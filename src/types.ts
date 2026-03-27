export interface FunctionInfo {
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  complexity: number;
  nestingDepth: number;
  paramCount: number;
  lineCount: number;
}

export interface FileChurn {
  filePath: string;
  commits: number;
  linesAdded: number;
  linesRemoved: number;
  authors: Set<string>;
}

export interface Hotspot {
  filePath: string;
  functionName: string;
  startLine: number;
  complexity: number;
  churn: number;
  score: number;
}

export interface CallEdge {
  caller: string;
  callee: string;
  callerFile: string;
  calleeFile: string;
}

export interface BlastRadius {
  entity: string;
  filePath: string;
  forwardSlice: string[];
  forwardFileSlice: string[];
  fanOut: number;
  fanIn: number;
  testCoverageGap: boolean;
  riskScore: number;
}

export interface TemporalCoupling {
  file1: string;
  file2: string;
  cochangeCount: number;
  totalCommits1: number;
  totalCommits2: number;
  confidence: number;
  hasStaticDependency: boolean;
}

export interface StrataReport {
  version: "0.1.0";
  generatedAt: string;
  repoPath: string;
  analyzedFiles: number;
  totalFunctions: number;
  hotspots: Hotspot[];
  blastRadii: BlastRadius[];
  temporalCouplings: TemporalCoupling[];
  entities: EntityRecord[];
  edges: EdgeRecord[];
  metrics: MetricsRecord[];
}

export interface EntityRecord {
  id: string;
  type: "function" | "file" | "module";
  name: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
}

export interface EdgeRecord {
  source: string;
  target: string;
  type: "calls" | "contains" | "co_changes_with" | "depends_on";
  weight?: number;
}

export interface MetricsRecord {
  entityId: string;
  complexity?: number;
  churn?: number;
  fanIn?: number;
  fanOut?: number;
  hotspotScore?: number;
  riskScore?: number;
}
