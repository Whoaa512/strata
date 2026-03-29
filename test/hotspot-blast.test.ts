import { describe, expect, test } from "bun:test";
import { computeHotspots } from "../src/hotspot";
import { computeBlastRadius, computeAllBlastRadii } from "../src/blast";
import type { Entity, ChurnEntry, CallEdge } from "../src/schema";

const makeEntity = (id: string, filePath: string, cognitive: number): Entity => ({
  id,
  name: id.split(":")[1],
  kind: "function",
  filePath,
  startLine: 1,
  endLine: 10,
  metrics: { cyclomatic: 1, cognitive, loc: 10, maxNestingDepth: 0, parameterCount: 0 },
});

describe("computeHotspots", () => {
  test("ranks by churn × complexity", () => {
    const entities: Entity[] = [
      makeEntity("a.ts:high:1", "a.ts", 10),
      makeEntity("b.ts:low:1", "b.ts", 1),
      makeEntity("a.ts:medium:5", "a.ts", 5),
    ];
    const churn: ChurnEntry[] = [
      { filePath: "a.ts", commits: 20, linesAdded: 100, linesDeleted: 50 },
      { filePath: "b.ts", commits: 2, linesAdded: 10, linesDeleted: 5 },
    ];

    const hotspots = computeHotspots(entities, churn);
    expect(hotspots.length).toBeGreaterThan(0);
    expect(hotspots[0].entityId).toBe("a.ts:high:1");
    expect(hotspots[0].score).toBe(1);
  });

  test("zero complexity = no hotspot", () => {
    const entities = [makeEntity("a.ts:noop:1", "a.ts", 0)];
    const churn: ChurnEntry[] = [{ filePath: "a.ts", commits: 100, linesAdded: 500, linesDeleted: 200 }];
    const hotspots = computeHotspots(entities, churn);
    expect(hotspots.length).toBe(0);
  });

  test("no churn = no hotspot", () => {
    const entities = [makeEntity("a.ts:complex:1", "a.ts", 20)];
    const hotspots = computeHotspots(entities, []);
    expect(hotspots.length).toBe(0);
  });
});

describe("computeBlastRadius", () => {
  test("direct callers", () => {
    const callGraph: CallEdge[] = [
      { caller: "a:foo:1", callee: "b:bar:1" },
      { caller: "c:baz:1", callee: "b:bar:1" },
    ];
    const result = computeBlastRadius("b:bar:1", callGraph);
    expect(result.directCallers.sort()).toEqual(["a:foo:1", "c:baz:1"]);
    expect(result.radius).toBe(2);
  });

  test("transitive callers", () => {
    const callGraph: CallEdge[] = [
      { caller: "a:foo:1", callee: "b:bar:1" },
      { caller: "b:bar:1", callee: "c:baz:1" },
      { caller: "d:qux:1", callee: "a:foo:1" },
    ];
    const result = computeBlastRadius("c:baz:1", callGraph);
    expect(result.directCallers).toEqual(["b:bar:1"]);
    expect(result.transitiveCallers.sort()).toEqual(["a:foo:1", "b:bar:1", "d:qux:1"]);
    expect(result.radius).toBe(3);
  });

  test("handles cycles", () => {
    const callGraph: CallEdge[] = [
      { caller: "a:foo:1", callee: "b:bar:1" },
      { caller: "b:bar:1", callee: "a:foo:1" },
    ];
    const result = computeBlastRadius("b:bar:1", callGraph);
    expect(result.radius).toBe(1);
    expect(result.transitiveCallers).toEqual(["a:foo:1"]);
  });

  test("no callers = radius 0", () => {
    const result = computeBlastRadius("x:y:1", []);
    expect(result.radius).toBe(0);
    expect(result.directCallers).toEqual([]);
    expect(result.transitiveCallers).toEqual([]);
  });
});

describe("computeAllBlastRadii", () => {
  test("sorted by radius descending", () => {
    const callGraph: CallEdge[] = [
      { caller: "a:foo:1", callee: "c:baz:1" },
      { caller: "b:bar:1", callee: "c:baz:1" },
      { caller: "d:qux:1", callee: "a:foo:1" },
    ];
    const result = computeAllBlastRadii(["a:foo:1", "c:baz:1"], callGraph);
    expect(result[0].entityId).toBe("c:baz:1");
    expect(result[0].radius).toBe(3);
  });
});
