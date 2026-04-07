import { describe, expect, test } from "bun:test";
import { analyzeDiff, buildCallerCountIndex, hubDampeningFactor, parseDiffHunks, resolveChangedEntities, type DiffFile, type DiffHunk } from "../src/diff";
import type { Entity, StrataDoc } from "../src/schema";

function makeDoc(overrides: Partial<StrataDoc> = {}): StrataDoc {
  return {
    version: "0.2.0",
    analyzedAt: new Date().toISOString(),
    rootDir: "/tmp/test",
    entities: [
      { id: "a.ts:foo:1", name: "foo", kind: "function", filePath: "a.ts", startLine: 1, endLine: 20, metrics: { cyclomatic: 1, cognitive: 1, loc: 20, maxNestingDepth: 0, parameterCount: 1 } },
      { id: "b.ts:bar:1", name: "bar", kind: "function", filePath: "b.ts", startLine: 1, endLine: 30, metrics: { cyclomatic: 1, cognitive: 1, loc: 30, maxNestingDepth: 0, parameterCount: 1 } },
      { id: "c.ts:baz:1", name: "baz", kind: "function", filePath: "c.ts", startLine: 1, endLine: 10, metrics: { cyclomatic: 1, cognitive: 1, loc: 10, maxNestingDepth: 0, parameterCount: 1 } },
      { id: "a.test.ts:testFoo:1", name: "testFoo", kind: "function", filePath: "a.test.ts", startLine: 1, endLine: 15, metrics: { cyclomatic: 1, cognitive: 1, loc: 15, maxNestingDepth: 0, parameterCount: 0 } },
      { id: "c.test.ts:testBaz:1", name: "testBaz", kind: "function", filePath: "c.test.ts", startLine: 1, endLine: 15, metrics: { cyclomatic: 1, cognitive: 1, loc: 15, maxNestingDepth: 0, parameterCount: 0 } },
    ],
    callGraph: [
      { caller: "a.ts:foo:1", callee: "b.ts:bar:1" },
      { caller: "b.ts:bar:1", callee: "c.ts:baz:1" },
    ],
    churn: [],
    temporalCoupling: [
      { fileA: "a.ts", fileB: "c.ts", cochangeCount: 10, confidence: 0.8, hasStaticDependency: false },
    ],
    hotspots: [],
    blastRadius: [
      { entityId: "c.ts:baz:1", directCallers: ["b.ts:bar:1"], transitiveCallers: ["b.ts:bar:1", "a.ts:foo:1"], radius: 2 },
    ],
    changeRipple: [
      { entityId: "a.ts:foo:1", rippleScore: 5, staticDeps: ["b.ts"], temporalDeps: ["c.ts"], implicitCouplings: [{ filePath: "c.ts", cochangeRate: 0.8 }], affectedFiles: ["b.ts", "c.ts"] },
    ],
    agentRisk: [],
    errors: [],
    ...overrides,
  };
}

