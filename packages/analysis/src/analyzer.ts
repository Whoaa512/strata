import type {
	ChurnEntry,
	CoChangeEntry,
	CognitiveComplexity,
	FileExtraction,
} from "@strata/extraction";
import { computeBlastRadii } from "./blast-radius.js";
import { computeHotspots } from "./hotspots.js";
import type { StrataView, SvEdge, SvEntity } from "./sv-format.js";
import { computeTemporalCouplings } from "./temporal-coupling.js";

export type AnalysisInput = {
	extractions: FileExtraction[];
	complexities: Map<string, CognitiveComplexity>;
	churn: ChurnEntry[];
	coChanges: CoChangeEntry[];
	repoPath: string;
	testFilePatterns?: RegExp[];
};

export function analyze(input: AnalysisInput): StrataView {
	const testPatterns = input.testFilePatterns ?? [
		/\.test\./,
		/\.spec\./,
		/__tests__/,
	];

	const churnMap = new Map(input.churn.map((c) => [c.filePath, c]));
	const functionFileMap = new Map<string, string>();
	const functionIds = new Set<string>();
	const allCalls = [];
	const entities: SvEntity[] = [];
	const edges: SvEdge[] = [];

	for (const extraction of input.extractions) {
		for (const fn of extraction.functions) {
			functionFileMap.set(fn.id, fn.filePath);
			functionIds.add(fn.id);

			const cc = input.complexities.get(fn.id);
			const fileChurn = churnMap.get(fn.filePath);

			entities.push({
				id: fn.id,
				type: fn.isMethod ? "class" : "function",
				name: fn.className ? `${fn.className}.${fn.name}` : fn.name,
				filePath: fn.filePath,
				startLine: fn.startLine,
				endLine: fn.endLine,
				metrics: {
					cognitiveComplexity: cc?.score ?? 0,
					nestingDepth: cc?.nestingContributions ?? 0,
					paramCount: fn.params.length,
					fanIn: 0,
					fanOut: 0,
					churn: fileChurn?.commits ?? 0,
					authors: fileChurn?.authors ?? [],
				},
			});
		}

		for (const call of extraction.calls) {
			allCalls.push(call);
			edges.push({
				source: call.caller,
				target: call.callee,
				type: "calls",
				weight: 1,
			});
		}
	}

	computeFanInOut(entities, allCalls);

	const testFiles = new Set(
		input.extractions
			.filter((e) => testPatterns.some((p) => p.test(e.filePath)))
			.map((e) => e.filePath),
	);

	const hotspots = computeHotspots(
		input.complexities,
		churnMap,
		functionFileMap,
	);

	const blastRadii = computeBlastRadii(
		allCalls,
		input.coChanges,
		functionIds,
		functionFileMap,
		testFiles,
	);

	const temporalCouplings = computeTemporalCouplings(input.coChanges, allCalls);

	for (const tc of input.coChanges) {
		edges.push({
			source: tc.fileA,
			target: tc.fileB,
			type: "co_changes_with",
			weight: tc.coChangeCount,
		});
	}

	return {
		version: "0.1.0",
		generatedAt: new Date().toISOString(),
		repoPath: input.repoPath,
		entities,
		edges,
		hotspots,
		blastRadii,
		temporalCouplings,
	};
}

function computeFanInOut(
	entities: SvEntity[],
	calls: { caller: string; callee: string }[],
): void {
	const fanOutMap = new Map<string, number>();
	const fanInMap = new Map<string, number>();

	for (const { caller, callee } of calls) {
		fanOutMap.set(caller, (fanOutMap.get(caller) ?? 0) + 1);
		fanInMap.set(callee, (fanInMap.get(callee) ?? 0) + 1);
	}

	for (const entity of entities) {
		entity.metrics.fanOut = fanOutMap.get(entity.id) ?? 0;
		entity.metrics.fanIn = fanInMap.get(entity.id) ?? 0;
	}
}
