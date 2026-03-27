import { resolve, relative, join } from "path";
import { existsSync, readdirSync, writeFileSync } from "fs";
import { CodeGraph } from "./graph";
import { getParser, parseFile, readSource } from "./parser";
import { extractFromTree } from "./extractor";
import { cognitiveComplexity, nestingDepth, parameterCount } from "./complexity";
import { parseGitLog, computeChurn, computeTemporalCoupling } from "./git";
import {
  computeHotspots,
  computeAllBlastRadii,
  detectTestFiles,
  findTestedEntities,
} from "./metrics";
import { buildStrataView } from "./sv-format";
import type Parser from "web-tree-sitter";

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

interface AnalysisResult {
  graph: CodeGraph;
  hotspots: ReturnType<typeof computeHotspots>;
  blastRadii: ReturnType<typeof computeAllBlastRadii>;
  temporalCouplings: ReturnType<typeof computeTemporalCoupling>;
}

export async function analyze(repoPath: string, months: number = 12): Promise<AnalysisResult> {
  const absPath = resolve(repoPath);
  if (!existsSync(absPath)) {
    throw new Error(`Path does not exist: ${absPath}`);
  }

  const graph = new CodeGraph();
  const files = collectSourceFiles(absPath);

  process.stderr.write(`Parsing ${files.length} files...\n`);

  for (const file of files) {
    const relPath = relative(absPath, file);
    try {
      const parser = await getParser(file);
      const source = readSource(file);
      const tree = parseFile(parser, source);
      extractFromTree(tree, relPath, graph);
      annotateComplexity(tree, relPath, graph);
    } catch (e) {
      process.stderr.write(`  Skipping ${relPath}: ${(e as Error).message}\n`);
    }
  }

  process.stderr.write(`Analyzing git history (${months} months)...\n`);
  const commits = parseGitLog(absPath, months);
  const churnMap = computeChurn(absPath, months);

  for (const [filePath, churn] of churnMap) {
    const entities = graph.entitiesInFile(filePath);
    for (const entity of entities) {
      entity.metrics.churn = churn.commits;
      entity.metrics.additions = churn.additions;
      entity.metrics.deletions = churn.deletions;
    }
  }

  const allFilePaths = files.map((f) => relative(absPath, f));
  const testFiles = detectTestFiles(allFilePaths);
  const testedEntities = findTestedEntities(graph, testFiles);

  const temporalCouplings = computeTemporalCoupling(commits, TS_EXTENSIONS);
  const hotspots = computeHotspots(graph);
  const blastRadii = computeAllBlastRadii(graph, testedEntities);

  return { graph, hotspots, blastRadii, temporalCouplings };
}

function collectSourceFiles(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      collectSourceFiles(fullPath, files);
      continue;
    }

    if (!entry.isFile()) continue;
    const ext = entry.name.slice(entry.name.lastIndexOf("."));
    if (TS_EXTENSIONS.has(ext)) files.push(fullPath);
  }

  return files;
}

function shouldSkipDir(name: string): boolean {
  return (
    name === "node_modules" ||
    name === "dist" ||
    name === "build" ||
    name === ".git" ||
    name === "coverage" ||
    name === ".next" ||
    name.startsWith(".")
  );
}

function annotateComplexity(
  tree: Parser.Tree,
  filePath: string,
  graph: CodeGraph,
): void {
  const entities = graph.entitiesInFile(filePath);
  const funcNodes = collectFunctionNodes(tree.rootNode);

  for (const entity of entities) {
    if (entity.kind !== "function") continue;

    const matchingNode = funcNodes.find(
      (n) =>
        n.startPosition.row + 1 === entity.startLine &&
        n.endPosition.row + 1 === entity.endLine,
    );

    if (!matchingNode) continue;

    entity.metrics.cognitiveComplexity = cognitiveComplexity(matchingNode);
    entity.metrics.nestingDepth = nestingDepth(matchingNode);
    entity.metrics.parameterCount = parameterCount(matchingNode);
    entity.metrics.fanOut = graph.fanOut(entity.id);
    entity.metrics.fanIn = graph.fanIn(entity.id);
    entity.metrics.lineCount = entity.endLine - entity.startLine + 1;
  }
}

