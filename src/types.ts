// .sv interchange format types

export interface SvEntity {
  id: string;
  kind: "function" | "class" | "module" | "file";
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  metrics: Record<string, number>;
}

export interface SvEdge {
  source: string;
  target: string;
  kind: "calls" | "depends_on" | "contains" | "co_changes_with";
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface SvDocument {
  version: "0.1.0";
  repo: string;
  analyzedAt: string;
  entities: SvEntity[];
  edges: SvEdge[];
  hotspots: Hotspot[];
}

export interface Hotspot {
  entityId: string;
  score: number;
  complexity: number;
  churn: number;
  blastRadius?: number;
}

// Plugin system

export interface AnalysisContext {
  repoPath: string;
  files: FileInfo[];
  parser: TreeSitterParser;
  gitLog: GitCommit[];
}

export interface FileInfo {
  path: string;
  relativePath: string;
  content: string;
}

export interface GitCommit {
  hash: string;
  date: string;
  author: string;
  files: string[];
}

export interface PluginResult {
  entities?: SvEntity[];
  edges?: SvEdge[];
}

export interface Plugin {
  name: string;
  analyze(context: AnalysisContext): Promise<PluginResult>;
}

export interface TreeSitterParser {
  parseTS(content: string): unknown;
  parseJS(content: string): unknown;
}
