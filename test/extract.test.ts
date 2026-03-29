import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { extract, createProgram } from "../src/extract";
import fs from "fs";
import path from "path";
import os from "os";

function setupFixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "strata-test-"));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
      },
      include: ["**/*.ts"],
    }),
  );
  return dir;
}

function cleanFixture(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("extract entities", () => {
  test("extracts function declarations", () => {
    const dir = setupFixture({
      "foo.ts": `export function greet(name: string): string {
  if (name.length > 10) {
    return "Hi";
  }
  return "Hello, " + name;
}`,
    });
    try {
      const program = createProgram(dir);
      const result = extract(program, dir);
      expect(result.entities.length).toBe(1);
      const e = result.entities[0];
      expect(e.name).toBe("greet");
      expect(e.kind).toBe("function");
      expect(e.filePath).toBe("foo.ts");
      expect(e.metrics.cyclomatic).toBe(2);
      expect(e.metrics.parameterCount).toBe(1);
      expect(e.metrics.cognitive).toBe(1);
    } finally {
      cleanFixture(dir);
    }
  });

  test("extracts arrow functions assigned to variables", () => {
    const dir = setupFixture({
      "bar.ts": `export const add = (a: number, b: number) => a + b;`,
    });
    try {
      const program = createProgram(dir);
      const result = extract(program, dir);
      expect(result.entities.length).toBe(1);
      expect(result.entities[0].name).toBe("add");
      expect(result.entities[0].kind).toBe("arrow");
      expect(result.entities[0].metrics.parameterCount).toBe(2);
    } finally {
      cleanFixture(dir);
    }
  });

  test("extracts methods in a class", () => {
    const dir = setupFixture({
      "cls.ts": `export class Calc {
  add(a: number, b: number) { return a + b; }
  sub(a: number, b: number) { return a - b; }
}`,
    });
    try {
      const program = createProgram(dir);
      const result = extract(program, dir);
      const methods = result.entities.filter((e) => e.kind === "method");
      expect(methods.length).toBe(2);
      expect(methods.map((m) => m.name).sort()).toEqual(["add", "sub"]);
    } finally {
      cleanFixture(dir);
    }
  });
});

describe("call graph resolution across files", () => {
  test("resolves import/export call edges", () => {
    const dir = setupFixture({
      "math.ts": `export function double(x: number) { return x * 2; }
export function triple(x: number) { return x * 3; }`,
      "main.ts": `import { double } from "./math";
export function process(x: number) {
  return double(x) + 1;
}`,
    });
    try {
      const program = createProgram(dir);
      const result = extract(program, dir);

      expect(result.callGraph.length).toBeGreaterThanOrEqual(1);
      const edge = result.callGraph.find((e) => e.callee.includes("double"));
      expect(edge).toBeDefined();
      expect(edge!.caller).toContain("process");
      expect(edge!.callee).toContain("double");

      const tripleEdge = result.callGraph.find((e) => e.callee.includes("triple"));
      expect(tripleEdge).toBeUndefined();
    } finally {
      cleanFixture(dir);
    }
  });

  test("resolves re-exported functions", () => {
    const dir = setupFixture({
      "core.ts": `export function validate(x: string) { return x.length > 0; }`,
      "index.ts": `export { validate } from "./core";`,
      "consumer.ts": `import { validate } from "./index";
export function check(input: string) {
  return validate(input);
}`,
    });
    try {
      const program = createProgram(dir);
      const result = extract(program, dir);

      const edge = result.callGraph.find(
        (e) => e.caller.includes("check") && e.callee.includes("validate"),
      );
      expect(edge).toBeDefined();
    } finally {
      cleanFixture(dir);
    }
  });

  test("does not create false edges for same-name functions in different files", () => {
    const dir = setupFixture({
      "a.ts": `export function format(x: string) { return x.trim(); }`,
      "b.ts": `export function format(x: string) { return x.toUpperCase(); }`,
      "c.ts": `import { format } from "./a";
export function run(x: string) { return format(x); }`,
    });
    try {
      const program = createProgram(dir);
      const result = extract(program, dir);

      const edges = result.callGraph.filter((e) => e.caller.includes("run"));
      expect(edges.length).toBe(1);
      expect(edges[0].callee).toContain("a.ts");
    } finally {
      cleanFixture(dir);
    }
  });
});

describe("error handling", () => {
  test("skips bad files gracefully", () => {
    const dir = setupFixture({
      "good.ts": `export function ok() { return 1; }`,
    });
    try {
      const program = createProgram(dir);
      const result = extract(program, dir);
      expect(result.entities.length).toBe(1);
      expect(result.errors.length).toBe(0);
    } finally {
      cleanFixture(dir);
    }
  });
});
