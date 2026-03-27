import type {
  StrataReport,
  FunctionInfo,
  Hotspot,
  BlastRadius,
  TemporalCoupling,
  CallEdge,
  EntityRecord,
  EdgeRecord,
  MetricsRecord,
} from "./types";

export function buildReport(
  repoPath: string,
  functions: FunctionInfo[],
  hotspots: Hotspot[],
  blastRadii: BlastRadius[],
  temporalCouplings: TemporalCoupling[],
  edges: CallEdge[],
  analyzedFiles: number
): StrataReport {
  const entities: EntityRecord[] = [];
  const edgeRecords: EdgeRecord[] = [];
  const metrics: MetricsRecord[] = [];

  const fileSet = new Set<string>();

  for (const fn of functions) {
    const id = fn.filePath + ":" + fn.name + ":" + fn.startLine;
    entities.push({
      id,
      type: "function",
      name: fn.name,
      filePath: fn.filePath,
      startLine: fn.startLine,
      endLine: fn.endLine,
    });

    const blast = blastRadii.find(
      (b) => b.entity === fn.name && b.filePath === fn.filePath
    );
    const hotspot = hotspots.find(
      (h) => h.functionName === fn.name && h.filePath === fn.filePath
    );

    metrics.push({
      entityId: id,
      complexity: fn.complexity,
      fanIn: blast?.fanIn,
      fanOut: blast?.fanOut,
      hotspotScore: hotspot?.score,
      riskScore: blast?.riskScore,
    });

    fileSet.add(fn.filePath);
  }

  for (const file of fileSet) {
    entities.push({
      id: file,
      type: "file",
      name: file.split("/").pop() ?? file,
      filePath: file,
    });
  }

  for (const edge of edges) {
    edgeRecords.push({
      source: edge.callerFile + ":" + edge.caller,
      target: edge.calleeFile + ":" + edge.callee,
      type: "calls",
    });
  }

  for (const tc of temporalCouplings) {
    edgeRecords.push({
      source: tc.file1,
      target: tc.file2,
      type: "co_changes_with",
      weight: tc.confidence,
    });
  }

  return {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    repoPath,
    analyzedFiles,
    totalFunctions: functions.length,
    hotspots,
    blastRadii,
    temporalCouplings,
    entities,
    edges: edgeRecords,
    metrics,
  };
}
