import { describe, expect, test } from "bun:test";
import { PythonExtractor } from "../src/python-extract";
import fs from "fs";
import path from "path";
import os from "os";

function setupFixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "strata-py-test-"));
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return dir;
}

function cleanFixture(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("python extraction", () => {
  const extractor = new PythonExtractor();

  test("extracts top-level function", () => {
    const dir = setupFixture({
      "hello.py": `def greet(name):
    if len(name) > 10:
        return "Hi"
    return "Hello, " + name
`,
    });
    try {
      const result = extractor.extract(dir, ["hello.py"]);
      expect(result.entities.length).toBe(1);
      const e = result.entities[0];
      expect(e.name).toBe("greet");
      expect(e.kind).toBe("function");
      expect(e.filePath).toBe("hello.py");
      expect(e.metrics.parameterCount).toBe(1);
    } finally {
      cleanFixture(dir);
    }
  });

  test("extracts class and its methods", () => {
    const dir = setupFixture({
      "calc.py": `class Calculator:
    def add(self, a, b):
        return a + b

    def sub(self, a, b):
        return a - b
`,
    });
    try {
      const result = extractor.extract(dir, ["calc.py"]);
      const cls = result.entities.find((e) => e.kind === "class");
      expect(cls).toBeDefined();
      expect(cls!.name).toBe("Calculator");

      const methods = result.entities.filter((e) => e.kind === "method");
      expect(methods.length).toBe(2);
      expect(methods.map((m) => m.name).sort()).toEqual(["add", "sub"]);
      expect(methods[0].metrics.parameterCount).toBe(2);
    } finally {
      cleanFixture(dir);
    }
  });

  test("correct line numbers", () => {
    const dir = setupFixture({
      "lines.py": `# comment
# another comment
def foo():
    pass

def bar():
    x = 1
    return x
`,
    });
    try {
      const result = extractor.extract(dir, ["lines.py"]);
      const foo = result.entities.find((e) => e.name === "foo");
      expect(foo).toBeDefined();
      expect(foo!.startLine).toBe(3);
      expect(foo!.endLine).toBe(4);

      const bar = result.entities.find((e) => e.name === "bar");
      expect(bar).toBeDefined();
      expect(bar!.startLine).toBe(6);
      expect(bar!.endLine).toBe(8);
    } finally {
      cleanFixture(dir);
    }
  });

  test("parameter count excludes self", () => {
    const dir = setupFixture({
      "params.py": `class Foo:
    def method(self, a, b, c):
        pass
`,
    });
    try {
      const result = extractor.extract(dir, ["params.py"]);
      const method = result.entities.find((e) => e.kind === "method");
      expect(method).toBeDefined();
      expect(method!.metrics.parameterCount).toBe(3);
    } finally {
      cleanFixture(dir);
    }
  });

  test("LOC metric", () => {
    const dir = setupFixture({
      "loc.py": `def big_func():
    a = 1
    b = 2
    c = 3
    d = 4
    return a + b + c + d
`,
    });
    try {
      const result = extractor.extract(dir, ["loc.py"]);
      expect(result.entities.length).toBe(1);
      expect(result.entities[0].metrics.loc).toBe(6);
    } finally {
      cleanFixture(dir);
    }
  });

  test("cyclomatic complexity", () => {
    const dir = setupFixture({
      "complex.py": `def check(x, y):
    if x > 0:
        pass
    elif x < 0:
        pass
    else:
        pass
    for i in range(y):
        if i > 5 and x or y:
            pass
    while x:
        x -= 1
    try:
        pass
    except ValueError:
        pass
    except TypeError:
        pass
`,
    });
    try {
      const result = extractor.extract(dir, ["complex.py"]);
      const e = result.entities[0];
      // base 1 + if + elif + for + if + and + or + while + try + except + except = 11
      expect(e.metrics.cyclomatic).toBe(11);
    } finally {
      cleanFixture(dir);
    }
  });

  test("cognitive complexity with nesting", () => {
    const dir = setupFixture({
      "cognitive.py": `def nested(x):
    if x > 0:
        for i in range(x):
            if i > 5:
                pass
`,
    });
    try {
      const result = extractor.extract(dir, ["cognitive.py"]);
      const e = result.entities[0];
      // if (+1, nesting 0) -> for (+1, nesting 1 = +2) -> if (+1, nesting 2 = +3) = 1+2+3 = 6
      expect(e.metrics.cognitive).toBe(6);
    } finally {
      cleanFixture(dir);
    }
  });

  test("call graph edges", () => {
    const dir = setupFixture({
      "calls.py": `def helper():
    return 42

def main():
    x = helper()
    return x
`,
    });
    try {
      const result = extractor.extract(dir, ["calls.py"]);
      expect(result.callGraph.length).toBeGreaterThanOrEqual(1);
      const edge = result.callGraph.find(
        (e) => e.caller.includes("main") && e.callee.includes("helper"),
      );
      expect(edge).toBeDefined();
    } finally {
      cleanFixture(dir);
    }
  });

  test("nested function definitions", () => {
    const dir = setupFixture({
      "nested.py": `def outer():
    def inner():
        return 1
    return inner()
`,
    });
    try {
      const result = extractor.extract(dir, ["nested.py"]);
      const names = result.entities.map((e) => e.name);
      expect(names).toContain("outer");
      expect(names).toContain("inner");
    } finally {
      cleanFixture(dir);
    }
  });

  test("decorated functions", () => {
    const dir = setupFixture({
      "decorated.py": `class Foo:
    @staticmethod
    def static_method(a):
        return a

    @classmethod
    def class_method(cls, b):
        return b
`,
    });
    try {
      const result = extractor.extract(dir, ["decorated.py"]);
      const static_m = result.entities.find(
        (e) => e.name === "static_method",
      );
      expect(static_m).toBeDefined();
      expect(static_m!.kind).toBe("method");
      expect(static_m!.metrics.parameterCount).toBe(1);

      const class_m = result.entities.find((e) => e.name === "class_method");
      expect(class_m).toBeDefined();
      expect(class_m!.metrics.parameterCount).toBe(1);
    } finally {
      cleanFixture(dir);
    }
  });

  test("syntax error produces error entry without crashing", () => {
    const dir = setupFixture({
      "bad.py": `def broken(
    # missing closing paren and colon
    return 1
`,
    });
    try {
      const result = extractor.extract(dir, ["bad.py"]);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0].filePath).toBe("bad.py");
    } finally {
      cleanFixture(dir);
    }
  });

  test("extensions include .py", () => {
    expect(extractor.extensions).toContain(".py");
  });
});
