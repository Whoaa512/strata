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

  const calleeIndex = new Map<string, string[]>();
  for (const edge of callGraph) {
    let callees = calleeIndex.get(edge.caller);
    if (!callees) {
      callees = [];
      calleeIndex.set(edge.caller, callees);
    }
    callees.push(edge.callee);
  }

  const callerIndex = new Map<string, string[]>();
  for (const edge of callGraph) {
    let callers = callerIndex.get(edge.callee);
    if (!callers) {
      callers = [];
      callerIndex.set(edge.callee, callers);
    }
    callers.push(edge.caller);
  }

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
  const staticDepsCache = new Map<string, StaticDeps>();

  return relevantEntities.map(entity => {
    const staticDeps = getStaticDeps(entity.id, calleeIndex, callerIndex, entityById, staticDepsCache);
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

const MAX_BFS = 200;
const MAX_DEPTH = 3;

function getStaticDeps(
  entityId: string,
  calleeIndex: Map<string, string[]>,
  callerIndex: Map<string, string[]>,
  entityById: Map<string, Entity>,
  cache: Map<string, StaticDeps>,
): StaticDeps {
  const cached = cache.get(entityId);
  if (cached) return cached;

  const entity = entityById.get(entityId);
  if (!entity) {
    const empty = { files: [], fileSet: new Set<string>() };
    cache.set(entityId, empty);
    return empty;
  }

  const files = new Set<string>();
  const seen = new Set<string>();
  const queue: Array<[string, number]> = [[entityId, 0]];

  while (queue.length > 0) {
    if (seen.size >= MAX_BFS) break;
    const [current, depth] = queue.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);

    if (depth >= MAX_DEPTH) continue;

    const callees = calleeIndex.get(current) ?? [];
    const callers = callerIndex.get(current) ?? [];

    for (const dep of callees) {
      const depEntity = entityById.get(dep);
      if (depEntity && depEntity.filePath !== entity.filePath) {
        files.add(depEntity.filePath);
      }
      if (!seen.has(dep)) queue.push([dep, depth + 1]);
    }

    for (const dep of callers) {
      const depEntity = entityById.get(dep);
      if (depEntity && depEntity.filePath !== entity.filePath) {
        files.add(depEntity.filePath);
      }
      if (!seen.has(dep)) queue.push([dep, depth + 1]);
    }
  }

  const result = { files: Array.from(files), fileSet: files };
  cache.set(entityId, result);
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
