import { describe, expect, test } from "bun:test";
import {
	computeBlastRadii,
	computeHotspots,
	computeTemporalCouplings,
} from "../src/analyze.js";
import type { CoChange, FileChurn, FunctionInfo } from "../src/types.js";

function makeFn(
	overrides: Partial<FunctionInfo> & { name: string },
): FunctionInfo {
	return {
		id: overrides.id ?? `${overrides.filePath ?? "src/a.ts"}:${overrides.name}`,
		filePath: "src/a.ts",
		startLine: 1,
		endLine: 10,
		complexity: 0,
		nestingDepth: 0,
		parameterCount: 0,
		calls: [],
		isExported: false,
		isTestFile: false,
		...overrides,
	};
}

describe("computeHotspots", () => {
	test("ranks by complexity × churn", () => {
		const functions: FunctionInfo[] = [
			makeFn({ name: "high", complexity: 10, filePath: "src/a.ts" }),
			makeFn({ name: "low", complexity: 2, filePath: "src/b.ts" }),
			makeFn({ name: "medium", complexity: 5, filePath: "src/c.ts" }),
		];

		const churn = new Map<string, FileChurn>([
			[
				"src/a.ts",
				{
					filePath: "src/a.ts",
					commits: 5,
					linesAdded: 100,
					linesRemoved: 10,
					authors: new Set(["dev"]),
				},
			],
			[
				"src/b.ts",
				{
					filePath: "src/b.ts",
					commits: 20,
					linesAdded: 200,
					linesRemoved: 50,
					authors: new Set(["dev"]),
				},
			],
			[
				"src/c.ts",
				{
					filePath: "src/c.ts",
					commits: 8,
					linesAdded: 50,
					linesRemoved: 5,
					authors: new Set(["dev"]),
				},
			],
		]);

		const result = computeHotspots(functions, churn);

		expect(result[0].name).toBe("high");
		expect(result[0].score).toBe(50);
		expect(result[1].name).toBe("low");
		expect(result[1].score).toBe(40);
		expect(result[2].name).toBe("medium");
		expect(result[2].score).toBe(40);
	});

	test("excludes test files", () => {
		const functions: FunctionInfo[] = [
			makeFn({
				name: "tested",
				complexity: 10,
				isTestFile: true,
				filePath: "test/a.test.ts",
			}),
			makeFn({ name: "prod", complexity: 5, filePath: "src/a.ts" }),
		];

		const churn = new Map<string, FileChurn>([
			[
				"test/a.test.ts",
				{
					filePath: "test/a.test.ts",
					commits: 10,
					linesAdded: 100,
					linesRemoved: 10,
					authors: new Set(["dev"]),
				},
			],
			[
				"src/a.ts",
				{
					filePath: "src/a.ts",
					commits: 5,
					linesAdded: 50,
					linesRemoved: 5,
					authors: new Set(["dev"]),
				},
			],
		]);

		const result = computeHotspots(functions, churn);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("prod");
	});

	test("excludes zero-complexity functions", () => {
		const functions: FunctionInfo[] = [
			makeFn({ name: "simple", complexity: 0, filePath: "src/a.ts" }),
		];

		const churn = new Map<string, FileChurn>([
			[
				"src/a.ts",
				{
					filePath: "src/a.ts",
					commits: 100,
					linesAdded: 500,
					linesRemoved: 100,
					authors: new Set(["dev"]),
				},
			],
		]);

		const result = computeHotspots(functions, churn);
		expect(result).toHaveLength(0);
	});
});

describe("computeBlastRadii", () => {
	test("computes forward slice from callee to callers", () => {
		const functions: FunctionInfo[] = [
			makeFn({
				name: "helper",
				filePath: "src/helpers.ts",
				id: "src/helpers.ts:helper",
				isExported: true,
			}),
			makeFn({
				name: "service",
				filePath: "src/service.ts",
				id: "src/service.ts:service",
				calls: ["src/helpers.ts:helper"],
			}),
			makeFn({
				name: "controller",
				filePath: "src/controller.ts",
				id: "src/controller.ts:controller",
				calls: ["src/service.ts:service"],
			}),
		];

		const result = computeBlastRadii(functions, "/repo");
		const helperRadius = result.find((r) => r.name === "helper");

		expect(helperRadius).toBeDefined();
		expect(helperRadius?.forwardSlice).toContain("src/service.ts:service");
		expect(helperRadius?.forwardSlice).toContain(
			"src/controller.ts:controller",
		);
		expect(helperRadius?.affectedFiles).toContain("src/service.ts");
		expect(helperRadius?.affectedFiles).toContain("src/controller.ts");
	});

	test("identifies untested affected files", () => {
		const functions: FunctionInfo[] = [
			makeFn({
				name: "core",
				filePath: "src/core.ts",
				id: "src/core.ts:core",
				isExported: true,
				complexity: 5,
			}),
			makeFn({
				name: "consumer",
				filePath: "src/consumer.ts",
				id: "src/consumer.ts:consumer",
				calls: ["src/core.ts:core"],
			}),
			makeFn({
				name: "testCore",
				filePath: "test/core.test.ts",
				id: "test/core.test.ts:testCore",
				isTestFile: true,
			}),
		];

		const result = computeBlastRadii(functions, "/repo");
		const coreRadius = result.find((r) => r.name === "core");

		expect(coreRadius).toBeDefined();
		expect(coreRadius?.untestedAffected).toContain("src/consumer.ts");
	});
});

describe("computeTemporalCouplings", () => {
	test("prioritizes non-static-dep pairs", () => {
		const functions: FunctionInfo[] = [
			makeFn({ name: "a", filePath: "src/a.ts", calls: ["b"] }),
			makeFn({ name: "b", filePath: "src/b.ts" }),
			makeFn({ name: "c", filePath: "src/c.ts" }),
		];

		const coChanges: CoChange[] = [
			{
				fileA: "src/a.ts",
				fileB: "src/b.ts",
				coChangeCount: 10,
				totalCommitsA: 20,
				totalCommitsB: 15,
				confidence: 0.5,
			},
			{
				fileA: "src/a.ts",
				fileB: "src/c.ts",
				coChangeCount: 8,
				totalCommitsA: 20,
				totalCommitsB: 10,
				confidence: 0.4,
			},
		];

		const result = computeTemporalCouplings(coChanges, functions);

		expect(result[0].fileA).toBe("src/a.ts");
		expect(result[0].fileB).toBe("src/c.ts");
		expect(result[0].hasStaticDep).toBe(false);

		expect(result[1].hasStaticDep).toBe(true);
	});
});
