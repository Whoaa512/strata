#!/usr/bin/env bun
// strata.ts — single-file code complexity analyzer for TS/JS repos

import Parser from "web-tree-sitter";
import { resolve, join, relative, extname, dirname } from "path";
import { existsSync, readFileSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FileChurn {
  path: string;
  commits: number;
  linesAdded: number;
  linesRemoved: number;
}

interface CommitFiles {
  hash: string;
  timestamp: number;
  files: string[];
}

interface TemporalCoupling {
  fileA: string;
  fileB: string;
  cochanges: number;
  totalChangesA: number;
  totalChangesB: number;
  couplingStrength: number;
}

interface FunctionInfo {
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  cognitiveComplexity: number;
  lineCount: number;
  params: number;
  calls: string[];
}

interface Hotspot {
  file: string;
  function: string;
  startLine: number;
  cognitiveComplexity: number;
  churn: number;
  score: number;
}

interface BlastRadius {
  function: string;
  file: string;
  forwardDeps: string[];
  depth: number;
  untested: string[];
  testCoverage: number;
  riskScore: number;
}

interface SvEntity {
  id: string;
  type: "function" | "file" | "module";
  name: string;
  file: string;
  startLine?: number;
  endLine?: number;
  metrics: Record<string, number>;
}

interface SvEdge {
  source: string;
  target: string;
  type: "calls" | "co_changes_with" | "contains";
  weight?: number;
}

interface SvDocument {
  version: "0.1.0";
  timestamp: string;
  repository: string;
  entities: SvEntity[];
  edges: SvEdge[];
  hotspots: Hotspot[];
  blastRadii: BlastRadius[];
  temporalCouplings: TemporalCoupling[];
}

// ─── Git Analysis ───────────────────────────────────────────────────────────

const TS_JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);

function isTargetFile(path: string): boolean {
  return TS_JS_EXTENSIONS.has(extname(path));
}

async function run(cmd: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text;
}

export async function getFileChurn(repoPath: string, months = 12): Promise<FileChurn[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 10);

  const log = await run(
    ["git", "log", "--numstat", `--since=${sinceStr}`, "--format="],
    repoPath
  );

  const churnMap = new Map<string, FileChurn>();

  for (const line of log.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split("\t");
    if (parts.length !== 3) continue;

    const [added, removed, filePath] = parts as [string, string, string];
    if (!isTargetFile(filePath)) continue;
    if (added === "-" || removed === "-") continue;

    const existing = churnMap.get(filePath) ?? {
      path: filePath,
      commits: 0,
      linesAdded: 0,
      linesRemoved: 0,
    };
    existing.commits++;
    existing.linesAdded += parseInt(added, 10);
    existing.linesRemoved += parseInt(removed, 10);
    churnMap.set(filePath, existing);
  }

  return [...churnMap.values()].sort((a, b) => b.commits - a.commits);
}

export async function getCommitFiles(repoPath: string, months = 12): Promise<CommitFiles[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 10);

  const log = await run(
    ["git", "log", "--name-only", `--since=${sinceStr}`, "--format=%H|%at"],
    repoPath
  );

  const commits: CommitFiles[] = [];
  let current: CommitFiles | null = null;

  for (const line of log.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current && current.files.length > 0) {
        commits.push(current);
      }
      current = null;
      continue;
    }

    if (trimmed.includes("|") && !trimmed.includes("/")) {
      const [hash, ts] = trimmed.split("|") as [string, string];
      current = { hash, timestamp: parseInt(ts, 10), files: [] };
      continue;
    }

    if (current && isTargetFile(trimmed)) {
      current.files.push(trimmed);
    }
  }

  if (current && current.files.length > 0) {
    commits.push(current);
  }

  return commits;
}

