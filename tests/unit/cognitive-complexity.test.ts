import { describe, it, expect } from "bun:test";
import { computeCognitiveComplexity } from "../../src/analysis/cognitive-complexity";

describe("cognitive complexity", () => {
  describe("simple cases", () => {
    it("returns 0 for empty function", async () => {
      expect(await computeCognitiveComplexity("function foo() {}")).toBe(0);
    });

    it("returns 0 for straight-line code", async () => {
      const code = `function foo() {
        const x = 1;
        const y = 2;
        return x + y;
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(0);
    });
  });

  describe("if statements", () => {
    it("scores 1 for a single if", async () => {
      const code = `function foo(x) {
        if (x) { return 1; }
        return 0;
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(1);
    });

    it("scores 2 for if-else", async () => {
      const code = `function foo(x) {
        if (x) { return 1; } else { return 0; }
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(2);
    });

    it("scores 3 for if-else if-else", async () => {
      const code = `function foo(x) {
        if (x === 1) { return 1; }
        else if (x === 2) { return 2; }
        else { return 0; }
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(3);
    });
  });

  describe("nesting increments", () => {
    it("adds nesting penalty for nested if", async () => {
      // outer if: +1 (no nesting)
      // inner if: +1 (structural) + 1 (nesting level 1) = +2
      // total: 3
      const code = `function foo(a, b) {
        if (a) {
          if (b) { return 1; }
        }
        return 0;
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(3);
    });

    it("adds double nesting penalty for triple nesting", async () => {
      // if: +1
      // if (nested 1): +1+1 = +2
      // if (nested 2): +1+2 = +3
      // total: 6
      const code = `function foo(a, b, c) {
        if (a) {
          if (b) {
            if (c) { return 1; }
          }
        }
        return 0;
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(6);
    });
  });

  describe("loops", () => {
    it("scores 1 for a simple for loop", async () => {
      const code = `function foo(arr) {
        for (let i = 0; i < arr.length; i++) {
          console.log(arr[i]);
        }
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(1);
    });

    it("scores 1 for a while loop", async () => {
      const code = `function foo() {
        let i = 0;
        while (i < 10) { i++; }
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(1);
    });

    it("scores 1 for a for-of loop", async () => {
      const code = `function foo(items) {
        for (const item of items) {
          console.log(item);
        }
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(1);
    });

    it("scores nesting increment for loop inside if", async () => {
      // if: +1
      // for (nested 1): +1+1 = +2
      // total: 3
      const code = `function foo(flag, arr) {
        if (flag) {
          for (const x of arr) {
            console.log(x);
          }
        }
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(3);
    });
  });

  describe("logical operators", () => {
    it("scores 1 for && in condition", async () => {
      const code = `function foo(a, b) {
        if (a && b) { return 1; }
        return 0;
      }`;
      // if: +1, &&: +1 = 2
      expect(await computeCognitiveComplexity(code)).toBe(2);
    });

    it("scores 1 for || in condition", async () => {
      const code = `function foo(a, b) {
        if (a || b) { return 1; }
        return 0;
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(2);
    });

    it("scores 1 per sequence of same operator, +1 for switching", async () => {
      // if: +1
      // a && b: +1 (first &&)
      // || c: +1 (switch to ||)
      // total: 3
      const code = `function foo(a, b, c) {
        if (a && b || c) { return 1; }
        return 0;
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(3);
    });

    it("no extra increment for continued same operator", async () => {
      // if: +1
      // a && b && c: only +1 for the whole && sequence
      // total: 2
      const code = `function foo(a, b, c) {
        if (a && b && c) { return 1; }
        return 0;
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(2);
    });
  });

  describe("switch", () => {
    it("scores 1 for switch statement", async () => {
      const code = `function foo(x) {
        switch (x) {
          case 1: return "a";
          case 2: return "b";
          default: return "c";
        }
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(1);
    });
  });

  describe("try-catch", () => {
    it("scores 1 for catch block", async () => {
      const code = `function foo() {
        try {
          doThing();
        } catch (e) {
          handleError(e);
        }
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(1);
    });
  });

  describe("ternary", () => {
    it("scores 1 for ternary operator", async () => {
      const code = `function foo(x) {
        return x ? 1 : 0;
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(1);
    });

    it("scores nesting for nested ternary", async () => {
      // outer ternary: +1
      // inner ternary (nested 1): +1+1 = +2
      // total: 3
      const code = `function foo(x, y) {
        return x ? (y ? 1 : 2) : 0;
      }`;
      expect(await computeCognitiveComplexity(code)).toBe(3);
    });
  });

  describe("break/continue with labels", () => {
    it("scores 1 for break to label", async () => {
      const code = `function foo(arr) {
        outer:
        for (const x of arr) {
          for (const y of x) {
            if (y === 0) break outer;
          }
        }
      }`;
      // outer for: +1
      // inner for (nested 1): +1+1 = +2
      // if (nested 2): +1+2 = +3
      // break outer: +1
      // total: 7
      expect(await computeCognitiveComplexity(code)).toBe(7);
    });
  });

  describe("realistic function", () => {
    it("scores moderately complex real-world function", async () => {
      const code = `function processItems(items, config) {
        if (!items || items.length === 0) {     // +1 (if) + 1 (||)
          return [];
        }
        const result = [];
        for (const item of items) {              // +1
          if (item.type === "special") {         // +2 (nesting 1)
            if (config.enabled) {                // +3 (nesting 2)
              result.push(transform(item));
            } else {                             // +1 (else)
              result.push(item);
            }
          } else {                               // +1 (else)
            result.push(item);
          }
        }
        return result;
      }`;
      // total: 1 + 1 + 1 + 2 + 3 + 1 + 1 = 10
      expect(await computeCognitiveComplexity(code)).toBe(10);
    });
  });
});
