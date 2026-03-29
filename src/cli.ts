#!/usr/bin/env bun
import { analyze, writeSvFile } from "./analyze";
import { renderReport } from "./render";
import { renderBrief, renderFileBrief } from "./brief";
import path from "path";

const args = process.argv.slice(2);
const command = args[0];
const target = args[1] ?? ".";

function usage() {
  console.log(`
  strata - agent-centric code intelligence

  Usage:
    strata brief [path]             Agent risk map for entire codebase
    strata brief [path] <file>      Detailed briefing for a specific file
    strata analyze <path>           Analyze codebase, write .strata/analysis.sv.json
    strata report <path>            Analyze and print terminal report
    strata explore <path>           Analyze and open interactive explorer
    strata help                     Show this message

  Keyboard shortcuts (explorer):
    1-5    Switch overlays
    0      Reset view
    /      Search
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
