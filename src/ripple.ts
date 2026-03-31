import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import type { Entity, CallEdge, TemporalCoupling, BlastRadius, ChurnEntry, ChangeRipple } from "./schema";

export function getPackageBoundary(filePath: string, rootDir: string): string {
  let dir = dirname(resolve(rootDir, filePath));
  const root = resolve(rootDir);

  while (dir.length >= root.length) {
    if (existsSync(join(dir, "package.json")) && dir !== root) {
      return dir.slice(root.length + 1) || ".";
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return ".";
}

export function getPackageBoundaries(
  entities: Entity[],
  rootDir: string,
): Map<string, string> {
  const cache = new Map<string, string>();
  const result = new Map<string, string>();

  for (const e of entities) {
    const dir = dirname(e.filePath);
    if (!cache.has(dir)) {
      cache.set(dir, getPackageBoundary(e.filePath, rootDir));
    }
    result.set(e.filePath, cache.get(dir)!);
  }

  return result;
}

const CROSS_PACKAGE_WEIGHT = 0.3;

export function computeChangeRipple(
  entities: Entity[],
  callGraph: CallEdge[],
  temporalCoupling: TemporalCoupling[],
  blastRadius: BlastRadius[],
  churn: ChurnEntry[],
  rootDir?: string,
): ChangeRipple[] {
  const entityById = new Map(entities.map(e => [e.id, e]));
  const blastByEntity = new Map(blastRadius.map(b => [b.entityId, b]));

  const pkgByFile = rootDir ? getPackageBoundaries(entities, rootDir) : null;

  const connectedEntities = new Set<string>();
  for (const edge of callGraph) {
    connectedEntities.add(edge.caller);
    connectedEntities.add(edge.callee);
  }

  const coupledFiles = new Set<string>();
  for (const c of temporalCoupling) {
    if (c.confidence >= 0.3) {
      coupledFiles.add(c.fileA);
      coupledFiles.add(c.fileB);
    }
  }

  const relevantEntities = entities.filter(e =>
    connectedEntities.has(e.id) || coupledFiles.has(e.filePath)
  );

  const couplingByFile = buildCouplingIndex(temporalCoupling);
  const fileGraph = buildFileGraph(callGraph, entityById);
  const fileDepsCache = new Map<string, StaticDeps>();

  return relevantEntities.map(entity => {
    const staticDeps = getFileDeps(entity.filePath, fileGraph, fileDepsCache);
    const temporalDeps = getTemporalDeps(entity.filePath, couplingByFile, staticDeps);
    const implicitCouplings = temporalDeps
      .filter(td => !staticDeps.fileSet.has(td.filePath))
      .map(td => ({ filePath: td.filePath, cochangeRate: td.confidence }));

    const affectedFiles = new Set<string>();
    for (const dep of staticDeps.files) affectedFiles.add(dep);
    for (const td of temporalDeps) affectedFiles.add(td.filePath);

    const blast = blastByEntity.get(entity.id);
    const blastCount = blast?.radius ?? 0;

    const entityPkg = pkgByFile?.get(entity.filePath) ?? ".";
    let weightedFileCount = 0;
    let weightedImplicitCount = 0;
    for (const f of affectedFiles) {
      const depPkg = pkgByFile?.get(f) ?? ".";
      weightedFileCount += (depPkg !== entityPkg && pkgByFile) ? CROSS_PACKAGE_WEIGHT : 1;
    }
    for (const ic of implicitCouplings) {
      const depPkg = pkgByFile?.get(ic.filePath) ?? ".";
      weightedImplicitCount += (depPkg !== entityPkg && pkgByFile) ? CROSS_PACKAGE_WEIGHT : 1;
    }

    const rippleScore = computeRippleScore(
      weightedFileCount,
      weightedImplicitCount,
      blastCount,
    );

    const affectedArr = Array.from(affectedFiles);

    return {
      entityId: entity.id,
      rippleScore,
      staticDeps: staticDeps.files,
      temporalDeps: temporalDeps.map(t => t.filePath),
      implicitCouplings,
      affectedFiles: affectedArr,
    };
  }).sort((a, b) => b.rippleScore - a.rippleScore);
}

function computeRippleScore(
  affectedFileCount: number,
  implicitCount: number,
  blastRadius: number,
): number {
  const fileWeight = affectedFileCount;
  const implicitPenalty = implicitCount * 1.5;
  const blastWeight = Math.sqrt(blastRadius);
  return Math.round((fileWeight + implicitPenalty + blastWeight) * 100) / 100;
}

interface StaticDeps {
  files: string[];
  fileSet: Set<string>;
}

const MAX_FILE_BFS = 100;
const MAX_DEPTH = 3;

function buildFileGraph(
  callGraph: CallEdge[],
  entityById: Map<string, Entity>,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const edge of callGraph) {
    const callerEntity = entityById.get(edge.caller);
    const calleeEntity = entityById.get(edge.callee);
    if (!callerEntity || !calleeEntity) continue;
    const a = callerEntity.filePath;
    const b = calleeEntity.filePath;
    if (a === b) continue;

    let aNeighbors = graph.get(a);
    if (!aNeighbors) { aNeighbors = new Set(); graph.set(a, aNeighbors); }
    aNeighbors.add(b);

    let bNeighbors = graph.get(b);
    if (!bNeighbors) { bNeighbors = new Set(); graph.set(b, bNeighbors); }
    bNeighbors.add(a);
  }
  return graph;
}

function getFileDeps(
  filePath: string,
  fileGraph: Map<string, Set<string>>,
  cache: Map<string, StaticDeps>,
): StaticDeps {
  const cached = cache.get(filePath);
  if (cached) return cached;

  const files = new Set<string>();
  const seen = new Set<string>();
  const queue: Array<[string, number]> = [[filePath, 0]];

  while (queue.length > 0) {
    if (seen.size >= MAX_FILE_BFS) break;
    const [current, depth] = queue.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);

    if (current !== filePath) files.add(current);
    if (depth >= MAX_DEPTH) continue;

    const neighbors = fileGraph.get(current);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (!seen.has(neighbor)) queue.push([neighbor, depth + 1]);
    }
  }

  const result = { files: Array.from(files), fileSet: files };
  cache.set(filePath, result);
  return result;
}

interface TemporalDep {
  filePath: string;
  confidence: number;
}

function buildCouplingIndex(
  couplings: TemporalCoupling[],
): Map<string, TemporalDep[]> {
  const index = new Map<string, TemporalDep[]>();

  for (const c of couplings) {
    if (c.confidence < 0.3) continue;

    let depsA = index.get(c.fileA);
    if (!depsA) { depsA = []; index.set(c.fileA, depsA); }
    depsA.push({ filePath: c.fileB, confidence: c.confidence });

    let depsB = index.get(c.fileB);
    if (!depsB) { depsB = []; index.set(c.fileB, depsB); }
    depsB.push({ filePath: c.fileA, confidence: c.confidence });
  }

  return index;
}

function getTemporalDeps(
  filePath: string,
  couplingIndex: Map<string, TemporalDep[]>,
  staticDeps: StaticDeps,
): TemporalDep[] {
  return couplingIndex.get(filePath) ?? [];
}
