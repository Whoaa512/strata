#!/usr/bin/env bun

import path from "node:path";
import type { StrataView } from "./core/types.js";
import { type AnalyzeOptions, analyze } from "./shell/analyze.js";

function parseArgs(argv: string[]): {
	repoPath: string;
	options: Partial<AnalyzeOptions>;
	outputPath?: string;
	format: "json" | "text";
} {
	const args = argv.slice(2);
	let repoPath = ".";
	let outputPath: string | undefined;
	let format: "json" | "text" = "text";
	const options: Partial<AnalyzeOptions> = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--months" || arg === "-m") {
			options.months = Number.parseInt(args[++i], 10);
			continue;
		}
		if (arg === "--top" || arg === "-n") {
			options.topN = Number.parseInt(args[++i], 10);
			continue;
		}
		if (arg === "--min-co-changes") {
			options.minCoChanges = Number.parseInt(args[++i], 10);
			continue;
		}
		if (arg === "--min-confidence") {
			options.minConfidence = Number.parseFloat(args[++i]);
			continue;
		}
		if (arg === "--output" || arg === "-o") {
			outputPath = args[++i];
			continue;
		}
		if (arg === "--json") {
			format = "json";
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			printUsage();
			process.exit(0);
		}
		if (!arg.startsWith("-")) {
			repoPath = arg;
		}
	}

	return { repoPath: path.resolve(repoPath), options, outputPath, format };
}

function printUsage(): void {
	console.log(`
strata - code complexity analyzer for TS/JS repos

Usage: strata [repo-path] [options]

Options:
  -n, --top <N>           Number of hotspots to show (default: 10)
  -m, --months <N>        Months of git history to analyze (default: 12)
  --min-co-changes <N>    Min co-changes for temporal coupling (default: 3)
  --min-confidence <F>    Min confidence for temporal coupling (default: 0.3)
  -o, --output <path>     Write .sv JSON to file
  --json                  Output raw JSON to stdout
  -h, --help              Show this help
`);
}

function formatTextOutput(sv: StrataView): string {
	const lines: string[] = [];

	lines.push(`\n  Strata Analysis: ${sv.repo}`);
	lines.push(`  Analyzed at: ${sv.analyzedAt}`);
	lines.push(`  Files: ${sv.entities.filter((e) => e.kind === "file").length}`);
	lines.push(`  Functions: ${sv.entities.filter((e) => e.kind === "function").length}`);

	lines.push(`\n  ── Top Hotspots (complexity × churn) ──\n`);

	if (sv.hotspots.length === 0) {
		lines.push("  No hotspots found.\n");
	}

	for (let i = 0; i < sv.hotspots.length; i++) {
		const h = sv.hotspots[i];
		const entity = sv.entities.find((e) => e.id === h.entityId);
		if (!entity) continue;

		lines.push(
			`  ${(i + 1).toString().padStart(2)}. ${entity.name}` +
				`  (complexity: ${h.complexity}, churn: ${h.churn}, score: ${h.score})` +
				`\n      ${entity.filePath}:${entity.startLine}`,
		);
	}

	lines.push(`\n  ── Blast Radius (top hotspots) ──\n`);

	for (const br of sv.blastRadii) {
		const entity = sv.entities.find((e) => e.id === br.entityId);
		if (!entity) continue;

		lines.push(
			`  ${entity.name}` +
				`  → affects ${br.forwardSlice.length} functions` +
				`, test coverage: ${(br.testCoverage * 100).toFixed(0)}%` +
				`, risk: ${(br.riskScore * 100).toFixed(0)}%`,
		);

		if (br.changeCoupling.length > 0) {
			lines.push(`      coupled to: ${br.changeCoupling.slice(0, 5).join(", ")}`);
		}
	}

	lines.push(`\n  ── Temporal Coupling ──\n`);

	if (sv.temporalCoupling.length === 0) {
		lines.push("  No significant temporal coupling found.\n");
	}

	for (const tc of sv.temporalCoupling) {
		const staticTag = tc.hasStaticDependency ? "" : " ⚠ no static dep";
		lines.push(
			`  ${tc.fileA} ↔ ${tc.fileB}` +
				`  (${tc.coChangeCount} co-changes, confidence: ${(tc.confidence * 100).toFixed(0)}%${staticTag})`,
		);
	}

	lines.push("");
	return lines.join("\n");
}

async function main(): Promise<void> {
	const { repoPath, options, outputPath, format } = parseArgs(process.argv);

	const opts: AnalyzeOptions = {
		repoPath,
		months: options.months ?? 12,
		minCoChanges: options.minCoChanges ?? 3,
		minConfidence: options.minConfidence ?? 0.3,
		topN: options.topN ?? 10,
	};

	const sv = await analyze(opts);

	if (outputPath) {
		await Bun.write(outputPath, JSON.stringify(sv, null, 2));
		console.log(`Wrote ${outputPath}`);
	}

	if (format === "json") {
		console.log(JSON.stringify(sv, null, 2));
		return;
	}

	console.log(formatTextOutput(sv));
}

main().catch((err) => {
	console.error("Error:", err.message);
	process.exit(1);
});