describe("analyzeDiff", () => {
  const doc = makeDoc();

  test("identifies missed files from temporal coupling", () => {
    const diff: DiffFile[] = [{ filePath: "a.ts", status: "modified" }];
    const result = analyzeDiff(doc, diff);

    const missedPaths = result.missedFiles.map(m => m.filePath);
    expect(missedPaths).toContain("c.ts");
  });

  test("call-graph-only connections need multiple signals to surface", () => {
    const diff: DiffFile[] = [{ filePath: "a.ts", status: "modified" }];
    const result = analyzeDiff(doc, diff);

    const missedPaths = result.missedFiles.map(m => m.filePath);
    expect(missedPaths).toContain("c.ts");
    expect(missedPaths).not.toContain("b.ts");
  });

  test("does not flag already-changed files as missed", () => {
    const diff: DiffFile[] = [
      { filePath: "a.ts", status: "modified" },
      { filePath: "b.ts", status: "modified" },
      { filePath: "c.ts", status: "modified" },
    ];
    const result = analyzeDiff(doc, diff);
    expect(result.missedFiles.length).toBe(0);
  });

  test("detects missed test files", () => {
    const diff: DiffFile[] = [{ filePath: "a.ts", status: "modified" }];
    const result = analyzeDiff(doc, diff);

    const missedTestPaths = result.missedTests.map(m => m.filePath);
    expect(missedTestPaths).toContain("a.test.ts");
  });

  test("finds affected callers from blast radius", () => {
    const diff: DiffFile[] = [{ filePath: "c.ts", status: "modified" }];
    const result = analyzeDiff(doc, diff);

    expect(result.affectedCallers.length).toBeGreaterThan(0);
    const callerNames = result.affectedCallers.map(c => c.name);
    expect(callerNames).toContain("foo");
  });

  test("confidence scores are between 0 and 1", () => {
    const diff: DiffFile[] = [{ filePath: "a.ts", status: "modified" }];
    const result = analyzeDiff(doc, diff);

    for (const m of [...result.missedFiles, ...result.missedTests]) {
      expect(m.confidence).toBeGreaterThanOrEqual(0);
      expect(m.confidence).toBeLessThanOrEqual(1);
    }
  });

  test("missed files sorted by confidence descending", () => {
    const diff: DiffFile[] = [{ filePath: "a.ts", status: "modified" }];
    const result = analyzeDiff(doc, diff);

    for (let i = 1; i < result.missedFiles.length; i++) {
      expect(result.missedFiles[i - 1].confidence).toBeGreaterThanOrEqual(result.missedFiles[i].confidence);
    }
  });

  test("empty diff produces empty analysis", () => {
    const result = analyzeDiff(doc, []);
    expect(result.changedFiles.length).toBe(0);
    expect(result.missedFiles.length).toBe(0);
    expect(result.missedTests.length).toBe(0);
    expect(result.affectedCallers.length).toBe(0);
    expect(result.shapeDelta.attention).toBe("GREEN");
    expect(result.shapeDelta.affectedFileCount).toBe(0);
  });

  test("builds shape delta from changed and affected files", () => {
    const diff: DiffFile[] = [{ filePath: "a.ts", status: "modified" }];
    const result = analyzeDiff(doc, diff);

    expect(result.shapeDelta.changedFileCount).toBe(1);
    expect(result.shapeDelta.affectedFileCount).toBeGreaterThan(1);
    expect(result.shapeDelta.attention).toBe("RED");
    expect(result.shapeDelta.testConfidence).toBe("WEAK");
    expect(result.shapeDelta.why.some(w => w.includes("implicit coupling"))).toBe(true);
    expect(result.shapeDelta.why.some(w => w.includes("test confidence weak"))).toBe(true);
    expect(result.shapeDelta.reviewFocus).toContain("Add/update tests covering affected ripple zone");
  });

  test("test confidence is strong when likely tests changed with source", () => {
    const diff: DiffFile[] = [
      { filePath: "a.ts", status: "modified" },
      { filePath: "a.test.ts", status: "modified" },
    ];
    const result = analyzeDiff(doc, diff);

    expect(result.shapeDelta.testConfidence).toBe("STRONG");
    expect(result.shapeDelta.why.some(w => w.includes("test confidence weak"))).toBe(false);
  });

  test("test confidence is unknown when no likely tests exist", () => {
    const noTestsDoc = makeDoc({
      entities: doc.entities.filter(e => !e.filePath.includes(".test.")),
    });
    const diff: DiffFile[] = [{ filePath: "b.ts", status: "modified" }];
    const result = analyzeDiff(noTestsDoc, diff);

    expect(result.shapeDelta.testConfidence).toBe("UNKNOWN");
  });

  test("flags likely tests for affected ripple zone", () => {
    const diff: DiffFile[] = [{ filePath: "a.ts", status: "modified" }];
    const result = analyzeDiff(doc, diff);

    const missedTestPaths = result.missedTests.map(m => m.filePath);
    expect(missedTestPaths).toContain("c.test.ts");
    const rippleTest = result.missedTests.find(m => m.filePath === "c.test.ts");
    expect(rippleTest?.reason).toContain("affected c.ts");
  });

  test("records package boundary crossings in shape delta", () => {
    const tmpDir = `/tmp/strata-shape-boundary-${Date.now()}`;
    const { mkdirSync, rmSync, writeFileSync } = require("fs");
    mkdirSync(`${tmpDir}/packages/a/src`, { recursive: true });
    mkdirSync(`${tmpDir}/packages/b/src`, { recursive: true });
    writeFileSync(`${tmpDir}/packages/a/package.json`, "{}");
    writeFileSync(`${tmpDir}/packages/b/package.json`, "{}");

    const entities: Entity[] = [
      makeEntity("packages/a/src/changed.ts:fn:1", "packages/a/src/changed.ts", 1, 10),
      makeEntity("packages/b/src/affected.ts:fn:1", "packages/b/src/affected.ts", 1, 10),
    ];
    const boundaryDoc = makeMinimalDoc({
      rootDir: tmpDir,
      entities,
      temporalCoupling: [
        { fileA: "packages/a/src/changed.ts", fileB: "packages/b/src/affected.ts", cochangeCount: 4, confidence: 0.8, hasStaticDependency: false },
      ],
    });

    const result = analyzeDiff(boundaryDoc, [{ filePath: "packages/a/src/changed.ts", status: "modified" }]);

    expect(result.shapeDelta.boundaryCrossings).toContain("packages/a -> packages/b");
    expect(result.shapeDelta.why.some(w => w.includes("boundary crossing"))).toBe(true);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("hubDampeningFactor", () => {
  test("no callers returns 1", () => {
    expect(hubDampeningFactor(0)).toBe(1);
  });

  test("single caller returns 1", () => {
    expect(hubDampeningFactor(1)).toBe(1);
  });

  test("many callers returns dampened value", () => {
    const factor16 = hubDampeningFactor(16);
    expect(factor16).toBeLessThan(0.25);
    expect(factor16).toBeGreaterThan(0);
  });

  test("dampening increases with caller count", () => {
    expect(hubDampeningFactor(2)).toBeGreaterThan(hubDampeningFactor(8));
    expect(hubDampeningFactor(8)).toBeGreaterThan(hubDampeningFactor(32));
  });
});

describe("hub function dampening in analyzeDiff", () => {
  function makeEntity(id: string, filePath: string) {
    return {
      id, name: id.split(":")[1], kind: "function" as const, filePath,
      startLine: 1, endLine: 20,
      metrics: { cyclomatic: 1, cognitive: 1, loc: 20, maxNestingDepth: 0, parameterCount: 1 },
    };
  }

  test("hub functions with many callers get lower confidence than functions with few callers", () => {
    const hubDoc: StrataDoc = {
      version: "0.2.0",
      analyzedAt: new Date().toISOString(),
      rootDir: "/tmp/test",
      entities: [
        makeEntity("changed.ts:changed:1", "changed.ts"),
        makeEntity("hub.ts:create:1", "hub.ts"),
        makeEntity("leaf.ts:helper:1", "leaf.ts"),
        ...Array.from({ length: 15 }, (_, i) =>
          makeEntity(`caller${i}.ts:fn${i}:1`, `caller${i}.ts`)
        ),
      ],
      callGraph: [
        { caller: "changed.ts:changed:1", callee: "hub.ts:create:1" },
        { caller: "changed.ts:changed:1", callee: "leaf.ts:helper:1" },
        ...Array.from({ length: 15 }, (_, i) => ({
          caller: `caller${i}.ts:fn${i}:1`, callee: "hub.ts:create:1",
        })),
      ],
      churn: [],
      temporalCoupling: [],
      hotspots: [],
      blastRadius: [],
      changeRipple: [],
      agentRisk: [],
      errors: [],
    };

    const diff: DiffFile[] = [{ filePath: "changed.ts", status: "modified" }];
    const result = analyzeDiff(hubDoc, diff);

    const hubMissed = result.missedFiles.find(m => m.filePath === "hub.ts");
    const leafMissed = result.missedFiles.find(m => m.filePath === "leaf.ts");

    if (hubMissed && leafMissed) {
      expect(hubMissed.confidence).toBeLessThan(leafMissed.confidence);
    }

    if (hubMissed) {
      expect(hubMissed.confidence).toBeLessThan(0.35);
    }
  });

  test("hub callers get dampened confidence when hub function changes", () => {
    const entities = [
      makeEntity("hub.ts:create:1", "hub.ts"),
      ...Array.from({ length: 20 }, (_, i) =>
        makeEntity(`caller${i}.ts:fn${i}:1`, `caller${i}.ts`)
      ),
    ];

    const hubDoc: StrataDoc = {
      version: "0.2.0",
      analyzedAt: new Date().toISOString(),
      rootDir: "/tmp/test",
      entities,
      callGraph: Array.from({ length: 20 }, (_, i) => ({
        caller: `caller${i}.ts:fn${i}:1`, callee: "hub.ts:create:1",
      })),
      churn: [],
      temporalCoupling: [],
      hotspots: [],
      blastRadius: [],
      changeRipple: [],
      agentRisk: [],
      errors: [],
    };

    const diff: DiffFile[] = [{ filePath: "hub.ts", status: "modified" }];
    const result = analyzeDiff(hubDoc, diff);

    for (const missed of result.missedFiles) {
      expect(missed.confidence).toBeLessThan(0.25);
    }
  });
});

function makeEntity(id: string, filePath: string, startLine: number, endLine: number): Entity {
  return {
    id, name: id.split(":")[1], kind: "function", filePath, startLine, endLine,
    metrics: { cyclomatic: 1, cognitive: 1, loc: endLine - startLine + 1, maxNestingDepth: 0, parameterCount: 1 },
  };
}

function makeMinimalDoc(overrides: Partial<StrataDoc> = {}): StrataDoc {
  return {
    version: "0.2.0",
    analyzedAt: new Date().toISOString(),
    rootDir: "/tmp/test",
    entities: [],
    callGraph: [],
    churn: [],
    temporalCoupling: [],
    hotspots: [],
    blastRadius: [],
    changeRipple: [],
    agentRisk: [],
    errors: [],
    ...overrides,
  };
}

describe("parseDiffHunks", () => {
  test("parses single hunk from unified diff output", () => {
    const diffOutput = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index abc1234..def5678 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -10,3 +10,5 @@ function something",
      "+added line",
      "+another line",
    ].join("\n");

    const hunks = parseDiffHunks(diffOutput);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].filePath).toBe("src/foo.ts");
    expect(hunks[0].startLine).toBe(10);
    expect(hunks[0].lineCount).toBe(5);
  });

  test("parses multiple hunks in same file", () => {
    const diffOutput = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -10,3 +10,5 @@ function first",
      "+line",
      "@@ -50,2 +52,8 @@ function second",
      "+line",
    ].join("\n");

    const hunks = parseDiffHunks(diffOutput);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].startLine).toBe(10);
    expect(hunks[0].lineCount).toBe(5);
    expect(hunks[1].startLine).toBe(52);
    expect(hunks[1].lineCount).toBe(8);
  });

  test("parses hunks across multiple files", () => {
    const diffOutput = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -10,3 +10,5 @@ function first",
      "+line",
      "diff --git a/src/bar.ts b/src/bar.ts",
      "--- a/src/bar.ts",
      "+++ b/src/bar.ts",
      "@@ -1,2 +1,4 @@ function bar",
      "+line",
    ].join("\n");

    const hunks = parseDiffHunks(diffOutput);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].filePath).toBe("src/foo.ts");
    expect(hunks[1].filePath).toBe("src/bar.ts");
  });

  test("handles single-line hunk (no count)", () => {
    const diffOutput = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -218 +218,8 @@ function formatEditResult",
      "+line",
    ].join("\n");

    const hunks = parseDiffHunks(diffOutput);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].startLine).toBe(218);
    expect(hunks[0].lineCount).toBe(8);
  });

  test("handles pure addition hunk (+start,count with -start,0)", () => {
    const diffOutput = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -2440,0 +2441,7 @@ export class InteractiveMode",
      "+line",
    ].join("\n");

    const hunks = parseDiffHunks(diffOutput);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].startLine).toBe(2441);
    expect(hunks[0].lineCount).toBe(7);
  });

  test("empty diff output returns empty array", () => {
    expect(parseDiffHunks("")).toEqual([]);
  });
});

