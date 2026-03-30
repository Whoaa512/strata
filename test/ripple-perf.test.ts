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
});
