import { resolve } from "node:path";
import {
	computeBlastRadii,
	computeHotspots,
	computeTemporalCouplings,
} from "./analyze.js";
import { extractFromRepo } from "./extract.js";
import { computeCoChanges, parseGitLog } from "./git.js";
import { buildSvDocument, writeSvDocument } from "./sv.js";

async function main() {
	const args = process.argv.slice(2);
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		printUsage();
		process.exit(args.length === 0 ? 1 : 0);
	}

	const repoPath = resolve(args[0]);
	const outputPath = args.find((a) => a.startsWith("--output="))?.split("=")[1];
	const months = Number.parseInt(
		args.find((a) => a.startsWith("--months="))?.split("=")[1] ?? "12",
	);
	const limit = Number.parseInt(
		args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "10",
	);
	const jsonOnly = args.includes("--json");

	if (!jsonOnly) {
		console.log(`\n🔍 Analyzing ${repoPath}...\n`);
	}

	if (!jsonOnly) process.stdout.write("  Parsing git history...");
	const { churn, commits } = await parseGitLog(repoPath, months);
	if (!jsonOnly) console.log(` ${commits.length} commits, ${churn.size} files`);

	if (!jsonOnly)
		process.stdout.write("  Extracting functions via TS compiler API...");
	const functions = extractFromRepo(repoPath);
	if (!jsonOnly) console.log(` ${functions.length} functions`);

	if (!jsonOnly) process.stdout.write("  Computing co-changes...");
	const coChanges = computeCoChanges(commits, churn);
	if (!jsonOnly) console.log(` ${coChanges.length} pairs`);

	if (!jsonOnly) process.stdout.write("  Computing hotspots...");
	const hotspots = computeHotspots(functions, churn, limit);
	if (!jsonOnly) console.log(` ${hotspots.length} hotspots`);

	if (!jsonOnly) process.stdout.write("  Computing blast radii...");
	const blastRadii = computeBlastRadii(functions, repoPath);
	if (!jsonOnly) console.log(` ${blastRadii.length} functions analyzed`);

	if (!jsonOnly) process.stdout.write("  Computing temporal couplings...");
	const temporalCouplings = computeTemporalCouplings(
		coChanges,
		functions,
		limit * 2,
	);
	if (!jsonOnly) console.log(` ${temporalCouplings.length} pairs`);

	const sv = buildSvDocument(
		repoPath,
		functions,
		hotspots,
		blastRadii,
		temporalCouplings,
	);

	if (outputPath) {
		writeSvDocument(sv, outputPath);
		if (!jsonOnly) console.log(`\n📄 .sv document written to ${outputPath}`);
	}

	if (jsonOnly) {
		console.log(JSON.stringify(sv, null, 2));
		return;
	}

	printReport(hotspots, blastRadii, temporalCouplings, limit);
}

function printReport(
	hotspots: ReturnType<typeof computeHotspots>,
	blastRadii: ReturnType<typeof computeBlastRadii>,
	temporalCouplings: ReturnType<typeof computeTemporalCouplings>,
	limit: number,
) {
	const divider = "═".repeat(72);

	console.log(`\n${divider}`);
	console.log("  🔥 TOP HOTSPOTS (complexity × churn)");
	console.log(divider);

	if (hotspots.length === 0) {
		console.log("  No hotspots found.");
	}

	for (let i = 0; i < hotspots.length; i++) {
		const h = hotspots[i];
		console.log(`  ${(i + 1).toString().padStart(2)}. ${h.name}`);
		console.log(
			`      ${h.filePath}:${h.startLine}  complexity=${h.complexity} churn=${h.churn} score=${h.score}`,
		);
	}

	console.log(`\n${divider}`);
	console.log("  💥 HIGHEST BLAST RADIUS");
	console.log(divider);

	const topBlast = blastRadii.slice(0, limit);
	if (topBlast.length === 0) {
		console.log("  No blast radius data.");
	}

	for (let i = 0; i < topBlast.length; i++) {
		const b = topBlast[i];
		const coverage = `${Math.round(b.testedRatio * 100)}%`;
		console.log(`  ${(i + 1).toString().padStart(2)}. ${b.name}`);
		console.log(
			`      ${b.filePath}  affects=${b.affectedFiles.length} files  tested=${coverage}  risk=${b.riskScore.toFixed(1)}`,
		);
		if (b.untestedAffected.length > 0) {
			console.log(
				`      ⚠ untested: ${b.untestedAffected.slice(0, 3).join(", ")}${b.untestedAffected.length > 3 ? ` +${b.untestedAffected.length - 3} more` : ""}`,
			);
		}
	}

	console.log(`\n${divider}`);
	console.log("  🔗 TEMPORAL COUPLING (no static dependency)");
	console.log(divider);

	const hidden = temporalCouplings.filter((t) => !t.hasStaticDep);
	if (hidden.length === 0) {
		console.log("  No hidden temporal couplings found.");
	}

	for (let i = 0; i < Math.min(hidden.length, limit); i++) {
		const t = hidden[i];
		console.log(
			`  ${(i + 1).toString().padStart(2)}. ${t.fileA}  ↔  ${t.fileB}`,
		);
		console.log(
			`      co-changes=${t.coChangeCount}  confidence=${(t.confidence * 100).toFixed(0)}%`,
		);
	}

	console.log();
}

function printUsage() {
	console.log(`
strata - Code complexity analyzer (v6: TypeScript compiler API)

Usage:
  strata <repo-path> [options]

Options:
  --output=<path>   Write .sv JSON document to file
  --months=<n>      Git history window (default: 12)
  --limit=<n>       Number of results per section (default: 10)
  --json            Output raw .sv JSON to stdout
  -h, --help        Show this help

Examples:
  strata .
  strata /path/to/repo --output=analysis.sv.json
  strata . --months=6 --limit=20
  strata . --json > analysis.sv.json
`);
}

main().catch((err) => {
	console.error("Error:", err.message);
	process.exit(1);
});
