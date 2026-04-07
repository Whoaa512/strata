import { execSync } from "child_process";
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

export interface ShapeDelta {
  changedFileCount: number;
  affectedFileCount: number;
  attention: "GREEN" | "YELLOW" | "RED";
  why: string[];
  likelyMissed: MissedFile[];
  reviewFocus: string[];
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
): ShapeDelta {
  const changedPaths = new Set(changedFiles.map(f => f.filePath));
  const changedEntityIds = new Set(changedEntities.map(e => e.id));
  const affectedFiles = new Set<string>(changedPaths);
  const why: string[] = [];

  for (const ripple of doc.changeRipple) {
    if (!changedEntityIds.has(ripple.entityId)) continue;
    for (const filePath of ripple.affectedFiles) affectedFiles.add(filePath);
  }
  for (const missed of [...missedFiles, ...missedTests]) affectedFiles.add(missed.filePath);
  for (const caller of affectedCallers) affectedFiles.add(caller.filePath);

  const topRippleDir = findTopRippleDir(changedEntities, doc.changeRipple, affectedFiles.size);
  if (topRippleDir) why.push(`ripple expanded in ${topRippleDir}`);

  const implicit = missedFiles.find(m => m.reason.includes("no import") || m.reason.includes("implicit"));
  if (implicit) why.push(`implicit coupling: ${implicit.filePath}`);

  if (hasWeakTestConfidence(changedPaths, missedTests)) {
    why.push("test confidence weak: likely tests not changed for affected area");
  }

  const invariantHint = findInvariantHint(changedFiles.map(f => f.filePath));
  if (invariantHint) why.push(`invariant hint: ${invariantHint}`);

  const redRisk = changedEntities.find(e => {
    const risk = doc.agentRisk.find(r => r.entityId === e.id);
    return risk?.safetyRating === "red";
  });
  if (redRisk) why.push(`changed red attention area: ${redRisk.filePath}`);

  const attention = computeShapeAttention(affectedFiles.size, changedFiles.length, missedFiles, missedTests, affectedCallers, why);

  return {
    changedFileCount: changedFiles.length,
    affectedFileCount: affectedFiles.size,
    attention,
    why: why.slice(0, 5),
    likelyMissed: [...missedFiles, ...missedTests]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5),
    reviewFocus: buildReviewFocus(missedFiles, missedTests, affectedCallers),
  };
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

function hasWeakTestConfidence(changedPaths: Set<string>, missedTests: MissedFile[]): boolean {
  const sourceChanged = Array.from(changedPaths).some(path => !isTestFile(path));
  const testChanged = Array.from(changedPaths).some(isTestFile);
  return sourceChanged && !testChanged && missedTests.length > 0;
}

function findInvariantHint(filePaths: string[]): string | null {
  const pattern = /(auth|session|token|permission|billing|payment|rate-?limit|validation|guard)/i;
  return filePaths.find(path => pattern.test(path)) ?? null;
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
