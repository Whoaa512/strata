import type { Entity, CallEdge, TemporalCoupling, BlastRadius, ChurnEntry, ChangeRipple } from "./schema";

export function computeChangeRipple(
  entities: Entity[],
  callGraph: CallEdge[],
  temporalCoupling: TemporalCoupling[],
  blastRadius: BlastRadius[],
  churn: ChurnEntry[],
): ChangeRipple[] {
  const entityById = new Map(entities.map(e => [e.id, e]));
  const blastByEntity = new Map(blastRadius.map(b => [b.entityId, b]));

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

  const couplingByFile = buildCouplingIndex(temporalCoupling);

  return entities.map(entity => {
    const staticDeps = getStaticDeps(entity.id, calleeIndex, callerIndex, entityById);
    const temporalDeps = getTemporalDeps(entity.filePath, couplingByFile, staticDeps);
    const implicitCouplings = temporalDeps
      .filter(td => !staticDeps.fileSet.has(td.filePath))
      .map(td => ({ filePath: td.filePath, cochangeRate: td.confidence }));

    const affectedFiles = new Set<string>();
    for (const dep of staticDeps.files) affectedFiles.add(dep);
    for (const td of temporalDeps) affectedFiles.add(td.filePath);

    const blast = blastByEntity.get(entity.id);
    const blastCount = blast?.radius ?? 0;

    const rippleScore = computeRippleScore(
      affectedFiles.size,
      implicitCouplings.length,
      blastCount,
    );

    return {
      entityId: entity.id,
      rippleScore,
      staticDeps: staticDeps.files,
      temporalDeps: temporalDeps.map(t => t.filePath),
      implicitCouplings,
      affectedFiles: Array.from(affectedFiles),
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

function getStaticDeps(
  entityId: string,
  calleeIndex: Map<string, string[]>,
  callerIndex: Map<string, string[]>,
  entityById: Map<string, Entity>,
): StaticDeps {
  const entity = entityById.get(entityId);
  if (!entity) return { files: [], fileSet: new Set() };

  const files = new Set<string>();
  const seen = new Set<string>();
  const queue = [entityId];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);

    const callees = calleeIndex.get(current) ?? [];
    const callers = callerIndex.get(current) ?? [];

    for (const dep of [...callees, ...callers]) {
      const depEntity = entityById.get(dep);
      if (depEntity && depEntity.filePath !== entity.filePath) {
        files.add(depEntity.filePath);
      }
      if (!seen.has(dep)) queue.push(dep);
    }
  }

  return { files: Array.from(files), fileSet: files };
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
