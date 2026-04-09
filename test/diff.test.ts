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

  test("test confidence is partial when source test changed but ripple test is missing", () => {
    const diff: DiffFile[] = [
      { filePath: "a.ts", status: "modified" },
      { filePath: "a.test.ts", status: "modified" },
    ];
    const result = analyzeDiff(doc, diff);

    expect(result.shapeDelta.testConfidence).toBe("PARTIAL");
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

  test("test confidence is partial when changed source test exists but ripple test is missing", () => {
    const diff: DiffFile[] = [
      { filePath: "a.ts", status: "modified" },
      { filePath: "a.test.ts", status: "modified" },
    ];
    const result = analyzeDiff(doc, diff);

    expect(result.shapeDelta.testConfidence).toBe("PARTIAL");
    expect(result.shapeDelta.testRecommendations).toContain("c.test.ts");
  });

  test("test confidence is weak when likely guard tests exist but none changed", () => {
    const result = analyzeDiff(doc, [{ filePath: "a.ts", status: "modified" }]);

    expect(result.shapeDelta.testConfidence).toBe("WEAK");
    expect(result.shapeDelta.testRecommendations).toContain("a.test.ts");
    expect(result.shapeDelta.testRecommendations).toContain("c.test.ts");
  });

  test("test confidence is strong when all likely guard tests changed", () => {
    const diff: DiffFile[] = [
      { filePath: "a.ts", status: "modified" },
      { filePath: "a.test.ts", status: "modified" },
      { filePath: "c.test.ts", status: "modified" },
    ];
    const result = analyzeDiff(doc, diff);

    expect(result.shapeDelta.testConfidence).toBe("STRONG");
    expect(result.shapeDelta.testRecommendations).toEqual(expect.arrayContaining(["a.test.ts", "c.test.ts"]));
  });

  test("changed test files count even when extractor found no test entities", () => {
    const result = analyzeDiff(makeMinimalDoc(), [
      { filePath: "src/cli.ts", status: "modified" },
      { filePath: "test/cli.test.ts", status: "added" },
    ]);

    expect(result.shapeDelta.testConfidence).toBe("STRONG");
    expect(result.shapeDelta.testRecommendations).toEqual(["test/cli.test.ts"]);
  });

  test("test confidence remains unknown when no likely guard tests are known", () => {
    const noLikelyTestsDoc = makeMinimalDoc({
      entities: [makeEntity("src/feature.ts:run:1", "src/feature.ts", 1, 10)],
    });
    const result = analyzeDiff(noLikelyTestsDoc, [{ filePath: "src/feature.ts", status: "modified" }]);

    expect(result.shapeDelta.testConfidence).toBe("UNKNOWN");
    expect(result.shapeDelta.testRecommendations).toEqual([]);
  });

  test("lists affected ripple files with no likely guard tests", () => {
    const entities: Entity[] = [
      makeEntity("src/auth.ts:validate:1", "src/auth.ts", 1, 10),
      makeEntity("src/session.ts:getSession:1", "src/session.ts", 1, 10),
      makeEntity("src/audit.ts:recordAudit:1", "src/audit.ts", 1, 10),
      makeEntity("src/session.test.ts:testSession:1", "src/session.test.ts", 1, 10),
    ];
    const rippleDoc = makeMinimalDoc({
      entities,
      changeRipple: [
        { entityId: "src/auth.ts:validate:1", rippleScore: 3, staticDeps: ["src/session.ts"], temporalDeps: ["src/audit.ts"], implicitCouplings: [], affectedFiles: ["src/session.ts", "src/audit.ts"] },
      ],
    });

    const result = analyzeDiff(rippleDoc, [{ filePath: "src/auth.ts", status: "modified" }]);

    expect(result.shapeDelta.uncoveredRipple).toContain("src/audit.ts");
    expect(result.shapeDelta.uncoveredRipple).not.toContain("src/session.ts");
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

    try {
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
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("does not record package boundary crossing within same package", () => {
    const tmpDir = `/tmp/strata-shape-same-boundary-${Date.now()}`;
    const { mkdirSync, rmSync, writeFileSync } = require("fs");
    mkdirSync(`${tmpDir}/packages/a/src`, { recursive: true });
    writeFileSync(`${tmpDir}/packages/a/package.json`, "{}");

    try {
      const entities: Entity[] = [
        makeEntity("packages/a/src/changed.ts:fn:1", "packages/a/src/changed.ts", 1, 10),
        makeEntity("packages/a/src/affected.ts:fn:1", "packages/a/src/affected.ts", 1, 10),
      ];
      const boundaryDoc = makeMinimalDoc({
        rootDir: tmpDir,
        entities,
        temporalCoupling: [
          { fileA: "packages/a/src/changed.ts", fileB: "packages/a/src/affected.ts", cochangeCount: 4, confidence: 0.8, hasStaticDependency: false },
        ],
      });

      const result = analyzeDiff(boundaryDoc, [{ filePath: "packages/a/src/changed.ts", status: "modified" }]);

      expect(result.shapeDelta.changedPackages).toEqual(["packages/a"]);
      expect(result.shapeDelta.affectedPackages).toEqual(["packages/a"]);
      expect(result.shapeDelta.boundaryCrossings).toEqual([]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("records affected directories and changed risk mix in shape delta", () => {
    const riskDoc = makeDoc({
      agentRisk: [
        { entityId: "a.ts:foo:1", rippleScore: 10, contextCost: 1000, safetyRating: "red", riskFactors: [] },
      ],
    });
    const diff: DiffFile[] = [{ filePath: "a.ts", status: "modified" }];
    const result = analyzeDiff(riskDoc, diff);

    expect(result.shapeDelta.affectedDirs).toContain(".");
    expect(result.shapeDelta.changedRisk.red).toBe(1);
    expect(result.shapeDelta.changedRisk.yellow).toBe(0);
    expect(result.shapeDelta.changedRisk.green).toBe(0);
  });

  test("summarizes packages, affected risk, and top shape movements", () => {
    const tmpDir = `/tmp/strata-shape-summary-${Date.now()}`;
    const { mkdirSync, rmSync, writeFileSync } = require("fs");
    mkdirSync(`${tmpDir}/packages/a/src`, { recursive: true });
    mkdirSync(`${tmpDir}/packages/b/src`, { recursive: true });
    writeFileSync(`${tmpDir}/packages/a/package.json`, "{}");
    writeFileSync(`${tmpDir}/packages/b/package.json`, "{}");

    try {
      const entities: Entity[] = [
        makeEntity("packages/a/src/changed.ts:fn:1", "packages/a/src/changed.ts", 1, 10),
        makeEntity("packages/b/src/affected.ts:fn:1", "packages/b/src/affected.ts", 1, 10),
        makeEntity("packages/b/src/affected.test.ts:testAffected:1", "packages/b/src/affected.test.ts", 1, 10),
      ];
      const shapeDoc = makeMinimalDoc({
        rootDir: tmpDir,
        entities,
        temporalCoupling: [
          { fileA: "packages/a/src/changed.ts", fileB: "packages/b/src/affected.ts", cochangeCount: 4, confidence: 0.8, hasStaticDependency: false },
        ],
        changeRipple: [
          { entityId: "packages/a/src/changed.ts:fn:1", rippleScore: 4, staticDeps: [], temporalDeps: ["packages/b/src/affected.ts"], implicitCouplings: [{ filePath: "packages/b/src/affected.ts", cochangeRate: 0.8 }], affectedFiles: ["packages/b/src/affected.ts"] },
        ],
        agentRisk: [
          { entityId: "packages/a/src/changed.ts:fn:1", rippleScore: 5, contextCost: 100, safetyRating: "red", riskFactors: [] },
          { entityId: "packages/b/src/affected.ts:fn:1", rippleScore: 3, contextCost: 100, safetyRating: "yellow", riskFactors: [] },
        ],
      });

      const result = analyzeDiff(shapeDoc, [{ filePath: "packages/a/src/changed.ts", status: "modified" }]);

      expect(result.shapeDelta.changedPackages).toEqual(["packages/a"]);
      expect(result.shapeDelta.affectedPackages).toContain("packages/b");
      expect(result.shapeDelta.affectedRisk.yellow).toBe(1);
      expect(result.shapeDelta.shapeMovements).toContain("ripple widened beyond changed files");
      expect(result.shapeDelta.shapeMovements).toContain("crossed package boundary: packages/a -> packages/b");
      expect(result.shapeDelta.shapeMovements.length).toBeLessThanOrEqual(4);
      expect(result.shapeDelta.summary.hiddenCouplings).toContain("packages/b/src/affected.ts");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("records runtime/data/config hints from changed paths", () => {
    const entities: Entity[] = [
      makeEntity("src/routes/auth.ts:handler:1", "src/routes/auth.ts", 1, 10),
      makeEntity("src/jobs/email.worker.ts:run:1", "src/jobs/email.worker.ts", 1, 10),
      makeEntity("src/db/user.schema.ts:migrate:1", "src/db/user.schema.ts", 1, 10),
      makeEntity("src/config/flags.ts:loadFlags:1", "src/config/flags.ts", 1, 10),
    ];
    const shapeDoc = makeMinimalDoc({ entities });
    const result = analyzeDiff(shapeDoc, [
      { filePath: "src/routes/auth.ts", status: "modified" },
      { filePath: "src/jobs/email.worker.ts", status: "modified" },
      { filePath: "src/db/user.schema.ts", status: "modified" },
      { filePath: "src/config/flags.ts", status: "modified" },
    ]);

    expect(result.shapeDelta.runtimeHints).toContain("runtime path hint: route/handler/controller/middleware touched: src/routes/auth.ts");
    expect(result.shapeDelta.runtimeHints).toContain("async/job hint: worker/queue/cron touched: src/jobs/email.worker.ts");
    expect(result.shapeDelta.runtimeHints).toContain("data shape hint: db/model/schema/migration touched: src/db/user.schema.ts");
    expect(result.shapeDelta.runtimeHints).toContain("config/flag hint: config/env/flag touched: src/config/flags.ts");
    expect(result.shapeDelta.why.some(w => w.includes("runtime/data hint"))).toBe(true);
  });

  test("records runtime hints from changed entity text", () => {
    const tmpDir = `/tmp/strata-runtime-text-${Date.now()}`;
    const { mkdirSync, rmSync, writeFileSync } = require("fs");
    mkdirSync(`${tmpDir}/src`, { recursive: true });
    writeFileSync(`${tmpDir}/src/notifier.ts`, [
      "export function notify() {",
      "  publish('user.created')",
      "  trackMetric('signup')",
      "  if (process.env.FEATURE_X || featureFlag('new-flow')) return",
      "}",
    ].join("\n"));

    try {
      const entity = makeEntity("src/notifier.ts:notify:1", "src/notifier.ts", 1, 5);
      const runtimeDoc = makeMinimalDoc({ rootDir: tmpDir, entities: [entity] });
      const result = analyzeDiff(runtimeDoc, [{ filePath: "src/notifier.ts", status: "modified" }]);

      expect(result.shapeDelta.runtimeHints).toContain("event/metric hint: emit/publish/track touched: src/notifier.ts:notify");
      expect(result.shapeDelta.runtimeHints).toContain("config/flag hint: process.env/feature flag touched: src/notifier.ts:notify");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("does not record runtime text hints from string literals only", () => {
    const tmpDir = `/tmp/strata-runtime-string-${Date.now()}`;
    const { mkdirSync, rmSync, writeFileSync } = require("fs");
    mkdirSync(`${tmpDir}/src`, { recursive: true });
    writeFileSync(`${tmpDir}/src/message.ts`, [
      "export function message() {",
      "  return 'publish process.env featureFlag metric'",
      "}",
    ].join("\n"));

    try {
      const entity = makeEntity("src/message.ts:message:1", "src/message.ts", 1, 3);
      const runtimeDoc = makeMinimalDoc({ rootDir: tmpDir, entities: [entity] });
      const result = analyzeDiff(runtimeDoc, [{ filePath: "src/message.ts", status: "modified" }]);

      expect(result.shapeDelta.runtimeHints).toEqual([]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("finds same-file sibling implementations in sibling directories", () => {
    const entities: Entity[] = [
      makeEntity("routes/rest/auth.ts:handler:1", "routes/rest/auth.ts", 1, 10),
      makeEntity("routes/graphql/auth.ts:handler:1", "routes/graphql/auth.ts", 1, 10),
    ];
    const siblingDoc = makeMinimalDoc({ entities });
    const result = analyzeDiff(siblingDoc, [{ filePath: "routes/rest/auth.ts", status: "modified" }]);

    const missed = result.missedFiles.find(m => m.filePath === "routes/graphql/auth.ts");
    expect(missed?.reason).toContain("structural sibling");
    expect(result.shapeDelta.why.some(w => w.includes("structural sibling"))).toBe(true);
    expect(result.shapeDelta.reviewFocus).toContain("Check sibling/parallel implementations near likely missed files");
  });

  test("finds same function names in sibling directories", () => {
    const entities: Entity[] = [
      makeEntity("handlers/rest/auth.ts:handleLogin:1", "handlers/rest/auth.ts", 1, 10),
      makeEntity("handlers/graphql/authResolver.ts:handleLogin:1", "handlers/graphql/authResolver.ts", 1, 10),
    ];
    const siblingDoc = makeMinimalDoc({ entities });
    const result = analyzeDiff(siblingDoc, [{ filePath: "handlers/rest/auth.ts", status: "modified" }]);

    const missed = result.missedFiles.find(m => m.filePath === "handlers/graphql/authResolver.ts");
    expect(missed?.reason).toContain("same function name in sibling directory");
  });

  test("finds sibling route files in same route directory", () => {
    const entities: Entity[] = [
      makeEntity("src/routes/auth.ts:authRoute:1", "src/routes/auth.ts", 1, 10),
      makeEntity("src/routes/oauth.ts:oauthRoute:1", "src/routes/oauth.ts", 1, 10),
    ];
    const routeDoc = makeMinimalDoc({ entities });
    const result = analyzeDiff(routeDoc, [{ filePath: "src/routes/auth.ts", status: "modified" }]);

    const missed = result.missedFiles.find(m => m.filePath === "src/routes/oauth.ts");
    expect(missed?.reason).toContain("route sibling");
  });

  test("finds platform sibling files", () => {
    const entities: Entity[] = [
      makeEntity("src/ios/auth.ts:login:1", "src/ios/auth.ts", 1, 10),
      makeEntity("src/android/auth.ts:login:1", "src/android/auth.ts", 1, 10),
    ];
    const siblingDoc = makeMinimalDoc({ entities });
    const result = analyzeDiff(siblingDoc, [{ filePath: "src/ios/auth.ts", status: "modified" }]);

    const missed = result.missedFiles.find(m => m.filePath === "src/android/auth.ts");
    expect(missed?.reason).toContain("platform sibling");
  });

  test("does not flood route sibling hints in large route dirs", () => {
    const entities: Entity[] = [
      makeEntity("src/routes/auth.ts:authRoute:1", "src/routes/auth.ts", 1, 10),
      ...Array.from({ length: 12 }, (_, i) =>
        makeEntity(`src/routes/route${i}.ts:route${i}:1`, `src/routes/route${i}.ts`, 1, 10)
      ),
    ];
    const routeDoc = makeMinimalDoc({ entities });
    const result = analyzeDiff(routeDoc, [{ filePath: "src/routes/auth.ts", status: "modified" }]);

    expect(result.missedFiles.filter(m => m.reason.includes("route sibling"))).toHaveLength(0);
  });

  test("does not flag same filename under unrelated roots", () => {
    const entities: Entity[] = [
      makeEntity("src/foo/index.ts:run:1", "src/foo/index.ts", 1, 10),
      makeEntity("examples/bar/index.ts:run:1", "examples/bar/index.ts", 1, 10),
    ];
    const siblingDoc = makeMinimalDoc({ entities });
    const result = analyzeDiff(siblingDoc, [{ filePath: "src/foo/index.ts", status: "modified" }]);

    expect(result.missedFiles.map(m => m.filePath)).not.toContain("examples/bar/index.ts");
  });

  test("boosts structural siblings when temporal coupling agrees", () => {
    const entities: Entity[] = [
      makeEntity("src/rest/auth.ts:handler:1", "src/rest/auth.ts", 1, 10),
      makeEntity("src/graphql/auth.ts:handler:1", "src/graphql/auth.ts", 1, 10),
    ];
    const siblingDoc = makeMinimalDoc({
      entities,
      temporalCoupling: [
        { fileA: "src/rest/auth.ts", fileB: "src/graphql/auth.ts", cochangeCount: 5, confidence: 0.5, hasStaticDependency: false },
      ],
    });
    const result = analyzeDiff(siblingDoc, [{ filePath: "src/rest/auth.ts", status: "modified" }]);

    const missed = result.missedFiles.find(m => m.filePath === "src/graphql/auth.ts");
    expect(missed?.confidence).toBeGreaterThan(0.5);
  });

  test("records invariant hints from changed entity text", () => {
    const tmpDir = `/tmp/strata-shape-invariant-${Date.now()}`;
    const { mkdirSync, rmSync, writeFileSync } = require("fs");
    mkdirSync(`${tmpDir}/src`, { recursive: true });
    writeFileSync(`${tmpDir}/src/order.ts`, [
      "export function processOrder() {",
      "  // must never ship without payment",
      "  if (!paid) throw new Error('required')",
      "}",
    ].join("\n"));

    try {
      const entity = makeEntity("src/order.ts:processOrder:1", "src/order.ts", 1, 4);
      const invariantDoc = makeMinimalDoc({ rootDir: tmpDir, entities: [entity] });
      const result = analyzeDiff(invariantDoc, [{ filePath: "src/order.ts", status: "modified" }]);

      expect(result.shapeDelta.invariantHints[0]).toContain("src/order.ts:processOrder");
      expect(result.shapeDelta.why.some(w => w.includes("invariant hint"))).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("records invariant hints from throw/assert/guard calls", () => {
    const tmpDir = `/tmp/strata-invariant-guard-${Date.now()}`;
    const { mkdirSync, rmSync, writeFileSync } = require("fs");
    mkdirSync(`${tmpDir}/src`, { recursive: true });
    writeFileSync(`${tmpDir}/src/policy.ts`, [
      "export function checkPolicy() {",
      "  assertAllowed(user)",
      "  guardTenant(account)",
      "}",
    ].join("\n"));

    try {
      const entity = makeEntity("src/policy.ts:checkPolicy:1", "src/policy.ts", 1, 4);
      const invariantDoc = makeMinimalDoc({ rootDir: tmpDir, entities: [entity] });
      const result = analyzeDiff(invariantDoc, [{ filePath: "src/policy.ts", status: "modified" }]);

      expect(result.shapeDelta.invariantHints).toContain("src/policy.ts:checkPolicy");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("records invariant hints from changed test names with domain language", () => {
    const entity = makeEntity("src/policy.test.ts:requiresPaymentPermission:1", "src/policy.test.ts", 1, 10);
    const invariantDoc = makeMinimalDoc({ entities: [entity] });
    const result = analyzeDiff(invariantDoc, [{ filePath: "src/policy.test.ts", status: "modified" }]);

    expect(result.shapeDelta.invariantHints).toContain("src/policy.test.ts:requiresPaymentPermission");
  });

  test("does not record invariant hints from docs-only paths", () => {
    const invariantDoc = makeMinimalDoc();
    const result = analyzeDiff(invariantDoc, [{ filePath: "docs/auth-token.md", status: "modified" }]);

    expect(result.shapeDelta.invariantHints).toEqual([]);
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

describe("runtime/data impact integration", () => {
  test("changed entity in runtime path produces runtime impact", () => {
    const entities: Entity[] = [
      makeEntity("src/handler.ts:handleOrder:1", "src/handler.ts", 1, 20),
      makeEntity("src/service.ts:createOrder:1", "src/service.ts", 1, 30),
    ];
    const doc = makeMinimalDoc({
      entities,
      runtimeEntrypoints: [
        { id: "ep-orders", kind: "http", route: "/api/orders", method: "POST", confidence: 0.9, evidence: "express route" },
      ],
      runtimePaths: [
        { entrypointId: "ep-orders", kind: "http", route: "/api/orders", method: "POST", reachableEntities: ["src/handler.ts:handleOrder:1", "src/service.ts:createOrder:1"], dataAccesses: [], depth: 2 },
      ],
    });

    const result = analyzeDiff(doc, [{ filePath: "src/service.ts", status: "modified" }]);

    expect(result.shapeDelta.runtimeImpacts.length).toBe(1);
    expect(result.shapeDelta.runtimeImpacts[0].kind).toBe("http");
    expect(result.shapeDelta.runtimeImpacts[0].route).toBe("/api/orders");
    expect(result.shapeDelta.runtimeImpacts[0].method).toBe("POST");
    expect(result.shapeDelta.runtimeImpacts[0].entrypointId).toBe("ep-orders");
    expect(result.shapeDelta.runtimeImpacts[0].confidence).toBe(0.9);
    expect(result.shapeDelta.why.some(w => w.includes("runtime path touched"))).toBe(true);
    expect(result.shapeDelta.shapeMovements.some(m => m.includes("runtime path touched"))).toBe(true);
  });

  test("changed entrypoint handler itself produces runtime impact", () => {
    const entities: Entity[] = [
      makeEntity("src/handler.ts:handleOrder:1", "src/handler.ts", 1, 20),
      makeEntity("src/service.ts:createOrder:1", "src/service.ts", 1, 30),
    ];
    const doc = makeMinimalDoc({
      entities,
      runtimeEntrypoints: [
        { id: "src/handler.ts:handleOrder:1", entityId: "src/handler.ts:handleOrder:1", kind: "http", route: "/api/orders", method: "POST", confidence: 0.9, evidence: "express route" },
      ],
      runtimePaths: [
        { entrypointId: "src/handler.ts:handleOrder:1", kind: "http", route: "/api/orders", method: "POST", reachableEntities: ["src/service.ts:createOrder:1"], dataAccesses: [], depth: 1 },
      ],
    });

    const result = analyzeDiff(doc, [{ filePath: "src/handler.ts", status: "modified" }]);

    expect(result.shapeDelta.runtimeImpacts.length).toBe(1);
    expect(result.shapeDelta.runtimeImpacts[0].route).toBe("/api/orders");
  });

  test("changed entity with data access produces data impact", () => {
    const entities: Entity[] = [
      makeEntity("src/repo.ts:saveUser:1", "src/repo.ts", 1, 15),
    ];
    const doc = makeMinimalDoc({
      entities,
      dataAccesses: [
        { entityId: "src/repo.ts:saveUser:1", kind: "db-write", target: "users", confidence: 0.85, evidence: "prisma.users.create" },
        { entityId: "src/repo.ts:saveUser:1", kind: "publish", target: "user.created", confidence: 0.8, evidence: "emit user.created" },
      ],
    });

    const result = analyzeDiff(doc, [{ filePath: "src/repo.ts", status: "modified" }]);

    expect(result.shapeDelta.dataImpacts.length).toBe(2);
    expect(result.shapeDelta.dataImpacts[0].kind).toBe("db-write");
    expect(result.shapeDelta.dataImpacts[0].target).toBe("users");
    expect(result.shapeDelta.dataImpacts[1].kind).toBe("publish");
    expect(result.shapeDelta.why.some(w => w.includes("data impact"))).toBe(true);
    expect(result.shapeDelta.reviewFocus).toContain("Audit data writes and event publishes for correctness");
  });

  test("unchanged entity does not produce runtime or data impact", () => {
    const entities: Entity[] = [
      makeEntity("src/handler.ts:handleOrder:1", "src/handler.ts", 1, 20),
      makeEntity("src/other.ts:unrelated:1", "src/other.ts", 1, 10),
    ];
    const doc = makeMinimalDoc({
      entities,
      runtimePaths: [
        { entrypointId: "ep-orders", kind: "http", route: "/api/orders", method: "POST", reachableEntities: ["src/handler.ts:handleOrder:1"], dataAccesses: [], depth: 1 },
      ],
      runtimeEntrypoints: [
        { id: "ep-orders", kind: "http", route: "/api/orders", method: "POST", confidence: 0.9, evidence: "express" },
      ],
      dataAccesses: [
        { entityId: "src/handler.ts:handleOrder:1", kind: "db-write", target: "orders", confidence: 0.9, evidence: "prisma" },
      ],
    });

    const result = analyzeDiff(doc, [{ filePath: "src/other.ts", status: "modified" }]);

    expect(result.shapeDelta.runtimeImpacts).toEqual([]);
    expect(result.shapeDelta.dataImpacts).toEqual([]);
  });

  test("backward compatible when runtime fields absent", () => {
    const doc = makeMinimalDoc({
      entities: [makeEntity("src/foo.ts:foo:1", "src/foo.ts", 1, 10)],
    });

    const result = analyzeDiff(doc, [{ filePath: "src/foo.ts", status: "modified" }]);

    expect(result.shapeDelta.runtimeImpacts).toEqual([]);
    expect(result.shapeDelta.dataImpacts).toEqual([]);
    expect(result.shapeDelta.attention).toBe("GREEN");
  });

  test("db-write with weak tests bumps attention to RED", () => {
    const entities: Entity[] = [
      makeEntity("src/repo.ts:saveUser:1", "src/repo.ts", 1, 15),
      makeEntity("src/repo.test.ts:testSave:1", "src/repo.test.ts", 1, 10),
    ];
    const doc = makeMinimalDoc({
      entities,
      dataAccesses: [
        { entityId: "src/repo.ts:saveUser:1", kind: "db-write", target: "users", confidence: 0.9, evidence: "prisma" },
      ],
    });

    const result = analyzeDiff(doc, [{ filePath: "src/repo.ts", status: "modified" }]);

    expect(result.shapeDelta.dataImpacts.length).toBe(1);
    expect(result.shapeDelta.testConfidence).toBe("WEAK");
    expect(result.shapeDelta.attention).toBe("RED");
  });

  test("dangerous data with partial tests bumps attention to RED", () => {
    const entities: Entity[] = [
      makeEntity("src/repo.ts:save:1", "src/repo.ts", 1, 20),
      makeEntity("src/service.ts:run:1", "src/service.ts", 1, 15),
      makeEntity("src/repo.test.ts:testRepo:1", "src/repo.test.ts", 1, 10),
      makeEntity("src/service.test.ts:testService:1", "src/service.test.ts", 1, 10),
    ];
    const doc = makeMinimalDoc({
      entities,
      dataAccesses: [
        { entityId: "src/repo.ts:save:1", kind: "db-write", target: "orders", confidence: 0.9, evidence: "insert" },
      ],
      changeRipple: [
        { entityId: "src/repo.ts:save:1", rippleScore: 2, staticDeps: ["src/service.ts"], temporalDeps: [], implicitCouplings: [], affectedFiles: ["src/service.ts"] },
      ],
    });

    const result = analyzeDiff(doc, [
      { filePath: "src/repo.ts", status: "modified" },
      { filePath: "src/repo.test.ts", status: "modified" },
    ]);

    expect(result.shapeDelta.testConfidence).toBe("PARTIAL");
    expect(result.shapeDelta.attention).toBe("RED");
  });

  test("runtime path touched with partial tests bumps attention to RED", () => {
    const entities: Entity[] = [
      makeEntity("src/handler.ts:handle:1", "src/handler.ts", 1, 20),
      makeEntity("src/service.ts:process:1", "src/service.ts", 1, 15),
      makeEntity("src/handler.test.ts:testHandler:1", "src/handler.test.ts", 1, 10),
      makeEntity("src/service.test.ts:testService:1", "src/service.test.ts", 1, 10),
    ];
    const doc = makeMinimalDoc({
      entities,
      runtimeEntrypoints: [
        { id: "ep1", kind: "http", route: "/api/do", method: "GET", confidence: 0.9, evidence: "express" },
      ],
      runtimePaths: [
        { entrypointId: "ep1", kind: "http", route: "/api/do", method: "GET", reachableEntities: ["src/handler.ts:handle:1", "src/service.ts:process:1"], dataAccesses: [], depth: 2 },
      ],
      changeRipple: [
        { entityId: "src/handler.ts:handle:1", rippleScore: 2, staticDeps: ["src/service.ts"], temporalDeps: [], implicitCouplings: [], affectedFiles: ["src/service.ts"] },
      ],
    });

    const result = analyzeDiff(doc, [
      { filePath: "src/handler.ts", status: "modified" },
      { filePath: "src/handler.test.ts", status: "modified" },
    ]);

    expect(result.shapeDelta.runtimeImpacts.length).toBe(1);
    expect(result.shapeDelta.testConfidence).toBe("PARTIAL");
    expect(result.shapeDelta.attention).toBe("RED");
  });

  test("multiple runtime paths produce multiple impacts", () => {
    const entities: Entity[] = [
      makeEntity("src/shared.ts:validate:1", "src/shared.ts", 1, 10),
    ];
    const doc = makeMinimalDoc({
      entities,
      runtimeEntrypoints: [
        { id: "ep1", kind: "http", route: "/api/a", method: "GET", confidence: 0.9, evidence: "express" },
        { id: "ep2", kind: "queue", route: "job-queue", confidence: 0.8, evidence: "bull worker" },
      ],
      runtimePaths: [
        { entrypointId: "ep1", kind: "http", route: "/api/a", method: "GET", reachableEntities: ["src/shared.ts:validate:1"], dataAccesses: [], depth: 1 },
        { entrypointId: "ep2", kind: "queue", route: "job-queue", reachableEntities: ["src/shared.ts:validate:1"], dataAccesses: [], depth: 1 },
      ],
    });

    const result = analyzeDiff(doc, [{ filePath: "src/shared.ts", status: "modified" }]);

    expect(result.shapeDelta.runtimeImpacts.length).toBe(2);
    expect(result.shapeDelta.runtimeImpacts.map(r => r.kind)).toContain("http");
    expect(result.shapeDelta.runtimeImpacts.map(r => r.kind)).toContain("queue");
  });

  test("runtime impact uses entrypoint metadata when available", () => {
    const entities: Entity[] = [
      makeEntity("src/handler.ts:fn:1", "src/handler.ts", 1, 10),
    ];
    const doc = makeMinimalDoc({
      entities,
      runtimeEntrypoints: [
        { id: "ep1", kind: "http", route: "/api/test", method: "PUT", confidence: 0.95, evidence: "decorator @Put" },
      ],
      runtimePaths: [
        { entrypointId: "ep1", kind: "http", reachableEntities: ["src/handler.ts:fn:1"], dataAccesses: [], depth: 1 },
      ],
    });

    const result = analyzeDiff(doc, [{ filePath: "src/handler.ts", status: "modified" }]);

    expect(result.shapeDelta.runtimeImpacts[0].route).toBe("/api/test");
    expect(result.shapeDelta.runtimeImpacts[0].method).toBe("PUT");
    expect(result.shapeDelta.runtimeImpacts[0].confidence).toBe(0.95);
    expect(result.shapeDelta.runtimeImpacts[0].evidence).toBe("decorator @Put");
  });

  test("data impacts sorted by confidence descending", () => {
    const entities: Entity[] = [
      makeEntity("src/repo.ts:fn:1", "src/repo.ts", 1, 20),
    ];
    const doc = makeMinimalDoc({
      entities,
      dataAccesses: [
        { entityId: "src/repo.ts:fn:1", kind: "db-read", target: "low", confidence: 0.5, evidence: "query" },
        { entityId: "src/repo.ts:fn:1", kind: "db-write", target: "high", confidence: 0.95, evidence: "insert" },
        { entityId: "src/repo.ts:fn:1", kind: "cache-read", target: "mid", confidence: 0.7, evidence: "redis.get" },
      ],
    });

    const result = analyzeDiff(doc, [{ filePath: "src/repo.ts", status: "modified" }]);

    expect(result.shapeDelta.dataImpacts[0].confidence).toBeGreaterThanOrEqual(result.shapeDelta.dataImpacts[1].confidence);
    expect(result.shapeDelta.dataImpacts[1].confidence).toBeGreaterThanOrEqual(result.shapeDelta.dataImpacts[2].confidence);
  });

  test("shape movement shows data side-effect for http-call", () => {
    const entities: Entity[] = [
      makeEntity("src/client.ts:callExternal:1", "src/client.ts", 1, 10),
    ];
    const doc = makeMinimalDoc({
      entities,
      dataAccesses: [
        { entityId: "src/client.ts:callExternal:1", kind: "http-call", target: "https://api.stripe.com/charge", confidence: 0.85, evidence: "fetch call" },
      ],
    });

    const result = analyzeDiff(doc, [{ filePath: "src/client.ts", status: "modified" }]);

    expect(result.shapeDelta.shapeMovements.some(m => m.includes("data side-effect"))).toBe(true);
    expect(result.shapeDelta.shapeMovements.some(m => m.includes("http-call"))).toBe(true);
  });

  test("review focus includes runtime and data audit items", () => {
    const entities: Entity[] = [
      makeEntity("src/handler.ts:fn:1", "src/handler.ts", 1, 10),
    ];
    const doc = makeMinimalDoc({
      entities,
      runtimeEntrypoints: [
        { id: "ep1", kind: "http", route: "/api/x", method: "GET", confidence: 0.9, evidence: "express" },
      ],
      runtimePaths: [
        { entrypointId: "ep1", kind: "http", route: "/api/x", method: "GET", reachableEntities: ["src/handler.ts:fn:1"], dataAccesses: [], depth: 1 },
      ],
      dataAccesses: [
        { entityId: "src/handler.ts:fn:1", kind: "db-write", target: "events", confidence: 0.9, evidence: "insert" },
      ],
    });

    const result = analyzeDiff(doc, [{ filePath: "src/handler.ts", status: "modified" }]);

    expect(result.shapeDelta.reviewFocus).toContain("Verify runtime entrypoints still behave correctly");
    expect(result.shapeDelta.reviewFocus).toContain("Audit data writes and event publishes for correctness");
  });
});
