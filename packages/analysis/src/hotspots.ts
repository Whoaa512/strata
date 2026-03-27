import type { ChurnEntry, CognitiveComplexity } from "@strata/extraction";
import type { SvHotspot } from "./sv-format.js";

export function computeHotspots(
	complexities: Map<string, CognitiveComplexity>,
	churn: Map<string, ChurnEntry>,
	functionFileMap: Map<string, string>,
	limit = 10,
): SvHotspot[] {
	const scored: SvHotspot[] = [];

	for (const [fnId, cc] of complexities) {
		const filePath = functionFileMap.get(fnId);
		if (!filePath) continue;

		const fileChurn = churn.get(filePath);
		const churnCount = fileChurn?.commits ?? 0;

		if (cc.score === 0 && churnCount === 0) continue;

		scored.push({
			entityId: fnId,
			score: cc.score * churnCount,
			complexity: cc.score,
			churn: churnCount,
			rank: 0,
		});
	}

	scored.sort((a, b) => b.score - a.score);

	for (let i = 0; i < scored.length; i++) {
		scored[i].rank = i + 1;
	}

	return scored.slice(0, limit);
}
