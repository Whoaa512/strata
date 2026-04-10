import type { AgentRisk, ChangeRipple, BlastRadius } from "./schema";

export type DelegationLevel = "AUTO" | "GLANCE" | "REVIEW" | "COLLABORATE" | "HUMAN";

export const DELEGATION_LEVELS: DelegationLevel[] = ["AUTO", "GLANCE", "REVIEW", "COLLABORATE", "HUMAN"];

export function computeDelegationLevel(
  risk: AgentRisk,
  ripple?: ChangeRipple,
  blast?: BlastRadius,
): DelegationLevel {
  let score = 0;

  const { safetyRating, contextCost, riskFactors } = risk;
  if (safetyRating === "red") score += 3;
  else if (safetyRating === "yellow") score += 1;

  if (contextCost > 15000) score += 2;
  else if (contextCost > 8000) score += 1;

  if (ripple) {
    if (ripple.implicitCouplings.length >= 3) score += 2;
    else if (ripple.implicitCouplings.length >= 1) score += 1;
  }

  if (blast && blast.radius > 10) score += 1;

  score += Math.min(2, riskFactors.length);

  if (score >= 8) return "HUMAN";
  if (score >= 5) return "COLLABORATE";
  if (score >= 3) return "REVIEW";
  if (score >= 1) return "GLANCE";
  return "AUTO";
}