function collectFunctionNodes(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const funcTypes = new Set([
    "function_declaration",
    "method_definition",
    "arrow_function",
    "function_expression",
    "function",
  ]);

  const results: Parser.SyntaxNode[] = [];
  const queue: Parser.SyntaxNode[] = [node];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (funcTypes.has(current.type)) {
      results.push(current);
    }
    for (const child of current.namedChildren) {
      queue.push(child);
    }
  }

  return results;
}

function formatReport(result: AnalysisResult, repoPath: string): string {
  const lines: string[] = [];
  const { graph, hotspots, blastRadii, temporalCouplings } = result;

  const size = graph.size();
  lines.push(`\n╔══════════════════════════════════════════╗`);
  lines.push(`║          STRATA ANALYSIS REPORT          ║`);
  lines.push(`╚══════════════════════════════════════════╝`);
  lines.push(`  Repository: ${repoPath}`);
  lines.push(`  Entities: ${size.entities} | Edges: ${size.edges}`);

  lines.push(`\n── TOP HOTSPOTS (complexity × churn) ──────`);
  if (hotspots.length === 0) {
    lines.push("  No hotspots found (need git history for churn data)");
  }
  for (const h of hotspots) {
    lines.push(
      `  ${h.score.toFixed(0).padStart(6)} │ ${h.entity.name.padEnd(30)} │ ${h.entity.filePath}`,
    );
    lines.push(
      `         │  complexity=${h.complexity} churn=${h.churn}`,
    );
  }

  lines.push(`\n── BLAST RADIUS (top 10 riskiest) ─────────`);
  const topBr = blastRadii.slice(0, 10);
  for (const br of topBr) {
    lines.push(
      `  risk=${br.riskScore.toFixed(1).padStart(6)} │ ${br.entity.name.padEnd(30)} │ ${br.entity.filePath}`,
    );
    lines.push(
      `         │  slice=${br.forwardSliceSize} fan-out=${br.fanOut} fan-in=${br.fanIn} coverage=${(br.testCoverageRatio * 100).toFixed(0)}%`,
    );
  }

  lines.push(`\n── TEMPORAL COUPLING (hidden deps) ────────`);
  if (temporalCouplings.length === 0) {
    lines.push("  No significant temporal coupling found");
  }
  for (const tc of temporalCouplings.slice(0, 10)) {
    lines.push(
      `  strength=${tc.strength.toFixed(2)} │ ${tc.fileA}`,
    );
    lines.push(
      `                │ ${tc.fileB}  (${tc.cochanges} co-changes)`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log(`Usage: strata <repo-path> [options]

Options:
  --months <n>     Git history lookback (default: 12)
  --json           Output .sv JSON instead of report
  --output <path>  Write .sv file to path
  -h, --help       Show this help`);
    process.exit(0);
  }

  const repoPath = args[0];
  const monthsIdx = args.indexOf("--months");
  const months = monthsIdx >= 0 ? parseInt(args[monthsIdx + 1], 10) : 12;
  const jsonMode = args.includes("--json");
  const outputIdx = args.indexOf("--output");
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;

  const result = await analyze(repoPath, months);
  const sv = buildStrataView(
    result.graph,
    repoPath,
    result.hotspots,
    result.blastRadii,
    result.temporalCouplings,
  );

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(sv, null, 2));
    process.stderr.write(`Wrote .sv file to ${outputPath}\n`);
  }

  if (jsonMode) {
    console.log(JSON.stringify(sv, null, 2));
  } else {
    console.log(formatReport(result, repoPath));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
