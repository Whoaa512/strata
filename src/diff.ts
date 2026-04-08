import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import type { StrataDoc, ChangeRipple, TemporalCoupling, Entity } from "./schema";
import { getPackageBoundaries } from "./ripple";

export interface DiffFile {
  filePath: string;
  status: "added" | "modified" | "deleted" | "renamed";
}

export interface DiffHunk {
  filePath: string;
  startLine: number;
  lineCount: number;
}

export interface MissedFile {
  filePath: string;
  reason: string;
  confidence: number;
  sources: string[];
}

type TestConfidence = "STRONG" | "PARTIAL" | "WEAK" | "UNKNOWN";
type RiskMix = { red: number; yellow: number; green: number };

export interface ShapeSummary {
  changedFiles: string[];
  affectedFiles: string[];
  affectedDirs: string[];
  changedPackages: string[];
  affectedPackages: string[];
  hiddenCouplings: string[];
  uncoveredRipple: string[];
  testConfidence: TestConfidence;
  invariantHints: string[];
  runtimeHints: string[];
  boundaryCrossings: string[];
  reviewFocus: string[];
}

export interface ShapeDelta {
  changedFileCount: number;
  affectedFileCount: number;
  attention: "GREEN" | "YELLOW" | "RED";
  testConfidence: TestConfidence;
  testRecommendations: string[];
  uncoveredRipple: string[];
  boundaryCrossings: string[];
  invariantHints: string[];
  affectedDirs: string[];
  runtimeHints: string[];
  changedPackages: string[];
  affectedPackages: string[];
  changedRisk: RiskMix;
  affectedRisk: RiskMix;
  shapeMovements: string[];
  why: string[];
  likelyMissed: MissedFile[];
  reviewFocus: string[];
  summary: ShapeSummary;
}

export interface DiffAnalysis {
  changedFiles: DiffFile[];
  changedEntities: Entity[];
  missedFiles: MissedFile[];
  missedTests: MissedFile[];
  affectedCallers: Array<{ entityId: string; name: string; filePath: string }>;
  shapeDelta: ShapeDelta;
}

export function getDiffFiles(rootDir: string, diffSpec: string): DiffFile[] {
  let cmd: string;

  if (diffSpec === "staged") {
    cmd = "git diff --cached --name-status";
  } else if (diffSpec.includes("..")) {
    cmd = `git diff --name-status ${diffSpec}`;
  } else if (/^HEAD~\d+$/.test(diffSpec)) {
    cmd = `git diff --name-status ${diffSpec}`;
  } else {
    cmd = `git diff --name-status ${diffSpec}...HEAD`;
  }

  let output: string;
  try {
    output = execSync(cmd, { cwd: rootDir, encoding: "utf-8" }).trim();
  } catch {
    return [];
  }

  if (!output) return [];

  return output.split("\n").map(line => {
    const parts = line.split("\t");
    const statusChar = parts[0][0];
    const filePath = parts[parts.length - 1];
    const status = statusChar === "A" ? "added" as const
      : statusChar === "D" ? "deleted" as const
      : statusChar === "R" ? "renamed" as const
      : "modified" as const;
    return { filePath, status };
  });
}

export function parseDiffHunks(diffOutput: string): DiffHunk[] {
  if (!diffOutput.trim()) return [];

  const hunks: DiffHunk[] = [];
  let currentFile = "";

  for (const line of diffOutput.split("\n")) {
    if (line.startsWith("diff --git")) {
      const match = line.match(/b\/(.+)$/);
      if (match) currentFile = match[1];
      continue;
    }

    if (!line.startsWith("@@")) continue;

    const hunkMatch = line.match(/@@ [^ ]+ \+(\d+)(?:,(\d+))? @@/);
    if (!hunkMatch || !currentFile) continue;

    hunks.push({
      filePath: currentFile,
      startLine: parseInt(hunkMatch[1], 10),
      lineCount: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
    });
  }

  return hunks;
}

export function getDiffHunks(rootDir: string, diffSpec: string): DiffHunk[] {
  let cmd: string;
  if (diffSpec === "staged") {
    cmd = "git diff --cached --unified=0";
  } else if (diffSpec.includes("..")) {
    cmd = `git diff --unified=0 ${diffSpec}`;
  } else if (/^HEAD~\d+$/.test(diffSpec)) {
    cmd = `git diff --unified=0 ${diffSpec}`;
  } else {
    cmd = `git diff --unified=0 ${diffSpec}...HEAD`;
  }

  try {
    const output = execSync(cmd, { cwd: rootDir, encoding: "utf-8" }).trim();
    return parseDiffHunks(output);
  } catch {
    return [];
  }
}

export function resolveChangedEntities(
  entities: Entity[],
  hunks: DiffHunk[],
  diffFiles: DiffFile[],
): Entity[] {
  const addedFiles = new Set(
    diffFiles.filter(f => f.status === "added").map(f => f.filePath),
  );

  const hunksByFile = new Map<string, DiffHunk[]>();
  for (const h of hunks) {
    let list = hunksByFile.get(h.filePath);
    if (!list) { list = []; hunksByFile.set(h.filePath, list); }
    list.push(h);
  }

  const changedFiles = new Set(diffFiles.map(f => f.filePath));

  return entities.filter(e => {
    if (!changedFiles.has(e.filePath)) return false;
    if (addedFiles.has(e.filePath)) return true;

    const fileHunks = hunksByFile.get(e.filePath);
    if (!fileHunks) return false;

    return fileHunks.some(h => {
      const hunkEnd = h.startLine + h.lineCount - 1;
      return e.startLine <= hunkEnd && e.endLine >= h.startLine;
    });
  });
}

