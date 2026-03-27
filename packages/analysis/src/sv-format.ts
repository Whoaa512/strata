export type SvEntity = {
	id: string;
	type: "function" | "module" | "class";
	name: string;
	filePath: string;
	startLine: number;
	endLine: number;
	metrics: {
		cognitiveComplexity: number;
		nestingDepth: number;
		paramCount: number;
		fanIn: number;
		fanOut: number;
		churn: number;
		authors: string[];
	};
};

export type SvEdge = {
	source: string;
	target: string;
	type: "calls" | "co_changes_with";
	weight: number;
};

export type SvHotspot = {
	entityId: string;
	score: number;
	complexity: number;
	churn: number;
	rank: number;
};

export type SvBlastRadius = {
	entityId: string;
	forwardSlice: string[];
	testCoverage: number;
	changeCoupling: string[];
	riskScore: number;
};

export type SvTemporalCoupling = {
	fileA: string;
	fileB: string;
	coupling: number;
	coChangeCount: number;
	hasStaticDependency: boolean;
};

export type StrataView = {
	version: "0.1.0";
	generatedAt: string;
	repoPath: string;
	entities: SvEntity[];
	edges: SvEdge[];
	hotspots: SvHotspot[];
	blastRadii: SvBlastRadius[];
	temporalCouplings: SvTemporalCoupling[];
};
