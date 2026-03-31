import { describe, expect, test } from "bun:test";
import { computeAgentRisk } from "../src/risk";
import type { Entity, ChangeRipple, ChurnEntry } from "../src/schema";

function makeEntity(id: string, filePath: string, loc = 20): Entity {
  return {
    id,
    name: id.split(":")[1] ?? id,
    kind: "function",
    filePath,
    startLine: 1,
    endLine: loc,
    metrics: { cyclomatic: 1, cognitive: 1, loc, maxNestingDepth: 0, parameterCount: 1 },
  };
}

function makeRipple(entityId: string, affectedFiles: string[]): ChangeRipple {
  return {
    entityId,
    rippleScore: affectedFiles.length,
    staticDeps: affectedFiles,
    temporalDeps: [],
    implicitCouplings: [],
    affectedFiles,
  };
}

describe("computeAgentRisk perf", () => {
  test("entities sharing same affected files produce same contextCost", () => {
    const sharedFiles = Array.from({ length: 10 }, (_, i) => `dep-${i}.ts`);
    const entities: Entity[] = [];
    const ripples: ChangeRipple[] = [];

    for (let i = 0; i < 100; i++) {
      const id = `src/mod-${i}.ts:fn:1`;
      entities.push(makeEntity(id, `src/mod-${i}.ts`));
      ripples.push(makeRipple(id, sharedFiles));
    }
    for (const f of sharedFiles) {
      entities.push(makeEntity(`${f}:helper:1`, f, 50));
    }

    const risks = computeAgentRisk(entities, ripples, []);
    const modRisks = risks.filter(r => r.entityId.includes("mod-"));
    const costs = modRisks.map(r => r.contextCost);
    expect(new Set(costs).size).toBe(1);
  });

  test("scales linearly with unique file sets not total entities", () => {
    const entities: Entity[] = [];
    const ripples: ChangeRipple[] = [];

    for (let i = 0; i < 1000; i++) {
      const id = `src/f-${i}.ts:fn:1`;
      entities.push(makeEntity(id, `src/f-${i}.ts`));
      ripples.push(makeRipple(id, [`shared-a.ts`, `shared-b.ts`]));
    }
    entities.push(makeEntity(`shared-a.ts:x:1`, `shared-a.ts`, 100));
    entities.push(makeEntity(`shared-b.ts:x:1`, `shared-b.ts`, 100));

    const t0 = performance.now();
    computeAgentRisk(entities, ripples, []);
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(500);
  });
});
