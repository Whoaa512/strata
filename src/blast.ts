import type { CallEdge, BlastRadius } from "./schema";

export function computeBlastRadius(
  entityId: string,
  callGraph: CallEdge[],
): BlastRadius {
  const callerIndex = new Map<string, string[]>();
  for (const edge of callGraph) {
    let callers = callerIndex.get(edge.callee);
    if (!callers) {
      callers = [];
      callerIndex.set(edge.callee, callers);
    }
    callers.push(edge.caller);
  }

  const directCallers = callerIndex.get(entityId) ?? [];
  const transitiveCallers = new Set<string>();
  const queue = [...directCallers];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (transitiveCallers.has(current) || current === entityId) continue;
    transitiveCallers.add(current);
    const upstreamCallers = callerIndex.get(current) ?? [];
    queue.push(...upstreamCallers);
  }

  return {
    entityId,
    directCallers,
    transitiveCallers: Array.from(transitiveCallers),
    radius: transitiveCallers.size,
  };
}

export function computeAllBlastRadii(
  entityIds: string[],
  callGraph: CallEdge[],
): BlastRadius[] {
  return entityIds
    .map((id) => computeBlastRadius(id, callGraph))
    .filter((br) => br.radius > 0)
    .sort((a, b) => b.radius - a.radius);
}
