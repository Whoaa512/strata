import type { FunctionInfo, FileChurn, Hotspot } from "./types";

export function computeHotspots(
  functions: FunctionInfo[],
  churnMap: Map<string, FileChurn>,
  topN: number = 10
): Hotspot[] {
  const maxComplexity = Math.max(1, ...functions.map((f) => f.complexity));
  const maxChurn = Math.max(
    1,
    ...Array.from(churnMap.values()).map((c) => c.commits)
  );

  const hotspots: Hotspot[] = [];

  for (const fn of functions) {
    if (fn.complexity === 0) continue;

    const churn = churnMap.get(fn.filePath);
    const commits = churn?.commits ?? 0;
    if (commits === 0) continue;

    const normComplexity = fn.complexity / maxComplexity;
    const normChurn = commits / maxChurn;
    const score = normComplexity * normChurn;

    hotspots.push({
      filePath: fn.filePath,
      functionName: fn.name,
      startLine: fn.startLine,
      complexity: fn.complexity,
      churn: commits,
      score,
    });
  }

  hotspots.sort((a, b) => b.score - a.score);
  return hotspots.slice(0, topN);
}