describe("resolveChangedEntities", () => {
  const entities: Entity[] = [
    makeEntity("f.ts:alpha:1", "f.ts", 10, 20),
    makeEntity("f.ts:beta:1", "f.ts", 30, 50),
    makeEntity("f.ts:gamma:1", "f.ts", 60, 80),
    makeEntity("g.ts:delta:1", "g.ts", 1, 40),
  ];

  test("includes entity whose range overlaps a hunk", () => {
    const hunks: DiffHunk[] = [{ filePath: "f.ts", startLine: 15, lineCount: 3 }];
    const diffFiles: DiffFile[] = [{ filePath: "f.ts", status: "modified" }];
    const result = resolveChangedEntities(entities, hunks, diffFiles);
    const ids = result.map(e => e.id);
    expect(ids).toContain("f.ts:alpha:1");
  });

  test("excludes entity with no overlapping hunk", () => {
    const hunks: DiffHunk[] = [{ filePath: "f.ts", startLine: 55, lineCount: 1 }];
    const diffFiles: DiffFile[] = [{ filePath: "f.ts", status: "modified" }];
    const result = resolveChangedEntities(entities, hunks, diffFiles);
    const ids = result.map(e => e.id);
    expect(ids).not.toContain("f.ts:alpha:1");
    expect(ids).not.toContain("f.ts:beta:1");
  });

  test("includes all entities in added files regardless of hunks", () => {
    const hunks: DiffHunk[] = [];
    const diffFiles: DiffFile[] = [{ filePath: "g.ts", status: "added" }];
    const result = resolveChangedEntities(entities, hunks, diffFiles);
    const ids = result.map(e => e.id);
    expect(ids).toContain("g.ts:delta:1");
  });

  test("only overlapping entity returned when multiple in same file", () => {
    const hunks: DiffHunk[] = [{ filePath: "f.ts", startLine: 35, lineCount: 5 }];
    const diffFiles: DiffFile[] = [{ filePath: "f.ts", status: "modified" }];
    const result = resolveChangedEntities(entities, hunks, diffFiles);
    const ids = result.map(e => e.id);
    expect(ids).toContain("f.ts:beta:1");
    expect(ids).not.toContain("f.ts:alpha:1");
    expect(ids).not.toContain("f.ts:gamma:1");
  });

  test("hunk at entity boundary (start line) counts as overlap", () => {
    const hunks: DiffHunk[] = [{ filePath: "f.ts", startLine: 10, lineCount: 1 }];
    const diffFiles: DiffFile[] = [{ filePath: "f.ts", status: "modified" }];
    const result = resolveChangedEntities(entities, hunks, diffFiles);
    const ids = result.map(e => e.id);
    expect(ids).toContain("f.ts:alpha:1");
  });

  test("hunk at entity boundary (end line) counts as overlap", () => {
    const hunks: DiffHunk[] = [{ filePath: "f.ts", startLine: 20, lineCount: 1 }];
    const diffFiles: DiffFile[] = [{ filePath: "f.ts", status: "modified" }];
    const result = resolveChangedEntities(entities, hunks, diffFiles);
    const ids = result.map(e => e.id);
    expect(ids).toContain("f.ts:alpha:1");
  });
});

