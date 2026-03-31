import type { Entity, ChangeRipple, AgentRisk, ChurnEntry } from "./schema";

const TOKENS_PER_LINE = 3.5;

export function computeAgentRisk(
  entities: Entity[],
  changeRipple: ChangeRipple[],
  churn: ChurnEntry[],
): AgentRisk[] {
  const entityById = new Map(entities.map(e => [e.id, e]));
  const rippleByEntity = new Map(changeRipple.map(r => [r.entityId, r]));
  const locByFile = buildFileLocMap(entities);

  const maxRipple = Math.max(1, ...changeRipple.map(r => r.rippleScore));

  return entities.map(entity => {
    const ripple = rippleByEntity.get(entity.id);
    const rippleScore = ripple?.rippleScore ?? 0;

    const contextCost = estimateContextCost(entity, ripple, locByFile);
    const riskFactors = identifyRiskFactors(entity, ripple);
    const safetyRating = computeSafetyRating(rippleScore, maxRipple, contextCost, riskFactors);

    return {
      entityId: entity.id,
      rippleScore,
      contextCost,
      safetyRating,
      riskFactors,
    };
  }).sort((a, b) => {
    const ratingOrder = { red: 0, yellow: 1, green: 2 };
    const ratingDiff = ratingOrder[a.safetyRating] - ratingOrder[b.safetyRating];
    if (ratingDiff !== 0) return ratingDiff;
    return b.rippleScore - a.rippleScore;
  });
}

function buildFileLocMap(entities: Entity[]): Map<string, number> {
  const locByFile = new Map<string, number>();
  for (const e of entities) {
    const current = locByFile.get(e.filePath) ?? 0;
    locByFile.set(e.filePath, Math.max(current, e.endLine));
  }
  return locByFile;
}

function estimateContextCost(
  entity: Entity,
  ripple: ChangeRipple | undefined,
  locByFile: Map<string, number>,
): number {
  if (!ripple || ripple.affectedFiles.length === 0) {
    return Math.round(entity.metrics.loc * TOKENS_PER_LINE);
  }

  let totalLines = entity.metrics.loc;
  for (const f of ripple.affectedFiles) {
    if (f !== entity.filePath) {
      totalLines += locByFile.get(f) ?? 50;
    }
  }

  return Math.round(totalLines * TOKENS_PER_LINE);
}

function identifyRiskFactors(
  entity: Entity,
  ripple: ChangeRipple | undefined,
): string[] {
  const factors: string[] = [];

  if (ripple && ripple.implicitCouplings.length > 0) {
    const count = ripple.implicitCouplings.length;
    const topRate = Math.round(ripple.implicitCouplings[0].cochangeRate * 100);
    factors.push(`${count} implicit coupling${count > 1 ? "s" : ""} (strongest: ${topRate}% co-change)`);
  }

  if (ripple && ripple.affectedFiles.length > 5) {
    factors.push(`wide ripple: ${ripple.affectedFiles.length} files affected`);
  }

  if (entity.metrics.loc > 200) {
    factors.push(`large function: ${entity.metrics.loc} LOC`);
  }

  if (entity.metrics.parameterCount > 5) {
    factors.push(`many parameters: ${entity.metrics.parameterCount}`);
  }

  return factors;
}

function computeSafetyRating(
  rippleScore: number,
  maxRipple: number,
  contextCost: number,
  riskFactors: string[],
): AgentRisk["safetyRating"] {
  let dangerSignals = 0;

  if (maxRipple > 0 && rippleScore / maxRipple > 0.6) dangerSignals += 2;
  else if (maxRipple > 0 && rippleScore / maxRipple > 0.3) dangerSignals += 1;

  if (contextCost > 15000) dangerSignals += 2;
  else if (contextCost > 8000) dangerSignals += 1;

  dangerSignals += riskFactors.length;

  if (dangerSignals >= 4) return "red";
  if (dangerSignals >= 2) return "yellow";
  return "green";
}
