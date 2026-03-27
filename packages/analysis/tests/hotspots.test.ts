import { describe, expect, test } from "bun:test";
import type { ChurnEntry, CognitiveComplexity } from "@strata/extraction";
import { computeHotspots } from "../src/hotspots.js";

describe("hotspots", () => {
	test("ranks by complexity × churn", () => {
		const complexities = new Map<string, CognitiveComplexity>([
			[
				"a.ts:foo:1",
				{
					functionId: "a.ts:foo:1",
					score: 10,
					nestingContributions: 3,
					structuralContributions: 7,
				},
			],
			[
				"b.ts:bar:1",
				{
					functionId: "b.ts:bar:1",
					score: 5,
					nestingContributions: 1,
					structuralContributions: 4,
				},
			],
			[
				"c.ts:baz:1",
				{
					functionId: "c.ts:baz:1",
					score: 20,
					nestingContributions: 5,
					structuralContributions: 15,
				},
			],
		]);

		const churn = new Map<string, ChurnEntry>([
			[
				"a.ts",
				{
					filePath: "a.ts",
					commits: 50,
					authors: ["alice"],
					lastModified: "2024-01-01",
				},
			],
			[
				"b.ts",
				{
					filePath: "b.ts",
					commits: 100,
					authors: ["bob"],
					lastModified: "2024-01-01",
				},
			],
			[
				"c.ts",
				{
					filePath: "c.ts",
					commits: 5,
					authors: ["charlie"],
					lastModified: "2024-01-01",
				},
			],
		]);

		const fnFileMap = new Map([
			["a.ts:foo:1", "a.ts"],
			["b.ts:bar:1", "b.ts"],
			["c.ts:baz:1", "c.ts"],
		]);

		const hotspots = computeHotspots(complexities, churn, fnFileMap);

		expect(hotspots[0].entityId).toBe("a.ts:foo:1");
		expect(hotspots[0].score).toBe(500);
		expect(hotspots[1].entityId).toBe("b.ts:bar:1");
		expect(hotspots[1].score).toBe(500);
		expect(hotspots[2].entityId).toBe("c.ts:baz:1");
		expect(hotspots[2].score).toBe(100);
	});

	test("limits results", () => {
		const complexities = new Map<string, CognitiveComplexity>();
		const churn = new Map<string, ChurnEntry>();
		const fnFileMap = new Map<string, string>();

		for (let i = 0; i < 20; i++) {
			const id = `f${i}.ts:fn:1`;
			complexities.set(id, {
				functionId: id,
				score: i + 1,
				nestingContributions: 0,
				structuralContributions: i + 1,
			});
			churn.set(`f${i}.ts`, {
				filePath: `f${i}.ts`,
				commits: 10,
				authors: [],
				lastModified: "2024-01-01",
			});
			fnFileMap.set(id, `f${i}.ts`);
		}

		const hotspots = computeHotspots(complexities, churn, fnFileMap, 5);
		expect(hotspots).toHaveLength(5);
	});

	test("assigns ranks", () => {
		const complexities = new Map<string, CognitiveComplexity>([
			[
				"x.ts:a:1",
				{
					functionId: "x.ts:a:1",
					score: 5,
					nestingContributions: 0,
					structuralContributions: 5,
				},
			],
		]);
		const churn = new Map<string, ChurnEntry>([
			[
				"x.ts",
				{
					filePath: "x.ts",
					commits: 10,
					authors: [],
					lastModified: "2024-01-01",
				},
			],
		]);
		const fnFileMap = new Map([["x.ts:a:1", "x.ts"]]);

		const hotspots = computeHotspots(complexities, churn, fnFileMap);
		expect(hotspots[0].rank).toBe(1);
	});
});
