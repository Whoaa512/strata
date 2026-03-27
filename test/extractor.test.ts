import { describe, expect, test, beforeAll } from "bun:test";
import { CodeGraph } from "../src/graph";
import { getParser, parseFile } from "../src/parser";
import { extractFromTree } from "../src/extractor";

let tsParser: Awaited<ReturnType<typeof getParser>>;

beforeAll(async () => {
  tsParser = await getParser("test.ts");
});

describe("extractor", () => {
  test("extracts function declarations", () => {
    const source = `
function hello() { return 1; }
function world() { return 2; }
`;
    const tree = parseFile(tsParser, source);
    const graph = new CodeGraph();
    extractFromTree(tree, "test.ts", graph);

    const fns = graph.entitiesByKind("function");
    expect(fns.length).toBe(2);
    expect(fns.map((f) => f.name).sort()).toEqual(["hello", "world"]);
  });

  test("extracts arrow functions assigned to variables", () => {
    const source = `
const greet = (name: string) => { return name; };
`;
    const tree = parseFile(tsParser, source);
    const graph = new CodeGraph();
    extractFromTree(tree, "test.ts", graph);

    const fns = graph.entitiesByKind("function");
    expect(fns.length).toBe(1);
    expect(fns[0].name).toBe("greet");
  });

  test("extracts call edges between functions", () => {
    const source = `
function a() { b(); }
function b() { return 1; }
`;
    const tree = parseFile(tsParser, source);
    const graph = new CodeGraph();
    extractFromTree(tree, "test.ts", graph);

    const callEdges = graph.outgoing("file:test.ts::a", "calls");
    expect(callEdges.length).toBe(1);
    expect(callEdges[0].target).toBe("file:test.ts::b");
  });

  test("extracts class methods", () => {
    const source = `
class Foo {
  bar() { return 1; }
  baz() { this.bar(); }
}
`;
    const tree = parseFile(tsParser, source);
    const graph = new CodeGraph();
    extractFromTree(tree, "test.ts", graph);

    const classes = graph.entitiesByKind("class");
    expect(classes.length).toBe(1);
    expect(classes[0].name).toBe("Foo");

    const fns = graph.entitiesByKind("function");
    expect(fns.map((f) => f.name).sort()).toEqual(["bar", "baz"]);
  });

  test("extracts import edges for relative imports", () => {
    const source = `
import { foo } from './utils';
import { bar } from 'lodash';
`;
    const tree = parseFile(tsParser, source);
    const graph = new CodeGraph();
    extractFromTree(tree, "test.ts", graph);

    const imports = graph.outgoing("file:test.ts", "imports");
    expect(imports.length).toBe(1);
    expect(imports[0].target).toBe("file:./utils");
  });

  test("creates file entity", () => {
    const source = `const x = 1;`;
    const tree = parseFile(tsParser, source);
    const graph = new CodeGraph();
    extractFromTree(tree, "test.ts", graph);

    const file = graph.getEntity("file:test.ts");
    expect(file).toBeDefined();
    expect(file!.kind).toBe("file");
  });

  test("forward slice through call graph", () => {
    const source = `
function a() { b(); c(); }
function b() { d(); }
function c() { return 1; }
function d() { return 2; }
`;
    const tree = parseFile(tsParser, source);
    const graph = new CodeGraph();
    extractFromTree(tree, "test.ts", graph);

    const slice = graph.forwardSlice("file:test.ts::a");
    expect(slice.size).toBe(3);
    expect(slice.has("file:test.ts::b")).toBe(true);
    expect(slice.has("file:test.ts::c")).toBe(true);
    expect(slice.has("file:test.ts::d")).toBe(true);
  });
});
