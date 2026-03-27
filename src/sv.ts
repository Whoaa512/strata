import type {
	BlastRadius,
	FunctionInfo,
	Hotspot,
	SvDocument,
	SvEdge,
	SvEntity,
	TemporalCoupling,
} from "./types.js";

export function buildSvDocument(
	repoPath: string,
	functions: FunctionInfo[],
	hotspots: Hotspot[],
	blastRadii: BlastRadius[],
	temporalCouplings: TemporalCoupling[],
): SvDocument {
	const entities = buildEntities(functions);
	const edges = buildEdges(functions, temporalCouplings);

	return {
		version: "0.1.0",
		timestamp: new Date().toISOString(),
		repository: repoPath,
		entities,
		edges,
		metrics: {
			hotspots,
			blastRadii,
			temporalCouplings,
		},
	};
}

function buildEntities(functions: FunctionInfo[]): SvEntity[] {
	const entities: SvEntity[] = [];
	const seenFiles = new Set<string>();

	for (const fn of functions) {
		if (!seenFiles.has(fn.filePath)) {
			seenFiles.add(fn.filePath);
			entities.push({
				id: `file:${fn.filePath}`,
				type: "file",
				name: fn.filePath.split("/").pop() ?? fn.filePath,
				filePath: fn.filePath,
				metrics: {},
			});
		}

		entities.push({
			id: fn.id,
			type: "function",
			name: fn.name,
			filePath: fn.filePath,
			startLine: fn.startLine,
			endLine: fn.endLine,
			metrics: {
				cognitiveComplexity: fn.complexity,
				nestingDepth: fn.nestingDepth,
				parameterCount: fn.parameterCount,
			},
		});
	}

	return entities;
}

function buildEdges(
	functions: FunctionInfo[],
	temporalCouplings: TemporalCoupling[],
): SvEdge[] {
	const edges: SvEdge[] = [];
	const fnIds = new Set(functions.map((f) => f.id));

	for (const fn of functions) {
		edges.push({
			source: `file:${fn.filePath}`,
			target: fn.id,
			type: "contains",
		});

		for (const call of fn.calls) {
			if (fnIds.has(call)) {
				edges.push({
					source: fn.id,
					target: call,
					type: "calls",
				});
			}
		}
	}

	for (const tc of temporalCouplings) {
		edges.push({
			source: `file:${tc.fileA}`,
			target: `file:${tc.fileB}`,
			type: "co_changes_with",
			weight: tc.confidence,
		});
	}

	return edges;
}

export function writeSvDocument(doc: SvDocument, outputPath: string): void {
	Bun.write(outputPath, JSON.stringify(doc, null, 2));
}
