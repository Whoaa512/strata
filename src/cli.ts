#!/usr/bin/env bun
import { resolve } from "node:path";
import { type AnalysisResult, analyzeRepo } from "./analyzer";
import {
	badge,
	box,
	c,
	divider,
	heatBar,
	riskIndicator,
	sparkline,
	spinner,
	table,
	truncPath,
} from "./render";

const HELP = `
${c.bold("strata")} — code complexity analyzer for TS/JS repos

${c.bold("USAGE")}
  ${c.cyan("strata")} ${c.gray("[options]")} ${c.yellow("<repo-path>")}

${c.bold("OPTIONS")}
  ${c.green("-n, --top")}       Number of results per section ${c.gray("(default: 10)")}
  ${c.green("-c, --commits")}   Max git commits to analyze ${c.gray("(default: 1000)")}
  ${c.green("-o, --output")}    Write .sv JSON to file
  ${c.green("-j, --json")}      Output raw JSON instead of pretty output
  ${c.green("-q, --quiet")}     Suppress progress output
  ${c.green("-h, --help")}      Show this help

${c.bold("EXAMPLES")}
  ${c.gray("$")} strata .
  ${c.gray("$")} strata ~/code/my-project --top 20
  ${c.gray("$")} strata . --output report.sv.json
`;

interface CliArgs {
	repoPath: string;
	topN: number;
	maxCommits: number;
	outputFile: string | null;
	json: boolean;
	quiet: boolean;
	help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		repoPath: ".",
		topN: 10,
		maxCommits: 1000,
		outputFile: null,
		json: false,
		quiet: false,
		help: false,
	};

	const positional: string[] = [];
	let i = 0;
	while (i < argv.length) {
		const arg = argv[i];
		switch (arg) {
			case "-n":
			case "--top":
				args.topN = Number.parseInt(argv[++i], 10);
				break;
			case "-c":
			case "--commits":
				args.maxCommits = Number.parseInt(argv[++i], 10);
				break;
			case "-o":
			case "--output":
				args.outputFile = argv[++i];
				break;
			case "-j":
			case "--json":
				args.json = true;
				break;
			case "-q":
			case "--quiet":
				args.quiet = true;
				break;
			case "-h":
			case "--help":
				args.help = true;
				break;
			default:
				if (!arg.startsWith("-")) positional.push(arg);
				break;
		}
		i++;
	}

	if (positional.length > 0) args.repoPath = positional[0];
	return args;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	if (args.help) {
		console.log(HELP);
		process.exit(0);
	}

	const repoPath = resolve(args.repoPath);

	const spin = args.quiet ? null : spinner();
	spin?.update("Analyzing repository...");

	let result: AnalysisResult;
	try {
		result = await analyzeRepo(repoPath, args.maxCommits, args.topN);
	} catch (err) {
		spin?.done(c.red("Analysis failed"));
		console.error(c.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
		process.exit(1);
	}

	spin?.done(
		`Analyzed ${result.stats.filesScanned} files, ${result.stats.functionsFound} functions in ${result.stats.analysisTimeMs}ms`,
	);

	if (args.json) {
		console.log(JSON.stringify(result.document, null, 2));
		if (args.outputFile) {
			await Bun.write(args.outputFile, JSON.stringify(result.document, null, 2));
		}
		return;
	}

	if (args.outputFile) {
		await Bun.write(args.outputFile, JSON.stringify(result.document, null, 2));
		console.log(`${c.green("✓")} Wrote ${args.outputFile}`);
	}

	renderReport(result);
}

function renderReport(result: AnalysisResult) {
	const { hotspots, blastRadii, temporalCouplings, stats } = result;

	console.log();
	renderHeader(result);
	console.log();
	renderHotspots(hotspots);
	console.log();
	renderBlastRadius(blastRadii);
	console.log();
	renderTemporalCoupling(temporalCouplings);
	console.log();
	renderSummary(stats, hotspots, blastRadii, temporalCouplings);
	console.log();
}

