import path from "node:path";
import type {
	Entity,
	Edge,
	StrataView,
	TemporalCouplingPair,
} from "../core/types.js";
import { emptyMetrics } from "../core/types.js";
import {
	computeHotspots,
	buildCallGraph,
	computeBlastRadius,
} from "../core/scoring.js";
import { computeTemporalCoupling, computeChurn, parseGitLog } from "../core/git-analysis.js";
import { parseFile, isAnalyzableFile } from "./parser.js";
import { getGitLog, getTrackedFiles } from "./git.js";
import type { FunctionInfo } from "../core/complexity.js";

export interface AnalyzeOptions {
	repoPath: string;
	months: number;
	minCoChanges: number;
	minConfidence: number;
	topN: number;
}

export async function analyze(opts: AnalyzeOptions): Promise<StrataView> {
	const { repoPath, months, minCoChanges, minConfidence, topN } = opts;

	const allFiles = await getTrackedFiles(repoPath);
	const analyzableFiles = allFiles.filter(isAnalyzableFile);

	const commits = await getGitLog(repoPath, months);
	const churnMap = computeChurn(commits);
	const temporalPairs = computeTemporalCoupling(commits, minCoChanges, minConfidence);

	const entities: Entity[] = [];
	const edges: Edge[] = [];
	const importMap = new Map<string, Set<string>>();

	const functionsByName = new Map<string, Entity>();
	const calleesByEntityId = new Map<string, string[]>();

	for (const relPath of analyzableFiles) {
		const absPath = path.join(repoPath, relPath);
		const content = await readFileContent(absPath);
		if (!content) continue;

		const functions = await parseFile(relPath, content);
		const fileChurn = churnMap.get(relPath);
		const imports = extractImportPaths(content, relPath);
		importMap.set(relPath, imports);

		const fileEntity = makeFileEntity(relPath, functions, fileChurn);
		entities.push(fileEntity);

		for (const fn of functions) {
			const entity = makeFunctionEntity(relPath, fn, fileChurn);
			entities.push(entity);
			functionsByName.set(fn.name, entity);
			calleesByEntityId.set(entity.id, fn.callees);

			edges.push({
				source: fileEntity.id,
				target: entity.id,
				kind: "contains",
				weight: 1,
			});
		}
	}

	resolveCallEdges(edges, calleesByEntityId, functionsByName);

	const callGraph = buildCallGraph(edges);

	const testFileIds = new Set(
		analyzableFiles.filter((f) => isTestFile(f)),
	);

	const couplingMap = buildTemporalCouplingMap(temporalPairs, importMap);

	const entityMap = new Map(entities.map((e) => [e.id, e]));

	const hotspots = computeHotspots(entities).slice(0, topN);

	const blastRadii = hotspots.map((h) => {
		const entity = entityMap.get(h.entityId)!;
		return computeBlastRadius(entity, callGraph, testFileIds, couplingMap, entityMap);
	});

	const temporalCoupling: TemporalCouplingPair[] = temporalPairs.slice(0, topN).map((p) => ({
		fileA: p.fileA,
		fileB: p.fileB,
		coChangeCount: p.coChangeCount,
		totalChangesA: p.totalChangesA,
		totalChangesB: p.totalChangesB,
		confidence: p.confidence,
		hasStaticDependency: hasStaticDep(p.fileA, p.fileB, importMap),
	}));

	return {
		version: "0.1.0",
		repo: path.basename(repoPath),
		analyzedAt: new Date().toISOString(),
		entities,
		edges,
		hotspots,
		blastRadii,
		temporalCoupling,
	};
}

async function readFileContent(absPath: string): Promise<string | null> {
	try {
		const file = Bun.file(absPath);
		return await file.text();
	} catch {
		return null;
	}
}

