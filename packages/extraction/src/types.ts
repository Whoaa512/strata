export type FunctionInfo = {
	id: string;
	name: string;
	filePath: string;
	startLine: number;
	endLine: number;
	params: string[];
	isExported: boolean;
	isMethod: boolean;
	className?: string;
};

export type CallEdge = {
	caller: string;
	callee: string;
};

export type FileExtraction = {
	filePath: string;
	functions: FunctionInfo[];
	calls: CallEdge[];
};

export type ChurnEntry = {
	filePath: string;
	commits: number;
	authors: string[];
	lastModified: string;
};

export type CoChangeEntry = {
	fileA: string;
	fileB: string;
	coChangeCount: number;
	totalChangesA: number;
	totalChangesB: number;
};

export type CognitiveComplexity = {
	functionId: string;
	score: number;
	nestingContributions: number;
	structuralContributions: number;
};
