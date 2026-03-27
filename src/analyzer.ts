import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { FunctionInfo } from "./complexity-analyzer";
import { extractFunctions } from "./complexity-analyzer";
import {
	type CommitFiles,
	type FileChurn,
	type TemporalCouplingRaw,
	computeChurn,
	computeTemporalCoupling,
	getCommitRange,
	parseGitLog,
} from "./git-analyzer";
import type {
	BlastRadiusResult,
	Hotspot,
	SvDocument,
	SvEdge,
	SvEntity,
	SvMetrics,
	TemporalCouplingPair,
} from "./sv-format";

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

export interface AnalysisResult {
	document: SvDocument;
	hotspots: Hotspot[];
	blastRadii: BlastRadiusResult[];
	temporalCouplings: TemporalCouplingPair[];
	stats: AnalysisStats;
}

export interface AnalysisStats {
	filesScanned: number;
	functionsFound: number;
	commitsAnalyzed: number;
	analysisTimeMs: number;
}

export async function analyzeRepo(
	repoPath: string,
	maxCommits = 1000,
	topN = 10,
): Promise<AnalysisResult> {
	const start = performance.now();

	const commits = await parseGitLog(repoPath, maxCommits);
	const churnMap = computeChurn(commits);
	const temporalCouplingRaw = computeTemporalCoupling(commits);
	const commitRange = await getCommitRange(repoPath, maxCommits);

	const files = await collectTsFiles(repoPath);
	const allFunctions: FunctionInfo[] = [];

	for (const filePath of files) {
		const fullPath = join(repoPath, filePath);
		const source = await Bun.file(fullPath).text();
		const fns = extractFunctions(filePath, source);
		allFunctions.push(...fns);
	}

	const entities = buildEntities(allFunctions, churnMap);
	const callEdges = buildCallEdges(allFunctions, entities);
	const couplingEdges = buildCouplingEdges(temporalCouplingRaw, callEdges);

	const fanInMap = computeFanIn(callEdges);
	for (const entity of entities) {
		entity.metrics.fanIn = fanInMap.get(entity.id) ?? 0;
	}

	const hotspots = computeHotspots(entities, topN);
	const blastRadii = computeBlastRadii(entities, callEdges, topN);
	const temporalCouplings = enrichTemporalCoupling(temporalCouplingRaw, callEdges);

	const document: SvDocument = {
		version: "0.1.0",
		meta: {
			repo: repoPath,
			analyzedAt: new Date().toISOString(),
			commitRange,
			fileCount: files.length,
			functionCount: allFunctions.length,
		},
		entities,
		edges: [...callEdges, ...couplingEdges],
	};

	return {
		document,
		hotspots,
		blastRadii,
		temporalCouplings,
		stats: {
			filesScanned: files.length,
			functionsFound: allFunctions.length,
			commitsAnalyzed: commits.length,
			analysisTimeMs: Math.round(performance.now() - start),
		},
	};
}

async function collectTsFiles(dir: string, prefix = ""): Promise<string[]> {
	const results: string[] = [];
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") {
			continue;
		}
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			results.push(...(await collectTsFiles(join(dir, entry.name), rel)));
		} else if (TS_EXTENSIONS.has(extOf(entry.name))) {
			results.push(rel);
		}
	}

	return results;
}

function extOf(name: string): string {
	const i = name.lastIndexOf(".");
	return i >= 0 ? name.slice(i) : "";
}

function buildEntities(functions: FunctionInfo[], churnMap: Map<string, FileChurn>): SvEntity[] {
	return functions.map((fn) => {
		const churn = churnMap.get(fn.filePath);
		return {
			id: fn.id,
			kind: "function" as const,
			name: fn.name,
			filePath: fn.filePath,
			startLine: fn.startLine,
			endLine: fn.endLine,
			metrics: {
				cognitiveComplexity: fn.cognitiveComplexity,
				cyclomaticComplexity: fn.cyclomaticComplexity,
				lineCount: fn.lineCount,
				parameterCount: fn.parameterCount,
				nestingDepthMax: fn.nestingDepthMax,
				churn: churn?.totalCommits ?? 0,
				churnLastQuarter: churn?.recentCommits ?? 0,
				contributorCount: churn?.contributors.size ?? 0,
				hotspot: 0,
				fanIn: 0,
				fanOut: fn.calls.length,
				testCoverage: null,
				blastRadius: 0,
			},
		};
	});
}