export function analyzeDiff(doc: StrataDoc, diffFiles: DiffFile[], hunks?: DiffHunk[]): DiffAnalysis {
  const changedPaths = new Set(diffFiles.map(f => f.filePath));

  const changedEntities = hunks
    ? resolveChangedEntities(doc.entities, hunks, diffFiles)
    : doc.entities.filter(e => changedPaths.has(e.filePath));
  const changedEntityIds = new Set(changedEntities.map(e => e.id));

  const pkgByFile = doc.rootDir ? getPackageBoundaries(doc.entities, doc.rootDir) : null;

  const missedMap = new Map<string, MissedFile>();

  findMissedFromTemporalCoupling(doc, changedPaths, missedMap);
  findMissedFromCallGraph(doc, changedEntityIds, changedPaths, missedMap, pkgByFile);
  findMissedFromRipple(doc, changedEntityIds, changedPaths, missedMap);
  findMissedFromStructuralSiblings(doc, changedPaths, missedMap);

  boostMultiSignalFiles(missedMap);

  const allMissed = Array.from(missedMap.values())
    .filter(m => m.confidence >= 0.4)
    .sort((a, b) => b.confidence - a.confidence);

  const missedTests = allMissed.filter(m => isTestFile(m.filePath));
  const missedFiles = allMissed.filter(m => !isTestFile(m.filePath));

  addMissedTestFiles(doc, changedPaths, missedTests);
  addRippleZoneTestFiles(doc, changedEntityIds, changedPaths, missedTests);
  missedTests.sort((a, b) => b.confidence - a.confidence);

  const affectedCallers = findAffectedCallers(doc, changedEntityIds);
  const cappedMissedFiles = missedFiles.slice(0, 15);
  const cappedMissedTests = missedTests.slice(0, 10);
  const shapeDelta = buildShapeDelta(
    doc,
    diffFiles,
    changedEntities,
    cappedMissedFiles,
    cappedMissedTests,
    affectedCallers,
    pkgByFile,
  );

  return {
    changedFiles: diffFiles,
    changedEntities,
    missedFiles: cappedMissedFiles,
    missedTests: cappedMissedTests,
    affectedCallers,
    shapeDelta,
  };
}

function findMissedFromTemporalCoupling(
  doc: StrataDoc,
  changedPaths: Set<string>,
  missed: Map<string, MissedFile>,
) {
  for (const tc of doc.temporalCoupling) {
    if (tc.confidence < 0.3) continue;

    let coupledFile: string | undefined;
    if (changedPaths.has(tc.fileA) && !changedPaths.has(tc.fileB)) {
      coupledFile = tc.fileB;
    } else if (changedPaths.has(tc.fileB) && !changedPaths.has(tc.fileA)) {
      coupledFile = tc.fileA;
    }
    if (!coupledFile) continue;

    const source = changedPaths.has(tc.fileA) ? tc.fileA : tc.fileB;
    const existing = missed.get(coupledFile);
    const conf = tc.confidence;

    if (existing) {
      existing.confidence = Math.max(existing.confidence, conf);
      existing.sources.push(source);
      if (!existing.reason.includes("co-change")) {
        existing.reason += ` + co-changes with ${source} (${Math.round(conf * 100)}%)`;
      }
    } else {
      const label = tc.hasStaticDependency ? "static dep + co-change" : "co-change (no import link)";
      missed.set(coupledFile, {
        filePath: coupledFile,
        reason: `${label} with ${source} (${Math.round(conf * 100)}% of commits)`,
        confidence: conf,
        sources: [source],
      });
    }
  }
}

export function buildCallerCountIndex(doc: StrataDoc): Map<string, number> {
  const counts = new Map<string, number>();
  for (const edge of doc.callGraph) {
    counts.set(edge.callee, (counts.get(edge.callee) ?? 0) + 1);
  }
  return counts;
}

export function hubDampeningFactor(callerCount: number): number {
  if (callerCount <= 1) return 1;
  return 1 / (1 + Math.log2(callerCount));
}

const CROSS_PACKAGE_DAMPENING = 0.5;

