import { describe, expect, test, beforeAll } from "bun:test";
import { getParser, parseFile } from "../src/parser";
import { cognitiveComplexity, nestingDepth, parameterCount } from "../src/complexity";
import Parser from "web-tree-sitter";

let tsParser: Parser;

beforeAll(async () => {
  tsParser = await getParser("test.ts");
});

function parseFunc(source: string): Parser.SyntaxNode {
  const tree = parseFile(tsParser, `function test() { ${source} }`);
  const fn = tree.rootNode.namedChildren[0];
  return fn;
}

describe("cognitive complexity", () => {
  test("simple function has 0 complexity", () => {
    const tree = parseFile(tsParser, `function simple() { return 1; }`);
    const fn = tree.rootNode.namedChildren[0];
    expect(cognitiveComplexity(fn)).toBe(0);
  });

  test("single if adds 1", () => {
    const fn = parseFunc(`if (x) { return 1; }`);
    expect(cognitiveComplexity(fn)).toBe(1);
  });

  test("nested if adds nesting penalty", () => {
    const fn = parseFunc(`
      if (a) {
        if (b) {
          return 1;
        }
      }
    `);
    // outer if: +1 (structural) +0 (nesting=0)
    // inner if: +1 (structural) +1 (nesting=1)
    expect(cognitiveComplexity(fn)).toBe(3);
  });

  test("for loop with nested if", () => {
    const fn = parseFunc(`
      for (let i = 0; i < n; i++) {
        if (arr[i] > 0) {
          count++;
        }
      }
    `);
    // for: +1 +0
    // if: +1 +1
    expect(cognitiveComplexity(fn)).toBe(3);
  });

  test("switch statement", () => {
    const fn = parseFunc(`
      switch (x) {
        case 1: return 'a';
        case 2: return 'b';
      }
    `);
    // switch: +1
    expect(cognitiveComplexity(fn)).toBe(1);
  });

  test("try-catch", () => {
    const fn = parseFunc(`
      try {
        doSomething();
      } catch (e) {
        handleError();
      }
    `);
    // try: +1
    // catch: +1 +1 (nesting from try)
    expect(cognitiveComplexity(fn)).toBe(3);
  });

  test("boolean operator sequences", () => {
    const fn = parseFunc(`if (a && b && c) { return 1; }`);
    // if: +1
    // && sequence: +1 (all same operator)
    expect(cognitiveComplexity(fn)).toBe(2);
  });

  test("mixed boolean operators add extra", () => {
    const fn = parseFunc(`if (a && b || c) { return 1; }`);
    // if: +1
    // mixed &&/||: +2 (switch from && to ||)
    expect(cognitiveComplexity(fn)).toBe(3);
  });
});

describe("nesting depth", () => {
  test("flat function has depth 0", () => {
    const fn = parseFunc(`return 1;`);
    expect(nestingDepth(fn)).toBe(0);
  });

  test("single if has depth 1", () => {
    const fn = parseFunc(`if (x) { return 1; }`);
    expect(nestingDepth(fn)).toBe(1);
  });

  test("nested ifs count depth", () => {
    const fn = parseFunc(`if (a) { if (b) { if (c) { return 1; } } }`);
    expect(nestingDepth(fn)).toBe(3);
  });
});

describe("parameter count", () => {
  test("counts parameters", () => {
    const tree = parseFile(tsParser, `function test(a: number, b: string, c: boolean) {}`);
    const fn = tree.rootNode.namedChildren[0];
    expect(parameterCount(fn)).toBe(3);
  });

  test("zero params", () => {
    const tree = parseFile(tsParser, `function test() {}`);
    const fn = tree.rootNode.namedChildren[0];
    expect(parameterCount(fn)).toBe(0);
  });
});
