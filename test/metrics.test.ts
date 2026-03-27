import { describe, expect, test } from "bun:test";
import { CodeGraph, type Entity } from "../src/graph";
import {
  computeHotspots,
  computeBlastRadius,
  detectTestFiles,
} from "../src/metrics";

function addFn(
  graph: CodeGraph,
  name: string,
  metrics: Record<string, number> = {},
): void {
  graph.addEntity({
    id: `file:test.ts::${name}`,
    kind: "function",
    name,
    filePath: "test.ts",
    startLine: 1,
    endLine: 10,
    metrics,
  });
}

describe("hotspots", () => {
  test("ranks by complexity × churn", () => {
    const g = new CodeGraph();
    addFn(g, "low", { cognitiveComplexity: 1, churn: 2 });
    addFn(g, "high", { cognitiveComplexity: 10, churn: 5 });
    addFn(g, "mid", { cognitiveComplexity: 5, churn: 3 });

    const hotspots = computeHotspots(g);
    expect(hotspots[0].entity.name).toBe("high");
    expect(hotspots[0].score).toBe(50);
    expect(hotspots[1].entity.name).toBe("mid");
    expect(hotspots[1].score).toBe(15);
    expect(hotspots[2].entity.name).toBe("low");
  });

  test("respects limit", () => {
    const g = new CodeGraph();
    for (let i = 0; i < 20; i++) {
      addFn(g, `fn${i}`, { cognitiveComplexity: i, churn: 1 });
    }
    const hotspots = computeHotspots(g, 5);
    expect(hotspots.length).toBe(5);
  });
});

describe("blast radius", () => {
  test("computes forward slice size and coverage", () => {
    const g = new CodeGraph();
    addFn(g, "a");
    addFn(g, "b");
    addFn(g, "c");
    addFn(g, "d");
    g.addEdge({ source: "file:test.ts::a", target: "file:test.ts::b", kind: "calls", weight: 1 });
    g.addEdge({ source: "file:test.ts::b", target: "file:test.ts::c", kind: "calls", weight: 1 });
    g.addEdge({ source: "file:test.ts::a", target: "file:test.ts::d", kind: "calls", weight: 1 });

    const tested = new Set(["file:test.ts::b"]);
    const br = computeBlastRadius(g, "file:test.ts::a", tested);

    expect(br).not.toBeNull();
    expect(br!.forwardSliceSize).toBe(3);
    expect(br!.untestedInSlice.length).toBe(2);
    expect(br!.testCoverageRatio).toBeCloseTo(1 / 3);
  });

  test("returns null for unknown entity", () => {
    const g = new CodeGraph();
    expect(computeBlastRadius(g, "nonexistent")).toBeNull();
  });

  test("leaf function has zero blast radius", () => {
    const g = new CodeGraph();
    addFn(g, "leaf");

    const br = computeBlastRadius(g, "file:test.ts::leaf");
    expect(br!.forwardSliceSize).toBe(0);
    expect(br!.testCoverageRatio).toBe(1);
    expect(br!.riskScore).toBe(0);
  });
});

describe("detectTestFiles", () => {
  test("identifies test files", () => {
    const files = [
      "src/utils.ts",
      "src/utils.test.ts",
      "test/integration.ts",
      "__tests__/foo.ts",
      "src/utils.spec.ts",
      "src/main.ts",
    ];
    const testFiles = detectTestFiles(files);
    expect(testFiles.size).toBe(4);
    expect(testFiles.has("src/utils.ts")).toBe(false);
    expect(testFiles.has("src/main.ts")).toBe(false);
  });
});
