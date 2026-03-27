import type { TemporalCoupling, CallEdge } from "./types";

export function computeTemporalCoupling(
  commitFileSets: string[][],
  staticEdges: CallEdge[],
  minCochanges: number = 3,
  minConfidence: number = 0.25
): TemporalCoupling[] {
  const fileCommitCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();

  for (const files of commitFileSets) {
    const tsFiles = files.filter(
      (f) =>
        (f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx")) &&
        !f.endsWith(".d.ts")
    );

    for (const file of tsFiles) {
      fileCommitCounts.set(file, (fileCommitCounts.get(file) ?? 0) + 1);
    }

    for (let i = 0; i < tsFiles.length; i++) {
      for (let j = i + 1; j < tsFiles.length; j++) {
        const key = makePairKey(tsFiles[i], tsFiles[j]);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const staticDeps = buildStaticDepSet(staticEdges);
  const couplings: TemporalCoupling[] = [];

  for (const [key, count] of pairCounts) {
    if (count < minCochanges) continue;

    const [file1, file2] = key.split("|||");
    const total1 = fileCommitCounts.get(file1) ?? 0;
    const total2 = fileCommitCounts.get(file2) ?? 0;
    const maxTotal = Math.max(total1, total2);
    if (maxTotal === 0) continue;

    const confidence = count / maxTotal;
    if (confidence < minConfidence) continue;

    couplings.push({
      file1,
      file2,
      cochangeCount: count,
      totalCommits1: total1,
      totalCommits2: total2,
      confidence,
      hasStaticDependency: staticDeps.has(makePairKey(file1, file2)),
    });
  }

  couplings.sort((a, b) => b.confidence - a.confidence);
  return couplings;
}

function makePairKey(a: string, b: string): string {
  return a < b ? a + "|||" + b : b + "|||" + a;
}

function buildStaticDepSet(edges: CallEdge[]): Set<string> {
  const deps = new Set<string>();
  for (const edge of edges) {
    if (edge.callerFile !== edge.calleeFile) {
      deps.add(makePairKey(edge.callerFile, edge.calleeFile));
    }
  }
  return deps;
}
