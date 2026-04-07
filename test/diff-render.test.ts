import { describe, expect, test } from "bun:test";
import { renderDiffAnalysis } from "../src/diff-render";
import type { DiffAnalysis } from "../src/diff";

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("renderDiffAnalysis", () => {
  test("renders test confidence, boundary crossings, and changed entity names", () => {
    const analysis: DiffAnalysis = {
      changedFiles: [{ filePath: "src/auth.ts", status: "modified" }],
      changedEntities: [
        { id: "src/auth.ts:validateToken:1", name: "validateToken", kind: "function", filePath: "src/auth.ts", startLine: 1, endLine: 10, metrics: { cyclomatic: 1, cognitive: 1, loc: 10, maxNestingDepth: 0, parameterCount: 1 } },
        { id: "src/auth.ts:refreshSession:20", name: "refreshSession", kind: "function", filePath: "src/auth.ts", startLine: 20, endLine: 30, metrics: { cyclomatic: 1, cognitive: 1, loc: 11, maxNestingDepth: 0, parameterCount: 1 } },
      ],
      missedFiles: [],
      missedTests: [],
      affectedCallers: [],
      shapeDelta: {
        changedFileCount: 1,
        affectedFileCount: 3,
        attention: "YELLOW",
        testConfidence: "PARTIAL",
        testRecommendations: ["test/auth.test.ts"],
        boundaryCrossings: ["src -> test"],
        invariantHints: [],
        affectedDirs: ["src", "test"],
        runtimeHints: ["runtime path hint: src/auth.ts"],
        changedPackages: ["src"],
        affectedPackages: ["src", "test"],
        changedRisk: { red: 1, yellow: 0, green: 1 },
        affectedRisk: { red: 1, yellow: 1, green: 1 },
        shapeMovements: ["ripple widened beyond changed files", "crossed package boundary: src -> test", "weak tests in affected zone"],
        why: ["test confidence partial: affected ripple tests still need review"],
        likelyMissed: [],
        reviewFocus: ["Add/update tests covering affected ripple zone"],
        summary: {
          changedFiles: ["src/auth.ts"],
          affectedFiles: ["src/auth.ts", "test/auth.test.ts"],
          affectedDirs: ["src", "test"],
          changedPackages: ["src"],
          affectedPackages: ["src", "test"],
          hiddenCouplings: [],
          testConfidence: "PARTIAL",
          invariantHints: [],
          runtimeHints: ["runtime path hint: src/auth.ts"],
          boundaryCrossings: ["src -> test"],
          reviewFocus: ["Add/update tests covering affected ripple zone"],
        },
      },
    };

    const output = stripAnsi(renderDiffAnalysis(analysis, "HEAD~1"));

    expect(output).toContain("Test confidence: PARTIAL");
    expect(output).toContain("Consider running/updating likely guard tests: test/auth.test.ts");
    expect(output).toContain("Boundary crossings: src -> test");
    expect(output).toContain("Changed packages: src");
    expect(output).toContain("Affected packages: src, test");
    expect(output).toContain("Affected dirs: src, test");
    expect(output).toContain("Changed risk: 1 red, 0 yellow, 1 green");
    expect(output).toContain("Affected risk: 1 red, 1 yellow, 1 green");
    expect(output).toContain("ripple widened beyond changed files");
    expect(output).toContain("runtime path hint: src/auth.ts");
    expect(output).toContain("src/auth.ts: validateToken, refreshSession");
  });
});
