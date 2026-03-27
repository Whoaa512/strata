import { describe, expect, test } from "bun:test";
import type { CallEdge, CoChangeEntry } from "@strata/extraction";
import {
	_computeForwardSlice,
	computeBlastRadii,
} from "../src/blast-radius.js";

describe("forward slice", () => {
	test("computes transitive callees", () => {
		const graph = new Map<string, Set<string>>([
			["a", new Set(["b", "c"])],
			["b", new Set(["d"])],
			["c", new Set(["d"])],
		]);

		const slice = _computeForwardSlice("a", graph);
		expect(slice.sort()).toEqual(["b", "c", "d"]);
	});

	test("handles cycles", () => {
		const graph = new Map<string, Set<string>>([
			["a", new Set(["b"])],
			["b", new Set(["a"])],
		]);

		const slice = _computeForwardSlice("a", graph);
		expect(slice).toEqual(["b"]);
	});

	test("returns empty for leaf nodes", () => {
		const graph = new Map<string, Set<string>>([["a", new Set(["b"])]]);

		const slice = _computeForwardSlice("b", graph);
		expect(slice).toEqual([]);
	});
});

describe("blast radius", () => {
	test("computes risk scores", () => {
		const calls: CallEdge[] = [
			{ caller: "a.ts:main:1", callee: "b.ts:helper:1" },
			{ caller: "b.ts:helper:1", callee: "c.ts:util:1" },
		];

		const coChanges: CoChangeEntry[] = [
			{
				fileA: "a.ts",
				fileB: "d.ts",
				coChangeCount: 5,
				totalChangesA: 10,
				totalChangesB: 10,
			},
		];

		const functionIds = new Set([
			"a.ts:main:1",
			"b.ts:helper:1",
			"c.ts:util:1",
		]);
		const functionFileMap = new Map([
			["a.ts:main:1", "a.ts"],
			["b.ts:helper:1", "b.ts"],
			["c.ts:util:1", "c.ts"],
		]);
		const testFiles = new Set<string>();

		const results = computeBlastRadii(
			calls,
			coChanges,
			functionIds,
			functionFileMap,
			testFiles,
		);

		const mainResult = results.find((r) => r.entityId === "a.ts:main:1");
		expect(mainResult).toBeDefined();
		expect(mainResult?.forwardSlice.length).toBe(2);
		expect(mainResult?.riskScore).toBeGreaterThan(0);
	});

	test("test coverage reduces risk", () => {
		const calls: CallEdge[] = [
			{ caller: "a.ts:fn:1", callee: "b.ts:fn:1" },
			{ caller: "a.test.ts:test:1", callee: "b.ts:fn:1" },
		];

		const functionIds = new Set(["a.ts:fn:1", "b.ts:fn:1"]);
		const functionFileMap = new Map([
			["a.ts:fn:1", "a.ts"],
			["b.ts:fn:1", "b.ts"],
		]);
		const testFiles = new Set(["a.test.ts"]);

		const results = computeBlastRadii(
			calls,
			[],
			functionIds,
			functionFileMap,
			testFiles,
		);

		const aResult = results.find((r) => r.entityId === "a.ts:fn:1");
		expect(aResult).toBeDefined();
		expect(aResult?.testCoverage).toBe(1);
	});
});
