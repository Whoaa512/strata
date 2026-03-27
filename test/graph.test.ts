import { describe, expect, test } from "bun:test";
import { CodeGraph, type Entity, type Edge } from "../src/graph";

function makeEntity(id: string, overrides?: Partial<Entity>): Entity {
  return {
    id,
    kind: "function",
    name: id,
    filePath: "test.ts",
    startLine: 1,
    endLine: 10,
    metrics: {},
    ...overrides,
  };
}

function makeEdge(source: string, target: string, kind: Edge["kind"] = "calls"): Edge {
  return { source, target, kind, weight: 1 };
}

describe("CodeGraph", () => {
  test("add and retrieve entities", () => {
    const g = new CodeGraph();
    g.addEntity(makeEntity("a"));
    g.addEntity(makeEntity("b"));

    expect(g.getEntity("a")?.name).toBe("a");
    expect(g.size().entities).toBe(2);
  });

  test("add edges and query fan-in/fan-out", () => {
    const g = new CodeGraph();
    g.addEntity(makeEntity("a"));
    g.addEntity(makeEntity("b"));
    g.addEntity(makeEntity("c"));
    g.addEdge(makeEdge("a", "b"));
    g.addEdge(makeEdge("a", "c"));

    expect(g.fanOut("a")).toBe(2);
    expect(g.fanIn("b")).toBe(1);
    expect(g.fanIn("a")).toBe(0);
  });

  test("forward slice traverses call graph", () => {
    const g = new CodeGraph();
    g.addEntity(makeEntity("a"));
    g.addEntity(makeEntity("b"));
    g.addEntity(makeEntity("c"));
    g.addEntity(makeEntity("d"));
    g.addEdge(makeEdge("a", "b"));
    g.addEdge(makeEdge("b", "c"));
    g.addEdge(makeEdge("a", "d"));

    const slice = g.forwardSlice("a");
    expect(slice.size).toBe(3);
    expect(slice.has("b")).toBe(true);
    expect(slice.has("c")).toBe(true);
    expect(slice.has("d")).toBe(true);
    expect(slice.has("a")).toBe(false);
  });

  test("backward slice", () => {
    const g = new CodeGraph();
    g.addEntity(makeEntity("a"));
    g.addEntity(makeEntity("b"));
    g.addEntity(makeEntity("c"));
    g.addEdge(makeEdge("a", "b"));
    g.addEdge(makeEdge("b", "c"));

    const slice = g.backwardSlice("c");
    expect(slice.has("b")).toBe(true);
    expect(slice.has("a")).toBe(true);
  });

  test("filter edges by kind", () => {
    const g = new CodeGraph();
    g.addEntity(makeEntity("a"));
    g.addEntity(makeEntity("b"));
    g.addEdge(makeEdge("a", "b", "calls"));
    g.addEdge(makeEdge("a", "b", "imports"));

    expect(g.outgoing("a", "calls").length).toBe(1);
    expect(g.outgoing("a", "imports").length).toBe(1);
    expect(g.outgoing("a").length).toBe(2);
  });

  test("entitiesByKind", () => {
    const g = new CodeGraph();
    g.addEntity(makeEntity("fn1", { kind: "function" }));
    g.addEntity(makeEntity("cls1", { kind: "class" }));
    g.addEntity(makeEntity("fn2", { kind: "function" }));

    expect(g.entitiesByKind("function").length).toBe(2);
    expect(g.entitiesByKind("class").length).toBe(1);
  });

  test("handles cycles in forward slice", () => {
    const g = new CodeGraph();
    g.addEntity(makeEntity("a"));
    g.addEntity(makeEntity("b"));
    g.addEdge(makeEdge("a", "b"));
    g.addEdge(makeEdge("b", "a"));

    const slice = g.forwardSlice("a");
    expect(slice.size).toBe(1);
    expect(slice.has("b")).toBe(true);
  });
});
