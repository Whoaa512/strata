import { CodeGraph, type Entity, type Edge } from "./graph";
import { type Hotspot, type BlastRadius } from "./metrics";
import { type TemporalCoupling } from "./git";

export interface StrataView {
  version: "0.1.0";
  generatedAt: string;
  repoPath: string;
  entities: SvEntity[];
  edges: SvEdge[];
  hotspots: SvHotspot[];
  blastRadii: SvBlastRadius[];
  temporalCouplings: SvTemporalCoupling[];
}

export interface SvEntity {
  id: string;
  kind: string;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  metrics: Record<string, number>;
}

export interface SvEdge {
  source: string;
  target: string;
  kind: string;
  weight: number;
}

export interface SvHotspot {
  entityId: string;
  name: string;
  filePath: string;
  complexity: number;
  churn: number;
  score: number;
}

export interface SvBlastRadius {
  entityId: string;
  name: string;
  filePath: string;
  forwardSliceSize: number;
  fanOut: number;
  fanIn: number;
  testCoverageRatio: number;
  untestedCount: number;
  riskScore: number;
}

export interface SvTemporalCoupling {
  fileA: string;
  fileB: string;
  cochanges: number;
  strength: number;
}

export function buildStrataView(
  graph: CodeGraph,
  repoPath: string,
  hotspots: Hotspot[],
  blastRadii: BlastRadius[],
  temporalCouplings: TemporalCoupling[],
): StrataView {
  return {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    repoPath,
    entities: graph.allEntities().map(toSvEntity),
    edges: graph.allEdges().map(toSvEdge),
    hotspots: hotspots.map(toSvHotspot),
    blastRadii: blastRadii.slice(0, 20).map(toSvBlastRadius),
    temporalCouplings: temporalCouplings.slice(0, 20).map(toSvTemporalCoupling),
  };
}

function toSvEntity(e: Entity): SvEntity {
  return {
    id: e.id,
    kind: e.kind,
    name: e.name,
    filePath: e.filePath,
    startLine: e.startLine,
    endLine: e.endLine,
    metrics: e.metrics,
  };
}

function toSvEdge(e: Edge): SvEdge {
  return {
    source: e.source,
    target: e.target,
    kind: e.kind,
    weight: e.weight,
  };
}

function toSvHotspot(h: Hotspot): SvHotspot {
  return {
    entityId: h.entity.id,
    name: h.entity.name,
    filePath: h.entity.filePath,
    complexity: h.complexity,
    churn: h.churn,
    score: h.score,
  };
}

function toSvBlastRadius(br: BlastRadius): SvBlastRadius {
  return {
    entityId: br.entity.id,
    name: br.entity.name,
    filePath: br.entity.filePath,
    forwardSliceSize: br.forwardSliceSize,
    fanOut: br.fanOut,
    fanIn: br.fanIn,
    testCoverageRatio: br.testCoverageRatio,
    untestedCount: br.untestedInSlice.length,
    riskScore: br.riskScore,
  };
}

function toSvTemporalCoupling(tc: TemporalCoupling): SvTemporalCoupling {
  return {
    fileA: tc.fileA,
    fileB: tc.fileB,
    cochanges: tc.cochanges,
    strength: tc.strength,
  };
}
