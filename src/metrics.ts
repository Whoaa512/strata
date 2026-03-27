import { CodeGraph, type Entity } from "./graph";

export interface Hotspot {
  entity: Entity;
  complexity: number;
  churn: number;
  score: number;
}

export interface BlastRadius {
  entity: Entity;
  forwardSlice: string[];
  forwardSliceSize: number;
  fanOut: number;
  fanIn: number;
  untestedInSlice: string[];
  testCoverageRatio: number;
  riskScore: number;
}

export function computeHotspots(graph: CodeGraph, limit: number = 10): Hotspot[] {
  const functions = graph.entitiesByKind("function");

  const hotspots: Hotspot[] = functions.map((entity) => {
    const complexity = entity.metrics.cognitiveComplexity ?? 0;
    const churn = entity.metrics.churn ?? 0;
    const score = complexity * churn;
    return { entity, complexity, churn, score };
  });

  hotspots.sort((a, b) => b.score - a.score);
  return hotspots.slice(0, limit);
}

export function computeBlastRadius(
  graph: CodeGraph,
  entityId: string,
  testedEntityIds: Set<string> = new Set(),
): BlastRadius | null {
  const entity = graph.getEntity(entityId);
  if (!entity) return null;

  const slice = graph.forwardSlice(entityId, "calls");
  const forwardSlice = [...slice];

  const untestedInSlice = forwardSlice.filter((id) => !testedEntityIds.has(id));

  const testCoverageRatio =
    forwardSlice.length === 0
      ? 1
      : 1 - untestedInSlice.length / forwardSlice.length;

  const fanOut = graph.fanOut(entityId);
  const fanIn = graph.fanIn(entityId);

  const riskScore =
    forwardSlice.length * (1 - testCoverageRatio) * Math.max(1, fanOut);

  return {
    entity,
    forwardSlice,
    forwardSliceSize: forwardSlice.length,
    fanOut,
    fanIn,
    untestedInSlice,
    testCoverageRatio,
    riskScore,
  };
}

export function computeAllBlastRadii(
  graph: CodeGraph,
  testedEntityIds: Set<string> = new Set(),
): BlastRadius[] {
  const functions = graph.entitiesByKind("function");
  const radii: BlastRadius[] = [];

  for (const fn of functions) {
    const br = computeBlastRadius(graph, fn.id, testedEntityIds);
    if (br) radii.push(br);
  }

  radii.sort((a, b) => b.riskScore - a.riskScore);
  return radii;
}

export function detectTestFiles(filePaths: string[]): Set<string> {
  const testPatterns = [
    /\.test\./,
    /\.spec\./,
    /__tests__\//,
    /test\//,
    /tests\//,
  ];

  const testFiles = new Set<string>();
  for (const fp of filePaths) {
    if (testPatterns.some((p) => p.test(fp))) {
      testFiles.add(fp);
    }
  }
  return testFiles;
}

export function findTestedEntities(
  graph: CodeGraph,
  testFiles: Set<string>,
): Set<string> {
  const tested = new Set<string>();

  for (const testFile of testFiles) {
    const entities = graph.entitiesInFile(testFile);
    for (const entity of entities) {
      const called = graph.forwardSlice(entity.id, "calls");
      for (const id of called) {
        tested.add(id);
      }
    }
  }

  return tested;
}
