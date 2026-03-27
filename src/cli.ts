#!/usr/bin/env bun

import { Engine } from "./engine";
import {
  cognitiveComplexityPlugin,
  churnPlugin,
  blastRadiusPlugin,
  temporalCouplingPlugin,
} from "./plugins";
import type { SvDocument } from "./types";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  console.log(`strata - code complexity analyzer (v4: plugin architecture)

Usage: strata <repo-path> [options]

Options:
  --top N          Show top N hotspots (default: 10)
  --json           Output raw .sv JSON
  --out <path>     Write .sv JSON to file
  -h, --help       Show this help`);
  process.exit(0);
}

const repoPath = resolve(args.find((a) => !a.startsWith("-")) ?? ".");
const topN = parseInt(args[args.indexOf("--top") + 1]) || 10;
const jsonMode = args.includes("--json");
const outIdx = args.indexOf("--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

async function main() {
  const engine = new Engine()
    .use(cognitiveComplexityPlugin)
    .use(churnPlugin)
    .use(blastRadiusPlugin)
    .use(temporalCouplingPlugin);

  console.error(`Analyzing ${repoPath}...`);
  const doc = await engine.analyze(repoPath);

  if (outPath) {
    await writeFile(outPath, JSON.stringify(doc, null, 2));
    console.error(`Wrote .sv document to ${outPath}`);
  }

  if (jsonMode) {
    console.log(JSON.stringify(doc, null, 2));
    return;
  }

  printReport(doc, topN);
}

function printReport(doc: SvDocument, topN: number) {
  const w = process.stdout.columns || 80;
  const line = "─".repeat(w);

  console.log();
  console.log(`\x1b[1m🔍 Strata Analysis: ${doc.repo}\x1b[0m`);
  console.log(`   ${doc.entities.length} entities, ${doc.edges.length} edges`);
  console.log();

  // Hotspots
  console.log(`\x1b[1m🔥 Top ${topN} Hotspots\x1b[0m (complexity × churn)`);
  console.log(line);

  if (doc.hotspots.length === 0) {
    console.log("  No hotspots found (need git history for churn data)");
  }

  for (const h of doc.hotspots.slice(0, topN)) {
    const entity = doc.entities.find((e) => e.id === h.entityId);
    const name = entity ? `${entity.filePath}::${entity.name}` : h.entityId;
    const bar = "█".repeat(Math.min(30, Math.round(h.score / 2)));
    console.log(
      `  ${bar} \x1b[33m${h.score.toFixed(0)}\x1b[0m  ${name} (cc=${h.complexity}, churn=${h.churn})`
    );
  }

  // Blast radius
  console.log();
  console.log(`\x1b[1m💥 Highest Blast Radius\x1b[0m`);
  console.log(line);

  const byBlast = doc.entities
    .filter((e) => e.kind === "function" && (e.metrics.blastRadius ?? 0) > 0)
    .sort((a, b) => (b.metrics.blastRadius ?? 0) - (a.metrics.blastRadius ?? 0))
    .slice(0, topN);

  if (byBlast.length === 0) {
    console.log("  No functions with measurable blast radius");
  }

  for (const e of byBlast) {
    const gap = e.metrics.testCoverageGap ?? 0;
    const gapStr = gap > 0 ? `\x1b[31m${(gap * 100).toFixed(0)}% untested\x1b[0m` : "\x1b[32mcovered\x1b[0m";
    console.log(
      `  ${e.filePath}::${e.name}  radius=${e.metrics.blastRadius}  ${gapStr}`
    );
  }

  // Temporal coupling
  console.log();
  console.log(`\x1b[1m🔗 Temporal Coupling\x1b[0m (files that co-change without static dependency)`);
  console.log(line);

  const couplings = doc.edges
    .filter((e) => e.kind === "co_changes_with")
    .slice(0, topN);

  if (couplings.length === 0) {
    console.log("  No significant temporal coupling found");
  }

  for (const e of couplings) {
    const a = e.source.replace("file::", "");
    const b = e.target.replace("file::", "");
    console.log(`  ${a}  ↔  ${b}  (${e.weight} co-changes)`);
  }

  console.log();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
