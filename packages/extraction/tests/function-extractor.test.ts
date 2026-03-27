import { beforeAll, describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "web-tree-sitter";
import { extractFunctions } from "../src/function-extractor.js";

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

function parse(code: string) {
	return extractFunctions(parser.parse(code), "test.ts");
}

describe("function extractor", () => {
	test("extracts named function declaration", () => {
		const result = parse("function greet(name: string) { return name; }");
		expect(result.functions).toHaveLength(1);
		expect(result.functions[0].name).toBe("greet");
		expect(result.functions[0].params).toEqual(["name"]);
	});

	test("extracts arrow function in variable", () => {
		const result = parse("const add = (a: number, b: number) => a + b;");
		expect(result.functions).toHaveLength(1);
		expect(result.functions[0].name).toBe("add");
		expect(result.functions[0].params).toEqual(["a", "b"]);
	});

	test("extracts class methods", () => {
		const result = parse(`
			class Foo {
				bar() { return 1; }
				baz(x: number) { return x; }
			}
		`);
		const methods = result.functions.filter((f) => f.isMethod);
		expect(methods).toHaveLength(2);
		expect(methods[0].name).toBe("bar");
		expect(methods[0].className).toBe("Foo");
		expect(methods[1].name).toBe("baz");
	});

	test("detects exported functions", () => {
		const result = parse("export function hello() {} function internal() {}");
		const exported = result.functions.filter((f) => f.isExported);
		expect(exported).toHaveLength(1);
		expect(exported[0].name).toBe("hello");
	});

	test("extracts call edges", () => {
		const result = parse(`
			function caller() {
				foo();
				bar(1, 2);
				obj.method();
			}
		`);
		expect(result.calls.length).toBeGreaterThanOrEqual(3);
		const callees = result.calls.map((c) => c.callee);
		expect(callees).toContain("foo");
		expect(callees).toContain("bar");
		expect(callees).toContain("obj.method");
	});

	test("handles multiple functions", () => {
		const result = parse(`
			function a() { b(); }
			function b() { return 1; }
			const c = () => a();
		`);
		expect(result.functions).toHaveLength(3);
		expect(result.calls.length).toBeGreaterThanOrEqual(2);
	});

	test("tracks line numbers", () => {
		const result = parse(`function foo() {
  return 1;
}

function bar() {
  return 2;
}`);
		expect(result.functions[0].startLine).toBe(1);
		expect(result.functions[1].startLine).toBe(5);
	});
});
