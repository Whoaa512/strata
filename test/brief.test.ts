import { describe, expect, test } from "bun:test";
import { renderFileBrief } from "../src/brief";
import type { StrataDoc } from "../src/schema";

function makeDoc(): StrataDoc {
  return {
    version: "0.2.0",
    analyzedAt: new Date().toISOString(),
    rootDir: "/tmp/test",
    entities: [
      { id: "src/big.ts:a:1", name: "a", kind: "function", filePath: "src/big.ts", startLine: 1, endLine: 10, metrics: { cyclomatic: 1, cognitive: 1, loc: 10, maxNestingDepth: 0, parameterCount: 1 } },
      { id: "src/big.ts:b:12", name: "b", kind: "function", filePath: "src/big.ts", startLine: 12, endLine: 20, metrics: { cyclomatic: 1, cognitive: 1, loc: 9, maxNestingDepth: 0, parameterCount: 1 } },
    ],
    callGraph: [],
    churn: [],
    temporalCoupling: [],
    hotspots: [],
    blastRadius: [],
    changeRipple: [
      { entityId: "src/big.ts:a:1", rippleScore: 5, staticDeps: ["src/dep.ts"], temporalDeps: ["test/big.test.ts"], implicitCouplings: [{ filePath: "test/big.test.ts", cochangeRate: 0.8 }], affectedFiles: ["src/dep.ts", "test/big.test.ts"] },
      { entityId: "src/big.ts:b:12", rippleScore: 4, staticDeps: ["src/dep.ts"], temporalDeps: ["test/big.test.ts"], implicitCouplings: [{ filePath: "test/big.test.ts", cochangeRate: 0.8 }], affectedFiles: ["src/dep.ts", "test/big.test.ts"] },
    ],
    agentRisk: [
      { entityId: "src/big.ts:a:1", rippleScore: 5, contextCost: 1500, safetyRating: "red", riskFactors: ["wide ripple: 2 files affected", "implicit coupling"] },
      { entityId: "src/big.ts:b:12", rippleScore: 4, contextCost: 1200, safetyRating: "red", riskFactors: ["wide ripple: 2 files affected", "implicit coupling"] },
    ],
    errors: [],
  };
}

describe("renderFileBrief", () => {
  test("groups repeated file-level risk before entity list", () => {
    const output = renderFileBrief(makeDoc(), "src/big.ts");

    expect(output).toContain("Summary");
    expect(output).toContain("Entities");
    expect(output.match(/implicit coupling: test\/big\.test\.ts/g)?.length).toBe(1);
    expect(output.match(/wide ripple: 2 files affected/g)?.length).toBe(1);
    expect(output).toContain("a");
    expect(output).toContain("b");
  });
});
