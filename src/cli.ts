#!/usr/bin/env bun

import { readdirSync, statSync, existsSync, writeFileSync } from "fs";
import { join, relative, resolve } from "path";
import { initParser, parseFile, detectLang } from "./parser";
import { extractFunctions } from "./complexity";
import { computeChurn, getCommitFileSets } from "./churn";
import { extractCallEdges, computeBlastRadii } from "./callgraph";
import { computeHotspots } from "./hotspots";
import { computeTemporalCoupling } from "./coupling";
import { buildReport } from "./report";
import type { FunctionInfo, CallEdge } from "./types";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));

if (flags.has("--help") || positional.length === 0) {
  console.log(`strata - code complexity analyzer

Usage: strata <repo-path> [options]

Options:
  --json           Output raw .sv JSON
  --out <file>     Write .sv JSON to file
  --months <n>     Git history lookback (default: 12)
  --top <n>        Number of hotspots to show (default: 10)
  --help           Show this help`);
  process.exit(0);
}

const repoPath = resolve(positional[0]);
if (!existsSync(join(repoPath, ".git"))) {
  console.error("Error: not a git repo:", repoPath);
  process.exit(1);
}

const jsonMode = flags.has("--json");
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
const monthsIdx = args.indexOf("--months");
const months = monthsIdx >= 0 ? parseInt(args[monthsIdx + 1], 10) : 12;
const topIdx = args.indexOf("--top");
const topN = topIdx >= 0 ? parseInt(args[topIdx + 1], 10) : 10;

const start = performance.now();
await initParser();
const parseInitMs = performance.now() - start;

const files = collectFiles(repoPath);
console.error(`[strata] Found ${files.length} TS/JS files (parser init: ${parseInitMs.toFixed(0)}ms)`);

const parseStart = performance.now();
const allFunctions: FunctionInfo[] = [];
const allEdges: CallEdge[] = [];
const testFiles = new Set<string>();

for (const filePath of files) {
  const relPath = relative(repoPath, filePath);
  const tree = parseFile(filePath);
  if (!tree) continue;

  const fns = extractFunctions(tree.rootNode, relPath);
  allFunctions.push(...fns);

  const edges = extractCallEdges(tree.rootNode, relPath, fns);
  allEdges.push(...edges);

  if (isTestFile(relPath)) testFiles.add(relPath);

  tree.delete();
}
const parseMs = performance.now() - parseStart;
console.error(
  `[strata] Parsed ${files.length} files, found ${allFunctions.length} functions (${parseMs.toFixed(0)}ms)`
);

const churnStart = performance.now();
const churnMap = computeChurn(repoPath, months);
const commitSets = getCommitFileSets(repoPath, months);
const churnMs = performance.now() - churnStart;
console.error(`[strata] Git churn: ${churnMap.size} files, ${commitSets.length} commits (${churnMs.toFixed(0)}ms)`);

const hotspots = computeHotspots(allFunctions, churnMap, topN);
const blastRadii = computeBlastRadii(allFunctions, allEdges, testFiles);
const couplings = computeTemporalCoupling(commitSets, allEdges);

const totalMs = performance.now() - start;
console.error(`[strata] Analysis complete in ${totalMs.toFixed(0)}ms`);

const report = buildReport(
  repoPath,
  allFunctions,
  hotspots,
  blastRadii,
  couplings,
  allEdges,
  files.length
);

if (outFile) {
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.error(`[strata] Report written to ${outFile}`);
}

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printSummary(report);
}

function printSummary(r: typeof report): void {
  console.log("\n🔥 TOP HOTSPOTS (complexity × churn)");
  console.log("─".repeat(72));
  if (r.hotspots.length === 0) {
    console.log("  No hotspots detected (try increasing --months)");
  }
  for (const h of r.hotspots) {
    const bar = "█".repeat(Math.round(h.score * 40));
    console.log(
      `  ${pad(h.score.toFixed(3), 6)} ${bar}`
    );
    console.log(
      `         ${h.filePath}:${h.startLine} → ${h.functionName}  (complexity=${h.complexity}, churn=${h.churn})`
    );
  }

  console.log("\n💥 HIGHEST BLAST RADIUS");
  console.log("─".repeat(72));
  const topBlast = r.blastRadii.slice(0, topN);
  if (topBlast.length === 0) {
    console.log("  No blast radius data");
  }
  for (const b of topBlast) {
    const coverage = b.testCoverageGap ? "⚠️  NO TESTS" : "✅ tested";
    console.log(
      `  risk=${b.riskScore.toFixed(3)}  ${b.filePath} → ${b.entity}  fan-out=${b.fanOut} fan-in=${b.fanIn} slice=${b.forwardSlice.length}  ${coverage}`
    );
  }

  console.log("\n🔗 TEMPORAL COUPLING (co-change without static dependency)");
  console.log("─".repeat(72));
  const nonStatic = r.temporalCouplings.filter((c) => !c.hasStaticDependency);
  if (nonStatic.length === 0) {
    console.log("  No hidden temporal coupling detected");
  }
  for (const c of nonStatic.slice(0, topN)) {
    console.log(
      `  ${(c.confidence * 100).toFixed(0)}% confidence (${c.cochangeCount} co-changes):`
    );
    console.log(`         ${c.file1}`);
    console.log(`         ${c.file2}`);
  }

  console.log(
    `\n📊 Summary: ${r.analyzedFiles} files, ${r.totalFunctions} functions, ${totalMs.toFixed(0)}ms`
  );
}

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", ".nuxt", "vendor"]);

  function walk(d: string): void {
    for (const entry of readdirSync(d)) {
      if (entry.startsWith(".") && entry !== ".") continue;
      const full = join(d, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(full);
      } else if (detectLang(entry)) {
        result.push(full);
      }
    }
  }

  walk(dir);
  return result;
}

function isTestFile(path: string): boolean {
  return (
    path.includes(".test.") ||
    path.includes(".spec.") ||
    path.includes("__tests__") ||
    path.includes("__test__")
  );
}

function pad(s: string, n: number): string {
  return s.padStart(n);
}
