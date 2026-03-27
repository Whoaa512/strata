import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { analyze } from "../src/shell/analyze";

let fixtureDir: string;

async function run(args: string[], cwd: string): Promise<string> {
	const result = Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) {
		throw new Error(`${args.join(" ")} failed: ${result.stderr.toString()}`);
	}
	return result.stdout.toString();
}

beforeAll(async () => {
	fixtureDir = await mkdtemp(path.join(os.tmpdir(), "strata-test-"));

	await run(["git", "init"], fixtureDir);
	await run(["git", "config", "user.email", "test@test.com"], fixtureDir);
	await run(["git", "config", "user.name", "Test"], fixtureDir);

	await Bun.write(
		path.join(fixtureDir, "src/auth.ts"),
		`export function validateToken(token: string): boolean {
	if (!token) { return false; }
	if (token.length < 10) { return false; }
	for (let i = 0; i < token.length; i++) {
		if (token[i] === ' ') { return false; }
	}
	return true;
}

export function hashPassword(password: string): string {
	return password;
}
`,
	);

	await Bun.write(
		path.join(fixtureDir, "src/db.ts"),
		`import { validateToken } from './auth';

export function query(sql: string, token: string): string[] {
	if (!validateToken(token)) { throw new Error('invalid'); }
	return [sql];
}
`,
	);

	await Bun.write(
		path.join(fixtureDir, "src/utils.ts"),
		`export function formatDate(d: Date): string { return d.toISOString(); }
export function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
`,
	);

	await Bun.write(
		path.join(fixtureDir, "src/auth.test.ts"),
		`import { validateToken } from './auth';
test('validates', () => { expect(validateToken('abc')).toBe(false); });
`,
	);

	await run(["git", "add", "-A"], fixtureDir);
	await run(["git", "commit", "-m", "initial"], fixtureDir);

	await Bun.write(
		path.join(fixtureDir, "src/auth.ts"),
		`export function validateToken(token: string): boolean {
	if (!token) { return false; }
	if (token.length < 10) { return false; }
	if (token.startsWith('expired_')) { return false; }
	for (let i = 0; i < token.length; i++) {
		if (token[i] === ' ') { return false; }
	}
	return true;
}

export function hashPassword(password: string): string {
	return password;
}
`,
	);

	await Bun.write(
		path.join(fixtureDir, "src/utils.ts"),
		`export function formatDate(d: Date): string { return d.toISOString(); }
export function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
export function clamp(v: number, min: number, max: number): number {
	if (v < min) return min;
	if (v > max) return max;
	return v;
}
`,
	);

	await run(["git", "add", "-A"], fixtureDir);
	await run(["git", "commit", "-m", "add token expiry check and clamp util"], fixtureDir);

	await Bun.write(
		path.join(fixtureDir, "src/auth.ts"),
		`export function validateToken(token: string): boolean {
	if (!token) { return false; }
	if (token.length < 10) { return false; }
	if (token.startsWith('expired_')) { return false; }
	if (token.includes('..')) { return false; }
	for (let i = 0; i < token.length; i++) {
		if (token[i] === ' ') { return false; }
	}
	return true;
}

export function hashPassword(password: string): string {
	return password;
}
`,
	);

	await run(["git", "add", "-A"], fixtureDir);
	await run(["git", "commit", "-m", "add path traversal check"], fixtureDir);
});

afterAll(async () => {
	await rm(fixtureDir, { recursive: true, force: true });
});