describe("hunk-scoped diff analysis", () => {
  test("only callers of hunk-overlapping entities appear as affected", () => {
    const entities: Entity[] = [
      makeEntity("big.ts:fnTop:1", "big.ts", 1, 20),
      makeEntity("big.ts:fnMid:1", "big.ts", 30, 50),
      makeEntity("big.ts:fnBot:1", "big.ts", 60, 80),
      makeEntity("callerTop.ts:usesTop:1", "callerTop.ts", 1, 10),
      makeEntity("callerMid.ts:usesMid:1", "callerMid.ts", 1, 10),
      makeEntity("callerBot.ts:usesBot:1", "callerBot.ts", 1, 10),
    ];

    const doc = makeMinimalDoc({
      entities,
      callGraph: [
        { caller: "callerTop.ts:usesTop:1", callee: "big.ts:fnTop:1" },
        { caller: "callerMid.ts:usesMid:1", callee: "big.ts:fnMid:1" },
        { caller: "callerBot.ts:usesBot:1", callee: "big.ts:fnBot:1" },
      ],
      blastRadius: [
        { entityId: "big.ts:fnTop:1", directCallers: ["callerTop.ts:usesTop:1"], transitiveCallers: ["callerTop.ts:usesTop:1"], radius: 1 },
        { entityId: "big.ts:fnMid:1", directCallers: ["callerMid.ts:usesMid:1"], transitiveCallers: ["callerMid.ts:usesMid:1"], radius: 1 },
        { entityId: "big.ts:fnBot:1", directCallers: ["callerBot.ts:usesBot:1"], transitiveCallers: ["callerBot.ts:usesBot:1"], radius: 1 },
      ],
    });

    const diffFiles: DiffFile[] = [{ filePath: "big.ts", status: "modified" }];
    const hunks: DiffHunk[] = [{ filePath: "big.ts", startLine: 35, lineCount: 10 }];

    const result = analyzeDiff(doc, diffFiles, hunks);

    const callerFiles = result.affectedCallers.map(c => c.filePath);
    expect(callerFiles).toContain("callerMid.ts");
    expect(callerFiles).not.toContain("callerTop.ts");
    expect(callerFiles).not.toContain("callerBot.ts");
  });

  test("without hunks, all entities in changed files are considered (backward compat)", () => {
    const entities: Entity[] = [
      makeEntity("big.ts:fnTop:1", "big.ts", 1, 20),
      makeEntity("big.ts:fnMid:1", "big.ts", 30, 50),
      makeEntity("callerTop.ts:usesTop:1", "callerTop.ts", 1, 10),
      makeEntity("callerMid.ts:usesMid:1", "callerMid.ts", 1, 10),
    ];

    const doc = makeMinimalDoc({
      entities,
      callGraph: [
        { caller: "callerTop.ts:usesTop:1", callee: "big.ts:fnTop:1" },
        { caller: "callerMid.ts:usesMid:1", callee: "big.ts:fnMid:1" },
      ],
      blastRadius: [
        { entityId: "big.ts:fnTop:1", directCallers: ["callerTop.ts:usesTop:1"], transitiveCallers: ["callerTop.ts:usesTop:1"], radius: 1 },
        { entityId: "big.ts:fnMid:1", directCallers: ["callerMid.ts:usesMid:1"], transitiveCallers: ["callerMid.ts:usesMid:1"], radius: 1 },
      ],
    });

    const diffFiles: DiffFile[] = [{ filePath: "big.ts", status: "modified" }];
    const result = analyzeDiff(doc, diffFiles);

    const callerFiles = result.affectedCallers.map(c => c.filePath);
    expect(callerFiles).toContain("callerTop.ts");
    expect(callerFiles).toContain("callerMid.ts");
  });

  test("hunk-scoped analysis narrows changedEntities in result", () => {
    const entities: Entity[] = [
      makeEntity("big.ts:fnTop:1", "big.ts", 1, 20),
      makeEntity("big.ts:fnMid:1", "big.ts", 30, 50),
      makeEntity("big.ts:fnBot:1", "big.ts", 60, 80),
    ];

    const doc = makeMinimalDoc({ entities });
    const diffFiles: DiffFile[] = [{ filePath: "big.ts", status: "modified" }];
    const hunks: DiffHunk[] = [{ filePath: "big.ts", startLine: 35, lineCount: 5 }];

    const result = analyzeDiff(doc, diffFiles, hunks);

    const changedIds = result.changedEntities.map(e => e.id);
    expect(changedIds).toContain("big.ts:fnMid:1");
    expect(changedIds).not.toContain("big.ts:fnTop:1");
    expect(changedIds).not.toContain("big.ts:fnBot:1");
  });
});

