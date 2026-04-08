import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { buildCodebaseShape } from "../src/shape";
import type { Entity, StrataDoc } from "../src/schema";

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

function makeDoc(rootDir: string): StrataDoc {
  const entities = [
    makeEntity("packages/auth/src/token.ts:validateToken:1", "packages/auth/src/token.ts"),
    makeEntity("packages/auth/src/session.ts:getSession:1", "packages/auth/src/session.ts"),
    makeEntity("packages/web/src/routes.ts:routeAuth:1", "packages/web/src/routes.ts"),
  ];

  return {
    version: "0.2.0",
    analyzedAt: "2026-04-07T00:00:00.000Z",
    rootDir,
    entities,
    callGraph: [],
    churn: [],
    temporalCoupling: [
      { fileA: "packages/auth/src/token.ts", fileB: "packages/web/src/routes.ts", cochangeCount: 6, confidence: 0.75, hasStaticDependency: false },
    ],
    hotspots: [],
    blastRadius: [],
    changeRipple: [
      { entityId: "packages/auth/src/token.ts:validateToken:1", rippleScore: 7, staticDeps: [], temporalDeps: ["packages/web/src/routes.ts"], implicitCouplings: [{ filePath: "packages/web/src/routes.ts", cochangeRate: 0.75 }], affectedFiles: ["packages/web/src/routes.ts"] },
      { entityId: "packages/auth/src/session.ts:getSession:1", rippleScore: 2, staticDeps: [], temporalDeps: [], implicitCouplings: [], affectedFiles: [] },
    ],
    agentRisk: [
      { entityId: "packages/auth/src/token.ts:validateToken:1", rippleScore: 7, contextCost: 2000, safetyRating: "red", riskFactors: ["implicit coupling"] },
      { entityId: "packages/auth/src/session.ts:getSession:1", rippleScore: 2, contextCost: 500, safetyRating: "yellow", riskFactors: [] },
      { entityId: "packages/web/src/routes.ts:routeAuth:1", rippleScore: 1, contextCost: 300, safetyRating: "green", riskFactors: [] },
    ],
    errors: [],
  };
}

describe("buildCodebaseShape", () => {
  test("summarizes packages as map-ready terrain groups", () => {
    const rootDir = join("/tmp", `strata-shape-${Date.now()}`);
    mkdirSync(join(rootDir, "packages/auth/src"), { recursive: true });
    mkdirSync(join(rootDir, "packages/web/src"), { recursive: true });
    writeFileSync(join(rootDir, "packages/auth/package.json"), "{}");
    writeFileSync(join(rootDir, "packages/web/package.json"), "{}");

    try {
      const shape = buildCodebaseShape(makeDoc(rootDir));

      expect(shape.packageCount).toBe(2);
      expect(shape.entityCount).toBe(3);
      expect(shape.packages.map(p => p.name)).toEqual(["packages/auth", "packages/web"]);
      expect(shape.packages[0]).toMatchObject({
        name: "packages/auth",
        fileCount: 2,
        entityCount: 2,
        risk: { red: 1, yellow: 1, green: 0 },
        maxRipple: 7,
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test("surfaces hidden cross-package couplings", () => {
    const rootDir = join("/tmp", `strata-shape-coupling-${Date.now()}`);
    mkdirSync(join(rootDir, "packages/auth/src"), { recursive: true });
    mkdirSync(join(rootDir, "packages/web/src"), { recursive: true });
    writeFileSync(join(rootDir, "packages/auth/package.json"), "{}");
    writeFileSync(join(rootDir, "packages/web/package.json"), "{}");

    try {
      const shape = buildCodebaseShape(makeDoc(rootDir));

      expect(shape.hiddenCouplings).toContainEqual({
        fromPackage: "packages/auth",
        toPackage: "packages/web",
        fileA: "packages/auth/src/token.ts",
        fileB: "packages/web/src/routes.ts",
        confidence: 0.75,
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
