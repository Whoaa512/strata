import { describe, test, expect, beforeAll } from "bun:test";
import { initParser, parseSource } from "../parser";
import { extractFunctions } from "../complexity";

beforeAll(async () => {
  await initParser();
});

describe("extractFunctions", () => {
  test("finds all top-level functions", () => {
    const tree = parseSource(
      `
function a() {}
const b = () => {};
export function c() {}
class Foo {
  method() {}
  async other() {}
}
`,
      "typescript"
    );
    const fns = extractFunctions(tree.rootNode, "test.ts");
    const names = fns.map((f) => f.name);
    expect(names).toContain("a");
    expect(names).toContain("b");
    expect(names).toContain("c");
    expect(names).toContain("method");
    expect(names).toContain("other");
    expect(fns.length).toBe(5);
    tree.delete();
  });

  test("computes zero complexity for simple function", () => {
    const tree = parseSource(
      `function add(a: number, b: number) { return a + b; }`,
      "typescript"
    );
    const fns = extractFunctions(tree.rootNode, "test.ts");
    expect(fns[0].complexity).toBe(0);
    expect(fns[0].paramCount).toBe(2);
    tree.delete();
  });

  test("computes complexity for if/else", () => {
    const tree = parseSource(
      `function check(x: number) {
        if (x > 0) {        // +1
          return "pos";
        } else {             // +1
          return "neg";
        }
      }`,
      "typescript"
    );
    const fns = extractFunctions(tree.rootNode, "test.ts");
    expect(fns[0].complexity).toBe(2);
    tree.delete();
  });

  test("increments for nesting", () => {
    const tree = parseSource(
      `function nested(x: number, y: number) {
        if (x > 0) {            // +1
          if (y > 0) {          // +2 (1 + nesting 1)
            return true;
          }
        }
        return false;
      }`,
      "typescript"
    );
    const fns = extractFunctions(tree.rootNode, "test.ts");
    expect(fns[0].complexity).toBe(3);
    tree.delete();
  });

  test("handles for loop with nested if", () => {
    const tree = parseSource(
      `function loop(items: any[]) {
        for (const item of items) {  // +1
          if (item.active) {         // +2 (1 + nesting 1)
            console.log(item);
          }
        }
      }`,
      "typescript"
    );
    const fns = extractFunctions(tree.rootNode, "test.ts");
    expect(fns[0].complexity).toBe(3);
    tree.delete();
  });

  test("counts boolean operator sequences", () => {
    const tree = parseSource(
      `function check(a: boolean, b: boolean, c: boolean) {
        if (a && b && c) {   // +1 for if, +1 for && sequence
          return true;
        }
        return false;
      }`,
      "typescript"
    );
    const fns = extractFunctions(tree.rootNode, "test.ts");
    expect(fns[0].complexity).toBe(2);
    tree.delete();
  });

  test("counts mixed boolean operators", () => {
    const tree = parseSource(
      `function check(a: boolean, b: boolean, c: boolean) {
        if (a && b || c) {   // +1 for if, +1 for &&, +1 for ||
          return true;
        }
        return false;
      }`,
      "typescript"
    );
    const fns = extractFunctions(tree.rootNode, "test.ts");
    expect(fns[0].complexity).toBe(3);
    tree.delete();
  });

  test("handles try/catch", () => {
    const tree = parseSource(
      `function risky() {
        try {
          doStuff();
        } catch (e) {       // +1
          console.error(e);
        }
      }`,
      "typescript"
    );
    const fns = extractFunctions(tree.rootNode, "test.ts");
    expect(fns[0].complexity).toBe(1);
    tree.delete();
  });

  test("handles deeply nested complex function", () => {
    const tree = parseSource(
      `function complex(items: any[], filter: string) {
        for (const item of items) {           // +1
          if (item.type === filter) {          // +2 (1+1)
            if (item.active) {                 // +3 (1+2)
              if (item.score > 10) {           // +4 (1+3)
                return item;
              }
            }
          } else if (item.type === "wild") {   // +1 (else if)
            for (const sub of item.children) { // +3 (1+2)
              if (sub.active) {                // +4 (1+3)
                return sub;
              }
            }
          }
        }
      }`,
      "typescript"
    );
    const fns = extractFunctions(tree.rootNode, "test.ts");
    expect(fns[0].complexity).toBe(18);
    expect(fns[0].nestingDepth).toBeGreaterThanOrEqual(4);
    tree.delete();
  });

  test("tracks line counts and positions", () => {
    const tree = parseSource(
      `function a() {
  return 1;
}

function b() {
  return 2;
}`,
      "typescript"
    );
    const fns = extractFunctions(tree.rootNode, "test.ts");
    expect(fns[0].startLine).toBe(1);
    expect(fns[0].lineCount).toBe(3);
    expect(fns[1].startLine).toBe(5);
    tree.delete();
  });
});
