import { describe, test, expect, beforeAll } from "bun:test";
import { initParser, parseSource } from "../parser";
import { extractFunctions } from "../complexity";
import {
  extractCallEdges,
  buildCallGraph,
  computeForwardSlice,
  computeBlastRadii,
} from "../callgraph";

beforeAll(async () => {
  await initParser();
});

describe("call graph", () => {
  const code = `
function a() {
  b();
  c();
}

function b() {
  d();
}

function c() {
  d();
}

function d() {
  console.log("leaf");
}

function isolated() {
  return 42;
}
`;

  test("extracts call edges from source", () => {
    const tree = parseSource(code, "typescript");
    const fns = extractFunctions(tree.rootNode, "test.ts");
    const edges = extractCallEdges(tree.rootNode, "test.ts", fns);

    expect(edges.length).toBeGreaterThanOrEqual(4);

    const aCallsB = edges.find((e) => e.caller === "a" && e.callee === "b");
    expect(aCallsB).toBeDefined();

    const aCallsC = edges.find((e) => e.caller === "a" && e.callee === "c");
    expect(aCallsC).toBeDefined();

    const bCallsD = edges.find((e) => e.caller === "b" && e.callee === "d");
    expect(bCallsD).toBeDefined();

    tree.delete();
  });

  test("builds forward and reverse graphs", () => {
    const tree = parseSource(code, "typescript");
    const fns = extractFunctions(tree.rootNode, "test.ts");
    const edges = extractCallEdges(tree.rootNode, "test.ts", fns);
    const { forward, reverse } = buildCallGraph(edges);

    expect(forward.get("test.ts:a")?.has("test.ts:b")).toBe(true);
    expect(forward.get("test.ts:a")?.has("test.ts:c")).toBe(true);
    expect(reverse.get("test.ts:d")?.has("test.ts:b")).toBe(true);
    expect(reverse.get("test.ts:d")?.has("test.ts:c")).toBe(true);

    tree.delete();
  });

  test("computes forward slice", () => {
    const tree = parseSource(code, "typescript");
    const fns = extractFunctions(tree.rootNode, "test.ts");
    const edges = extractCallEdges(tree.rootNode, "test.ts", fns);
    const { forward } = buildCallGraph(edges);

    const slice = computeForwardSlice("test.ts:a", forward);
    expect(slice.has("test.ts:b")).toBe(true);
    expect(slice.has("test.ts:c")).toBe(true);
    expect(slice.has("test.ts:d")).toBe(true);
    expect(slice.has("test.ts:isolated")).toBe(false);

    tree.delete();
  });

  test("computes blast radii", () => {
    const tree = parseSource(code, "typescript");
    const fns = extractFunctions(tree.rootNode, "test.ts");
    const edges = extractCallEdges(tree.rootNode, "test.ts", fns);
    const testFiles = new Set<string>();

    const radii = computeBlastRadii(fns, edges, testFiles);

    expect(radii.length).toBe(5);
    const aRadius = radii.find((r) => r.entity === "a");
    expect(aRadius).toBeDefined();
    expect(aRadius!.forwardSlice.length).toBeGreaterThanOrEqual(3);
    expect(aRadius!.testCoverageGap).toBe(true);

    const dRadius = radii.find((r) => r.entity === "d");
    expect(dRadius).toBeDefined();
    expect(dRadius!.forwardSlice.length).toBeLessThanOrEqual(1);

    tree.delete();
  });

  test("marks test coverage correctly", () => {
    const tree = parseSource(code, "typescript");
    const fns = extractFunctions(tree.rootNode, "test.ts");
    const edges = extractCallEdges(tree.rootNode, "test.ts", fns);
    const testFiles = new Set(["test.test.ts"]);

    const radii = computeBlastRadii(fns, edges, testFiles);
    const aRadius = radii.find((r) => r.entity === "a");
    expect(aRadius!.testCoverageGap).toBe(false);

    tree.delete();
  });
});
