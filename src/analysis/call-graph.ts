import type { Edge } from "../schema";

export interface CallGraph {
  adjacency: Map<string, Set<string>>;
  fanIn: Map<string, number>;
  fanOut: Map<string, number>;
}

export function buildCallGraph(
  edges: Pick<Edge, "source" | "target" | "kind">[]
): CallGraph {
  const adjacency = new Map<string, Set<string>>();
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();

  for (const edge of edges) {
    if (edge.kind !== "calls") continue;

    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, new Set());
    }
    adjacency.get(edge.source)!.add(edge.target);

    fanOut.set(edge.source, (fanOut.get(edge.source) ?? 0) + 1);
    fanIn.set(edge.target, (fanIn.get(edge.target) ?? 0) + 1);
  }

  return { adjacency, fanIn, fanOut };
}

export function computeForwardSlice(
  graph: CallGraph,
  entityId: string
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [];

  const neighbors = graph.adjacency.get(entityId);
  if (!neighbors) return visited;

  for (const n of neighbors) {
    queue.push(n);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current) || current === entityId) continue;
    visited.add(current);

    const next = graph.adjacency.get(current);
    if (next) {
      for (const n of next) {
        if (!visited.has(n) && n !== entityId) queue.push(n);
      }
    }
  }

  return visited;
}

export interface BlastRadiusResult {
  entityId: string;
  forwardSlice: string[];
  testCoverage: number;
  changeCoupling: string[];
  contributorCount: number;
  riskScore: number;
}

export function computeBlastRadius(
  graph: CallGraph,
  entityId: string,
  testedEntities: Set<string>,
  coupledFiles: string[],
  contributorCount: number
): BlastRadiusResult {
  const slice = computeForwardSlice(graph, entityId);
  const sliceArray = Array.from(slice).sort();

  let coverage: number;
  if (sliceArray.length === 0) {
    coverage = 1.0;
  } else {
    const tested = sliceArray.filter((id) => testedEntities.has(id)).length;
    coverage = tested / sliceArray.length;
  }

  const riskScore =
    sliceArray.length * (1 - coverage) * Math.max(1, contributorCount * 0.5);

  return {
    entityId,
    forwardSlice: sliceArray,
    testCoverage: coverage,
    changeCoupling: coupledFiles,
    contributorCount,
    riskScore,
  };
}
