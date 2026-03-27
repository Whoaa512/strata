import type { CallEdge, CoChangeEntry } from "@strata/extraction";
import type { SvTemporalCoupling } from "./sv-format.js";

export function computeTemporalCouplings(
	coChanges: CoChangeEntry[],
	calls: CallEdge[],
	limit = 20,
): SvTemporalCoupling[] {
	const staticDeps = buildStaticDependencySet(calls);

	return coChanges
		.map((entry) => {
			const coupling = computeCouplingStrength(entry);
			const depKey = [entry.fileA, entry.fileB].sort().join("\0");

			return {
				fileA: entry.fileA,
				fileB: entry.fileB,
				coupling: Math.round(coupling * 100) / 100,
				coChangeCount: entry.coChangeCount,
				hasStaticDependency: staticDeps.has(depKey),
			};
		})
		.sort((a, b) => {
			if (a.hasStaticDependency !== b.hasStaticDependency) {
				return a.hasStaticDependency ? 1 : -1;
			}
			return b.coupling - a.coupling;
		})
		.slice(0, limit);
}

function computeCouplingStrength(entry: CoChangeEntry): number {
	const maxChanges = Math.max(entry.totalChangesA, entry.totalChangesB);
	if (maxChanges === 0) return 0;
	return entry.coChangeCount / maxChanges;
}

function buildStaticDependencySet(calls: CallEdge[]): Set<string> {
	const deps = new Set<string>();
	for (const { caller, callee } of calls) {
		const callerFile = caller.split(":")[0];
		const calleeFile = callee.split(":")[0];
		if (callerFile && calleeFile && callerFile !== calleeFile) {
			const key = [callerFile, calleeFile].sort().join("\0");
			deps.add(key);
		}
	}
	return deps;
}