function findMissedFromCallGraph(
  doc: StrataDoc,
  changedEntityIds: Set<string>,
  changedPaths: Set<string>,
  missed: Map<string, MissedFile>,
  pkgByFile: Map<string, string> | null,
) {
  const entityById = new Map(doc.entities.map(e => [e.id, e]));
  const callerCounts = buildCallerCountIndex(doc);

  for (const edge of doc.callGraph) {
    let targetId: string | undefined;
    let sourceId: string | undefined;

    if (changedEntityIds.has(edge.caller) && !changedEntityIds.has(edge.callee)) {
      targetId = edge.callee;
      sourceId = edge.caller;
    } else if (changedEntityIds.has(edge.callee) && !changedEntityIds.has(edge.caller)) {
      targetId = edge.caller;
      sourceId = edge.callee;
    }
    if (!targetId || !sourceId) continue;

    const target = entityById.get(targetId);
    const source = entityById.get(sourceId);
    if (!target || !source || changedPaths.has(target.filePath)) continue;

    const isDirectDep = changedEntityIds.has(edge.caller);

    const targetCallerCount = callerCounts.get(targetId) ?? 0;
    const sourceCallerCount = callerCounts.get(sourceId) ?? 0;
    const relevantCount = isDirectDep ? targetCallerCount : sourceCallerCount;
    const dampening = hubDampeningFactor(relevantCount);

    let pkgDampening = 1;
    if (pkgByFile) {
      const sourcePkg = pkgByFile.get(source.filePath) ?? ".";
      const targetPkg = pkgByFile.get(target.filePath) ?? ".";
      if (sourcePkg !== targetPkg) pkgDampening = CROSS_PACKAGE_DAMPENING;
    }

    const existing = missed.get(target.filePath);
    if (existing) {
      existing.confidence = Math.min(1, existing.confidence + 0.05 * dampening * pkgDampening);
      if (!existing.sources.includes(source.filePath)) {
        existing.sources.push(source.filePath);
      }
    } else {
      const direction = isDirectDep ? "calls" : "called by";
      const baseConf = isDirectDep ? 0.35 : 0.25;
      missed.set(target.filePath, {
        filePath: target.filePath,
        reason: `${direction} changed function ${source.name}`,
        confidence: baseConf * dampening * pkgDampening,
        sources: [source.filePath],
      });
    }
  }
}

function findMissedFromRipple(
  doc: StrataDoc,
  changedEntityIds: Set<string>,
  changedPaths: Set<string>,
  missed: Map<string, MissedFile>,
) {
  for (const ripple of doc.changeRipple) {
    if (!changedEntityIds.has(ripple.entityId)) continue;

    for (const ic of ripple.implicitCouplings) {
      if (changedPaths.has(ic.filePath)) continue;
      if (ic.cochangeRate < 0.3) continue;

      const existing = missed.get(ic.filePath);
      if (existing) {
        existing.confidence = Math.max(existing.confidence, ic.cochangeRate);
      } else {
        missed.set(ic.filePath, {
          filePath: ic.filePath,
          reason: `implicit coupling (${Math.round(ic.cochangeRate * 100)}% co-change, no import)`,
          confidence: ic.cochangeRate,
          sources: [],
        });
      }
    }
  }
}

function findMissedFromStructuralSiblings(
  doc: StrataDoc,
  changedPaths: Set<string>,
  missed: Map<string, MissedFile>,
) {
  const allPaths = new Set(doc.entities.map(e => e.filePath).filter(path => !isTestFile(path)));
  const entitiesByFile = groupEntitiesByFile(doc.entities);
  const routeFileCountByDir = countRouteFilesByDir(allPaths);

  for (const changedPath of changedPaths) {
    if (isTestFile(changedPath)) continue;

    for (const candidate of allPaths) {
      if (candidate === changedPath || changedPaths.has(candidate)) continue;

      const sibling = classifyStructuralSibling(changedPath, candidate, entitiesByFile, routeFileCountByDir);
      if (!sibling) continue;

      addOrBoostMissedFile(missed, candidate, {
        reason: `structural sibling of ${changedPath} (${sibling.reason})`,
        confidence: structuralSiblingConfidence(changedPath, candidate, sibling.confidence, doc.temporalCoupling),
        source: changedPath,
      });
    }
  }
}

function groupEntitiesByFile(entities: Entity[]): Map<string, Entity[]> {
  const byFile = new Map<string, Entity[]>();
  for (const entity of entities) {
    const list = byFile.get(entity.filePath) ?? [];
    list.push(entity);
    byFile.set(entity.filePath, list);
  }
  return byFile;
}

function classifyStructuralSibling(
  changedPath: string,
  candidate: string,
  entitiesByFile: Map<string, Entity[]>,
  routeFileCountByDir: Map<string, number>,
): { reason: string; confidence: number } | null {
  if (isPlatformSibling(changedPath, candidate)) {
    return { reason: "platform sibling", confidence: 0.45 };
  }
  if (isSameFileInSiblingDirectory(changedPath, candidate)) {
    return { reason: "same filename in sibling directory", confidence: 0.45 };
  }
  if (hasSameEntityNameInSiblingDirectory(changedPath, candidate, entitiesByFile)) {
    return { reason: "same function name in sibling directory", confidence: 0.43 };
  }
  if (isRouteSibling(changedPath, candidate, routeFileCountByDir)) {
    return { reason: "route sibling", confidence: 0.42 };
  }
  return null;
}

function isSameFileInSiblingDirectory(a: string, b: string): boolean {
  const aParts = a.split("/");
  const bParts = b.split("/");
  if (aParts.length < 3 || aParts.length !== bParts.length) return false;
  if (aParts[aParts.length - 1] !== bParts[bParts.length - 1]) return false;
  if (aParts[aParts.length - 2] === bParts[bParts.length - 2]) return false;
  return aParts.slice(0, -2).join("/") === bParts.slice(0, -2).join("/");
}

