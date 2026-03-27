import type { Entity, Edge, HotspotScore, BlastRadius } from "./types.js";

export function computeHotspots(entities: Entity[]): HotspotScore[] {
	const scores: HotspotScore[] = [];

	for (const entity of entities) {
		if (entity.kind !== "function") continue;
		const { cognitiveComplexity, churn } = entity.metrics;
		if (cognitiveComplexity === 0 && churn === 0) continue;

		scores.push({
			entityId: entity.id,
			complexity: cognitiveComplexity,
			churn,
			score: cognitiveComplexity * churn,
		});
	}

	scores.sort((a, b) => b.score - a.score);
	return scores;
}

export function buildCallGraph(edges: Edge[]): Map<string, string[]> {
	const graph = new Map<string, string[]>();

	for (const edge of edges) {
		if (edge.kind !== "calls") continue;
		const existing = graph.get(edge.source);
		if (existing) {
			existing.push(edge.target);
		} else {
			graph.set(edge.source, [edge.target]);
		}
	}

	return graph;
}

export function buildReverseCallGraph(edges: Edge[]): Map<string, string[]> {
	const graph = new Map<string, string[]>();

	for (const edge of edges) {
		if (edge.kind !== "calls") continue;
		const existing = graph.get(edge.target);
		if (existing) {
			existing.push(edge.source);
		} else {
			graph.set(edge.target, [edge.source]);
		}
	}

	return graph;
}

export function forwardSlice(entityId: string, callGraph: Map<string, string[]>): string[] {
	const visited = new Set<string>();
	const queue = [entityId];

	while (queue.length > 0) {
		const current = queue.pop()!;
		if (visited.has(current)) continue;
		visited.add(current);

		const callees = callGraph.get(current);
		if (callees) {
			for (const callee of callees) {
				if (!visited.has(callee)) queue.push(callee);
			}
		}
	}

	visited.delete(entityId);
	return [...visited];
}

export function computeBlastRadius(
	entity: Entity,
	callGraph: Map<string, string[]>,
	testFileIds: Set<string>,
	temporalCouplingMap: Map<string, string[]>,
	entityMap: Map<string, Entity>,
): BlastRadius {
	const slice = forwardSlice(entity.id, callGraph);

	const coveredCount = slice.filter((id) => {
		const e = entityMap.get(id);
		if (!e) return false;
		return testFileIds.has(e.filePath);
	}).length;
	const testCoverage = slice.length > 0 ? coveredCount / slice.length : 1;

	const changeCoupling = temporalCouplingMap.get(entity.filePath) ?? [];

	const contributors = new Set<string>();
	contributors.add(String(entity.metrics.contributorCount));

	const riskScore = computeRiskScore(
		slice.length,
		testCoverage,
		entity.metrics.cognitiveComplexity,
		changeCoupling.length,
	);

	return {
		entityId: entity.id,
		forwardSlice: slice,
		testCoverage,
		changeCoupling,
		contributorCount: entity.metrics.contributorCount,
		riskScore,
	};
}

export function computeRiskScore(
	sliceSize: number,
	testCoverage: number,
	complexity: number,
	couplingCount: number,
): number {
	const sliceFactor = Math.min(sliceSize / 10, 1);
	const coverageGap = 1 - testCoverage;
	const complexityFactor = Math.min(complexity / 20, 1);
	const couplingFactor = Math.min(couplingCount / 5, 1);

	return (sliceFactor * 0.3 + coverageGap * 0.3 + complexityFactor * 0.2 + couplingFactor * 0.2);
}
