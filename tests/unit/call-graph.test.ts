import { describe, it, expect } from "bun:test";
import {
  buildCallGraph,
  computeBlastRadius,
  computeForwardSlice,
  type CallGraph,
} from "../../src/analysis/call-graph";

describe("call graph", () => {
  describe("buildCallGraph", () => {
    it("builds empty graph from no edges", () => {
      const graph = buildCallGraph([]);
      expect(graph.adjacency.size).toBe(0);
    });

    it("builds adjacency list from edges", () => {
      const graph = buildCallGraph([
        { source: "a", target: "b", kind: "calls" },
        { source: "a", target: "c", kind: "calls" },
        { source: "b", target: "d", kind: "calls" },
      ]);
      expect(graph.adjacency.get("a")).toEqual(new Set(["b", "c"]));
      expect(graph.adjacency.get("b")).toEqual(new Set(["d"]));
    });

    it("computes fan-in and fan-out", () => {
      const graph = buildCallGraph([
        { source: "a", target: "c", kind: "calls" },
        { source: "b", target: "c", kind: "calls" },
        { source: "c", target: "d", kind: "calls" },
      ]);
      expect(graph.fanOut.get("a")).toBe(1);
      expect(graph.fanIn.get("c")).toBe(2);
      expect(graph.fanOut.get("c")).toBe(1);
    });
  });

  describe("computeForwardSlice", () => {
    it("returns empty set for leaf node", () => {
      const graph = buildCallGraph([
        { source: "a", target: "b", kind: "calls" },
      ]);
      const slice = computeForwardSlice(graph, "b");
      expect(slice.size).toBe(0);
    });

    it("finds transitive callees", () => {
      const graph = buildCallGraph([
        { source: "a", target: "b", kind: "calls" },
        { source: "b", target: "c", kind: "calls" },
        { source: "c", target: "d", kind: "calls" },
      ]);
      const slice = computeForwardSlice(graph, "a");
      expect(slice).toEqual(new Set(["b", "c", "d"]));
    });

    it("handles cycles without infinite loop", () => {
      const graph = buildCallGraph([
        { source: "a", target: "b", kind: "calls" },
        { source: "b", target: "a", kind: "calls" },
      ]);
      const slice = computeForwardSlice(graph, "a");
      expect(slice).toEqual(new Set(["b"]));
    });

    it("handles diamond dependencies", () => {
      const graph = buildCallGraph([
        { source: "a", target: "b", kind: "calls" },
        { source: "a", target: "c", kind: "calls" },
        { source: "b", target: "d", kind: "calls" },
        { source: "c", target: "d", kind: "calls" },
      ]);
      const slice = computeForwardSlice(graph, "a");
      expect(slice).toEqual(new Set(["b", "c", "d"]));
    });

    it("returns empty set for unknown node", () => {
      const graph = buildCallGraph([
        { source: "a", target: "b", kind: "calls" },
      ]);
      const slice = computeForwardSlice(graph, "unknown");
      expect(slice.size).toBe(0);
    });
  });

  describe("computeBlastRadius", () => {
    it("computes blast radius for a function", () => {
      const graph = buildCallGraph([
        { source: "a", target: "b", kind: "calls" },
        { source: "b", target: "c", kind: "calls" },
      ]);
      const testFiles = new Set(["c"]);
      const coupledFiles: string[] = [];

      const result = computeBlastRadius(graph, "a", testFiles, coupledFiles, 1);
      expect(result.entityId).toBe("a");
      expect(result.forwardSlice).toEqual(["b", "c"]);
      expect(result.testCoverage).toBe(0.5); // c is tested, b is not
      expect(result.contributorCount).toBe(1);
    });

    it("returns 1.0 coverage when all callees are tested", () => {
      const graph = buildCallGraph([
        { source: "a", target: "b", kind: "calls" },
      ]);
      const testFiles = new Set(["b"]);
      const result = computeBlastRadius(graph, "a", testFiles, [], 1);
      expect(result.testCoverage).toBe(1.0);
    });

    it("returns 0.0 coverage when no callees are tested", () => {
      const graph = buildCallGraph([
        { source: "a", target: "b", kind: "calls" },
        { source: "a", target: "c", kind: "calls" },
      ]);
      const testFiles = new Set<string>();
      const result = computeBlastRadius(graph, "a", testFiles, [], 1);
      expect(result.testCoverage).toBe(0.0);
    });

    it("returns 1.0 coverage for leaf nodes (no callees = nothing to cover)", () => {
      const graph = buildCallGraph([
        { source: "a", target: "b", kind: "calls" },
      ]);
      const result = computeBlastRadius(graph, "b", new Set(), [], 1);
      expect(result.testCoverage).toBe(1.0);
      expect(result.forwardSlice).toEqual([]);
    });

    it("includes change coupling in result", () => {
      const graph = buildCallGraph([]);
      const result = computeBlastRadius(
        graph,
        "a",
        new Set(),
        ["x.ts", "y.ts"],
        2
      );
      expect(result.changeCoupling).toEqual(["x.ts", "y.ts"]);
      expect(result.contributorCount).toBe(2);
    });

    it("computes risk score proportional to blast radius and coverage gaps", () => {
      const graph = buildCallGraph([
        { source: "a", target: "b", kind: "calls" },
        { source: "a", target: "c", kind: "calls" },
        { source: "a", target: "d", kind: "calls" },
      ]);
      const result = computeBlastRadius(graph, "a", new Set(), [], 1);
      // 3 callees, 0 coverage, risk should be > 0
      expect(result.riskScore).toBeGreaterThan(0);
    });
  });
});
