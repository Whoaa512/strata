import { extractFunctions } from "./analysis/cognitive-complexity";
import { computeHotspots } from "./analysis/hotspots";
import { buildCallGraph, computeBlastRadius } from "./analysis/call-graph";
import {
  getGitLog,
  parseGitLog,
  computeChurn,
  computeTemporalCoupling,
} from "./extraction/git";
import { extractCallEdges } from "./extraction/calls";
import type {
  StrataDocument,
  Entity,
  Edge,
  BlastRadius,
} from "./schema";

export interface AnalyzeOptions {
  repoPath: string;
  months?: number;
  topN?: number;
  minCoChanges?: number;
}

export async function analyze(opts: AnalyzeOptions): Promise<StrataDocument> {
  const { repoPath, months = 12, topN = 10, minCoChanges = 2 } = opts;

  const tsFiles = await findTSFiles(repoPath);
  const gitLogRaw = await getGitLog(repoPath, months);
  const commits = parseGitLog(gitLogRaw);
  const churnMap = computeChurn(commits);

  const allEntities: Entity[] = [];
  const allEdges: Edge[] = [];

  for (const filePath of tsFiles) {
    const relPath = filePath.replace(repoPath + "/", "");
    const code = await Bun.file(filePath).text();

    const functions = await extractFunctions(code, relPath);
    const fileChurn = churnMap.get(relPath);

    for (const fn of functions) {
      allEntities.push({
        id: fn.id,
        name: fn.name,
        kind: fn.kind,
        location: {
          file: relPath,
          startLine: fn.startLine,
          endLine: fn.endLine,
        },
        metrics: {
          cognitiveComplexity: fn.complexity,
          nestingDepth: fn.nestingDepth,
          lineCount: fn.lineCount,
          parameterCount: fn.parameterCount,
          fanIn: 0,
          fanOut: 0,
        },
        churn: fileChurn
          ? {
              commits: fileChurn.commits,
              authors: fileChurn.authors,
              lastModified: fileChurn.lastModified,
              linesAdded: fileChurn.linesAdded,
              linesDeleted: fileChurn.linesDeleted,
            }
          : undefined,
      });
    }

    const callEdges = await extractCallEdges(code, relPath);
    for (const edge of callEdges) {
      const targetEntity = resolveCallee(edge.callee, relPath, allEntities);
      if (targetEntity) {
        allEdges.push({
          source: edge.caller,
          target: targetEntity,
          kind: "calls",
        });
      }
    }
  }

  const graph = buildCallGraph(allEdges);

  for (const entity of allEntities) {
    entity.metrics.fanIn = graph.fanIn.get(entity.id) ?? 0;
    entity.metrics.fanOut = graph.fanOut.get(entity.id) ?? 0;
  }

  const testFiles = new Set(
    tsFiles
      .filter(
        (f) =>
          f.includes(".test.") ||
          f.includes(".spec.") ||
          f.includes("__tests__")
      )
      .map((f) => f.replace(repoPath + "/", ""))
  );

  const testedEntities = new Set<string>();
  for (const entity of allEntities) {
    if (testFiles.has(entity.location.file)) {
      testedEntities.add(entity.id);
    }
  }

  const temporalCouplings = computeTemporalCoupling(commits, minCoChanges);

  const couplingByFile = new Map<string, string[]>();
  for (const tc of temporalCouplings) {
    if (!couplingByFile.has(tc.fileA)) couplingByFile.set(tc.fileA, []);
    if (!couplingByFile.has(tc.fileB)) couplingByFile.set(tc.fileB, []);
    couplingByFile.get(tc.fileA)!.push(tc.fileB);
    couplingByFile.get(tc.fileB)!.push(tc.fileA);
  }

  const hotspots = computeHotspots(allEntities, topN);

  const blastRadii: BlastRadius[] = hotspots.map((hs) => {
    const entity = allEntities.find((e) => e.id === hs.entityId)!;
    const coupled = couplingByFile.get(entity.location.file) ?? [];
    const contributors = entity.churn?.authors ?? 1;
    return computeBlastRadius(
      graph,
      hs.entityId,
      testedEntities,
      coupled,
      contributors
    );
  });

  // Mark temporal couplings with static dependency info
  const staticDeps = new Set<string>();
  for (const edge of allEdges) {
    const srcFile = edge.source.split("::")[0];
    const tgtFile = edge.target.split("::")[0];
    if (srcFile !== tgtFile) {
      staticDeps.add([srcFile, tgtFile].sort().join("\0"));
    }
  }

  const enrichedCouplings = temporalCouplings.map((tc) => ({
    ...tc,
    hasStaticDependency: staticDeps.has(
      [tc.fileA, tc.fileB].sort().join("\0")
    ),
  }));

  return {
    version: "0.1.0",
    repository: repoPath,
    analyzedAt: new Date().toISOString(),
    entities: allEntities,
    edges: allEdges,
    hotspots,
    blastRadii,
    temporalCouplings: enrichedCouplings,
  };
}

function resolveCallee(
  calleeName: string,
  currentFile: string,
  entities: Entity[]
): string | null {
  // Try exact match first
  const exact = entities.find((e) => e.id === calleeName);
  if (exact) return exact.id;

  // Try matching by function name within same file
  const sameFile = entities.find(
    (e) => e.location.file === currentFile && e.name === calleeName
  );
  if (sameFile) return sameFile.id;

  // Try matching just by function name
  const byName = entities.find((e) => e.name === calleeName);
  if (byName) return byName.id;

  return null;
}

async function findTSFiles(repoPath: string): Promise<string[]> {
  const proc = Bun.spawn(
    [
      "find",
      repoPath,
      "-type",
      "f",
      "(",
      "-name",
      "*.ts",
      "-o",
      "-name",
      "*.tsx",
      "-o",
      "-name",
      "*.js",
      "-o",
      "-name",
      "*.jsx",
      ")",
      "-not",
      "-path",
      "*/node_modules/*",
      "-not",
      "-path",
      "*/.git/*",
      "-not",
      "-path",
      "*/dist/*",
      "-not",
      "-path",
      "*/build/*",
    ],
    { cwd: repoPath, stdout: "pipe", stderr: "pipe" }
  );

  const output = await new Response(proc.stdout).text();
  await proc.exited;

  return output
    .trim()
    .split("\n")
    .filter((f) => f.length > 0)
    .sort();
}
