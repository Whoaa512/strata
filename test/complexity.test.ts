import { beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import Parser from "web-tree-sitter";
import {
	computeCognitiveComplexity,
	computeMaxNesting,
	extractFunctions,
} from "../src/core/complexity";

let tsParser: Parser;

beforeAll(async () => {
	await Parser.init();
	tsParser = new Parser();
	const wasmPath = path.join(
		import.meta.dir,
		"..",
		"node_modules",
		"tree-sitter-wasms",
		"out",
		"tree-sitter-typescript.wasm",
	);
	const tsLang = await Parser.Language.load(wasmPath);
	tsParser.setLanguage(tsLang);
});

function parseTS(code: string): Parser.Tree {
	return tsParser.parse(code);
}

describe("computeCognitiveComplexity", () => {
	test("simple function has 0 complexity", () => {
		const tree = parseTS(`function add(a: number, b: number) { return a + b; }`);
		const body = tree.rootNode.namedChildren[0].childForFieldName("body")!;
		expect(computeCognitiveComplexity(body)).toBe(0);
	});

	test("single if adds 1", () => {
		const tree = parseTS(`function f(x: number) { if (x > 0) { return x; } return 0; }`);
		const body = tree.rootNode.namedChildren[0].childForFieldName("body")!;
		expect(computeCognitiveComplexity(body)).toBe(1);
	});

	test("if-else adds 2 (1 for if + 1 for else)", () => {
		const tree = parseTS(`function f(x: number) { if (x > 0) { return 1; } else { return 0; } }`);
		const body = tree.rootNode.namedChildren[0].childForFieldName("body")!;
		expect(computeCognitiveComplexity(body)).toBe(2);
	});

	test("nested if adds nesting penalty", () => {
		const code = `function f(x: number, y: number) {
			if (x > 0) {
				if (y > 0) {
					return 1;
				}
			}
			return 0;
		}`;
		const tree = parseTS(code);
		const body = tree.rootNode.namedChildren[0].childForFieldName("body")!;
		const complexity = computeCognitiveComplexity(body);
		expect(complexity).toBe(3);
	});

	test("for loop adds complexity", () => {
		const code = `function f(items: number[]) {
			for (let i = 0; i < items.length; i++) {
				if (items[i] > 0) { break; }
			}
		}`;
		const tree = parseTS(code);
		const body = tree.rootNode.namedChildren[0].childForFieldName("body")!;
		const complexity = computeCognitiveComplexity(body);
		expect(complexity).toBeGreaterThanOrEqual(3);
	});

	test("boolean operator sequences", () => {
		const code = `function f(a: boolean, b: boolean, c: boolean) {
			if (a && b && c) { return 1; }
			return 0;
		}`;
		const tree = parseTS(code);
		const body = tree.rootNode.namedChildren[0].childForFieldName("body")!;
		const complexity = computeCognitiveComplexity(body);
		expect(complexity).toBeGreaterThanOrEqual(2);
	});

	test("mixed boolean operators count changes", () => {
		const code = `function f(a: boolean, b: boolean, c: boolean) {
			if (a && b || c) { return 1; }
			return 0;
		}`;
		const tree = parseTS(code);
		const body = tree.rootNode.namedChildren[0].childForFieldName("body")!;
		const complexity = computeCognitiveComplexity(body);
		expect(complexity).toBeGreaterThanOrEqual(3);
	});
});

describe("computeMaxNesting", () => {
	test("flat function has depth 0", () => {
		const tree = parseTS(`function f() { return 1; }`);
		const body = tree.rootNode.namedChildren[0].childForFieldName("body")!;
		expect(computeMaxNesting(body)).toBe(0);
	});

	test("single if has depth 1", () => {
		const tree = parseTS(`function f(x: number) { if (x > 0) { return x; } }`);
		const body = tree.rootNode.namedChildren[0].childForFieldName("body")!;
		expect(computeMaxNesting(body)).toBe(1);
	});

	test("nested structures increase depth", () => {
		const code = `function f(items: number[]) {
			for (const item of items) {
				if (item > 0) {
					while (true) { break; }
				}
			}
		}`;
		const tree = parseTS(code);
		const body = tree.rootNode.namedChildren[0].childForFieldName("body")!;
		expect(computeMaxNesting(body)).toBe(3);
	});
});

describe("extractFunctions", () => {
	test("extracts named function declarations", () => {
		const code = `function hello() { return "hi"; }
function world(a: number, b: string) { return a; }`;
		const tree = parseTS(code);
		const fns = extractFunctions(tree.rootNode, "test.ts");

		expect(fns.length).toBe(2);
		expect(fns[0].name).toBe("hello");
		expect(fns[0].parameterCount).toBe(0);
		expect(fns[1].name).toBe("world");
		expect(fns[1].parameterCount).toBe(2);
	});

	test("extracts arrow functions assigned to variables", () => {
		const code = `const greet = (name: string) => { return "hi " + name; };`;
		const tree = parseTS(code);
		const fns = extractFunctions(tree.rootNode, "test.ts");

		expect(fns.length).toBe(1);
		expect(fns[0].name).toBe("greet");
		expect(fns[0].parameterCount).toBe(1);
	});

	test("extracts callees", () => {
		const code = `function process(items: string[]) {
			const result = transform(items);
			return format(result);
		}`;
		const tree = parseTS(code);
		const fns = extractFunctions(tree.rootNode, "test.ts");

		expect(fns[0].callees.sort()).toEqual(["format", "transform"]);
	});

	test("extracts method calls as callees", () => {
		const code = `function process(items: string[]) {
			items.forEach(item => console.log(item));
		}`;
		const tree = parseTS(code);
		const fns = extractFunctions(tree.rootNode, "test.ts");

		const topFn = fns.find((f) => f.name === "process")!;
		expect(topFn.callees).toContain("forEach");
		expect(topFn.callees).toContain("log");
	});

	test("computes line count", () => {
		const code = `function multi(
	a: number,
	b: number
) {
	return a + b;
}`;
		const tree = parseTS(code);
		const fns = extractFunctions(tree.rootNode, "test.ts");
		expect(fns[0].lineCount).toBe(6);
	});
});
