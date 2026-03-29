import { describe, expect, test } from "bun:test";
import { computeChangeRipple } from "../src/ripple";
import { computeAgentRisk } from "../src/risk";
import type { Entity, CallEdge, TemporalCoupling, BlastRadius, ChurnEntry } from "../src/schema";

function makeEntity(id: string, filePath: string, loc = 20): Entity {
  return {
    id, name: id.split(":")[1] ?? id, kind: "function", filePath,
    startLine: 1, endLine: loc,
    metrics: { cyclomatic: 1, cognitive: 1, loc, maxNestingDepth: 0, parameterCount: 1 },
  };
}

const entities: Entity[] = [
  makeEntity("a.ts:foo:1", "a.ts", 30),
  makeEntity("b.ts:bar:1", "b.ts", 50),
  makeEntity("c.ts:baz:1", "c.ts", 10),
  makeEntity("d.ts:qux:1", "d.ts", 15),
];

const callGraph: CallEdge[] = [
  { caller: "a.ts:foo:1", callee: "b.ts:bar:1" },
  { caller: "b.ts:bar:1", callee: "c.ts:baz:1" },
];

const temporalCoupling: TemporalCoupling[] = [
  { fileA: "a.ts", fileB: "d.ts", cochangeCount: 8, confidence: 0.8, hasStaticDependency: false },
  { fileA: "b.ts", fileB: "c.ts", cochangeCount: 5, confidence: 0.5, hasStaticDependency: true },
];

const blastRadius: BlastRadius[] = [
  { entityId: "c.ts:baz:1", directCallers: ["b.ts:bar:1"], transitiveCallers: ["b.ts:bar:1", "a.ts:foo:1"], radius: 2 },
  { entityId: "b.ts:bar:1", directCallers: ["a.ts:foo:1"], transitiveCallers: ["a.ts:foo:1"], radius: 1 },
];

const churn: ChurnEntry[] = [
  { filePath: "a.ts", commits: 20, linesAdded: 100, linesDeleted: 50 },
  { filePath: "b.ts", commits: 5, linesAdded: 30, linesDeleted: 10 },
];

describe("computeChangeRipple", () => {
  const ripples = computeChangeRipple(entities, callGraph, temporalCoupling, blastRadius, churn);
  const rippleMap = new Map(ripples.map(r => [r.entityId, r]));

  test("computes ripple for all entities", () => {
    expect(ripples.length).toBe(entities.length);
  });

  test("entity with call deps + temporal coupling has high ripple", () => {
    const r = rippleMap.get("a.ts:foo:1")!;
    expect(r.rippleScore).toBeGreaterThan(0);
    expect(r.staticDeps.length).toBeGreaterThan(0);
    expect(r.affectedFiles.length).toBeGreaterThanOrEqual(2);
  });

  test("detects implicit couplings (temporal without static dep)", () => {
    const r = rippleMap.get("a.ts:foo:1")!;
    const implicitFiles = r.implicitCouplings.map(c => c.filePath);
    expect(implicitFiles).toContain("d.ts");
  });

  test("isolated entity has low ripple", () => {
    const r = rippleMap.get("d.ts:qux:1")!;
    expect(r.staticDeps.length).toBe(0);
  });

  test("sorted by ripple score descending", () => {
    for (let i = 1; i < ripples.length; i++) {
      expect(ripples[i - 1].rippleScore).toBeGreaterThanOrEqual(ripples[i].rippleScore);
    }
  });
});

describe("computeAgentRisk", () => {
  const ripples = computeChangeRipple(entities, callGraph, temporalCoupling, blastRadius, churn);
  const risks = computeAgentRisk(entities, ripples, churn);
  const riskMap = new Map(risks.map(r => [r.entityId, r]));

  test("computes risk for all entities", () => {
    expect(risks.length).toBe(entities.length);
  });

  test("context cost is in tokens (positive number)", () => {
    for (const r of risks) {
      expect(r.contextCost).toBeGreaterThan(0);
    }
  });

  test("safety rating is valid enum", () => {
    for (const r of risks) {
      expect(["green", "yellow", "red"]).toContain(r.safetyRating);
    }
  });

  test("entity with implicit couplings has risk factor", () => {
    const r = riskMap.get("a.ts:foo:1")!;
    const hasImplicit = r.riskFactors.some(f => f.includes("implicit"));
    expect(hasImplicit).toBe(true);
  });

  test("entity with only implicit coupling is yellow (not green)", () => {
    const r = riskMap.get("d.ts:qux:1")!;
    expect(r.safetyRating).toBe("yellow");
    expect(r.riskFactors.some(f => f.includes("implicit"))).toBe(true);
  });
});