function makeFileEntity(
	relPath: string,
	functions: FunctionInfo[],
	churn: { commits: number; authors: Set<string>; lastModified: string } | undefined,
): Entity {
	const totalComplexity = functions.reduce((sum, fn) => sum + fn.cognitiveComplexity, 0);
	const totalLines = functions.reduce((sum, fn) => sum + fn.lineCount, 0);

	return {
		id: `file:${relPath}`,
		kind: "file",
		name: path.basename(relPath),
		filePath: relPath,
		startLine: 1,
		endLine: totalLines,
		metrics: {
			...emptyMetrics(),
			cognitiveComplexity: totalComplexity,
			lineCount: totalLines,
			churn: churn?.commits ?? 0,
			contributorCount: churn?.authors.size ?? 0,
			lastModified: churn?.lastModified,
		},
	};
}

function makeFunctionEntity(
	relPath: string,
	fn: FunctionInfo,
	churn: { commits: number; authors: Set<string>; lastModified: string } | undefined,
): Entity {
	return {
		id: `fn:${relPath}:${fn.name}:${fn.startLine}`,
		kind: "function",
		name: fn.name,
		filePath: relPath,
		startLine: fn.startLine,
		endLine: fn.endLine,
		metrics: {
			...emptyMetrics(),
			cognitiveComplexity: fn.cognitiveComplexity,
			nestingDepth: fn.nestingDepth,
			parameterCount: fn.parameterCount,
			lineCount: fn.lineCount,
			churn: churn?.commits ?? 0,
			contributorCount: churn?.authors.size ?? 0,
			lastModified: churn?.lastModified,
		},
	};
}

function resolveCallEdges(
	edges: Edge[],
	calleesByEntityId: Map<string, string[]>,
	functionsByName: Map<string, Entity>,
): void {
	for (const [entityId, callees] of calleesByEntityId) {
		for (const calleeName of callees) {
			const target = functionsByName.get(calleeName);
			if (!target) continue;
			if (target.id === entityId) continue;

			edges.push({
				source: entityId,
				target: target.id,
				kind: "calls",
				weight: 1,
			});
		}
	}
}

function extractImportPaths(content: string, fromFile: string): Set<string> {
	const imports = new Set<string>();
	const dir = path.dirname(fromFile);

	const importRegex = /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g;
	let match: RegExpExecArray | null;

	while ((match = importRegex.exec(content)) !== null) {
		const importPath = match[1];
		if (importPath.startsWith(".")) {
			const resolved = path.normalize(path.join(dir, importPath));
			const withoutExt = resolved.replace(/\.[^.]+$/, "");
			for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
				imports.add(withoutExt + ext);
			}
			imports.add(resolved);
		}
	}

	return imports;
}

function isTestFile(filePath: string): boolean {
	const lower = filePath.toLowerCase();
	return (
		lower.includes(".test.") ||
		lower.includes(".spec.") ||
		lower.includes("__tests__") ||
		lower.includes("/test/") ||
		lower.includes("/tests/")
	);
}

function buildTemporalCouplingMap(
	pairs: { fileA: string; fileB: string }[],
	_importMap: Map<string, Set<string>>,
): Map<string, string[]> {
	const map = new Map<string, string[]>();

	for (const pair of pairs) {
		const existingA = map.get(pair.fileA) ?? [];
		existingA.push(pair.fileB);
		map.set(pair.fileA, existingA);

		const existingB = map.get(pair.fileB) ?? [];
		existingB.push(pair.fileA);
		map.set(pair.fileB, existingB);
	}

	return map;
}

function hasStaticDep(
	fileA: string,
	fileB: string,
	importMap: Map<string, Set<string>>,
): boolean {
	const importsA = importMap.get(fileA);
	if (importsA) {
		for (const imp of importsA) {
			if (imp.includes(fileB.replace(/\.[^.]+$/, ""))) return true;
		}
	}

	const importsB = importMap.get(fileB);
	if (importsB) {
		for (const imp of importsB) {
			if (imp.includes(fileA.replace(/\.[^.]+$/, ""))) return true;
		}
	}

	return false;
}
