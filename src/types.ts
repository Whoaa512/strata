export type FunctionInfo = {
	id: string;
	name: string;
	filePath: string;
	startLine: number;
	endLine: number;
	complexity: number;
	nestingDepth: number;
	parameterCount: number;
	calls: string[];
	isExported: boolean;
	isTestFile: boolean;
};

export type FileChurn = {
	filePath: string;
	commits: number;
	linesAdded: number;
	linesRemoved: number;
	authors: Set<string>;
};

export type CoChange = {
	fileA: string;
	fileB: string;
	coChangeCount: number;
	totalCommitsA: number;
	totalCommitsB: number;
	confidence: number;
};

export type Hotspot = {
	functionId: string;
	name: string;
	filePath: string;
	startLine: number;
	complexity: number;
	churn: number;
	score: number;
};

export type BlastRadius = {
	functionId: string;
	name: string;
	filePath: string;
	forwardSlice: string[];
	affectedFiles: string[];
	testedRatio: number;
	untestedAffected: string[];
	riskScore: number;
};

export type TemporalCoupling = {
	fileA: string;
	fileB: string;
	coChangeCount: number;
	confidence: number;
	hasStaticDep: boolean;
};

export type SvDocument = {
	version: string;
	timestamp: string;
	repository: string;
	entities: SvEntity[];
	edges: SvEdge[];
	metrics: {
		hotspots: Hotspot[];
		blastRadii: BlastRadius[];
		temporalCouplings: TemporalCoupling[];
	};
};

export type SvEntity = {
	id: string;
	type: "function" | "file" | "module";
	name: string;
	filePath: string;
	startLine?: number;
	endLine?: number;
	metrics: Record<string, number>;
};

export type SvEdge = {
	source: string;
	target: string;
	type: "calls" | "contains" | "co_changes_with";
	weight?: number;
};
