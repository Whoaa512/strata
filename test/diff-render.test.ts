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
        testConfidence: "WEAK",
        boundaryCrossings: ["src -> test"],
        invariantHints: [],
        affectedDirs: ["src", "test"],
        why: ["test confidence weak: likely tests not changed for affected area"],
        likelyMissed: [],
        reviewFocus: ["Add/update tests covering affected ripple zone"],
      },
    };

    const output = stripAnsi(renderDiffAnalysis(analysis, "HEAD~1"));

    expect(output).toContain("Test confidence: WEAK");
    expect(output).toContain("Boundary crossings: src -> test");
    expect(output).toContain("Affected dirs: src, test");
    expect(output).toContain("src/auth.ts: validateToken, refreshSession");
  });
});
