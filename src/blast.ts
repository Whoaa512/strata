import type { CallEdge, BlastRadius } from "./schema";

function buildCallerIndex(callGraph: CallEdge[]): Map<string, string[]> {
  const callerIndex = new Map<string, string[]>();
  for (const edge of callGraph) {
    let callers = callerIndex.get(edge.callee);
    if (!callers) {
      callers = [];
      callerIndex.set(edge.callee, callers);
    }
    callers.push(edge.caller);
  }
  return callerIndex;
}

const MAX_TRANSITIVE = 500;

export function computeBlastRadius(
  entityId: string,
  callGraph: CallEdge[],
  prebuiltIndex?: Map<string, string[]>,
): BlastRadius {
  const callerIndex = prebuiltIndex ?? buildCallerIndex(callGraph);

  const directCallers = callerIndex.get(entityId) ?? [];
  if (directCallers.length === 0) {
    return { entityId, directCallers: [], transitiveCallers: [], radius: 0 };
  }

  const transitiveCallers = new Set<string>();
  const queue = [...directCallers];

  while (queue.length > 0) {
    if (transitiveCallers.size >= MAX_TRANSITIVE) break;
    const current = queue.pop()!;
    if (transitiveCallers.has(current) || current === entityId) continue;
    transitiveCallers.add(current);
    const upstreamCallers = callerIndex.get(current) ?? [];
    queue.push(...upstreamCallers);
  }

  const MAX_STORED_CALLERS = 50;

  return {
    entityId,
    directCallers: directCallers.slice(0, MAX_STORED_CALLERS),
    transitiveCallers: Array.from(transitiveCallers).slice(0, MAX_STORED_CALLERS),
    radius: transitiveCallers.size,
  };
}

export function computeAllBlastRadii(
  entityIds: string[],
  callGraph: CallEdge[],
): BlastRadius[] {
  const callerIndex = buildCallerIndex(callGraph);
  const hasCallers = new Set(callerIndex.keys());

  return entityIds
    .filter((id) => hasCallers.has(id))
    .map((id) => computeBlastRadius(id, callGraph, callerIndex))
    .filter((br) => br.radius > 0)
    .sort((a, b) => b.radius - a.radius);
}