describe("integration: analyze", () => {
	test("produces valid .sv output", async () => {
		const sv = await analyze({
			repoPath: fixtureDir,
			months: 12,
			minCoChanges: 2,
			minConfidence: 0.3,
			topN: 10,
		});

		expect(sv.version).toBe("0.1.0");
		expect(sv.entities.length).toBeGreaterThan(0);
		expect(sv.edges.length).toBeGreaterThan(0);
	});

	test("finds functions across files", async () => {
		const sv = await analyze({
			repoPath: fixtureDir,
			months: 12,
			minCoChanges: 2,
			minConfidence: 0.3,
			topN: 10,
		});

		const fnNames = sv.entities
			.filter((e) => e.kind === "function")
			.map((e) => e.name);

		expect(fnNames).toContain("validateToken");
		expect(fnNames).toContain("hashPassword");
		expect(fnNames).toContain("query");
		expect(fnNames).toContain("formatDate");
	});

	test("auth.ts has highest churn", async () => {
		const sv = await analyze({
			repoPath: fixtureDir,
			months: 12,
			minCoChanges: 2,
			minConfidence: 0.3,
			topN: 10,
		});

		const authFile = sv.entities.find(
			(e) => e.kind === "file" && e.filePath.includes("auth.ts") && !e.filePath.includes("test"),
		);
		const dbFile = sv.entities.find(
			(e) => e.kind === "file" && e.filePath.includes("db.ts"),
		);

		expect(authFile).toBeDefined();
		expect(dbFile).toBeDefined();
		expect(authFile!.metrics.churn).toBeGreaterThan(dbFile!.metrics.churn);
	});

	test("detects temporal coupling between auth and utils", async () => {
		const sv = await analyze({
			repoPath: fixtureDir,
			months: 12,
			minCoChanges: 2,
			minConfidence: 0.3,
			topN: 10,
		});

		const coupling = sv.temporalCoupling.find(
			(tc) =>
				(tc.fileA.includes("auth") && tc.fileB.includes("utils")) ||
				(tc.fileA.includes("utils") && tc.fileB.includes("auth")),
		);

		expect(coupling).toBeDefined();
		expect(coupling!.coChangeCount).toBeGreaterThanOrEqual(2);
	});

	test("contains call edges", async () => {
		const sv = await analyze({
			repoPath: fixtureDir,
			months: 12,
			minCoChanges: 2,
			minConfidence: 0.3,
			topN: 10,
		});

		const callEdges = sv.edges.filter((e) => e.kind === "calls");
		expect(callEdges.length).toBeGreaterThan(0);

		const queryCallsValidate = callEdges.find(
			(e) => e.source.includes("query") && e.target.includes("validateToken"),
		);
		expect(queryCallsValidate).toBeDefined();
	});

	test("blast radius reflects forward slice", async () => {
		const sv = await analyze({
			repoPath: fixtureDir,
			months: 12,
			minCoChanges: 2,
			minConfidence: 0.3,
			topN: 10,
		});

		for (const br of sv.blastRadii) {
			expect(br.riskScore).toBeGreaterThanOrEqual(0);
			expect(br.riskScore).toBeLessThanOrEqual(1);
			expect(br.testCoverage).toBeGreaterThanOrEqual(0);
			expect(br.testCoverage).toBeLessThanOrEqual(1);
		}
	});
});

describe(".sv format validation", () => {
	test("all entities have required fields", async () => {
		const sv = await analyze({
			repoPath: fixtureDir,
			months: 12,
			minCoChanges: 2,
			minConfidence: 0.3,
			topN: 10,
		});

		for (const entity of sv.entities) {
			expect(entity.id).toBeTruthy();
			expect(entity.kind).toBeTruthy();
			expect(entity.name).toBeTruthy();
			expect(entity.filePath).toBeTruthy();
			expect(typeof entity.startLine).toBe("number");
			expect(typeof entity.endLine).toBe("number");
			expect(entity.metrics).toBeTruthy();
			expect(typeof entity.metrics.cognitiveComplexity).toBe("number");
			expect(typeof entity.metrics.churn).toBe("number");
		}
	});

	test("all edges reference valid entity ids", async () => {
		const sv = await analyze({
			repoPath: fixtureDir,
			months: 12,
			minCoChanges: 2,
			minConfidence: 0.3,
			topN: 10,
		});

		const entityIds = new Set(sv.entities.map((e) => e.id));

		for (const edge of sv.edges) {
			expect(entityIds.has(edge.source)).toBe(true);
			expect(entityIds.has(edge.target)).toBe(true);
		}
	});

	test("hotspot entity ids exist in entities", async () => {
		const sv = await analyze({
			repoPath: fixtureDir,
			months: 12,
			minCoChanges: 2,
			minConfidence: 0.3,
			topN: 10,
		});

		const entityIds = new Set(sv.entities.map((e) => e.id));
		for (const h of sv.hotspots) {
			expect(entityIds.has(h.entityId)).toBe(true);
		}
	});

	test("JSON round-trips cleanly", async () => {
		const sv = await analyze({
			repoPath: fixtureDir,
			months: 12,
			minCoChanges: 2,
			minConfidence: 0.3,
			topN: 10,
		});

		const json = JSON.stringify(sv);
		const parsed = JSON.parse(json);
		expect(parsed.version).toBe(sv.version);
		expect(parsed.entities.length).toBe(sv.entities.length);
		expect(parsed.edges.length).toBe(sv.edges.length);
	});
});
