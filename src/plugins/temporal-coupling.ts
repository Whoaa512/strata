import type { Plugin, AnalysisContext, PluginResult, SvEdge } from "../types";

export const temporalCouplingPlugin: Plugin = {
  name: "temporal-coupling",

  async analyze(ctx: AnalysisContext): Promise<PluginResult> {
    const cochangeCounts = computeCochanges(ctx);
    const edges: SvEdge[] = [];

    for (const [pair, count] of cochangeCounts) {
      if (count < 3) continue;

      const [fileA, fileB] = pair.split("||");
      edges.push({
        source: `file::${fileA}`,
        target: `file::${fileB}`,
        kind: "co_changes_with",
        weight: count,
        metadata: { commits: count },
      });
    }

    edges.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    return { edges };
  },
};

function computeCochanges(ctx: AnalysisContext): Map<string, number> {
  const counts = new Map<string, number>();
  const repoFiles = new Set(ctx.files.map((f) => f.relativePath));

  for (const commit of ctx.gitLog) {
    const relevantFiles = commit.files.filter((f) => repoFiles.has(f));
    if (relevantFiles.length < 2 || relevantFiles.length > 20) continue;

    for (let i = 0; i < relevantFiles.length; i++) {
      for (let j = i + 1; j < relevantFiles.length; j++) {
        const [a, b] = [relevantFiles[i], relevantFiles[j]].sort();
        const key = `${a}||${b}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return counts;
}
