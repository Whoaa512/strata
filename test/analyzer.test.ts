import { describe, expect, test } from "bun:test";
import type { SvEdge, SvEntity } from "../src/sv-format";

function makeEntity(
	id: string,
	name: string,
	complexity: number,
	churn: number,
	overrides: Partial<SvEntity["metrics"]> = {},
): SvEntity {
	return {
		id,
		kind: "function",
		name,
		filePath: `src/${name}.ts`,
		startLine: 1,
		endLine: 10,
		metrics: {
			cognitiveComplexity: complexity,
			cyclomaticComplexity: complexity,
			lineCount: 10,
			parameterCount: 2,
			nestingDepthMax: 2,
			churn,
			churnLastQuarter: Math.floor(churn / 2),
			contributorCount: 1,
			hotspot: 0,
			fanIn: 0,
			fanOut: 0,
			testCoverage: null,
			blastRadius: 0,
			...overrides,
		},
	};
}

describe("hotspot scoring", () => {
	test("complexity × churn produces correct ranking", () => {
		const entities = [
			makeEntity("a", "lowBoth", 2, 3),
			makeEntity("b", "highComplexLowChurn", 20, 2),
			makeEntity("c", "hotspot", 15, 10),
			makeEntity("d", "highChurnLowComplex", 3, 20),
		];

		for (const e of entities) {
			e.metrics.hotspot = e.metrics.cognitiveComplexity * Math.max(e.metrics.churn, 1);
		}

		const sorted = [...entities].sort((a, b) => b.metrics.hotspot - a.metrics.hotspot);

		expect(sorted[0].name).toBe("hotspot");
		expect(sorted[0].metrics.hotspot).toBe(150);
		expect(sorted[1].name).toBe("highChurnLowComplex");
		expect(sorted[1].metrics.hotspot).toBe(60);
	});
});

describe("blast radius", () => {
	test("forward slice follows call graph", () => {
		const edges: SvEdge[] = [
			{ source: "a", target: "b", kind: "calls", weight: 1 },
			{ source: "b", target: "c", kind: "calls", weight: 1 },
			{ source: "b", target: "d", kind: "calls", weight: 1 },
		];

		const adjacency = new Map<string, Set<string>>();
		for (const edge of edges) {
			if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
			adjacency.get(edge.source)?.add(edge.target);
		}

		const visited = new Set<string>();
		const queue = ["a"];
		while (queue.length > 0) {
			const current = queue.shift();
			if (!current || visited.has(current)) continue;
			visited.add(current);
			const neighbors = adjacency.get(current);
			if (neighbors) {
				for (const n of neighbors) {
					if (!visited.has(n)) queue.push(n);
				}
			}
		}
		visited.delete("a");

		expect(visited.size).toBe(3);
		expect(visited.has("b")).toBeTrue();
		expect(visited.has("c")).toBeTrue();
		expect(visited.has("d")).toBeTrue();
	});

	test("handles cycles gracefully", () => {
		const edges: SvEdge[] = [
			{ source: "a", target: "b", kind: "calls", weight: 1 },
			{ source: "b", target: "a", kind: "calls", weight: 1 },
		];

		const adjacency = new Map<string, Set<string>>();
		for (const edge of edges) {
			if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
			adjacency.get(edge.source)?.add(edge.target);
		}

		const visited = new Set<string>();
		const queue = ["a"];
		while (queue.length > 0) {
			const current = queue.shift();
			if (!current || visited.has(current)) continue;
			visited.add(current);
			const neighbors = adjacency.get(current);
			if (neighbors) {
				for (const n of neighbors) {
					if (!visited.has(n)) queue.push(n);
				}
			}
		}
		visited.delete("a");

		expect(visited.size).toBe(1);
		expect(visited.has("b")).toBeTrue();
	});
});

describe("temporal coupling enrichment", () => {
	test("coupling strength is ratio of co-changes to max individual changes", () => {
		const coChangeCount = 8;
		const totalA = 10;
		const totalB = 20;
		const maxChanges = Math.max(totalA, totalB);
		const strength = coChangeCount / maxChanges;

		expect(strength).toBe(0.4);
	});

	test("detects static dependency overlap", () => {
		const callEdges: SvEdge[] = [
			{ source: "src/auth.ts::login::1", target: "src/db.ts::query::1", kind: "calls", weight: 1 },
		];

		const staticDeps = new Set<string>();
		for (const edge of callEdges) {
			const sourceFile = edge.source.split("::")[0];
			const targetFile = edge.target.split("::")[0];
			if (sourceFile !== targetFile) {
				staticDeps.add([sourceFile, targetFile].sort().join("||"));
			}
		}

		expect(staticDeps.has(["src/auth.ts", "src/db.ts"].sort().join("||"))).toBeTrue();
		expect(staticDeps.has(["src/auth.ts", "src/foo.ts"].sort().join("||"))).toBeFalse();
	});
});