function hasSameEntityNameInSiblingDirectory(
  changedPath: string,
  candidate: string,
  entitiesByFile: Map<string, Entity[]>,
): boolean {
  if (!isSiblingDirectory(changedPath, candidate)) return false;

  const changedNames = new Set((entitiesByFile.get(changedPath) ?? []).map(e => e.name));
  return (entitiesByFile.get(candidate) ?? []).some(e => changedNames.has(e.name));
}

function isSiblingDirectory(a: string, b: string): boolean {
  const aParts = a.split("/");
  const bParts = b.split("/");
  if (aParts.length < 3 || bParts.length < 3) return false;
  const aDirParts = aParts.slice(0, -1);
  const bDirParts = bParts.slice(0, -1);
  if (aDirParts.length !== bDirParts.length) return false;
  if (aDirParts[aDirParts.length - 1] === bDirParts[bDirParts.length - 1]) return false;
  return aDirParts.slice(0, -1).join("/") === bDirParts.slice(0, -1).join("/");
}

const MAX_ROUTE_SIBLINGS_PER_DIR = 6;

function countRouteFilesByDir(paths: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const dir = dirnameOf(path);
    if (!isRouteDir(dir)) continue;
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return counts;
}

function isRouteSibling(a: string, b: string, routeFileCountByDir: Map<string, number>): boolean {
  const aParts = a.split("/");
  const bParts = b.split("/");
  if (aParts.length !== bParts.length) return false;

  const dir = aParts.slice(0, -1).join("/");
  if (dir !== bParts.slice(0, -1).join("/")) return false;
  if (!isRouteDir(dir)) return false;
  if ((routeFileCountByDir.get(dir) ?? 0) > MAX_ROUTE_SIBLINGS_PER_DIR) return false;

  return aParts[aParts.length - 1] !== bParts[bParts.length - 1];
}

function isRouteDir(dir: string): boolean {
  return /(^|\/)routes?(\/|$)/i.test(dir);
}

function dirnameOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
}

function isPlatformSibling(a: string, b: string): boolean {
  const platforms = new Set(["ios", "android", "web", "rest", "graphql", "server", "client"]);
  const aParts = a.split("/");
  const bParts = b.split("/");
  if (aParts.length !== bParts.length) return false;
  if (aParts[aParts.length - 1] !== bParts[bParts.length - 1]) return false;

  let platformDiffs = 0;
  for (let i = 0; i < aParts.length - 1; i++) {
    if (aParts[i] === bParts[i]) continue;
    if (!platforms.has(aParts[i]) || !platforms.has(bParts[i])) return false;
    platformDiffs += 1;
  }
  return platformDiffs === 1;
}

function structuralSiblingConfidence(
  changedPath: string,
  candidate: string,
  baseConfidence: number,
  temporalCoupling: TemporalCoupling[],
): number {
  const coupling = temporalCoupling.find(tc => (
    (tc.fileA === changedPath && tc.fileB === candidate) ||
    (tc.fileA === candidate && tc.fileB === changedPath)
  ));
  if (!coupling || coupling.confidence < 0.3) return baseConfidence;
  return Math.min(0.75, Math.max(baseConfidence, coupling.confidence + 0.1));
}

function addOrBoostMissedFile(
  missed: Map<string, MissedFile>,
  filePath: string,
  update: { reason: string; confidence: number; source: string },
) {
  const existing = missed.get(filePath);
  if (existing) {
    existing.confidence = Math.max(existing.confidence, update.confidence);
    if (!existing.sources.includes(update.source)) existing.sources.push(update.source);
    if (!existing.reason.includes("structural sibling")) existing.reason += ` + ${update.reason}`;
    return;
  }

  missed.set(filePath, {
    filePath,
    reason: update.reason,
    confidence: update.confidence,
    sources: [update.source],
  });
}

function addMissedTestFiles(
  doc: StrataDoc,
  changedPaths: Set<string>,
  missedTests: MissedFile[],
) {
  for (const changedPath of changedPaths) {
    if (isTestFile(changedPath)) continue;
    addLikelyTestFiles(doc, changedPaths, missedTests, changedPath, `test file for changed ${changedPath}`, 0.7);
  }
}

function addRippleZoneTestFiles(
  doc: StrataDoc,
  changedEntityIds: Set<string>,
  changedPaths: Set<string>,
  missedTests: MissedFile[],
) {
  const affected = new Set<string>();
  for (const ripple of doc.changeRipple) {
    if (!changedEntityIds.has(ripple.entityId)) continue;
    for (const filePath of ripple.affectedFiles) affected.add(filePath);
  }

  for (const filePath of affected) {
    if (changedPaths.has(filePath) || isTestFile(filePath)) continue;
    addLikelyTestFiles(doc, changedPaths, missedTests, filePath, `likely guard test for affected ${filePath}`, 0.55);
  }
}