function renderHeader(result: AnalysisResult) {
	const { stats, document } = result;
	const content = [
		`${c.gray("repo")}    ${c.bold(document.meta.repo)}`,
		`${c.gray("files")}   ${c.cyan(String(stats.filesScanned))}  ${c.gray("functions")}  ${c.cyan(String(stats.functionsFound))}  ${c.gray("commits")}  ${c.cyan(String(stats.commitsAnalyzed))}`,
		`${c.gray("time")}    ${c.green(`${stats.analysisTimeMs}ms`)}  ${c.gray("range")}  ${c.dim(document.meta.commitRange.from.slice(0, 8))}${c.gray("..")}${c.dim(document.meta.commitRange.to.slice(0, 8))}`,
	].join("\n");

	console.log(box(content, "⚡ strata"));
}

function renderHotspots(hotspots: AnalysisResult["hotspots"]) {
	if (hotspots.length === 0) {
		console.log(c.gray("  No hotspots found."));
		return;
	}

	const maxScore = hotspots[0]?.score ?? 1;
	const maxComplexity = Math.max(...hotspots.map((h) => h.entity.metrics.cognitiveComplexity));
	const maxChurn = Math.max(...hotspots.map((h) => h.entity.metrics.churn));

	console.log(divider("🔥 HOTSPOTS  complexity × churn", 70));
	console.log();

	const rows = hotspots.map((h, i) => {
		const e = h.entity;
		const rank = c.dim(`${String(i + 1).padStart(2)}.`);
		const name = c.bold(c.heatColor(h.score, maxScore, e.name));
		const fileLoc = c.gray(`${truncPath(e.filePath, 35)}:${e.startLine}`);
		const cmplx = c.heatColor(
			e.metrics.cognitiveComplexity,
			maxComplexity,
			String(e.metrics.cognitiveComplexity).padStart(3),
		);
		const churn = c.heatColor(e.metrics.churn, maxChurn, String(e.metrics.churn).padStart(3));
		const bar = heatBar(h.score, maxScore, 15);
		const score = c.bold(String(Math.round(h.score)).padStart(5));

		return [rank, name, fileLoc, cmplx, churn, bar, score];
	});

	const header = [
		c.dim("#"),
		"Function",
		"Location",
		c.dim("Cog"),
		c.dim("Churn"),
		c.dim("Score"),
		"",
	];

	console.log(table(header, rows, { padding: 2 }));

	const scores = hotspots.map((h) => h.score);
	console.log(`\n  ${c.gray("distribution")}  ${sparkline(scores)}`);
}

function renderBlastRadius(blastRadii: AnalysisResult["blastRadii"]) {
	if (blastRadii.length === 0) {
		console.log(c.gray("  No blast radius data."));
		return;
	}

	console.log(divider("💥 BLAST RADIUS  what breaks if you touch it", 70));
	console.log();

	const maxRisk = Math.max(...blastRadii.map((b) => b.riskScore));

	const rows = blastRadii.map((b, i) => {
		const e = b.entity;
		const rank = c.dim(`${String(i + 1).padStart(2)}.`);
		const name = c.bold(e.name);
		const fileLoc = c.gray(`${truncPath(e.filePath, 30)}:${e.startLine}`);
		const reach = c.cyan(`${b.forwardSlice.length} fn${b.forwardSlice.length !== 1 ? "s" : ""}`);
		const uncovered =
			b.uncoveredInSlice.length > 0
				? c.red(`${b.uncoveredInSlice.length} untested`)
				: c.green("all covered");
		const risk = riskIndicator(b.riskScore);
		const bar = heatBar(b.riskScore, maxRisk, 12);

		return [rank, name, fileLoc, reach, uncovered, risk, bar];
	});

	const header = [c.dim("#"), "Function", "Location", "Reach", "Coverage", "Risk", ""];

	console.log(table(header, rows, { padding: 2 }));
}