export function computeTemporalCoupling(
  commits: CommitFiles[],
  minCochanges = 3
): TemporalCoupling[] {
  const pairCount = new Map<string, number>();
  const fileCount = new Map<string, number>();

  for (const commit of commits) {
    const files = commit.files;
    for (const f of files) {
      fileCount.set(f, (fileCount.get(f) ?? 0) + 1);
    }
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const key = [files[i], files[j]].sort().join("|||");
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  const couplings: TemporalCoupling[] = [];
  for (const [key, count] of pairCount) {
    if (count < minCochanges) continue;
    const [fileA, fileB] = key.split("|||") as [string, string];
    const totalA = fileCount.get(fileA) ?? 0;
    const totalB = fileCount.get(fileB) ?? 0;
    const strength = count / Math.max(totalA, totalB);
    couplings.push({
      fileA,
      fileB,
      cochanges: count,
      totalChangesA: totalA,
      totalChangesB: totalB,
      couplingStrength: strength,
    });
  }

  return couplings.sort((a, b) => b.couplingStrength - a.couplingStrength);
}

// ─── Tree-sitter Analysis ───────────────────────────────────────────────────

let tsParser: Parser | null = null;
let tsLang: Parser.Language | null = null;
let jsLang: Parser.Language | null = null;
let tsxLang: Parser.Language | null = null;

async function initParser(): Promise<void> {
  if (tsParser) return;

  const wasmDir = resolve(dirname(import.meta.path), "node_modules/tree-sitter-wasms/out");
  const parserWasm = resolve(dirname(import.meta.path), "node_modules/web-tree-sitter/tree-sitter.wasm");

  await Parser.init({
    locateFile: () => parserWasm,
  });
  tsParser = new Parser();

  tsLang = await Parser.Language.load(join(wasmDir, "tree-sitter-typescript.wasm"));
  jsLang = await Parser.Language.load(join(wasmDir, "tree-sitter-javascript.wasm"));
  tsxLang = await Parser.Language.load(join(wasmDir, "tree-sitter-tsx.wasm"));
}

function getLang(filePath: string): Parser.Language | null {
  const ext = extname(filePath);
  switch (ext) {
    case ".ts":
    case ".mts":
    case ".cts":
      return tsLang;
    case ".tsx":
      return tsxLang;
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return jsLang;
    default:
      return null;
  }
}

const COMPLEXITY_NODE_TYPES = new Set([
  "if_statement",
  "else_clause",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "catch_clause",
  "ternary_expression",
  "switch_case",
  "binary_expression",
]);

const LOGICAL_OPS = new Set(["&&", "||", "??"]);
const NESTING_TYPES = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "catch_clause",
  "switch_statement",
]);

export function computeCognitiveComplexity(node: Parser.SyntaxNode): number {
  let complexity = 0;

  function walk(n: Parser.SyntaxNode, nesting: number): void {
    if (COMPLEXITY_NODE_TYPES.has(n.type)) {
      if (n.type === "else_clause") {
        complexity += 1;
      } else if (n.type === "binary_expression") {
        const op = n.childForFieldName("operator")?.text ?? n.children[1]?.text;
        if (op && LOGICAL_OPS.has(op)) {
          complexity += 1;
        }
      } else {
        complexity += 1 + nesting;
      }
    }

    const nextNesting = NESTING_TYPES.has(n.type) ? nesting + 1 : nesting;

    for (const child of n.children) {
      walk(child, nextNesting);
    }
  }

  walk(node, 0);
  return complexity;
}

function extractFunctionName(node: Parser.SyntaxNode): string | null {
  const nameNode = node.childForFieldName("name");
  if (nameNode) return nameNode.text;

  if (node.parent?.type === "variable_declarator") {
    return node.parent.childForFieldName("name")?.text ?? null;
  }
  if (node.parent?.type === "pair") {
    return node.parent.childForFieldName("key")?.text ?? null;
  }
  if (node.parent?.type === "assignment_expression") {
    return node.parent.childForFieldName("left")?.text ?? null;
  }
  return null;
}

function extractCalls(node: Parser.SyntaxNode): string[] {
  const calls: string[] = [];

  function walk( n: Parser.SyntaxNode): void {
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function");
      if (fn) {
        calls.push(fn.text);
      }
    }
    for (const child of n.children) {
      walk(child);
    }
  }

  walk(node);
  return calls;
}

function countParams(node: Parser.SyntaxNode): number {
  const params = node.childForFieldName("parameters");
  if (!params) return 0;
  return params.children.filter(
    (c) => c.type !== "(" && c.type !== ")" && c.type !== ","
  ).length;
}

const FUNCTION_TYPES = new Set([
  "function_declaration",
  "method_definition",
  "arrow_function",
  "function",
  "function_expression",
]);

export function extractFunctions(
  tree: Parser.Tree,
  filePath: string
): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  function walk(node: Parser.SyntaxNode): void {
    if (FUNCTION_TYPES.has(node.type)) {
      const name = extractFunctionName(node) ?? `<anonymous:${node.startPosition.row + 1}>`;
      const body = node.childForFieldName("body") ?? node;
      functions.push({
        name,
        file: filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        cognitiveComplexity: computeCognitiveComplexity(body),
        lineCount: node.endPosition.row - node.startPosition.row + 1,
        params: countParams(node),
        calls: extractCalls(body),
      });
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  walk(tree.rootNode);
  return functions;
}

export async function analyzeFile(
  filePath: string,
  repoPath: string
): Promise<FunctionInfo[]> {
  await initParser();
  if (!tsParser) return [];

  const lang = getLang(filePath);
  if (!lang) return [];

  const fullPath = resolve(repoPath, filePath);
  if (!existsSync(fullPath)) return [];

  const source = readFileSync(fullPath, "utf-8");
  tsParser.setLanguage(lang);
  const tree = tsParser.parse(source);

  return extractFunctions(tree, filePath);
}

// ─── Test Detection ─────────────────────────────────────────────────────────

const TEST_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /__tests__\//,
  /\.stories\./,
  /test\//i,
  /tests\//i,
  /spec\//i,
];

