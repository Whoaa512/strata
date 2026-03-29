import { execSync } from "child_process";
import type { StrataDoc, ChangeRipple, TemporalCoupling, Entity } from "./schema";

export interface DiffFile {
  filePath: string;
  status: "added" | "modified" | "deleted" | "renamed";
}

export interface MissedFile {
  filePath: string;
  reason: string;
  confidence: number;
  sources: string[];
}

export interface DiffAnalysis {
  changedFiles: DiffFile[];
  changedEntities: Entity[];
  missedFiles: MissedFile[];
  missedTests: MissedFile[];
  affectedCallers: Array<{ entityId: string; name: string; filePath: string }>;
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

export function analyzeDiff(doc: StrataDoc, diffFiles: DiffFile[]): DiffAnalysis {
  const changedPaths = new Set(diffFiles.map(f => f.filePath));
  const changedEntities = doc.entities.filter(e => changedPaths.has(e.filePath));
  const changedEntityIds = new Set(changedEntities.map(e => e.id));

  const missedMap = new Map<string, MissedFile>();

  findMissedFromTemporalCoupling(doc, changedPaths, missedMap);
  findMissedFromCallGraph(doc, changedEntityIds, changedPaths, missedMap);
  findMissedFromRipple(doc, changedEntityIds, changedPaths, missedMap);

  boostMultiSignalFiles(missedMap);

  const allMissed = Array.from(missedMap.values())
    .filter(m => m.confidence >= 0.4)
    .sort((a, b) => b.confidence - a.confidence);

  const missedTests = allMissed.filter(m => isTestFile(m.filePath));
  const missedFiles = allMissed.filter(m => !isTestFile(m.filePath));

  addMissedTestFiles(doc, changedPaths, missedTests);

  const affectedCallers = findAffectedCallers(doc, changedEntityIds);

  return {
    changedFiles: diffFiles,
    changedEntities,
    missedFiles: missedFiles.slice(0, 15),
    missedTests: missedTests.slice(0, 10),
    affectedCallers,
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

function findMissedFromCallGraph(
  doc: StrataDoc,
  changedEntityIds: Set<string>,
  changedPaths: Set<string>,
  missed: Map<string, MissedFile>,
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

    const existing = missed.get(target.filePath);
    const isDirectDep = changedEntityIds.has(edge.caller);

    const targetCallerCount = callerCounts.get(targetId) ?? 0;
    const sourceCallerCount = callerCounts.get(sourceId) ?? 0;
    const relevantCount = isDirectDep ? targetCallerCount : sourceCallerCount;
    const dampening = hubDampeningFactor(relevantCount);

    if (existing) {
      existing.confidence = Math.min(1, existing.confidence + 0.05 * dampening);
      if (!existing.sources.includes(source.filePath)) {
        existing.sources.push(source.filePath);
      }
    } else {
      const direction = isDirectDep ? "calls" : "called by";
      const baseConf = isDirectDep ? 0.35 : 0.25;
      missed.set(target.filePath, {
        filePath: target.filePath,
        reason: `${direction} changed function ${source.name}`,
        confidence: baseConf * dampening,
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
  const testPatterns = [".test.", ".spec.", "__tests__/", "test/"];

  for (const changedPath of changedPaths) {
    if (isTestFile(changedPath)) continue;

    const base = changedPath.replace(/\.[^.]+$/, "");
    const ext = changedPath.match(/\.[^.]+$/)?.[0] ?? ".ts";

    const candidates = [
      `${base}.test${ext}`,
      `${base}.spec${ext}`,
      changedPath.replace(/^src\//, "test/").replace(/\.[^.]+$/, `.test${ext}`),
    ];

    for (const candidate of candidates) {
      const exists = doc.entities.some(e => e.filePath === candidate);
      if (exists && !changedPaths.has(candidate)) {
        const already = missedTests.some(m => m.filePath === candidate);
        if (!already) {
          missedTests.push({
            filePath: candidate,
            reason: `test file for changed ${changedPath}`,
            confidence: 0.7,
            sources: [changedPath],
          });
        }
      }
    }
  }
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
