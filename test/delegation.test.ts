import { describe, expect, test } from "bun:test";
import { computeDelegationLevel, DELEGATION_LEVELS } from "../src/delegation";
import type { AgentRisk, ChangeRipple, BlastRadius } from "../src/schema";

function makeRisk(overrides: Partial<AgentRisk> = {}): AgentRisk {
  return {
    entityId: "test:fn:1",
    rippleScore: 0,
    contextCost: 100,
    safetyRating: "green",
    riskFactors: [],
    ...overrides,
  };
}

function makeRipple(overrides: Partial<ChangeRipple> = {}): ChangeRipple {
  return {
    entityId: "test:fn:1",
    rippleScore: 0,
    staticDeps: [],
    temporalDeps: [],
    implicitCouplings: [],
    affectedFiles: [],
    ...overrides,
  };
}

function makeBlast(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    entityId: "test:fn:1",
    directCallers: [],
    transitiveCallers: [],
    radius: 0,
    ...overrides,
  };
}

describe("computeDelegationLevel", () => {
  test("safe entity → AUTO", () => {
    expect(computeDelegationLevel(makeRisk())).toBe("AUTO");
  });

  test("green with one risk factor → GLANCE", () => {
    expect(computeDelegationLevel(makeRisk({
      riskFactors: ["large function: 250 LOC"],
    }))).toBe("GLANCE");
  });

  test("yellow safety → at least GLANCE", () => {
    const level = computeDelegationLevel(makeRisk({ safetyRating: "yellow" }));
    expect(DELEGATION_LEVELS.indexOf(level)).toBeGreaterThanOrEqual(1);
  });

  test("yellow + implicit coupling → at least GLANCE", () => {
    const risk = makeRisk({ safetyRating: "yellow" });
    const ripple = makeRipple({
      implicitCouplings: [{ filePath: "x.ts", cochangeRate: 0.6 }],
    });
    const level = computeDelegationLevel(risk, ripple);
    expect(DELEGATION_LEVELS.indexOf(level)).toBeGreaterThanOrEqual(1);
  });

  test("yellow + multiple implicit couplings + risk factor → REVIEW", () => {
    const risk = makeRisk({
      safetyRating: "yellow",
      riskFactors: ["wide ripple: 8 files affected"],
    });
    const ripple = makeRipple({
      implicitCouplings: [
        { filePath: "x.ts", cochangeRate: 0.6 },
        { filePath: "y.ts", cochangeRate: 0.5 },
        { filePath: "z.ts", cochangeRate: 0.4 },
      ],
    });
    expect(computeDelegationLevel(risk, ripple)).toBe("REVIEW");
  });

  test("red safety + high context cost → COLLABORATE or higher", () => {
    const risk = makeRisk({
      safetyRating: "red",
      contextCost: 16000,
      riskFactors: [],
    });
    const level = computeDelegationLevel(risk);
    expect(DELEGATION_LEVELS.indexOf(level)).toBeGreaterThanOrEqual(3);
  });

  test("maxed out signals → HUMAN", () => {
    const risk = makeRisk({
      safetyRating: "red",
      contextCost: 20000,
      riskFactors: ["implicit couplings", "wide ripple", "large function"],
    });
    const ripple = makeRipple({
      implicitCouplings: [
        { filePath: "a.ts", cochangeRate: 0.8 },
        { filePath: "b.ts", cochangeRate: 0.7 },
        { filePath: "c.ts", cochangeRate: 0.6 },
      ],
    });
    const blast = makeBlast({ radius: 15 });
    expect(computeDelegationLevel(risk, ripple, blast)).toBe("HUMAN");
  });

  test("blast radius > 10 adds signal", () => {
    const base = makeRisk({ safetyRating: "yellow" });
    const withSmallBlast = computeDelegationLevel(base, undefined, makeBlast({ radius: 5 }));
    const withBigBlast = computeDelegationLevel(base, undefined, makeBlast({ radius: 15 }));
    expect(DELEGATION_LEVELS.indexOf(withBigBlast)).toBeGreaterThanOrEqual(
      DELEGATION_LEVELS.indexOf(withSmallBlast),
    );
  });

  test("risk factors capped at 2 contribution", () => {
    const manyFactors = makeRisk({
      riskFactors: ["a", "b", "c", "d", "e"],
    });
    const twoFactors = makeRisk({
      riskFactors: ["a", "b"],
    });
    expect(computeDelegationLevel(manyFactors)).toBe(computeDelegationLevel(twoFactors));
  });

  test("DELEGATION_LEVELS ordering has 5 entries", () => {
    expect(DELEGATION_LEVELS).toEqual(["AUTO", "GLANCE", "REVIEW", "COLLABORATE", "HUMAN"]);
  });
});
