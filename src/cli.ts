#!/usr/bin/env bun
import { analyze, writeSvFile } from "./analyze";
import { renderReport } from "./render";
import { renderBrief, renderFileBrief } from "./brief";
import { getDiffFiles, getDiffHunks, analyzeDiff } from "./diff";
import { renderDiffAnalysis } from "./diff-render";
import path from "path";

const args = process.argv.slice(2);
const command = args[0];
const target = args[1] ?? ".";

function usage() {
  console.log(`
  strata - agent-centric code intelligence

  Usage:
    strata brief [path]                  Agent risk map for entire codebase
    strata brief [path] <file>           Detailed briefing for a specific file
    strata diff [path] [diffSpec]        Review a diff for missed files/tests
    strata analyze <path>                Analyze codebase, write .strata/analysis.sv.json
    strata report <path>                 Analyze and print terminal report
    strata explore <path>                Analyze and open interactive explorer
    strata help                          Show this message

  Diff specs:
    strata diff .                        Defaults to HEAD~1
    strata diff . HEAD~3                 Last 3 commits
    strata diff . main                   Compare current branch to main
    strata diff . staged                 Staged changes only
    strata diff . abc123..def456         Commit range

  Keyboard shortcuts (explorer):
    1-5    Switch overlays
    0      Reset view
    /      Search
    WASD   Pan
    Esc    Clear search / close panel
`);
}

if (!command || command === "help" || command === "--help") {
  usage();
  process.exit(0);
}

if (command === "explore") {
  const serverPath = path.join(import.meta.dir, "server.ts");
  const proc = Bun.spawn(["bun", serverPath, target], {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env, PORT: process.env.PORT ?? "4747" },
  });
  await proc.exited;
  process.exit(0);
}

if (command === "diff") {
  const diffTarget = args[1] ?? ".";
  const diffSpec = args[2] ?? "HEAD~1";
  const rootDir = path.resolve(diffTarget);
  console.log(`Analyzing ${rootDir}...`);
  const doc = analyze(rootDir);
  const diffFiles = getDiffFiles(rootDir, diffSpec);

  if (diffFiles.length === 0) {
    console.log(`  No changes found for diff spec: ${diffSpec}`);
    process.exit(0);
  }

  const hunks = getDiffHunks(rootDir, diffSpec);
  const analysis = analyzeDiff(doc, diffFiles, hunks);
  console.log(renderDiffAnalysis(analysis, diffSpec));
  process.exit(0);
}

if (command === "brief") {
  const briefTarget = args[1] ?? ".";
  const briefFile = args[2];
  const rootDir = path.resolve(briefTarget);
  console.log(`Analyzing ${rootDir}...`);
  const doc = analyze(rootDir);

  if (briefFile) {
    console.log(renderFileBrief(doc, briefFile));
  } else {
    console.log(renderBrief(doc));
  }
  process.exit(0);
}

if (command !== "analyze" && command !== "report") {
  console.error(`Unknown command: ${command}`);
  usage();
  process.exit(1);
}

const rootDir = path.resolve(target);
const start = performance.now();

console.log(`Analyzing ${rootDir}...`);
const doc = analyze(rootDir);
const elapsed = ((performance.now() - start) / 1000).toFixed(2);

if (command === "analyze") {
  const outPath = writeSvFile(doc, rootDir);
  console.log(`Done in ${elapsed}s. Output: ${outPath}`);
  console.log(`  ${doc.entities.length} entities, ${doc.callGraph.length} call edges, ${doc.errors.length} errors`);
}

if (command === "report") {
  const outPath = writeSvFile(doc, rootDir);
  console.log(renderReport(doc));
  console.log(`\n  ${outPath} written (${elapsed}s)`);
}
