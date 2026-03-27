#!/usr/bin/env bun
import { analyze } from "../pipeline";
import { StrataDocumentSchema } from "../schema";
import path from "path";

const args = process.argv.slice(2);

function usage(): never {
  console.error(`Usage: strata <repo-path> [options]

Options:
  --months <n>      Git history depth (default: 12)
  --top <n>         Number of hotspots (default: 10)
  --min-cochanges <n>  Min co-changes for coupling (default: 2)
  --json            Output raw .sv JSON
  --output <path>   Write .sv file to path
  -h, --help        Show this help
`);
  process.exit(1);
}

if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
  usage();
}

const repoPath = path.resolve(args[0]);
let months = 12;
let topN = 10;
let minCoChanges = 2;
let jsonOutput = false;
let outputPath: string | null = null;

for (let i = 1; i < args.length; i++) {
  switch (args[i]) {
    case "--months":
      months = parseInt(args[++i]) || 12;
      break;
    case "--top":
      topN = parseInt(args[++i]) || 10;
      break;
    case "--min-cochanges":
      minCoChanges = parseInt(args[++i]) || 2;
      break;
    case "--json":
      jsonOutput = true;
      break;
    case "--output":
      outputPath = args[++i];
      break;
    default:
      console.error(`Unknown option: ${args[i]}`);
      usage();
  }
}

async function main() {
  console.error(`\n🔍 Analyzing ${repoPath}...\n`);

  const doc = await analyze({ repoPath, months, topN, minCoChanges });

  if (outputPath) {
    await Bun.write(outputPath, JSON.stringify(doc, null, 2));
    console.error(`📄 Wrote .sv document to ${outputPath}`);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(doc, null, 2));
    return;
  }

  printReport(doc);
}

function printReport(doc: ReturnType<typeof StrataDocumentSchema.parse> extends infer T ? T : never) {
  const { entities, hotspots, blastRadii, temporalCouplings, edges } = doc as any;

  console.log("═══════════════════════════════════════════════════════");
  console.log("  STRATA — Code Complexity Analysis");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Repository:  ${doc.repository}`);
  console.log(`  Entities:    ${entities.length} functions/methods`);
  console.log(`  Call edges:  ${edges.length}`);
  console.log(`  Analyzed:    ${doc.analyzedAt}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // Top hotspots
  console.log("🔥 TOP HOTSPOTS (complexity × churn)");
  console.log("───────────────────────────────────────────────────────");
  if (hotspots.length === 0) {
    console.log("  No hotspots found (no churn data or zero complexity)");
  }
  for (let i = 0; i < hotspots.length; i++) {
    const hs = hotspots[i];
    const entity = entities.find((e: any) => e.id === hs.entityId);
    const loc = entity
      ? `${entity.location.file}:${entity.location.startLine}`
      : hs.entityId;
    console.log(
      `  ${(i + 1).toString().padStart(2)}. ${hs.score.toString().padStart(6)} │ complexity: ${hs.complexity.toString().padStart(3)} × churn: ${hs.churn.toString().padStart(3)} │ ${loc}`
    );
  }
  console.log();

  // Blast radius
  console.log("💥 BLAST RADIUS (per hotspot)");
  console.log("───────────────────────────────────────────────────────");
  if (blastRadii.length === 0) {
    console.log("  No blast radius data");
  }
  for (const br of blastRadii) {
    const entity = entities.find((e: any) => e.id === br.entityId);
    const name = entity?.name ?? br.entityId;
    const coverage = (br.testCoverage * 100).toFixed(0);
    const affected = br.forwardSlice.length;
    console.log(
      `  ${name.padEnd(35)} │ affects: ${affected.toString().padStart(3)} │ test coverage: ${coverage.padStart(3)}% │ risk: ${br.riskScore.toFixed(1).padStart(6)} │ contributors: ${br.contributorCount}`
    );
    if (br.changeCoupling.length > 0) {
      console.log(
        `    coupled with: ${br.changeCoupling.slice(0, 5).join(", ")}`
      );
    }
  }
  console.log();

  // Temporal coupling
  const surprisingCouplings = temporalCouplings.filter(
    (tc: any) => !tc.hasStaticDependency
  );
  console.log("🔗 TEMPORAL COUPLING (no static dependency — surprising co-changes)");
  console.log("───────────────────────────────────────────────────────");
  if (surprisingCouplings.length === 0) {
    console.log("  No surprising temporal couplings found");
  }
  for (const tc of surprisingCouplings.slice(0, 15)) {
    const conf = (tc.confidence * 100).toFixed(0);
    console.log(
      `  ${tc.fileA.padEnd(30)} ↔ ${tc.fileB.padEnd(30)} │ ${tc.coChangeCount} co-changes │ confidence: ${conf}%`
    );
  }
  console.log();
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
