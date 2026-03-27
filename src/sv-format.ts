export interface SvDocument {
	version: "0.1.0";
	meta: SvMeta;
	entities: SvEntity[];
	edges: SvEdge[];
}

export interface SvMeta {
	repo: string;
	analyzedAt: string;
	commitRange: { from: string; to: string };
	fileCount: number;
	functionCount: number;
}

export interface SvEntity {
	id: string;
	kind: "function" | "class" | "module" | "file";
	name: string;
	filePath: string;
	startLine: number;
	endLine: number;
	metrics: SvMetrics;
}

export interface SvMetrics {
	cognitiveComplexity: number;
	cyclomaticComplexity: number;
	lineCount: number;
	parameterCount: number;
	nestingDepthMax: number;
	churn: number;
	churnLastQuarter: number;
	contributorCount: number;
	hotspot: number;
	fanIn: number;
	fanOut: number;
	testCoverage: number | null;
	blastRadius: number;
}

export interface SvEdge {
	source: string;
	target: string;
	kind: "calls" | "contains" | "co_changes_with" | "depends_on";
	weight: number;
}

export interface Hotspot {
	entity: SvEntity;
	score: number;
	rank: number;
}

export interface BlastRadiusResult {
	entity: SvEntity;
	forwardSlice: string[];
	uncoveredInSlice: string[];
	riskScore: number;
}

export interface TemporalCouplingPair {
	fileA: string;
	fileB: string;
	couplingStrength: number;
	coChangeCount: number;
	totalChangesA: number;
	totalChangesB: number;
	hasStaticDependency: boolean;
}
