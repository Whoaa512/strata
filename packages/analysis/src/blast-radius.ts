import type { CallEdge, CoChangeEntry } from "@strata/extraction";
import type { SvBlastRadius } from "./sv-format.js";

export function computeBlastRadii(
	calls: CallEdge[],
	coChanges: CoChangeEntry[],
	functionIds: Set<string>,
	functionFileMap: Map<string, string>,
	testFiles: Set<string>,
): SvBlastRadius[] {
	const callGraph = buildCallGraph(calls);
	const fileCoChanges = buildFileCoChangeMap(coChanges);
	const testCoverage = computeTestCoverage(calls, testFiles);

	const results: SvBlastRadius[] = [];

	for (const fnId of functionIds) {
		const forwardSlice = computeForwardSlice(fnId, callGraph);
		const filePath = functionFileMap.get(fnId);
		if (!filePath) continue;

		const changeCoupling = fileCoChanges.get(filePath) ?? [];
		const coveredCount = countTestedEntities(forwardSlice, testCoverage);
		const totalReachable = forwardSlice.length;
		const coverage = totalReachable > 0 ? coveredCount / totalReachable : 1;

		const riskScore = computeRiskScore(
			forwardSlice.length,
			coverage,
			changeCoupling.length,
		);

		results.push({
			entityId: fnId,
			forwardSlice,
			testCoverage: Math.round(coverage * 100) / 100,
			changeCoupling,
			riskScore: Math.round(riskScore * 100) / 100,
		});
	}

	return results.sort((a, b) => b.riskScore - a.riskScore);
}

function buildCallGraph(calls: CallEdge[]): Map<string, Set<string>> {
	const graph = new Map<string, Set<string>>();
	for (const { caller, callee } of calls) {
		const existing = graph.get(caller);
		if (existing) {
			existing.add(callee);
		} else {
			graph.set(caller, new Set([callee]));
		}
	}
	return graph;
}

function buildFileCoChangeMap(
	coChanges: CoChangeEntry[],
): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const { fileA, fileB } of coChanges) {
		const existingA = map.get(fileA);
		if (existingA) {
			existingA.push(fileB);
		} else {
			map.set(fileA, [fileB]);
		}

		const existingB = map.get(fileB);
		if (existingB) {
			existingB.push(fileA);
		} else {
			map.set(fileB, [fileA]);
		}
	}
	return map;
}

function computeForwardSlice(
	startId: string,
	callGraph: Map<string, Set<string>>,
): string[] {
	const visited = new Set<string>();
	const queue = [startId];

	while (queue.length > 0) {
		const current = queue.pop();
		if (!current) break;
		if (visited.has(current)) continue;
		visited.add(current);

		const callees = callGraph.get(current);
		if (!callees) continue;
		for (const callee of callees) {
			if (!visited.has(callee)) {
				queue.push(callee);
			}
		}
	}

	visited.delete(startId);
	return Array.from(visited);
}

function computeTestCoverage(
	calls: CallEdge[],
	testFiles: Set<string>,
): Set<string> {
	const tested = new Set<string>();
	for (const { caller, callee } of calls) {
		const isTestCaller = Array.from(testFiles).some((tf) =>
			caller.startsWith(tf),
		);
		if (isTestCaller) {
			tested.add(callee);
		}
	}
	return tested;
}

function countTestedEntities(
	forwardSlice: string[],
	testCoverage: Set<string>,
): number {
	return forwardSlice.filter((id) => testCoverage.has(id)).length;
}

function computeRiskScore(
	reachableCount: number,
	testCoverage: number,
	couplingCount: number,
): number {
	const reachFactor = Math.log2(reachableCount + 1);
	const coverageGap = 1 - testCoverage;
	const couplingFactor = Math.log2(couplingCount + 1);

	return reachFactor * (1 + coverageGap) + couplingFactor;
}

export { computeForwardSlice as _computeForwardSlice };
