import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ts from "typescript";
import { computeCognitiveComplexity, extractFromRepo } from "../src/extract.js";

function complexityOf(code: string): number {
	const sourceFile = ts.createSourceFile(
		"test.ts",
		code,
		ts.ScriptTarget.ESNext,
		true,
	);

	let result = 0;
	ts.forEachChild(sourceFile, (node) => {
		if (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) {
			if (ts.isVariableStatement(node)) {
				const decl = node.declarationList.declarations[0];
				if (
					decl?.initializer &&
					(ts.isArrowFunction(decl.initializer) ||
						ts.isFunctionExpression(decl.initializer))
				) {
					result = computeCognitiveComplexity(decl.initializer, sourceFile);
					return;
				}
			}
			result = computeCognitiveComplexity(node, sourceFile);
		}
	});
	return result;
}

describe("computeCognitiveComplexity", () => {
	test("empty function = 0", () => {
		expect(complexityOf("function foo() {}")).toBe(0);
	});

	test("single if = 1", () => {
		expect(complexityOf("function foo(x: boolean) { if (x) {} }")).toBe(1);
	});

	test("if-else = 2 (if + else)", () => {
		expect(complexityOf("function foo(x: boolean) { if (x) {} else {} }")).toBe(
			2,
		);
	});

	test("if-else if-else = 3", () => {
		expect(
			complexityOf(
				"function foo(x: number) { if (x > 0) {} else if (x < 0) {} else {} }",
			),
		).toBe(3);
	});

	test("nested if = 1 + (1+1) = 3", () => {
		expect(
			complexityOf(
				"function foo(a: boolean, b: boolean) { if (a) { if (b) {} } }",
			),
		).toBe(3);
	});

	test("for loop = 1", () => {
		expect(
			complexityOf(
				"function foo(arr: number[]) { for (let i = 0; i < arr.length; i++) {} }",
			),
		).toBe(1);
	});

	test("logical operators add 1 each", () => {
		expect(
			complexityOf("function foo(a: boolean, b: boolean) { if (a && b) {} }"),
		).toBe(2);
	});

	test("switch = 1", () => {
		expect(
			complexityOf(
				'function foo(x: string) { switch(x) { case "a": break; } }',
			),
		).toBe(1);
	});

	test("ternary = 1 + nesting", () => {
		expect(complexityOf("function foo(x: boolean) { return x ? 1 : 2; }")).toBe(
			1,
		);
	});

	test("try-catch adds 1 for catch", () => {
		expect(complexityOf("function foo() { try {} catch(e) {} }")).toBe(1);
	});
});

describe("extractFromRepo", () => {
	let tmpDir: string;

	async function setup(files: Record<string, string>): Promise<string> {
		tmpDir = await mkdtemp(join(tmpdir(), "strata-test-"));
		for (const [name, content] of Object.entries(files)) {
			const filePath = join(tmpDir, name);
			const dir = filePath.substring(0, filePath.lastIndexOf("/"));
			await mkdir(dir, { recursive: true });
			await writeFile(filePath, content);
		}
		return tmpDir;
	}

	test("extracts functions from a simple file", async () => {
		const dir = await setup({
			"src/math.ts": `
export function add(a: number, b: number): number {
	return a + b;
}

export function complexCalc(x: number): number {
	if (x > 0) {
		if (x > 100) {
			return x * 2;
		}
		return x + 1;
	}
	return 0;
}
`,
		});

		const result = extractFromRepo(dir);

		expect(result.length).toBe(2);

		const add = result.find((f) => f.name === "add");
		expect(add).toBeDefined();
		expect(add?.complexity).toBe(0);
		expect(add?.parameterCount).toBe(2);
		expect(add?.isExported).toBe(true);

		const complex = result.find((f) => f.name === "complexCalc");
		expect(complex).toBeDefined();
		expect(complex?.complexity).toBeGreaterThan(0);
		expect(complex?.parameterCount).toBe(1);

		await rm(tmpDir, { recursive: true });
	});

	test("extracts arrow functions", async () => {
		const dir = await setup({
			"src/util.ts": `
export const greet = (name: string): string => {
	if (name.length === 0) {
		return "anonymous";
	}
	return \`hello \${name}\`;
};
`,
		});

		const result = extractFromRepo(dir);
		const greet = result.find((f) => f.name === "greet");
		expect(greet).toBeDefined();
		expect(greet?.complexity).toBe(1);

		await rm(tmpDir, { recursive: true });
	});

	test("extracts class methods with class prefix", async () => {
		const dir = await setup({
			"src/service.ts": `
export class UserService {
	getUser(id: string) {
		return { id };
	}
	deleteUser(id: string) {
		if (!id) throw new Error("no id");
		return true;
	}
}
`,
		});

		const result = extractFromRepo(dir);

		const getUser = result.find((f) => f.name === "UserService.getUser");
		expect(getUser).toBeDefined();
		expect(getUser?.complexity).toBe(0);

		const deleteUser = result.find((f) => f.name === "UserService.deleteUser");
		expect(deleteUser).toBeDefined();
		expect(deleteUser?.complexity).toBe(1);

		await rm(tmpDir, { recursive: true });
	});

	test("identifies test files", async () => {
		const dir = await setup({
			"src/math.ts":
				"export function add(a: number, b: number) { return a + b; }",
			"test/math.test.ts": `
import { add } from "../src/math";
function testAdd() { add(1, 2); }
`,
		});

		const result = extractFromRepo(dir);
		const testFn = result.find((f) => f.isTestFile);
		expect(testFn).toBeDefined();
		expect(testFn?.filePath).toContain("test/");

		await rm(tmpDir, { recursive: true });
	});

	test("resolves call targets across files", async () => {
		const dir = await setup({
			"src/helpers.ts": "export function helper() { return 42; }",
			"src/main.ts": `
import { helper } from "./helpers";
export function main() { return helper(); }
`,
			"tsconfig.json": JSON.stringify({
				compilerOptions: {
					target: "ESNext",
					module: "ESNext",
					moduleResolution: "bundler",
					strict: true,
					noEmit: true,
				},
				include: ["src/**/*.ts"],
			}),
		});

		const result = extractFromRepo(dir);
		const mainFn = result.find((f) => f.name === "main");
		expect(mainFn).toBeDefined();
		expect(mainFn?.calls.length).toBeGreaterThan(0);
		expect(mainFn?.calls.some((c) => c.includes("helper"))).toBe(true);

		await rm(tmpDir, { recursive: true });
	});
});
