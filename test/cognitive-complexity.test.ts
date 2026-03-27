import { describe, expect, it } from "bun:test";
import { cognitiveComplexityPlugin } from "../src/plugins/cognitive-complexity";
import { createParser } from "../src/utils/parser";
import type { AnalysisContext } from "../src/types";

async function analyzeSnippet(code: string, ext = ".ts") {
  const parser = await createParser();
  const ctx: AnalysisContext = {
    repoPath: "/tmp/test",
    files: [{ path: `/tmp/test/test${ext}`, relativePath: `test${ext}`, content: code }],
    parser,
    gitLog: [],
  };
  return cognitiveComplexityPlugin.analyze(ctx);
}

describe("cognitive-complexity plugin", () => {
  it("scores a simple function as 0", async () => {
    const result = await analyzeSnippet(`function add(a: number, b: number) { return a + b; }`);
    expect(result.entities).toHaveLength(1);
    expect(result.entities![0].metrics.cognitiveComplexity).toBe(0);
  });

  it("scores a single if as 1", async () => {
    const result = await analyzeSnippet(`function check(x: number) {
      if (x > 0) {
        return true;
      }
      return false;
    }`);
    expect(result.entities![0].metrics.cognitiveComplexity).toBe(1);
  });

  it("adds nesting penalty for nested if", async () => {
    const result = await analyzeSnippet(`function nested(x: number, y: number) {
      if (x > 0) {
        if (y > 0) {
          return true;
        }
      }
      return false;
    }`);
    const cc = result.entities![0].metrics.cognitiveComplexity;
    expect(cc).toBeGreaterThan(2);
  });

  it("scores for-loop with nested if", async () => {
    const result = await analyzeSnippet(`function loop(items: number[]) {
      for (const item of items) {
        if (item > 0) {
          console.log(item);
        }
      }
    }`);
    const cc = result.entities![0].metrics.cognitiveComplexity;
    expect(cc).toBeGreaterThanOrEqual(3);
  });

  it("handles else-if chains", async () => {
    const result = await analyzeSnippet(`function classify(x: number) {
      if (x > 100) {
        return "high";
      } else if (x > 50) {
        return "medium";
      } else {
        return "low";
      }
    }`);
    const cc = result.entities![0].metrics.cognitiveComplexity;
    expect(cc).toBeGreaterThanOrEqual(3);
  });

  it("finds arrow functions assigned to variables", async () => {
    const result = await analyzeSnippet(`const greet = (name: string) => {
      if (name) {
        return "Hello " + name;
      }
      return "Hello";
    };`);
    expect(result.entities).toHaveLength(1);
    expect(result.entities![0].name).toBe("greet");
    expect(result.entities![0].metrics.cognitiveComplexity).toBe(1);
  });

  it("handles JavaScript files", async () => {
    const result = await analyzeSnippet(
      `function foo() { if (true) { return 1; } return 0; }`,
      ".js"
    );
    expect(result.entities).toHaveLength(1);
    expect(result.entities![0].metrics.cognitiveComplexity).toBe(1);
  });

  it("finds multiple functions in one file", async () => {
    const result = await analyzeSnippet(`
      function a() { return 1; }
      function b() { if (true) return 2; return 3; }
      function c() {
        for (let i = 0; i < 10; i++) {
          if (i > 5) break;
        }
      }
    `);
    expect(result.entities!.length).toBe(3);
  });

  it("scores logical operators", async () => {
    const result = await analyzeSnippet(`function check(a: boolean, b: boolean, c: boolean) {
      if (a && b || c) {
        return true;
      }
      return false;
    }`);
    const cc = result.entities![0].metrics.cognitiveComplexity;
    expect(cc).toBeGreaterThanOrEqual(3);
  });
});
