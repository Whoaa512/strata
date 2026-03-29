import { describe, expect, test } from "bun:test";
import { analyzeDiff, type DiffFile } from "../src/diff";
import type { StrataDoc } from "../src/schema";

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

  test("identifies missed files from call graph", () => {
    const diff: DiffFile[] = [{ filePath: "a.ts", status: "modified" }];
    const result = analyzeDiff(doc, diff);

    const missedPaths = result.missedFiles.map(m => m.filePath);
    expect(missedPaths).toContain("b.ts");
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
  });
});
