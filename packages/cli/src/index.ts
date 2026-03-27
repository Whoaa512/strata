#!/usr/bin/env bun

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatReport } from "./formatter.js";
import { runAnalysis } from "./runner.js";

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
	console.log(`
Usage: strata <repo-path> [options]

Options:
  --months <n>    Git history window (default: 12)
  --json          Output raw .sv JSON instead of report
  --out <file>    Write .sv JSON to file
  --help          Show this help
`);
	process.exit(0);
}

const repoPath = args[0];
const months = parseFlag(args, "--months", 12);
const jsonMode = args.includes("--json");
const outFile = parseStringFlag(args, "--out");

try {
	const sv = await runAnalysis(repoPath, months);

	if (outFile) {
		const outPath = resolve(outFile);
		await writeFile(outPath, JSON.stringify(sv, null, 2));
		console.log(`Wrote .sv file to ${outPath}`);
	}

	if (jsonMode) {
		console.log(JSON.stringify(sv, null, 2));
	} else {
		console.log(formatReport(sv));
	}
} catch (err) {
	console.error("Error:", err instanceof Error ? err.message : err);
	process.exit(1);
}

function parseFlag(args: string[], flag: string, defaultVal: number): number {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return defaultVal;
	return Number.parseInt(args[idx + 1], 10) || defaultVal;
}

function parseStringFlag(args: string[], flag: string): string | undefined {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}