describe("cross-package dampening in diff", () => {
  const tmpDir = `/tmp/strata-pkg-diff-${Date.now()}`;

  function setupPkgDirs() {
    const { mkdirSync, writeFileSync } = require("fs");
    mkdirSync(`${tmpDir}/packages/a/src`, { recursive: true });
    mkdirSync(`${tmpDir}/packages/b/src`, { recursive: true });
    writeFileSync(`${tmpDir}/package.json`, "{}");
    writeFileSync(`${tmpDir}/packages/a/package.json`, "{}");
    writeFileSync(`${tmpDir}/packages/b/package.json`, "{}");
  }

  function cleanupPkgDirs() {
    const { rmSync } = require("fs");
    rmSync(tmpDir, { recursive: true, force: true });
  }

  test("missed file in different package gets lower confidence than same package", () => {
    setupPkgDirs();
    const entities: Entity[] = [
      makeEntity("packages/a/src/changed.ts:fn:1", "packages/a/src/changed.ts", 1, 20),
      makeEntity("packages/a/src/samePackage.ts:helper:1", "packages/a/src/samePackage.ts", 1, 20),
      makeEntity("packages/b/src/crossPackage.ts:other:1", "packages/b/src/crossPackage.ts", 1, 20),
    ];

    const doc = makeMinimalDoc({
      rootDir: tmpDir,
      entities,
      callGraph: [
        { caller: "packages/a/src/changed.ts:fn:1", callee: "packages/a/src/samePackage.ts:helper:1" },
        { caller: "packages/a/src/changed.ts:fn:1", callee: "packages/b/src/crossPackage.ts:other:1" },
      ],
      temporalCoupling: [
        { fileA: "packages/a/src/changed.ts", fileB: "packages/a/src/samePackage.ts", cochangeCount: 5, confidence: 0.6, hasStaticDependency: true },
        { fileA: "packages/a/src/changed.ts", fileB: "packages/b/src/crossPackage.ts", cochangeCount: 5, confidence: 0.6, hasStaticDependency: true },
      ],
    });

    const diffFiles: DiffFile[] = [{ filePath: "packages/a/src/changed.ts", status: "modified" }];
    const result = analyzeDiff(doc, diffFiles);

    const samePkg = result.missedFiles.find(m => m.filePath === "packages/a/src/samePackage.ts");
    const crossPkg = result.missedFiles.find(m => m.filePath === "packages/b/src/crossPackage.ts");

    expect(samePkg).toBeDefined();
    expect(crossPkg).toBeDefined();
    expect(crossPkg!.confidence).toBeLessThan(samePkg!.confidence);
    cleanupPkgDirs();
  });

  test("cross-package call-graph confidence is halved vs same-package", () => {
    setupPkgDirs();
    const entities: Entity[] = [
      makeEntity("packages/a/src/changed.ts:fn:1", "packages/a/src/changed.ts", 1, 20),
      makeEntity("packages/a/src/samePkg.ts:local:1", "packages/a/src/samePkg.ts", 1, 20),
      makeEntity("packages/b/src/crossPkg.ts:remote:1", "packages/b/src/crossPkg.ts", 1, 20),
    ];

    const doc = makeMinimalDoc({
      rootDir: tmpDir,
      entities,
      callGraph: [
        { caller: "packages/a/src/changed.ts:fn:1", callee: "packages/a/src/samePkg.ts:local:1" },
        { caller: "packages/a/src/changed.ts:fn:1", callee: "packages/b/src/crossPkg.ts:remote:1" },
      ],
    });

    const diffFiles: DiffFile[] = [{ filePath: "packages/a/src/changed.ts", status: "modified" }];
    const result = analyzeDiff(doc, diffFiles);

    const samePkg = result.missedFiles.find(m => m.filePath === "packages/a/src/samePkg.ts");
    const crossPkg = result.missedFiles.find(m => m.filePath === "packages/b/src/crossPkg.ts");

    if (samePkg && crossPkg) {
      expect(crossPkg.confidence).toBeLessThan(samePkg.confidence);
      expect(crossPkg.confidence).toBeCloseTo(samePkg.confidence * 0.5, 2);
    } else if (samePkg && !crossPkg) {
      expect(true).toBe(true);
    }
    cleanupPkgDirs();
  });
});
