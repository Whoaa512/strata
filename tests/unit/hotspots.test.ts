import { describe, it, expect } from "bun:test";
import { computeHotspots } from "../../src/analysis/hotspots";
import type { Entity } from "../../src/schema";

function makeEntity(
  id: string,
  complexity: number,
  commits: number
): Entity {
  return {
    id,
    name: id.split("::")[1] || id,
    kind: "function",
    location: { file: id.split("::")[0], startLine: 1, endLine: 10 },
    metrics: {
      cognitiveComplexity: complexity,
      nestingDepth: 0,
      lineCount: 10,
      fanIn: 0,
      fanOut: 0,
    },
    churn: {
      commits,
      authors: 1,
      lastModified: "2026-03-27",
      linesAdded: 10,
      linesDeleted: 5,
    },
  };
}

describe("hotspot computation", () => {
  it("returns empty array for no entities", () => {
    expect(computeHotspots([])).toEqual([]);
  });

  it("scores as complexity × churn", () => {
    const entities = [makeEntity("a.ts::foo", 10, 5)];
    const hotspots = computeHotspots(entities);
    expect(hotspots[0].score).toBe(50);
    expect(hotspots[0].complexity).toBe(10);
    expect(hotspots[0].churn).toBe(5);
  });

  it("sorts by score descending", () => {
    const entities = [
      makeEntity("a.ts::low", 2, 2),     // score: 4
      makeEntity("b.ts::high", 10, 10),   // score: 100
      makeEntity("c.ts::mid", 5, 5),      // score: 25
    ];
    const hotspots = computeHotspots(entities);
    expect(hotspots[0].entityId).toBe("b.ts::high");
    expect(hotspots[1].entityId).toBe("c.ts::mid");
    expect(hotspots[2].entityId).toBe("a.ts::low");
  });

  it("returns top N when limit specified", () => {
    const entities = [
      makeEntity("a.ts::a", 1, 1),
      makeEntity("b.ts::b", 5, 5),
      makeEntity("c.ts::c", 10, 10),
    ];
    const hotspots = computeHotspots(entities, 2);
    expect(hotspots.length).toBe(2);
    expect(hotspots[0].entityId).toBe("c.ts::c");
  });

  it("handles entities without churn data", () => {
    const entity: Entity = {
      id: "a.ts::foo",
      name: "foo",
      kind: "function",
      location: { file: "a.ts", startLine: 1, endLine: 10 },
      metrics: {
        cognitiveComplexity: 10,
        nestingDepth: 0,
        lineCount: 10,
        fanIn: 0,
        fanOut: 0,
      },
    };
    const hotspots = computeHotspots([entity]);
    expect(hotspots[0].score).toBe(0);
    expect(hotspots[0].churn).toBe(0);
  });

  it("zero complexity means zero score regardless of churn", () => {
    const entities = [makeEntity("a.ts::simple", 0, 100)];
    const hotspots = computeHotspots(entities);
    expect(hotspots[0].score).toBe(0);
  });
});