function addLikelyTestFiles(
  doc: StrataDoc,
  changedPaths: Set<string>,
  missedTests: MissedFile[],
  sourcePath: string,
  reason: string,
  confidence: number,
) {
  for (const candidate of likelyTestCandidates(sourcePath)) {
    const exists = doc.entities.some(e => e.filePath === candidate);
    if (!exists || changedPaths.has(candidate)) continue;

    const existing = missedTests.find(m => m.filePath === candidate);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence);
      if (!existing.sources.includes(sourcePath)) existing.sources.push(sourcePath);
      continue;
    }

    missedTests.push({
      filePath: candidate,
      reason,
      confidence,
      sources: [sourcePath],
    });
  }
}

function likelyTestCandidates(sourcePath: string): string[] {
  const base = sourcePath.replace(/\.[^.]+$/, "");
  const ext = sourcePath.match(/\.[^.]+$/)?.[0] ?? ".ts";

  return [
    `${base}.test${ext}`,
    `${base}.spec${ext}`,
    sourcePath.replace(/^src\//, "test/").replace(/\.[^.]+$/, `.test${ext}`),
  ];
}

function buildShapeDelta(
  doc: StrataDoc,
  changedFiles: DiffFile[],
  changedEntities: Entity[],
  missedFiles: MissedFile[],
  missedTests: MissedFile[],
  affectedCallers: DiffAnalysis["affectedCallers"],
  pkgByFile: Map<string, string> | null,
): ShapeDelta {
  const changedPaths = new Set(changedFiles.map(f => f.filePath));
  const changedEntityIds = new Set(changedEntities.map(e => e.id));
  const affectedFiles = new Set<string>(changedPaths);
  const lineCache = new Map<string, string[] | null>();
  const why: string[] = [];

  for (const ripple of doc.changeRipple) {
    if (!changedEntityIds.has(ripple.entityId)) continue;
    for (const filePath of ripple.affectedFiles) affectedFiles.add(filePath);
  }
  for (const missed of [...missedFiles, ...missedTests]) affectedFiles.add(missed.filePath);
  for (const caller of affectedCallers) affectedFiles.add(caller.filePath);

  const affectedDirs = topDirs(affectedFiles);
  const changedPackages = findPackages(changedPaths, pkgByFile);
  const affectedPackages = findPackages(affectedFiles, pkgByFile);

  const topRippleDir = findTopRippleDir(changedEntities, doc.changeRipple, affectedFiles.size);
  if (topRippleDir) why.push(`ripple expanded in ${topRippleDir}`);

  const boundaryCrossings = findBoundaryCrossings(changedPaths, affectedFiles, pkgByFile);
  if (boundaryCrossings.length > 0) {
    why.push(`boundary crossing: ${boundaryCrossings[0]}`);
    why.push(`changed package ${boundaryCrossings[0].replace(" -> ", " affected package ")}`);
  }

  const structuralSibling = missedFiles.find(m => m.reason.includes("structural sibling"));
  if (structuralSibling) why.push(`structural sibling: ${structuralSibling.filePath}`);

  const implicit = missedFiles.find(m => m.reason.includes("no import") || m.reason.includes("implicit"));
  if (implicit) why.push(`implicit coupling: ${implicit.filePath}`);

  const testPlan = computeTestPlan(doc, changedPaths, affectedFiles);
  if (testPlan.confidence === "WEAK") {
    why.push("test confidence weak: likely guard tests not changed for affected area");
  } else if (testPlan.confidence === "PARTIAL") {
    why.push("test confidence partial: affected ripple tests still need review");
  }

  const invariantHints = findInvariantHints(doc.rootDir, changedFiles.map(f => f.filePath), changedEntities, lineCache);
  if (invariantHints.length > 0) why.push(`invariant hint: ${invariantHints[0]}`);

  const runtimeHints = findRuntimeHints(doc.rootDir, changedFiles.map(f => f.filePath), changedEntities, lineCache);
  if (runtimeHints.length > 0) why.push(`runtime/data hint: ${runtimeHints[0]}`);

  const changedRisk = countChangedRisk(doc, changedEntities);
  const affectedRisk = countRiskForFiles(doc, affectedFiles);

  const redRisk = changedEntities.find(e => {
    const risk = doc.agentRisk.find(r => r.entityId === e.id);
    return risk?.safetyRating === "red";
  });
  if (redRisk) why.push(`changed red attention area: ${redRisk.filePath}`);

  const shapeMovements = buildShapeMovements({
    affectedFileCount: affectedFiles.size,
    changedFileCount: changedFiles.length,
    boundaryCrossings,
    implicitFile: implicit?.filePath,
    testConfidence: testPlan.confidence,
    runtimeHints,
    invariantHints,
  });
  const reviewFocus = buildReviewFocus(missedFiles, missedTests, affectedCallers);
  const attention = computeShapeAttention(affectedFiles.size, changedFiles.length, missedFiles, missedTests, affectedCallers, why);
  const likelyMissed = [...missedFiles, ...missedTests]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
  const hiddenCouplings = missedFiles
    .filter(m => m.reason.includes("no import") || m.reason.includes("implicit") || m.reason.includes("co-change"))
    .map(m => m.filePath)
    .slice(0, 10);
  const summary: ShapeSummary = {
    changedFiles: Array.from(changedPaths).sort(),
    affectedFiles: Array.from(affectedFiles).sort(),
    affectedDirs,
    changedPackages,
    affectedPackages,
    hiddenCouplings,
    uncoveredRipple: testPlan.uncoveredRipple,
    testConfidence: testPlan.confidence,
    invariantHints,
    runtimeHints,
    boundaryCrossings,
    reviewFocus,
  };

  return {
    changedFileCount: changedFiles.length,
    affectedFileCount: affectedFiles.size,
    attention,
    testConfidence: testPlan.confidence,
    testRecommendations: testPlan.recommendations,
    uncoveredRipple: testPlan.uncoveredRipple,
    boundaryCrossings,
    invariantHints,
    affectedDirs,
    runtimeHints,
    changedPackages,
    affectedPackages,
    changedRisk,
    affectedRisk,
    shapeMovements,
    why: why.slice(0, 5),
    likelyMissed,
    reviewFocus,
    summary,
  };
}

function topDirs(files: Set<string>): string[] {
  const counts = new Map<string, number>();
  for (const filePath of files) {
    const dir = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : ".";
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([dir]) => dir);
}

function findTopRippleDir(
  changedEntities: Entity[],
  ripples: ChangeRipple[],
  affectedFileCount: number,
): string | null {
  if (affectedFileCount <= changedEntities.length) return null;

  const rippleByEntity = new Map(ripples.map(r => [r.entityId, r]));
  const counts = new Map<string, number>();
  for (const entity of changedEntities) {
    const ripple = rippleByEntity.get(entity.id);
    if (!ripple) continue;
    for (const filePath of ripple.affectedFiles) {
      const dir = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : ".";
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }

  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  return top?.[1] ? top[0] : null;
}

interface TestPlan {
  confidence: TestConfidence;
  recommendations: string[];
  uncoveredRipple: string[];
}

function computeTestPlan(
  doc: StrataDoc,
  changedPaths: Set<string>,
  affectedFiles: Set<string>,
): TestPlan {
  const sourceFiles = Array.from(affectedFiles).filter(path => !isTestFile(path));
  if (!sourceFiles.some(path => changedPaths.has(path))) {
    return { confidence: "UNKNOWN", recommendations: [], uncoveredRipple: [] };
  }

  const knownFiles = new Set(doc.entities.map(e => e.filePath));
  const likelyTests = new Set<string>();
  const uncoveredRipple: string[] = [];
  for (const sourcePath of sourceFiles) {
    const knownLikelyTests = likelyTestCandidates(sourcePath).filter(candidate => knownFiles.has(candidate));
    for (const candidate of knownLikelyTests) likelyTests.add(candidate);
    if (!changedPaths.has(sourcePath) && knownLikelyTests.length === 0) uncoveredRipple.push(sourcePath);
  }

  if (likelyTests.size === 0) {
    return { confidence: "UNKNOWN", recommendations: [], uncoveredRipple: uncoveredRipple.sort().slice(0, 5) };
  }

  const changedLikelyTests = Array.from(likelyTests).filter(path => changedPaths.has(path)).sort();
  const missingLikelyTests = Array.from(likelyTests).filter(path => !changedPaths.has(path)).sort();
  const recommendations = missingLikelyTests.length > 0 ? missingLikelyTests : changedLikelyTests;

  if (missingLikelyTests.length === 0 && changedLikelyTests.length > 0) {
    return { confidence: "STRONG", recommendations, uncoveredRipple: uncoveredRipple.sort().slice(0, 5) };
  }
  if (changedLikelyTests.length > 0) {
    return { confidence: "PARTIAL", recommendations, uncoveredRipple: uncoveredRipple.sort().slice(0, 5) };
  }
  return { confidence: "WEAK", recommendations, uncoveredRipple: uncoveredRipple.sort().slice(0, 5) };
}

function findPackages(files: Set<string>, pkgByFile: Map<string, string> | null): string[] {
  if (!pkgByFile) return [];

  const packages = new Set<string>();
  for (const filePath of files) {
    packages.add(pkgByFile.get(filePath) ?? ".");
  }

  return Array.from(packages).sort().slice(0, 6);
}

function findBoundaryCrossings(
  changedPaths: Set<string>,
  affectedFiles: Set<string>,
  pkgByFile: Map<string, string> | null,
): string[] {
  if (!pkgByFile) return [];

  const changedPkgs = new Set<string>();
  for (const filePath of changedPaths) {
    changedPkgs.add(pkgByFile.get(filePath) ?? ".");
  }

  const crossings = new Set<string>();
  for (const filePath of affectedFiles) {
    if (changedPaths.has(filePath)) continue;
    const affectedPkg = pkgByFile.get(filePath) ?? ".";
    for (const changedPkg of changedPkgs) {
      if (changedPkg !== affectedPkg) crossings.add(`${changedPkg} -> ${affectedPkg}`);
    }
  }

  return Array.from(crossings).sort().slice(0, 5);
}

function countChangedRisk(doc: StrataDoc, changedEntities: Entity[]): RiskMix {
  const riskByEntity = new Map(doc.agentRisk.map(r => [r.entityId, r.safetyRating]));
  const counts: RiskMix = { red: 0, yellow: 0, green: 0 };

  for (const entity of changedEntities) {
    const rating = riskByEntity.get(entity.id);
    if (!rating) continue;
    counts[rating] += 1;
  }

  return counts;
}

function countRiskForFiles(doc: StrataDoc, filePaths: Set<string>): RiskMix {
  const entityById = new Map(doc.entities.map(e => [e.id, e]));
  const ratingByFile = new Map<string, "red" | "yellow" | "green">();

  for (const risk of doc.agentRisk) {
    const entity = entityById.get(risk.entityId);
    if (!entity || !filePaths.has(entity.filePath)) continue;
    const current = ratingByFile.get(entity.filePath);
    ratingByFile.set(entity.filePath, higherRisk(current, risk.safetyRating));
  }

  const counts: RiskMix = { red: 0, yellow: 0, green: 0 };
  for (const rating of ratingByFile.values()) counts[rating] += 1;
  return counts;
}

function higherRisk(
  a: "red" | "yellow" | "green" | undefined,
  b: "red" | "yellow" | "green",
): "red" | "yellow" | "green" {
  if (!a) return b;
  const order = { red: 3, yellow: 2, green: 1 };
  return order[b] > order[a] ? b : a;
}

function findRuntimeHints(
  rootDir: string,
  filePaths: string[],
  changedEntities: Entity[],
  lineCache: Map<string, string[] | null>,
): string[] {
  const hints: string[] = [];
  for (const filePath of filePaths) {
    addPathRuntimeHint(filePath, hints);
  }

  for (const entity of changedEntities) {
    const lines = readEntityLines(rootDir, entity, lineCache);
    if (!lines) continue;
    const text = stripQuotedText(lines.join("\n"));
    if (/\b(emit|publish|track[A-Za-z]*|metric[A-Za-z]*|log[A-Za-z]*)\s*\(/i.test(text)) {
      addHint(hints, `event/metric hint: emit/publish/track touched: ${entity.filePath}:${entity.name}`);
    }
    if (/process\.env|featureFlag\s*\(|feature_flag\s*\(|\bflag\s*\(/i.test(text)) {
      addHint(hints, `config/flag hint: process.env/feature flag touched: ${entity.filePath}:${entity.name}`);
    }
  }

  return hints.slice(0, 6);
}

function addPathRuntimeHint(filePath: string, hints: string[]) {
  if (/(^|\/)(jobs?|workers?|queues?|cron)(\/|\.|-|_|$)|\.(worker|job)\./i.test(filePath)) {
    addHint(hints, `async/job hint: worker/queue/cron touched: ${filePath}`);
    return;
  }
  if (/(^|\/)(db|database|models?|schemas?|migrations?)(\/|\.|-|_|$)|\.(schema|model|migration)\./i.test(filePath)) {
    addHint(hints, `data shape hint: db/model/schema/migration touched: ${filePath}`);
    return;
  }
  if (/(^|\/)(config|flags?|env)(\/|\.|-|_|$)|\.(config|env)\./i.test(filePath)) {
    addHint(hints, `config/flag hint: config/env/flag touched: ${filePath}`);
    return;
  }
  if (/(^|\/)(routes?|handlers?|controllers?|middleware)(\/|\.|-|_|$)/i.test(filePath)) {
    addHint(hints, `runtime path hint: route/handler/controller/middleware touched: ${filePath}`);
  }
}

function addHint(hints: string[], hint: string) {
  if (!hints.includes(hint)) hints.push(hint);
}

function stripQuotedText(text: string): string {
  return text
    .replace(/`(?:\\.|[^`])*`/g, "")
    .replace(/"(?:\\.|[^"])*"/g, "")
    .replace(/'(?:\\.|[^'])*'/g, "");
}

function findInvariantHints(
  rootDir: string,
  filePaths: string[],
  changedEntities: Entity[],
  lineCache: Map<string, string[] | null>,
): string[] {
  const hints = new Set<string>();
  const domainPattern = /(auth|session|token|permission|billing|payment|rate-?limit|validation|guard)/i;

  for (const filePath of filePaths) {
    if (isDocsOnlyPath(filePath)) continue;
    if (domainPattern.test(filePath)) hints.add(filePath);
  }

  for (const entity of changedEntities) {
    const entityHint = invariantHintForEntity(rootDir, entity, lineCache);
    if (entityHint) hints.add(entityHint);
  }

  return Array.from(hints).slice(0, 3);
}

function isDocsOnlyPath(filePath: string): boolean {
  return /(^|\/)docs?\//i.test(filePath) || /\.(md|mdx|txt|rst)$/i.test(filePath);
}

function invariantHintForEntity(
  rootDir: string,
  entity: Entity,
  lineCache: Map<string, string[] | null>,
): string | null {
  const entityPattern = /(assert|authoriz|enforce|ensure|guard|permission|permit|require|session|token|validat)/i;
  if (entityPattern.test(entity.name)) return `${entity.filePath}:${entity.name}`;

  const lines = readEntityLines(rootDir, entity, lineCache);
  if (!lines) return null;

  return lines.some(hasInvariantText) ? `${entity.filePath}:${entity.name}` : null;
}

function hasInvariantText(line: string): boolean {
  const trimmed = line.trim();
  const commentHasRule = /^(\/\/|\/\*|\*)/.test(trimmed)
    && /\b(must|never|always|required|invariant)\b/i.test(trimmed);
  if (commentHasRule) return true;

  return /\bthrow\b/i.test(trimmed)
    || /\bassert[A-Za-z0-9_]*\s*\(/i.test(trimmed)
    || /\b(validate|guard)[A-Za-z0-9_]*\s*\(/i.test(trimmed);
}

function readEntityLines(
  rootDir: string,
  entity: Entity,
  lineCache: Map<string, string[] | null>,
): string[] | null {
  const key = `${rootDir}:${entity.filePath}`;
  if (!lineCache.has(key)) {
    try {
      const content = readFileSync(join(rootDir, entity.filePath), "utf-8");
      lineCache.set(key, content.split("\n"));
    } catch {
      lineCache.set(key, null);
    }
  }

  const lines = lineCache.get(key);
  if (!lines) return null;
  return lines.slice(entity.startLine - 1, entity.endLine);
}

function buildShapeMovements(input: {
  affectedFileCount: number;
  changedFileCount: number;
  boundaryCrossings: string[];
  implicitFile?: string;
  testConfidence: TestConfidence;
  runtimeHints: string[];
  invariantHints: string[];
}): string[] {
  const movements: string[] = [];

  if (input.affectedFileCount > input.changedFileCount) {
    movements.push("ripple widened beyond changed files");
  }
  if (input.boundaryCrossings.length > 0) {
    movements.push(`crossed package boundary: ${input.boundaryCrossings[0]}`);
  }
  if (input.implicitFile) {
    movements.push(`implicit coupling surfaced: ${input.implicitFile}`);
  }
  if (input.testConfidence === "WEAK" || input.testConfidence === "PARTIAL") {
    movements.push("weak tests in affected zone");
  }
  if (input.runtimeHints.length > 0) {
    movements.push("runtime/data/config area touched");
  }
  if (input.invariantHints.length > 0) {
    movements.push(`invariant hint: ${input.invariantHints[0]}`);
  }

  return movements.slice(0, 3);
}

function computeShapeAttention(
  affectedFileCount: number,
  changedFileCount: number,
  missedFiles: MissedFile[],
  missedTests: MissedFile[],
  affectedCallers: DiffAnalysis["affectedCallers"],
  why: string[],
): ShapeDelta["attention"] {
  const highConfidenceMiss = missedFiles.some(m => m.confidence >= 0.7);
  const expanded = affectedFileCount > Math.max(2, changedFileCount * 2);
  const weakTests = why.some(w => w.includes("test confidence weak"));
  const implicit = why.some(w => w.includes("implicit coupling"));

  if (highConfidenceMiss || (expanded && (weakTests || implicit)) || missedTests.length >= 3) return "RED";
  if (missedFiles.length > 0 || missedTests.length > 0 || affectedCallers.length > 0 || expanded) return "YELLOW";
  return "GREEN";
}

function buildReviewFocus(
  missedFiles: MissedFile[],
  missedTests: MissedFile[],
  affectedCallers: DiffAnalysis["affectedCallers"],
): string[] {
  const focus: string[] = [];
  if (affectedCallers.length > 0) focus.push("Check callers in blast zone");
  if (missedFiles.some(m => m.reason.includes("implicit") || m.reason.includes("no import"))) {
    focus.push("Check implicit/co-changing files");
  }
  if (missedFiles.length > 0) focus.push("Check sibling/parallel implementations near likely missed files");
  if (missedTests.length > 0) focus.push("Add/update tests covering affected ripple zone");
  if (focus.length === 0) focus.push("Review changed files for local correctness");
  return focus.slice(0, 4);
}

function findAffectedCallers(
  doc: StrataDoc,
  changedEntityIds: Set<string>,
): DiffAnalysis["affectedCallers"] {
  const entityById = new Map(doc.entities.map(e => [e.id, e]));
  const callers: DiffAnalysis["affectedCallers"] = [];
  const seen = new Set<string>();

  for (const br of doc.blastRadius) {
    if (!changedEntityIds.has(br.entityId)) continue;

    for (const callerId of br.transitiveCallers) {
      if (changedEntityIds.has(callerId) || seen.has(callerId)) continue;
      seen.add(callerId);

      const caller = entityById.get(callerId);
      if (caller) {
        callers.push({ entityId: callerId, name: caller.name, filePath: caller.filePath });
      }
    }
  }

  return callers;
}

function boostMultiSignalFiles(missed: Map<string, MissedFile>) {
  for (const m of missed.values()) {
    const hasTemporalSignal = m.reason.includes("co-change");
    const hasCallSignal = m.reason.includes("calls") || m.reason.includes("called by");
    if (hasTemporalSignal && m.sources.length > 1) {
      m.confidence = Math.min(1, m.confidence + 0.15);
    }
    if (hasCallSignal && m.sources.length >= 3) {
      m.confidence = Math.min(1, m.confidence + 0.1);
    }
  }
}

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.|__tests__|\/test\//.test(path);
}
