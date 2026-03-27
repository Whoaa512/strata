import { describe, expect, it } from "bun:test";
import type { SvEntity, Hotspot, PluginResult, SvEdge } from "../src/types";

function mergeEntities(entities: SvEntity[]): SvEntity[] {
  const byId = new Map<string, SvEntity>();
  const fileMetrics = new Map<string, Record<string, number>>();

  for (const e of entities) {
    if (e.kind === "file") {
      fileMetrics.set(e.filePath, { ...fileMetrics.get(e.filePath), ...e.metrics });
    }

    const existing = byId.get(e.id);
    if (!existing) {
      byId.set(e.id, { ...e });
      continue;
    }
    existing.metrics = { ...existing.metrics, ...e.metrics };
  }

  for (const entity of byId.values()) {
    if (entity.kind !== "function") continue;

    const fm = fileMetrics.get(entity.filePath);
    if (!fm) continue;

    if (fm.churn !== undefined && entity.metrics.churn === undefined) {
      entity.metrics.churn = fm.churn;
    }
  }

  return [...byId.values()];
}

function computeHotspots(entities: SvEntity[]): Hotspot[] {
  return entities
    .filter((e) => e.kind === "function")
    .map((e) => ({
      entityId: e.id,
      score: (e.metrics.cognitiveComplexity ?? 0) * (e.metrics.churn ?? 0),
      complexity: e.metrics.cognitiveComplexity ?? 0,
      churn: e.metrics.churn ?? 0,
      blastRadius: e.metrics.blastRadius,
    }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);
}

describe("entity merging", () => {
  it("merges file-level churn into function entities", () => {
    const entities: SvEntity[] = [
      {
        id: "src/a.ts::foo",
        kind: "function",
        name: "foo",
        filePath: "src/a.ts",
        startLine: 1,
        endLine: 10,
        metrics: { cognitiveComplexity: 5 },
      },
      {
        id: "src/a.ts::bar",
        kind: "function",
        name: "bar",
        filePath: "src/a.ts",
        startLine: 12,
        endLine: 20,
        metrics: { cognitiveComplexity: 1 },
      },
      {
        id: "file::src/a.ts",
        kind: "file",
        name: "src/a.ts",
        filePath: "src/a.ts",
        startLine: 1,
        endLine: 20,
        metrics: { churn: 10 },
      },
    ];

    const merged = mergeEntities(entities);
    const foo = merged.find((e) => e.name === "foo");
    const bar = merged.find((e) => e.name === "bar");

    expect(foo!.metrics.churn).toBe(10);
    expect(foo!.metrics.cognitiveComplexity).toBe(5);
    expect(bar!.metrics.churn).toBe(10);
  });

  it("merges duplicate entity metrics from different plugins", () => {
    const entities: SvEntity[] = [
      {
        id: "src/a.ts::foo",
        kind: "function",
        name: "foo",
        filePath: "src/a.ts",
        startLine: 1,
        endLine: 10,
        metrics: { cognitiveComplexity: 5 },
      },
      {
        id: "src/a.ts::foo",
        kind: "function",
        name: "foo",
        filePath: "src/a.ts",
        startLine: 1,
        endLine: 10,
        metrics: { blastRadius: 3 },
      },
    ];

    const merged = mergeEntities(entities);
    expect(merged).toHaveLength(1);
    expect(merged[0].metrics.cognitiveComplexity).toBe(5);
    expect(merged[0].metrics.blastRadius).toBe(3);
  });
});

describe("hotspot computation", () => {
  it("ranks by complexity × churn", () => {
    const entities: SvEntity[] = [
      {
        id: "a::f1",
        kind: "function",
        name: "f1",
        filePath: "a.ts",
        startLine: 1,
        endLine: 5,
        metrics: { cognitiveComplexity: 10, churn: 5 },
      },
      {
        id: "a::f2",
        kind: "function",
        name: "f2",
        filePath: "a.ts",
        startLine: 6,
        endLine: 10,
        metrics: { cognitiveComplexity: 2, churn: 20 },
      },
    ];

    const hotspots = computeHotspots(entities);
    expect(hotspots[0].entityId).toBe("a::f1");
    expect(hotspots[0].score).toBe(50);
    expect(hotspots[1].entityId).toBe("a::f2");
    expect(hotspots[1].score).toBe(40);
  });

  it("excludes zero-score entries", () => {
    const entities: SvEntity[] = [
      {
        id: "a::f1",
        kind: "function",
        name: "f1",
        filePath: "a.ts",
        startLine: 1,
        endLine: 5,
        metrics: { cognitiveComplexity: 0, churn: 10 },
      },
    ];

    const hotspots = computeHotspots(entities);
    expect(hotspots).toHaveLength(0);
  });
});
