import { beforeAll, describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "web-tree-sitter";
import { computeCognitiveComplexity } from "../src/cognitive-complexity.js";

const thisDir = dirname(fileURLToPath(import.meta.url));
const wasmPath = resolve(
	thisDir,
	"..",
	"node_modules",
	"tree-sitter-wasms",
	"out",
	"tree-sitter-typescript.wasm",
);

let parser: Parser;

beforeAll(async () => {
	await Parser.init();
	parser = new Parser();
	const lang = await Parser.Language.load(wasmPath);
	parser.setLanguage(lang);
});

function getFirstFunction(code: string): Parser.SyntaxNode {
	const tree = parser.parse(code);
	const root = tree.rootNode;

	function find(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
		if (
			node.type === "function_declaration" ||
			node.type === "arrow_function" ||
			node.type === "method_definition"
		) {
			return node;
		}
		for (const child of node.namedChildren) {
			const found = find(child);
			if (found) return found;
		}
		return null;
	}

	const fn = find(root);
	if (!fn) throw new Error("No function found in code");
	return fn;
}

describe("cognitive complexity", () => {
	test("empty function has 0 complexity", () => {
		const fn = getFirstFunction("function foo() {}");
		const result = computeCognitiveComplexity(fn, "test:foo:1");
		expect(result.score).toBe(0);
	});

	test("single if adds 1", () => {
		const fn = getFirstFunction(
			"function foo(x: number) { if (x > 0) { return x; } return 0; }",
		);
		const result = computeCognitiveComplexity(fn, "test:foo:1");
		expect(result.score).toBe(1);
	});

	test("nested if adds nesting penalty", () => {
		const fn = getFirstFunction(`
			function foo(x: number, y: number) {
				if (x > 0) {
					if (y > 0) {
						return x + y;
					}
				}
				return 0;
			}
		`);
		const result = computeCognitiveComplexity(fn, "test:foo:1");
		// outer if: +1 (0 nesting)
		// inner if: +1 +1 nesting = +2
		expect(result.score).toBe(3);
		expect(result.nestingContributions).toBe(1);
	});

	test("else clause adds 1", () => {
		const fn = getFirstFunction(`
			function foo(x: number) {
				if (x > 0) {
					return 1;
				} else {
					return 0;
				}
			}
		`);
		const result = computeCognitiveComplexity(fn, "test:foo:1");
		// if: +1, else: +1
		expect(result.score).toBe(2);
	});

	test("else if does not add nesting", () => {
		const fn = getFirstFunction(`
			function foo(x: number) {
				if (x > 0) {
					return 1;
				} else if (x < 0) {
					return -1;
				} else {
					return 0;
				}
			}
		`);
		const result = computeCognitiveComplexity(fn, "test:foo:1");
		// if: +1, else if: +1 (else) +1 (if) = +2, else: +1
		expect(result.score).toBe(4);
	});

	test("for loop with nested if", () => {
		const fn = getFirstFunction(`
			function foo(arr: number[]) {
				for (const x of arr) {
					if (x > 0) {
						return x;
					}
				}
			}
		`);
		const result = computeCognitiveComplexity(fn, "test:foo:1");
		// for: +1 (0 nesting), if: +1 +1 nesting = +2
		expect(result.score).toBe(3);
	});

	test("boolean operator sequences", () => {
		const fn = getFirstFunction(`
			function foo(a: boolean, b: boolean, c: boolean) {
				if (a && b && c) {
					return true;
				}
				return false;
			}
		`);
		const result = computeCognitiveComplexity(fn, "test:foo:1");
		// if: +1, && chain (all same op): +1
		expect(result.score).toBe(2);
	});

	test("mixed boolean operators add per switch", () => {
		const fn = getFirstFunction(`
			function foo(a: boolean, b: boolean, c: boolean) {
				if (a && b || c) {
					return true;
				}
				return false;
			}
		`);
		const result = computeCognitiveComplexity(fn, "test:foo:1");
		// if: +1, && then ||: +2 (two switches)
		expect(result.score).toBe(3);
	});

	test("ternary adds 1 + nesting", () => {
		const fn = getFirstFunction(`
			function foo(x: number) {
				if (x > 10) {
					return x > 20 ? 'high' : 'mid';
				}
				return 'low';
			}
		`);
		const result = computeCognitiveComplexity(fn, "test:foo:1");
		// if: +1, ternary: +1 +1 nesting = +2
		expect(result.score).toBe(3);
	});

	test("while loop", () => {
		const fn = getFirstFunction(`
			function foo(x: number) {
				while (x > 0) {
					x--;
				}
				return x;
			}
		`);
		const result = computeCognitiveComplexity(fn, "test:foo:1");
		expect(result.score).toBe(1);
	});

	test("switch with cases", () => {
		const fn = getFirstFunction(`
			function foo(x: string) {
				switch (x) {
					case 'a': return 1;
					case 'b': return 2;
					default: return 0;
				}
			}
		`);
		const result = computeCognitiveComplexity(fn, "test:foo:1");
		// each case: +1 +0 nesting (switch itself is nesting, cases increment)
		// Note: switch_case nodes include default
		expect(result.score).toBeGreaterThanOrEqual(2);
	});

	test("try-catch", () => {
		const fn = getFirstFunction(`
			function foo() {
				try {
					doSomething();
				} catch (e) {
					handleError(e);
				}
			}
		`);
		const result = computeCognitiveComplexity(fn, "test:foo:1");
		// catch: +1
		expect(result.score).toBe(1);
	});
});