function isTestFile(path: string): boolean {
  return TEST_PATTERNS.some((p) => p.test(path));
}

async function findTestFiles(repoPath: string): Promise<Set<string>> {
  const result = await run(
    ["git", "ls-files", "--", "*.ts", "*.tsx", "*.js", "*.jsx"],
    repoPath
  );
  const testFiles = new Set<string>();
  for (const line of result.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && isTestFile(trimmed)) {
      testFiles.add(trimmed);
    }
  }
  return testFiles;
}

function findTestsForFunction(
  funcName: string,
  filePath: string,
  testFiles: Set<string>,
  allFunctions: FunctionInfo[]
): boolean {
  const baseName = filePath.replace(/\.[^.]+$/, "");
  const testPatterns = [
    `${baseName}.test.`,
    `${baseName}.spec.`,
    baseName.replace(/src\//, "test/"),
    baseName.replace(/src\//, "tests/"),
    baseName.replace(/src\//, "__tests__/"),
  ];

  for (const testFile of testFiles) {
    for (const pattern of testPatterns) {
      if (testFile.startsWith(pattern) || testFile.includes(pattern)) {
        return true;
      }
    }
  }

  for (const testFile of testFiles) {
    const testFuncs = allFunctions.filter((f) => f.file === testFile);
    for (const tf of testFuncs) {
      if (tf.calls.some((c) => c.includes(funcName))) {
        return true;
      }
    }
  }

  return false;
}

// ─── Blast Radius ───────────────────────────────────────────────────────────

function buildCallGraph(
  allFunctions: FunctionInfo[]
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const funcByName = new Map<string, string>();

  for (const f of allFunctions) {
    const key = `${f.file}::${f.name}`;
    funcByName.set(f.name, key);
    if (!graph.has(key)) graph.set(key, new Set());
  }

  for (const f of allFunctions) {
    const callerKey = `${f.file}::${f.name}`;
    for (const call of f.calls) {
      const simpleName = call.split(".").pop() ?? call;
      const calleeKey = funcByName.get(simpleName);
      if (calleeKey && calleeKey !== callerKey) {
        graph.get(callerKey)?.add(calleeKey);
      }
    }
  }

  return graph;
}

function forwardSlice(
  start: string,
  graph: Map<string, Set<string>>,
  maxDepth = 10
): { deps: string[]; depth: number } {
  const visited = new Set<string>();
  const queue: [string, number][] = [[start, 0]];
  let maxReached = 0;

  while (queue.length > 0) {
    const [current, depth] = queue.shift()!;
    if (visited.has(current) || depth > maxDepth) continue;
    visited.add(current);
    maxReached = Math.max(maxReached, depth);

    const neighbors = graph.get(current);
    if (neighbors) {
      for (const n of neighbors) {
        if (!visited.has(n)) {
          queue.push([n, depth + 1]);
        }
      }
    }
  }

  visited.delete(start);
  return { deps: [...visited], depth: maxReached };
}

export function computeBlastRadii(
  allFunctions: FunctionInfo[],
  testFiles: Set<string>
): BlastRadius[] {
  const graph = buildCallGraph(allFunctions);
  const results: BlastRadius[] = [];

  for (const f of allFunctions) {
    if (isTestFile(f.file)) continue;

    const key = `${f.file}::${f.name}`;
    const { deps, depth } = forwardSlice(key, graph);

    const untested = deps.filter((dep) => {
      const [file, name] = dep.split("::") as [string, string];
      return !findTestsForFunction(name, file, testFiles, allFunctions);
    });

    const coverage = deps.length > 0 ? 1 - untested.length / deps.length : 1;

    const riskScore =
      (deps.length * 0.3 + untested.length * 0.5 + depth * 0.2) *
      (f.cognitiveComplexity > 0 ? Math.log2(f.cognitiveComplexity + 1) : 1);

    results.push({
      function: f.name,
      file: f.file,
      forwardDeps: deps,
      depth,
      untested,
      testCoverage: Math.round(coverage * 100) / 100,
      riskScore: Math.round(riskScore * 100) / 100,
    });
  }

  return results.sort((a, b) => b.riskScore - a.riskScore);
}

// ─── Hotspot Computation ────────────────────────────────────────────────────

export function computeHotspots(
  functions: FunctionInfo[],
  churn: FileChurn[]
): Hotspot[] {
  const churnMap = new Map<string, number>();
  for (const c of churn) {
    churnMap.set(c.path, c.commits);
  }

  const hotspots: Hotspot[] = [];
  for (const f of functions) {
    if (isTestFile(f.file)) continue;
    if (f.cognitiveComplexity === 0) continue;

    const fileChurn = churnMap.get(f.file) ?? 0;
    if (fileChurn === 0) continue;

    hotspots.push({
      file: f.file,
      function: f.name,
      startLine: f.startLine,
      cognitiveComplexity: f.cognitiveComplexity,
      churn: fileChurn,
      score: f.cognitiveComplexity * fileChurn,
    });
  }

  return hotspots.sort((a, b) => b.score - a.score);
}

// ─── .sv Document Builder ───────────────────────────────────────────────────

export function buildSvDocument(
  repoPath: string,
  functions: FunctionInfo[],
  hotspots: Hotspot[],
  blastRadii: BlastRadius[],
  temporalCouplings: TemporalCoupling[]
): SvDocument {
  const entities: SvEntity[] = [];
  const edges: SvEdge[] = [];
  const seenFiles = new Set<string>();

  for (const f of functions) {
    const id = `${f.file}::${f.name}`;
    entities.push({
      id,
      type: "function",
      name: f.name,
      file: f.file,
      startLine: f.startLine,
      endLine: f.endLine,
      metrics: {
        cognitiveComplexity: f.cognitiveComplexity,
        lineCount: f.lineCount,
        params: f.params,
      },
    });

    if (!seenFiles.has(f.file)) {
      seenFiles.add(f.file);
      entities.push({
        id: f.file,
        type: "file",
        name: f.file,
        file: f.file,
        metrics: {},
      });
    }

    edges.push({
      source: f.file,
      target: id,
      type: "contains",
    });

    for (const call of f.calls) {
      const simpleName = call.split(".").pop() ?? call;
      const target = functions.find(
        (tf) => tf.name === simpleName && `${tf.file}::${tf.name}` !== id
      );
      if (target) {
        edges.push({
          source: id,
          target: `${target.file}::${target.name}`,
          type: "calls",
        });
      }
    }
  }

  for (const tc of temporalCouplings) {
    edges.push({
      source: tc.fileA,
      target: tc.fileB,
      type: "co_changes_with",
      weight: tc.couplingStrength,
    });
  }

  return {
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    repository: repoPath,
    entities,
    edges,
    hotspots,
    blastRadii,
    temporalCouplings,
  };
}

// ─── Analysis Pipeline ──────────────────────────────────────────────────────

export async function analyze(
  repoPath: string,
  options: { months?: number; top?: number; minCochanges?: number } = {}
): Promise<SvDocument> {
  const { months = 12, top = 10, minCochanges = 3 } = options;

  const absPath = resolve(repoPath);

  if (!existsSync(join(absPath, ".git"))) {
    throw new Error(`Not a git repository: ${absPath}`);
  }

  process.stderr.write("⏳ Analyzing git history...\n");
  const [churn, commits] = await Promise.all([
    getFileChurn(absPath, months),
    getCommitFiles(absPath, months),
  ]);

  process.stderr.write("⏳ Computing temporal coupling...\n");
  const temporalCouplings = computeTemporalCoupling(commits, minCochanges);

  const sourceFiles = await run(
    ["git", "ls-files", "--", "*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs"],
    absPath
  );
  const files = sourceFiles
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f && !isTestFile(f));

  process.stderr.write(`⏳ Parsing ${files.length} source files...\n`);
  await initParser();

  const allFunctions: FunctionInfo[] = [];
  for (const file of files) {
    const funcs = await analyzeFile(file, absPath);
    allFunctions.push(...funcs);
  }

  process.stderr.write(`⏳ Found ${allFunctions.length} functions, computing hotspots...\n`);
  const hotspots = computeHotspots(allFunctions, churn);

  process.stderr.write("⏳ Finding test files...\n");
  const testFiles = await findTestFiles(absPath);

  const testFunctions: FunctionInfo[] = [];
  for (const testFile of testFiles) {
    const funcs = await analyzeFile(testFile, absPath);
    testFunctions.push(...funcs);
  }

  process.stderr.write("⏳ Computing blast radii...\n");
  const allFuncsWithTests = [...allFunctions, ...testFunctions];
  const blastRadii = computeBlastRadii(allFuncsWithTests, testFiles);

  return buildSvDocument(
    absPath,
    allFunctions,
    hotspots.slice(0, top),
    blastRadii.slice(0, top),
    temporalCouplings.filter(
      (tc) =>
        !hasStaticDependency(tc.fileA, tc.fileB, allFunctions)
    ).slice(0, top)
  );
}

function hasStaticDependency(
  fileA: string,
  fileB: string,
  functions: FunctionInfo[]
): boolean {
  const funcsInA = functions.filter((f) => f.file === fileA);
  const funcsInB = functions.filter((f) => f.file === fileB);
  const namesInB = new Set(funcsInB.map((f) => f.name));
  const namesInA = new Set(funcsInA.map((f) => f.name));

  for (const f of funcsInA) {
    for (const call of f.calls) {
      const simpleName = call.split(".").pop() ?? call;
      if (namesInB.has(simpleName)) return true;
    }
  }
  for (const f of funcsInB) {
    for (const call of f.calls) {
      const simpleName = call.split(".").pop() ?? call;
      if (namesInA.has(simpleName)) return true;
    }
  }
  return false;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function printReport(doc: SvDocument, top: number): void {
  console.log("\n🔥 TOP HOTSPOTS (complexity × churn)");
  console.log("─".repeat(80));
  if (doc.hotspots.length === 0) {
    console.log("  No hotspots found.");
  }
  for (const h of doc.hotspots.slice(0, top)) {
    console.log(
      `  ${h.score.toString().padStart(6)} │ ${h.file}::${h.function} (L${h.startLine})  complexity=${h.cognitiveComplexity} churn=${h.churn}`
    );
  }

  console.log("\n💥 BLAST RADIUS (forward deps + test gaps)");
  console.log("─".repeat(80));
  if (doc.blastRadii.length === 0) {
    console.log("  No blast radius data.");
  }
  for (const b of doc.blastRadii.slice(0, top)) {
    console.log(
      `  risk=${b.riskScore.toString().padStart(6)} │ ${b.file}::${b.function}  deps=${b.forwardDeps.length} untested=${b.untested.length} coverage=${(b.testCoverage * 100).toFixed(0)}% depth=${b.depth}`
    );
  }

  console.log("\n🔗 TEMPORAL COUPLING (co-change without static dep)");
  console.log("─".repeat(80));
  if (doc.temporalCouplings.length === 0) {
    console.log("  No temporal couplings found.");
  }
  for (const tc of doc.temporalCouplings.slice(0, top)) {
    console.log(
      `  strength=${tc.couplingStrength.toFixed(2).padStart(5)} │ ${tc.fileA} ↔ ${tc.fileB}  (${tc.cochanges} co-changes)`
    );
  }
  console.log();
}

function printUsage(): void {
  console.log(`
strata — code complexity analyzer for TS/JS repos

Usage:
  bun strata.ts <repo-path> [options]

Options:
  --months <n>         Git history window (default: 12)
  --top <n>            Number of results per section (default: 10)
  --min-cochanges <n>  Minimum co-changes for coupling (default: 3)
  --json               Output raw .sv JSON only
  --output <file>      Write .sv JSON to file
  -h, --help           Show this help
`);
}

function parseArgs(args: string[]): {
  repoPath: string;
  months: number;
  top: number;
  minCochanges: number;
  json: boolean;
  output: string | null;
} {
  let repoPath = ".";
  let months = 12;
  let top = 10;
  let minCochanges = 3;
  let json = false;
  let output: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    switch (arg) {
      case "--months":
        months = parseInt(args[++i] ?? "12", 10);
        break;
      case "--top":
        top = parseInt(args[++i] ?? "10", 10);
        break;
      case "--min-cochanges":
        minCochanges = parseInt(args[++i] ?? "3", 10);
        break;
      case "--json":
        json = true;
        break;
      case "--output":
        output = args[++i] ?? null;
        break;
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
      default:
        if (!arg.startsWith("-")) {
          repoPath = arg;
        }
    }
  }

  return { repoPath, months, top, minCochanges, json, output };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  const doc = await analyze(opts.repoPath, {
    months: opts.months,
    top: opts.top,
    minCochanges: opts.minCochanges,
  });

  if (opts.output) {
    await Bun.write(opts.output, JSON.stringify(doc, null, 2));
    process.stderr.write(`✅ Wrote .sv document to ${opts.output}\n`);
  }

  if (opts.json) {
    console.log(JSON.stringify(doc, null, 2));
  } else {
    printReport(doc, opts.top);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  });
}
