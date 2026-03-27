import { describe, expect, test } from "bun:test";
import Parser from "tree-sitter";
import TypeScriptLang from "tree-sitter-typescript";
import {
	computeCognitiveComplexity,
	computeCyclomaticComplexity,
	extractFunctions,
} from "../src/complexity-analyzer";

const parser = new Parser();
parser.setLanguage(TypeScriptLang.typescript);

function parseBody(code: string): Parser.SyntaxNode {
	const wrapped = `function test() { ${code} }`;
	const tree = parser.parse(wrapped);
	const fn = tree.rootNode.children[0];
	const body = fn.childForFieldName("body");
	if (!body) throw new Error("no body found");
	return body;
}

describe("extractFunctions", () => {
	test("extracts function declarations", () => {
		const code = `
function hello(name: string): void {
  console.log(name);
}

function world(a: number, b: number): number {
  return a + b;
}`;
		const fns = extractFunctions("test.ts", code);
		expect(fns.length).toBe(2);
		expect(fns[0].name).toBe("hello");
		expect(fns[0].parameterCount).toBe(1);
		expect(fns[1].name).toBe("world");
		expect(fns[1].parameterCount).toBe(2);
	});

	test("extracts arrow functions assigned to variables", () => {
		const code = "const greet = (name: string) => { return name; };";
		const fns = extractFunctions("test.ts", code);
		expect(fns.length).toBe(1);
		expect(fns[0].name).toBe("greet");
	});

	test("extracts class methods", () => {
		const code = `
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
  subtract(a: number, b: number): number {
    return a - b;
  }
}`;
		const fns = extractFunctions("test.ts", code);
		expect(fns.length).toBe(2);
		expect(fns[0].name).toBe("Calculator.add");
		expect(fns[1].name).toBe("Calculator.subtract");
	});

	test("extracts call targets", () => {
		const code = `
function process(data: string) {
  const cleaned = sanitize(data);
  const result = transform(cleaned);
  console.log(result);
}`;
		const fns = extractFunctions("test.ts", code);
		expect(fns[0].calls).toContain("sanitize");
		expect(fns[0].calls).toContain("transform");
		expect(fns[0].calls).toContain("console.log");
	});
});

describe("cognitiveComplexity", () => {
	test("simple function has 0 complexity", () => {
		const body = parseBody("return 1 + 2;");
		expect(computeCognitiveComplexity(body)).toBe(0);
	});

	test("single if adds 1", () => {
		const body = parseBody("if (x) { return 1; }");
		expect(computeCognitiveComplexity(body)).toBe(1);
	});

	test("nested if adds nesting penalty", () => {
		const body = parseBody("if (x) { if (y) { return 1; } }");
		expect(computeCognitiveComplexity(body)).toBeGreaterThan(2);
	});

	test("else adds 1 (no nesting penalty)", () => {
		const body = parseBody("if (x) { return 1; } else { return 2; }");
		expect(computeCognitiveComplexity(body)).toBe(2);
	});

	test("boolean operators add 1 each", () => {
		const body = parseBody("if (a && b || c) { return 1; }");
		expect(computeCognitiveComplexity(body)).toBeGreaterThanOrEqual(3);
	});

	test("complex nested code has high complexity", () => {
		const code = `
    if (a) {
      for (let i = 0; i < 10; i++) {
        if (b) {
          while (c) {
            if (d && e) {
              return;
            }
          }
        }
      }
    }`;
		const body = parseBody(code);
		const complexity = computeCognitiveComplexity(body);
		expect(complexity).toBeGreaterThan(10);
	});
});

describe("cyclomaticComplexity", () => {
	test("empty function has complexity 1", () => {
		const body = parseBody("return;");
		expect(computeCyclomaticComplexity(body)).toBe(1);
	});

	test("single branch adds 1", () => {
		const body = parseBody("if (x) { return 1; }");
		expect(computeCyclomaticComplexity(body)).toBe(2);
	});

	test("multiple branches accumulate", () => {
		const body = parseBody("if (x) {} if (y) {} if (z) {}");
		expect(computeCyclomaticComplexity(body)).toBe(4);
	});
});
