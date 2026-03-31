import { describe, expect, test } from "bun:test";
import { computeChangeRipple } from "../src/ripple";
import type { Entity, CallEdge } from "../src/schema";

function makeEntity(id: string, filePath: string): Entity {
  return {
    id,
    name: id.split(":")[1] ?? id,
    kind: "function",
    filePath,
    startLine: 1,
    endLine: 20,
    metrics: { cyclomatic: 1, cognitive: 1, loc: 20, maxNestingDepth: 0, parameterCount: 1 },
  };
}

describe("computeChangeRipple perf shape", () => {
  test("handles duplicate entity ids without changing output size", () => {
    const entities: Entity[] = [];
    const callGraph: CallEdge[] = [];

    for (let i = 0; i < 200; i++) {
      entities.push(makeEntity(`shared.ts:root:1`, `shared.ts`));
      entities.push(makeEntity(`dep-${i}.ts:leaf:1`, `dep-${i}.ts`));
      callGraph.push({ caller: "shared.ts:root:1", callee: `dep-${i}.ts:leaf:1` });
    }

    const ripples = computeChangeRipple(entities, callGraph, [], [], []);

    expect(ripples.length).toBe(entities.length);
    expect(ripples[0].affectedFiles.length).toBeGreaterThan(0);
  });

  test("entities in same file share file-level deps efficiently", () => {
    const entities: Entity[] = [];
    const callGraph: CallEdge[] = [];

    for (let i = 0; i < 50; i++) {
      entities.push(makeEntity(`hub.ts:fn${i}:${i + 1}`, `hub.ts`));
    }
    for (let i = 0; i < 20; i++) {
      entities.push(makeEntity(`dep-${i}.ts:helper:1`, `dep-${i}.ts`));
      callGraph.push({ caller: `hub.ts:fn${i % 50}:${(i % 50) + 1}`, callee: `dep-${i}.ts:helper:1` });
    }

    const t0 = performance.now();
    const ripples = computeChangeRipple(entities, callGraph, [], [], []);
    const elapsed = performance.now() - t0;

    const hubRipples = ripples.filter(r => r.entityId.startsWith("hub.ts:"));
    expect(hubRipples.length).toBeGreaterThan(0);
    expect(hubRipples[0].affectedFiles.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });

  test("scales with file count not entity count", () => {
    const entities: Entity[] = [];
    const callGraph: CallEdge[] = [];

    for (let fileIdx = 0; fileIdx < 100; fileIdx++) {
      for (let fnIdx = 0; fnIdx < 20; fnIdx++) {
        entities.push(makeEntity(`f-${fileIdx}.ts:fn${fnIdx}:${fnIdx + 1}`, `f-${fileIdx}.ts`));
      }
    }
    for (let i = 1; i < 100; i++) {
      callGraph.push({ caller: `f-0.ts:fn0:1`, callee: `f-${i}.ts:fn0:1` });
    }

    const t0 = performance.now();
    computeChangeRipple(entities, callGraph, [], [], []);
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(1000);
  });
});
