import type { Entity, Hotspot } from "../schema";

export function computeHotspots(
  entities: Entity[],
  limit?: number
): Hotspot[] {
  const hotspots: Hotspot[] = entities.map((e) => {
    const complexity = e.metrics.cognitiveComplexity;
    const churn = e.churn?.commits ?? 0;
    return {
      entityId: e.id,
      score: complexity * churn,
      complexity,
      churn,
    };
  });

  hotspots.sort((a, b) => b.score - a.score);

  if (limit !== undefined) {
    return hotspots.slice(0, limit);
  }
  return hotspots;
}