function renderTemporalCoupling(couplings: AnalysisResult["temporalCouplings"]) {
	if (couplings.length === 0) {
		console.log(c.gray("  No temporal coupling pairs found."));
		return;
	}

	console.log(divider("🔗 TEMPORAL COUPLING  hidden co-change patterns", 70));
	console.log();

	const maxStrength = Math.max(...couplings.map((tc) => tc.couplingStrength));

	const rows = couplings.map((tc, i) => {
		const rank = c.dim(`${String(i + 1).padStart(2)}.`);
		const fileA = c.cyan(truncPath(tc.fileA, 28));
		const arrow = tc.hasStaticDependency ? c.gray("──") : c.yellow("~~");
		const fileB = c.cyan(truncPath(tc.fileB, 28));
		const count = c.bold(`${tc.coChangeCount}×`);
		const strength = c.heatColor(
			tc.couplingStrength,
			maxStrength,
			`${Math.round(tc.couplingStrength * 100)}%`,
		);
		const bar = heatBar(tc.couplingStrength, 1, 10);
		const tag = tc.hasStaticDependency ? c.gray("static") : badge("HIDDEN", "warn");

		return [rank, fileA, arrow, fileB, count, strength, bar, tag];
	});

	const header = [c.dim("#"), "File A", "", "File B", "Co-Δ", "Str", "", "Type"];

	console.log(table(header, rows, { padding: 1 }));

	const hiddenCount = couplings.filter((tc) => !tc.hasStaticDependency).length;
	if (hiddenCount > 0) {
		console.log(
			`\n  ${c.yellow("⚠")} ${c.bold(String(hiddenCount))} coupling pair${hiddenCount > 1 ? "s" : ""} with ${c.yellow("no static dependency")} — these co-change for reasons the code doesn't show`,
		);
	}
}

function renderSummary(
	stats: AnalysisResult["stats"],
	hotspots: AnalysisResult["hotspots"],
	blastRadii: AnalysisResult["blastRadii"],
	couplings: AnalysisResult["temporalCouplings"],
) {
	console.log(divider("📊 SUMMARY", 70));
	console.log();

	const topHotspot = hotspots[0];
	const worstBlast = blastRadii[0];
	const hiddenCouplings = couplings.filter((tc) => !tc.hasStaticDependency).length;

	const lines: string[] = [];

	if (topHotspot) {
		lines.push(
			`  ${c.red("●")} ${c.bold("Worst hotspot:")} ${c.yellow(topHotspot.entity.name)} ` +
				`${c.gray("—")} complexity ${c.red(String(topHotspot.entity.metrics.cognitiveComplexity))}, ` +
				`churn ${c.red(String(topHotspot.entity.metrics.churn))}, ` +
				`score ${c.bold(c.red(String(Math.round(topHotspot.score))))}`,
		);
	}

	if (worstBlast) {
		lines.push(
			`  ${c.red("●")} ${c.bold("Largest blast radius:")} ${c.yellow(worstBlast.entity.name)} ` +
				`${c.gray("—")} affects ${c.red(`${worstBlast.forwardSlice.length} functions`)}, ` +
				`${c.red(`${worstBlast.uncoveredInSlice.length} untested`)}`,
		);
	}

	if (hiddenCouplings > 0) {
		lines.push(
			`  ${c.yellow("●")} ${c.bold("Hidden couplings:")} ${c.yellow(String(hiddenCouplings))} file pairs co-change without static dependency`,
		);
	}

	const complexFns = hotspots.filter((h) => h.entity.metrics.cognitiveComplexity > 15).length;
	if (complexFns > 0) {
		lines.push(
			`  ${c.red("●")} ${c.bold(`${complexFns}`)} functions exceed cognitive complexity threshold ${c.gray("(>15)")}`,
		);
	}

	if (lines.length === 0) {
		lines.push(`  ${c.green("●")} Codebase looks healthy!`);
	}

	for (const line of lines) console.log(line);

	console.log();
	console.log(
		`  ${c.gray("Scanned")} ${c.bold(String(stats.filesScanned))} ${c.gray("files ·")} ` +
			`${c.bold(String(stats.functionsFound))} ${c.gray("functions ·")} ` +
			`${c.bold(String(stats.commitsAnalyzed))} ${c.gray("commits ·")} ` +
			`${c.green(`${stats.analysisTimeMs}ms`)}`,
	);
}

main().catch((err) => {
	console.error(c.red(`Fatal: ${err instanceof Error ? err.message : String(err)}`));
	process.exit(1);
});
