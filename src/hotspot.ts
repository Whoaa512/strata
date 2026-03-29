import type { Entity, ChurnEntry, Hotspot } from "./schema";

export function computeHotspots(
  entities: Entity[],
  churn: ChurnEntry[],
): Hotspot[] {
  const churnByFile = new Map<string, ChurnEntry>();
  for (const c of churn) {
    churnByFile.set(c.filePath, c);
  }

  const maxComplexity = Math.max(1, ...entities.map((e) => e.metrics.cognitive));
  const maxChurn = Math.max(1, ...churn.map((c) => c.commits));

  return entities
    .map((entity) => {
      const fileChurn = churnByFile.get(entity.filePath);
      const churnScore = fileChurn ? fileChurn.commits / maxChurn : 0;
      const complexityScore = entity.metrics.cognitive / maxComplexity;
      const score = Math.round(churnScore * complexityScore * 1000) / 1000;

      return {
        entityId: entity.id,
        score,
        complexity: entity.metrics.cognitive,
        churn: fileChurn?.commits ?? 0,
      };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);
}
