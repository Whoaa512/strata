import { describe, expect, test } from "bun:test";
import { getChurn, getTemporalCoupling, markStaticDependencies } from "../src/git";
import path from "path";

const repoRoot = path.resolve(import.meta.dir, "..");

describe("getChurn", () => {
  test("returns churn data for strata repo", () => {
    const churn = getChurn(repoRoot);
    expect(churn.length).toBeGreaterThan(0);
    for (const entry of churn) {
      expect(entry.filePath).toBeTruthy();
      expect(entry.commits).toBeGreaterThan(0);
      expect(entry.linesAdded).toBeGreaterThanOrEqual(0);
      expect(entry.linesDeleted).toBeGreaterThanOrEqual(0);
    }
  });

  test("returns empty for non-git dir", () => {
    const churn = getChurn("/tmp");
    expect(churn).toEqual([]);
  });
});

describe("getTemporalCoupling", () => {
  test("returns coupling data for strata repo", () => {
    const coupling = getTemporalCoupling(repoRoot, 500, 2);
    if (coupling.length > 0) {
      expect(coupling[0].fileA).toBeTruthy();
      expect(coupling[0].fileB).toBeTruthy();
      expect(coupling[0].cochangeCount).toBeGreaterThanOrEqual(2);
      expect(coupling[0].confidence).toBeGreaterThan(0);
      expect(coupling[0].confidence).toBeLessThanOrEqual(1);
    }
  });

  test("filters large commits", () => {
    const coupling = getTemporalCoupling(repoRoot, 500, 1, 2);
    for (const c of coupling) {
      expect(c.cochangeCount).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("markStaticDependencies", () => {
  test("marks pairs that have call graph edges", () => {
    const couplings = [
      { fileA: "a.ts", fileB: "b.ts", cochangeCount: 5, confidence: 0.8, hasStaticDependency: false },
      { fileA: "c.ts", fileB: "d.ts", cochangeCount: 3, confidence: 0.5, hasStaticDependency: false },
    ];
    const callGraph = [{ caller: "a.ts:foo:1", callee: "b.ts:bar:1" }];
    const entities = [
      { id: "a.ts:foo:1", filePath: "a.ts" },
      { id: "b.ts:bar:1", filePath: "b.ts" },
    ];

    const result = markStaticDependencies(couplings, callGraph, entities);
    expect(result[0].hasStaticDependency).toBe(true);
    expect(result[1].hasStaticDependency).toBe(false);
  });
});
