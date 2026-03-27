import { describe, test, expect, beforeAll } from "bun:test";
import { initParser, parseSource, detectLang } from "../parser";
import type { Tree } from "web-tree-sitter";

beforeAll(async () => {
  await initParser();
});

describe("detectLang", () => {
  test("identifies TypeScript files", () => {
    expect(detectLang("foo.ts")).toBe("typescript");
    expect(detectLang("foo.tsx")).toBe("tsx");
    expect(detectLang("foo.js")).toBe("javascript");
    expect(detectLang("foo.mjs")).toBe("javascript");
    expect(detectLang("foo.cjs")).toBe("javascript");
    expect(detectLang("foo.jsx")).toBe("tsx");
  });

  test("rejects non-code files", () => {
    expect(detectLang("foo.json")).toBeNull();
    expect(detectLang("foo.md")).toBeNull();
    expect(detectLang("foo.d.ts")).toBeNull();
  });
});

describe("parseSource", () => {
  test("parses simple TypeScript", () => {
    const tree = parseSource(
      `function add(a: number, b: number): number { return a + b; }`,
      "typescript"
    );
    expect(tree.rootNode.type).toBe("program");
    expect(tree.rootNode.childCount).toBeGreaterThan(0);
    tree.delete();
  });

  test("parses TSX", () => {
    const tree = parseSource(
      `const App = () => <div>hello</div>;`,
      "tsx"
    );
    expect(tree.rootNode.type).toBe("program");
    tree.delete();
  });

  test("parses JavaScript", () => {
    const tree = parseSource(
      `function greet(name) { return "hello " + name; }`,
      "javascript"
    );
    expect(tree.rootNode.type).toBe("program");
    tree.delete();
  });
});