function buildCallEdges(functions: FunctionInfo[], entities: SvEntity[]): SvEdge[] {
	const nameToId = new Map<string, string>();
	for (const e of entities) {
		nameToId.set(e.name, e.id);
		const shortName = e.name.split(".").pop();
		if (shortName && !nameToId.has(shortName)) {
			nameToId.set(shortName, e.id);
		}
	}

	const edges: SvEdge[] = [];
	for (const fn of functions) {
		const sourceId = `${fn.filePath}::${fn.name}::${fn.startLine}`;
		for (const call of fn.calls) {
			const targetId = nameToId.get(call);
			if (targetId && targetId !== sourceId) {
				edges.push({ source: sourceId, target: targetId, kind: "calls", weight: 1 });
			}
		}
	}

	return edges;
}

function buildCouplingEdges(
	temporalCouplings: TemporalCouplingRaw[],
	_callEdges: SvEdge[],
): SvEdge[] {
	return temporalCouplings.slice(0, 50).map((tc) => ({
		source: tc.fileA,
		target: tc.fileB,
		kind: "co_changes_with" as const,
		weight: tc.coChangeCount,
	}));
}

function computeFanIn(callEdges: SvEdge[]): Map<string, number> {
	const fanIn = new Map<string, number>();
	for (const edge of callEdges) {
		if (edge.kind === "calls") {
			fanIn.set(edge.target, (fanIn.get(edge.target) ?? 0) + 1);
		}
	}
	return fanIn;
}

function computeHotspots(entities: SvEntity[], topN: number): Hotspot[] {
	for (const e of entities) {
		e.metrics.hotspot = e.metrics.cognitiveComplexity * Math.max(e.metrics.churn, 1);
	}

	const sorted = [...entities].sort((a, b) => b.metrics.hotspot - a.metrics.hotspot);

	return sorted.slice(0, topN).map((entity, i) => ({
		entity,
		score: entity.metrics.hotspot,
		rank: i + 1,
	}));
}

function computeBlastRadii(
	entities: SvEntity[],
	callEdges: SvEdge[],
	topN: number,
): BlastRadiusResult[] {
	const adjacency = new Map<string, Set<string>>();
	for (const edge of callEdges) {
		if (edge.kind !== "calls") continue;
		if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
		adjacency.get(edge.source)?.add(edge.target);
	}

	const results: BlastRadiusResult[] = [];

	for (const entity of entities) {
		const visited = new Set<string>();
		const queue = [entity.id];
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

		visited.delete(entity.id);
		const forwardSlice = [...visited];

		const uncoveredInSlice = forwardSlice.filter((id) => {
			const target = entities.find((e) => e.id === id);
			return target && target.metrics.testCoverage === null;
		});

		const riskScore =
			forwardSlice.length * (1 + uncoveredInSlice.length / Math.max(forwardSlice.length, 1));
		entity.metrics.blastRadius = forwardSlice.length;

		results.push({ entity, forwardSlice, uncoveredInSlice, riskScore });
	}

	return results.sort((a, b) => b.riskScore - a.riskScore).slice(0, topN);
}

function enrichTemporalCoupling(
	raw: TemporalCouplingRaw[],
	callEdges: SvEdge[],
): TemporalCouplingPair[] {
	const staticDeps = new Set<string>();
	for (const edge of callEdges) {
		if (edge.kind === "calls") {
			const sourceFile = edge.source.split("::")[0];
			const targetFile = edge.target.split("::")[0];
			if (sourceFile !== targetFile) {
				staticDeps.add([sourceFile, targetFile].sort().join("||"));
			}
		}
	}

	return raw.slice(0, 20).map((tc) => {
		const key = [tc.fileA, tc.fileB].sort().join("||");
		const maxChanges = Math.max(tc.totalChangesA, tc.totalChangesB);
		return {
			fileA: tc.fileA,
			fileB: tc.fileB,
			couplingStrength: maxChanges > 0 ? tc.coChangeCount / maxChanges : 0,
			coChangeCount: tc.coChangeCount,
			totalChangesA: tc.totalChangesA,
			totalChangesB: tc.totalChangesB,
			hasStaticDependency: staticDeps.has(key),
		};
	});
}
