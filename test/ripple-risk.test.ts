import { describe, expect, test } from "bun:test";
import { computeChangeRipple, getPackageBoundary, getPackageBoundaries } from "../src/ripple";
import { computeAgentRisk } from "../src/risk";
import type { Entity, CallEdge, TemporalCoupling, BlastRadius, ChurnEntry } from "../src/schema";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

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

describe("package boundary detection", () => {
  const tmpDir = join("/tmp", `strata-pkg-test-${Date.now()}`);

  test("detects package.json boundaries", () => {
    mkdirSync(join(tmpDir, "packages/a/src"), { recursive: true });
    mkdirSync(join(tmpDir, "packages/b/src"), { recursive: true });
    writeFileSync(join(tmpDir, "package.json"), "{}");
    writeFileSync(join(tmpDir, "packages/a/package.json"), "{}");
    writeFileSync(join(tmpDir, "packages/b/package.json"), "{}");

    expect(getPackageBoundary("packages/a/src/index.ts", tmpDir)).toBe("packages/a");
    expect(getPackageBoundary("packages/b/src/util.ts", tmpDir)).toBe("packages/b");
    expect(getPackageBoundary("src/root.ts", tmpDir)).toBe(".");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("getPackageBoundaries maps all entities", () => {
    mkdirSync(join(tmpDir, "packages/x/src"), { recursive: true });
    mkdirSync(join(tmpDir, "packages/y/src"), { recursive: true });
    writeFileSync(join(tmpDir, "package.json"), "{}");
    writeFileSync(join(tmpDir, "packages/x/package.json"), "{}");
    writeFileSync(join(tmpDir, "packages/y/package.json"), "{}");

    const testEntities = [
      makeEntity("x:foo:1", "packages/x/src/foo.ts"),
      makeEntity("y:bar:1", "packages/y/src/bar.ts"),
    ];
    const result = getPackageBoundaries(testEntities, tmpDir);
    expect(result.get("packages/x/src/foo.ts")).toBe("packages/x");
    expect(result.get("packages/y/src/bar.ts")).toBe("packages/y");

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("cross-package ripple dampening", () => {
  const tmpDir = join("/tmp", `strata-ripple-pkg-${Date.now()}`);

  test("cross-package deps have lower ripple than intra-package deps", () => {
    mkdirSync(join(tmpDir, "packages/a/src"), { recursive: true });
    mkdirSync(join(tmpDir, "packages/b/src"), { recursive: true });
    writeFileSync(join(tmpDir, "package.json"), "{}");
    writeFileSync(join(tmpDir, "packages/a/package.json"), "{}");
    writeFileSync(join(tmpDir, "packages/b/package.json"), "{}");

    const pkgEntities: Entity[] = [
      makeEntity("a:main:1", "packages/a/src/main.ts", 30),
      makeEntity("a:helper:1", "packages/a/src/helper.ts", 20),
      makeEntity("b:util:1", "packages/b/src/util.ts", 20),
    ];
    const pkgCallGraph: CallEdge[] = [
      { caller: "a:main:1", callee: "a:helper:1" },
      { caller: "a:main:1", callee: "b:util:1" },
    ];

    const withPkg = computeChangeRipple(pkgEntities, pkgCallGraph, [], [], [], tmpDir);
    const withoutPkg = computeChangeRipple(pkgEntities, pkgCallGraph, [], [], []);

    const mainWithPkg = withPkg.find(r => r.entityId === "a:main:1")!;
    const mainWithoutPkg = withoutPkg.find(r => r.entityId === "a:main:1")!;

    expect(mainWithPkg.rippleScore).toBeLessThan(mainWithoutPkg.rippleScore);

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
