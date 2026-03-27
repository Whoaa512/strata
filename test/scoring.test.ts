import { describe, expect, test } from "bun:test";
import {
	buildCallGraph,
	computeBlastRadius,
	computeHotspots,
	computeRiskScore,
	forwardSlice,
} from "../src/core/scoring";
import type { Edge, Entity } from "../src/core/types";
import { emptyMetrics } from "../src/core/types";

function makeEntity(id: string, complexity: number, churn: number): Entity {
	return {
		id,
		kind: "function",
		name: id,
		filePath: `src/${id}.ts`,
		startLine: 1,
		endLine: 10,
		metrics: { ...emptyMetrics(), cognitiveComplexity: complexity, churn },
	};
}

describe("computeHotspots", () => {
	test("scores complexity × churn", () => {
		const entities = [makeEntity("a", 10, 5), makeEntity("b", 2, 20), makeEntity("c", 15, 3)];

		const hotspots = computeHotspots(entities);

		expect(hotspots[0].entityId).toBe("a");
		expect(hotspots[0].score).toBe(50);
		expect(hotspots[1].entityId).toBe("c");
		expect(hotspots[1].score).toBe(45);
		expect(hotspots[2].entityId).toBe("b");
		expect(hotspots[2].score).toBe(40);
	});

	test("excludes zero-score entities", () => {
		const entities = [makeEntity("a", 0, 0), makeEntity("b", 5, 3)];
		const hotspots = computeHotspots(entities);
		expect(hotspots.length).toBe(1);
	});

	test("only includes function entities", () => {
		const entities: Entity[] = [{ ...makeEntity("a", 10, 5), kind: "file" }, makeEntity("b", 5, 3)];
		const hotspots = computeHotspots(entities);
		expect(hotspots.length).toBe(1);
		expect(hotspots[0].entityId).toBe("b");
	});
});

describe("buildCallGraph + forwardSlice", () => {
	const edges: Edge[] = [
		{ source: "a", target: "b", kind: "calls", weight: 1 },
		{ source: "b", target: "c", kind: "calls", weight: 1 },
		{ source: "b", target: "d", kind: "calls", weight: 1 },
		{ source: "c", target: "e", kind: "calls", weight: 1 },
		{ source: "x", target: "y", kind: "depends_on", weight: 1 },
	];

	test("builds forward call graph", () => {
		const graph = buildCallGraph(edges);
		expect(graph.get("a")).toEqual(["b"]);
		expect(graph.get("b")!.sort()).toEqual(["c", "d"]);
		expect(graph.has("x")).toBe(false);
	});

	test("forward slice traverses transitive callees", () => {
		const graph = buildCallGraph(edges);
		const slice = forwardSlice("a", graph);
		expect(new Set(slice)).toEqual(new Set(["b", "c", "d", "e"]));
	});

	test("forward slice from leaf is empty", () => {
		const graph = buildCallGraph(edges);
		expect(forwardSlice("e", graph)).toEqual([]);
	});

	test("handles cycles", () => {
		const cyclicEdges: Edge[] = [
			{ source: "a", target: "b", kind: "calls", weight: 1 },
			{ source: "b", target: "a", kind: "calls", weight: 1 },
		];
		const graph = buildCallGraph(cyclicEdges);
		const slice = forwardSlice("a", graph);
		expect(slice).toEqual(["b"]);
	});
});

describe("computeRiskScore", () => {
	test("maxes out at 1.0", () => {
		const score = computeRiskScore(100, 0, 100, 100);
		expect(score).toBeLessThanOrEqual(1);
	});

	test("is 0 when everything is covered and simple", () => {
		const score = computeRiskScore(0, 1, 0, 0);
		expect(score).toBe(0);
	});

	test("coverage gap increases risk", () => {
		const covered = computeRiskScore(5, 1, 5, 2);
		const uncovered = computeRiskScore(5, 0, 5, 2);
		expect(uncovered).toBeGreaterThan(covered);
	});
});

describe("computeBlastRadius", () => {
	test("computes full blast radius for an entity", () => {
		const entity = makeEntity("a", 10, 5);
		const edges: Edge[] = [
			{ source: "a", target: "b", kind: "calls", weight: 1 },
			{ source: "b", target: "c", kind: "calls", weight: 1 },
		];
		const callGraph = buildCallGraph(edges);
		const testFiles = new Set(["src/b.ts"]);
		const couplingMap = new Map<string, string[]>([["src/a.ts", ["src/z.ts"]]]);
		const entityMap = new Map<string, Entity>([
			["a", entity],
			["b", makeEntity("b", 3, 2)],
			["c", makeEntity("c", 1, 1)],
		]);

		const br = computeBlastRadius(entity, callGraph, testFiles, couplingMap, entityMap);

		expect(new Set(br.forwardSlice)).toEqual(new Set(["b", "c"]));
		expect(br.testCoverage).toBe(0.5);
		expect(br.changeCoupling).toEqual(["src/z.ts"]);
		expect(br.riskScore).toBeGreaterThan(0);
	});
});
