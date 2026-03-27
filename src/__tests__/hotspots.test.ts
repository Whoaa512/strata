import { describe, test, expect } from "bun:test";
import { computeHotspots } from "../hotspots";
import type { FunctionInfo, FileChurn } from "../types";

describe("computeHotspots", () => {
  const functions: FunctionInfo[] = [
    { name: "simple", filePath: "a.ts", startLine: 1, endLine: 3, complexity: 1, nestingDepth: 0, paramCount: 1, lineCount: 3 },
    { name: "complex", filePath: "b.ts", startLine: 1, endLine: 30, complexity: 15, nestingDepth: 4, paramCount: 3, lineCount: 30 },
    { name: "medium", filePath: "c.ts", startLine: 1, endLine: 15, complexity: 5, nestingDepth: 2, paramCount: 2, lineCount: 15 },
    { name: "trivial", filePath: "d.ts", startLine: 1, endLine: 2, complexity: 0, nestingDepth: 0, paramCount: 0, lineCount: 2 },
  ];

  test("ranks by complexity * churn", () => {
    const churnMap = new Map<string, FileChurn>([
      ["a.ts", { filePath: "a.ts", commits: 50, linesAdded: 100, linesRemoved: 50, authors: new Set(["alice"]) }],
      ["b.ts", { filePath: "b.ts", commits: 10, linesAdded: 200, linesRemoved: 100, authors: new Set(["bob"]) }],
      ["c.ts", { filePath: "c.ts", commits: 30, linesAdded: 150, linesRemoved: 75, authors: new Set(["charlie"]) }],
      ["d.ts", { filePath: "d.ts", commits: 100, linesAdded: 500, linesRemoved: 250, authors: new Set(["dave"]) }],
    ]);

    const hotspots = computeHotspots(functions, churnMap);

    expect(hotspots.length).toBe(3);
    // maxChurn=100(d.ts), maxComplexity=15(b.ts)
    // complex: (15/15)*(10/100)=0.1, medium: (5/15)*(30/100)=0.1, simple: (1/15)*(50/100)=0.033
    expect(["complex", "medium"]).toContain(hotspots[0].functionName);
    expect(hotspots[0].score).toBeCloseTo(0.1, 2);
    expect(hotspots[2].functionName).toBe("simple");

    // trivial (complexity=0) should be excluded
    expect(hotspots.find((h) => h.functionName === "trivial")).toBeUndefined();
  });

  test("excludes functions with zero churn", () => {
    const churnMap = new Map<string, FileChurn>([
      ["a.ts", { filePath: "a.ts", commits: 10, linesAdded: 20, linesRemoved: 5, authors: new Set(["x"]) }],
    ]);

    const hotspots = computeHotspots(functions, churnMap);
    expect(hotspots.length).toBe(1);
    expect(hotspots[0].functionName).toBe("simple");
  });

  test("respects topN", () => {
    const churnMap = new Map<string, FileChurn>([
      ["a.ts", { filePath: "a.ts", commits: 10, linesAdded: 20, linesRemoved: 5, authors: new Set(["x"]) }],
      ["b.ts", { filePath: "b.ts", commits: 20, linesAdded: 40, linesRemoved: 10, authors: new Set(["y"]) }],
      ["c.ts", { filePath: "c.ts", commits: 15, linesAdded: 30, linesRemoved: 8, authors: new Set(["z"]) }],
    ]);

    const hotspots = computeHotspots(functions, churnMap, 2);
    expect(hotspots.length).toBe(2);
  });
});
