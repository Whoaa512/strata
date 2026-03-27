import { describe, expect, test } from "bun:test";
import type { CallEdge, CoChangeEntry } from "@strata/extraction";
import { computeTemporalCouplings } from "../src/temporal-coupling.js";

describe("temporal coupling", () => {
	test("identifies non-static co-changes", () => {
		const coChanges: CoChangeEntry[] = [
			{
				fileA: "src/auth.ts",
				fileB: "src/config.ts",
				coChangeCount: 8,
				totalChangesA: 10,
				totalChangesB: 12,
			},
		];

		const calls: CallEdge[] = [];

		const result = computeTemporalCouplings(coChanges, calls);
		expect(result).toHaveLength(1);
		expect(result[0].hasStaticDependency).toBe(false);
		expect(result[0].coupling).toBeGreaterThan(0);
	});

	test("marks pairs with static dependencies", () => {
		const coChanges: CoChangeEntry[] = [
			{
				fileA: "src/a.ts",
				fileB: "src/b.ts",
				coChangeCount: 5,
				totalChangesA: 10,
				totalChangesB: 10,
			},
		];

		const calls: CallEdge[] = [
			{ caller: "src/a.ts:foo:1", callee: "src/b.ts:bar:1" },
		];

		const result = computeTemporalCouplings(coChanges, calls);
		expect(result[0].hasStaticDependency).toBe(true);
	});

	test("sorts non-static before static", () => {
		const coChanges: CoChangeEntry[] = [
			{
				fileA: "a.ts",
				fileB: "b.ts",
				coChangeCount: 5,
				totalChangesA: 10,
				totalChangesB: 10,
			},
			{
				fileA: "c.ts",
				fileB: "d.ts",
				coChangeCount: 5,
				totalChangesA: 10,
				totalChangesB: 10,
			},
		];

		const calls: CallEdge[] = [{ caller: "a.ts:fn:1", callee: "b.ts:fn:1" }];

		const result = computeTemporalCouplings(coChanges, calls);
		expect(result[0].hasStaticDependency).toBe(false);
		expect(result[1].hasStaticDependency).toBe(true);
	});

	test("computes coupling strength", () => {
		const coChanges: CoChangeEntry[] = [
			{
				fileA: "a.ts",
				fileB: "b.ts",
				coChangeCount: 8,
				totalChangesA: 10,
				totalChangesB: 20,
			},
		];

		const result = computeTemporalCouplings(coChanges, []);
		expect(result[0].coupling).toBe(0.4);
	});
});
