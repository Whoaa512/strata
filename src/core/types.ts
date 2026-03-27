export type EntityKind = "function" | "class" | "module" | "file";
export type EdgeKind = "calls" | "depends_on" | "contains" | "co_changes_with";

export interface Entity {
	id: string;
	kind: EntityKind;
	name: string;
	filePath: string;
	startLine: number;
	endLine: number;
	metrics: MetricVector;
}

export interface Edge {
	source: string;
	target: string;
	kind: EdgeKind;
	weight: number;
}

export interface MetricVector {
	cognitiveComplexity: number;
	nestingDepth: number;
	parameterCount: number;
	lineCount: number;
	fanIn: number;
	fanOut: number;
	churn: number;
	lastModified?: string;
	contributorCount: number;
}

export interface HotspotScore {
	entityId: string;
	complexity: number;
	churn: number;
	score: number;
}

export interface BlastRadius {
	entityId: string;
	forwardSlice: string[];
	testCoverage: number;
	changeCoupling: string[];
	contributorCount: number;
	riskScore: number;
}

export interface TemporalCouplingPair {
	fileA: string;
	fileB: string;
	coChangeCount: number;
	totalChangesA: number;
	totalChangesB: number;
	confidence: number;
	hasStaticDependency: boolean;
}

export interface StrataView {
	version: "0.1.0";
	repo: string;
	analyzedAt: string;
	entities: Entity[];
	edges: Edge[];
	hotspots: HotspotScore[];
	blastRadii: BlastRadius[];
	temporalCoupling: TemporalCouplingPair[];
}

export function emptyMetrics(): MetricVector {
	return {
		cognitiveComplexity: 0,
		nestingDepth: 0,
		parameterCount: 0,
		lineCount: 0,
		fanIn: 0,
		fanOut: 0,
		churn: 0,
		contributorCount: 0,
	};
}
