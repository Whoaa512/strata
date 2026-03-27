import { describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	computeBlastRadii,
	computeHotspots,
	computeTemporalCouplings,
} from "../src/analyze.js";
import { extractFromRepo } from "../src/extract.js";
import { computeCoChanges, parseGitLog } from "../src/git.js";
import { buildSvDocument } from "../src/sv.js";

async function exec(cmd: string, cwd: string): Promise<string> {
	const proc = Bun.spawn(["sh", "-c", cmd], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "test",
			GIT_AUTHOR_EMAIL: "test@test.com",
			GIT_COMMITTER_NAME: "test",
			GIT_COMMITTER_EMAIL: "test@test.com",
		},
	});
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	return out.trim();
}

describe("integration: full pipeline", () => {
	test("analyzes a multi-file repo with git history", async () => {
		const tmpDir = join(tmpdir(), `strata-integration-${Date.now()}`);
		await mkdir(tmpDir, { recursive: true });

		await exec("git init", tmpDir);
		await mkdir(join(tmpDir, "src"), { recursive: true });

		await writeFile(
			join(tmpDir, "src", "math.ts"),
			`export function add(a: number, b: number) { return a + b; }
export function complexCalc(x: number): number {
	if (x > 0) {
		if (x > 100) {
			for (let i = 0; i < x; i++) {
				if (i % 2 === 0) {
					x += i;
				}
			}
			return x * 2;
		}
		return x + 1;
	}
	return 0;
}
`,
		);
		await writeFile(
			join(tmpDir, "src", "util.ts"),
			`import { add } from "./math";
export function sum(arr: number[]): number {
	let total = 0;
	for (const n of arr) {
		total = add(total, n);
	}
	return total;
}
`,
		);
		await writeFile(
			join(tmpDir, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					target: "ESNext",
					module: "ESNext",
					moduleResolution: "bundler",
					strict: true,
					noEmit: true,
				},
				include: ["src/**/*.ts"],
			}),
		);

		await exec("git add -A && git commit -m 'initial'", tmpDir);

		await writeFile(
			join(tmpDir, "src", "math.ts"),
			`export function add(a: number, b: number) { return a + b; }
export function subtract(a: number, b: number) { return a - b; }
export function complexCalc(x: number): number {
	if (x > 0) {
		if (x > 100) {
			for (let i = 0; i < x; i++) {
				if (i % 2 === 0) {
					x += i;
				} else if (i % 3 === 0) {
					x -= i;
				}
			}
			return x * 2;
		}
		return x + 1;
	}
	return 0;
}
`,
		);
		await writeFile(
			join(tmpDir, "src", "util.ts"),
			`import { add, subtract } from "./math";
export function sum(arr: number[]): number {
	let total = 0;
	for (const n of arr) {
		total = add(total, n);
	}
	return total;
}
export function diff(a: number, b: number) { return subtract(a, b); }
`,
		);
		await exec(
			"git add -A && git commit -m 'add subtract and complexity'",
			tmpDir,
		);

		await writeFile(
			join(tmpDir, "src", "math.ts"),
			`export function add(a: number, b: number) { return a + b; }
export function subtract(a: number, b: number) { return a - b; }
export function multiply(a: number, b: number) { return a * b; }
export function complexCalc(x: number): number {
	if (x > 0) {
		if (x > 100) {
			for (let i = 0; i < x; i++) {
				if (i % 2 === 0) {
					x += i;
				} else if (i % 3 === 0) {
					x -= i;
				} else {
					x *= 2;
				}
			}
			return x * 2;
		}
		switch(x) {
			case 1: return 10;
			case 2: return 20;
			default: return x + 1;
		}
	}
	return 0;
}
`,
		);
		await exec(
			"git add -A && git commit -m 'add multiply and more complexity'",
			tmpDir,
		);

		const { churn, commits } = await parseGitLog(tmpDir, 12);
		expect(churn.size).toBeGreaterThan(0);
		expect(commits.length).toBeGreaterThan(0);

		const functions = extractFromRepo(tmpDir);
		expect(functions.length).toBeGreaterThan(0);

		const complexCalc = functions.find((f) => f.name === "complexCalc");
		expect(complexCalc).toBeDefined();
		expect(complexCalc?.complexity).toBeGreaterThan(5);

		const sumFn = functions.find((f) => f.name === "sum");
		expect(sumFn).toBeDefined();
		expect(sumFn?.calls.length).toBeGreaterThan(0);

		const coChanges = computeCoChanges(commits, churn);
		const hotspots = computeHotspots(functions, churn);
		expect(hotspots.length).toBeGreaterThan(0);
		expect(hotspots[0].name).toBe("complexCalc");

		const blastRadii = computeBlastRadii(functions, tmpDir);
		expect(blastRadii.length).toBeGreaterThan(0);

		const temporalCouplings = computeTemporalCouplings(coChanges, functions);

		const sv = buildSvDocument(
			tmpDir,
			functions,
			hotspots,
			blastRadii,
			temporalCouplings,
		);
		expect(sv.version).toBe("0.1.0");
		expect(sv.entities.length).toBeGreaterThan(0);
		expect(sv.edges.length).toBeGreaterThan(0);
		expect(sv.metrics.hotspots.length).toBeGreaterThan(0);

		const json = JSON.stringify(sv);
		const parsed = JSON.parse(json);
		expect(parsed.version).toBe("0.1.0");

		await rm(tmpDir, { recursive: true });
	}, 30000);
});
