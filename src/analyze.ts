import type {
	BlastRadius,
	CoChange,
	FileChurn,
	FunctionInfo,
	Hotspot,
	TemporalCoupling,
} from "./types.js";

export function computeHotspots(
	functions: FunctionInfo[],
	churn: Map<string, FileChurn>,
	limit = 10,
): Hotspot[] {
	const hotspots: Hotspot[] = [];

	for (const fn of functions) {
		if (fn.isTestFile) continue;
		if (fn.complexity === 0) continue;

		const fileChurn = churn.get(fn.filePath);
		const churnScore = fileChurn ? fileChurn.commits : 0;
		if (churnScore === 0) continue;

		hotspots.push({
			functionId: fn.id,
			name: fn.name,
			filePath: fn.filePath,
			startLine: fn.startLine,
			complexity: fn.complexity,
			churn: churnScore,
			score: fn.complexity * churnScore,
		});
	}

	return hotspots.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function computeBlastRadii(
	functions: FunctionInfo[],
	repoPath: string,
): BlastRadius[] {
	const fnIndex = new Map<string, FunctionInfo>();
	for (const fn of functions) {
		fnIndex.set(fn.id, fn);
	}

	const calleeToCallers = buildReverseCallGraph(functions, repoPath);
	const testFiles = new Set(
		functions.filter((f) => f.isTestFile).map((f) => f.filePath),
	);

	const results: BlastRadius[] = [];

	for (const fn of functions) {
		if (fn.isTestFile) continue;
		if (!fn.isExported && fn.calls.length === 0) continue;

		const forwardSlice = computeForwardSlice(fn.id, calleeToCallers);
		const affectedFiles = [
			...new Set(
				forwardSlice
					.map((id) => fnIndex.get(id)?.filePath)
					.filter((p): p is string => !!p),
			),
		];

		const testedFiles = affectedFiles.filter((f) => {
			const testFile = findTestFile(f, testFiles);
			return testFile !== null;
		});

		const testedRatio =
			affectedFiles.length > 0 ? testedFiles.length / affectedFiles.length : 1;

		const untestedAffected = affectedFiles.filter(
			(f) => !testedFiles.includes(f),
		);

		const riskScore =
			forwardSlice.length * (1 - testedRatio) * (fn.complexity + 1);

		results.push({
			functionId: fn.id,
			name: fn.name,
			filePath: fn.filePath,
			forwardSlice,
			affectedFiles,
			testedRatio,
			untestedAffected,
			riskScore,
		});
	}

	return results.sort((a, b) => b.riskScore - a.riskScore);
}

export function computeTemporalCouplings(
	coChanges: CoChange[],
	functions: FunctionInfo[],
	limit = 20,
): TemporalCoupling[] {
	const staticDeps = buildStaticDepSet(functions);

	return coChanges
		.map((cc) => ({
			fileA: cc.fileA,
			fileB: cc.fileB,
			coChangeCount: cc.coChangeCount,
			confidence: cc.confidence,
			hasStaticDep: staticDeps.has(depKey(cc.fileA, cc.fileB)),
		}))
		.sort((a, b) => {
			if (a.hasStaticDep !== b.hasStaticDep) {
				return a.hasStaticDep ? 1 : -1;
			}
			return b.confidence - a.confidence;
		})
		.slice(0, limit);
}

function buildReverseCallGraph(
	functions: FunctionInfo[],
	repoPath: string,
): Map<string, Set<string>> {
	const calleeToCallers = new Map<string, Set<string>>();

	for (const fn of functions) {
		for (const call of fn.calls) {
			const targetId = resolveCallToFunctionId(call, functions, repoPath);
			if (!targetId) continue;

			let callers = calleeToCallers.get(targetId);
			if (!callers) {
				callers = new Set();
				calleeToCallers.set(targetId, callers);
			}
			callers.add(fn.id);
		}
	}

	return calleeToCallers;
}

function resolveCallToFunctionId(
	call: string,
	functions: FunctionInfo[],
	repoPath: string,
): string | null {
	for (const fn of functions) {
		if (fn.id === call) return fn.id;
	}

	const normalizedCall = call.startsWith(repoPath)
		? call.slice(repoPath.length + 1)
		: call;

	for (const fn of functions) {
		if (
			normalizedCall.startsWith(fn.filePath) &&
			normalizedCall.includes(fn.name)
		) {
			return fn.id;
		}
	}

	for (const fn of functions) {
		if (normalizedCall === fn.name || normalizedCall.endsWith(`.${fn.name}`)) {
			return fn.id;
		}
	}

	return null;
}

function computeForwardSlice(
	startId: string,
	calleeToCallers: Map<string, Set<string>>,
): string[] {
	const visited = new Set<string>();
	const queue = [startId];

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || visited.has(current)) continue;
		visited.add(current);

		const callers = calleeToCallers.get(current);
		if (callers) {
			for (const caller of callers) {
				if (!visited.has(caller)) {
					queue.push(caller);
				}
			}
		}
	}

	visited.delete(startId);
	return Array.from(visited);
}

function findTestFile(filePath: string, testFiles: Set<string>): string | null {
	const base = filePath.replace(/\.(ts|tsx|js|jsx)$/, "");

	for (const ext of [
		".test.ts",
		".spec.ts",
		".test.tsx",
		".spec.tsx",
		".test.js",
		".spec.js",
	]) {
		if (testFiles.has(base + ext)) return base + ext;
	}

	const fileName = filePath
		.split("/")
		.pop()
		?.replace(/\.(ts|tsx|js|jsx)$/, "");
	if (!fileName) return null;

	for (const testFile of testFiles) {
		if (testFile.includes(fileName)) return testFile;
	}

	return null;
}

function buildStaticDepSet(functions: FunctionInfo[]): Set<string> {
	const deps = new Set<string>();

	for (const fn of functions) {
		for (const call of fn.calls) {
			for (const target of functions) {
				if (call.includes(target.name) && fn.filePath !== target.filePath) {
					deps.add(depKey(fn.filePath, target.filePath));
				}
			}
		}
	}

	return deps;
}

function depKey(a: string, b: string): string {
	return a < b ? `${a}|||${b}` : `${b}|||${a}`;
}
