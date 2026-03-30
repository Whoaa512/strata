import { describe, expect, test } from "bun:test";
import { PythonExtractor } from "../src/python-extract";
import fs from "fs";
import path from "path";
import os from "os";

function setup(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "strata-py-"));
  for (const [name, content] of Object.entries(files)) {
    const fp = path.join(dir, name);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content);
  }
  return dir;
}

function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const extractor = new PythonExtractor();

describe("PythonExtractor", () => {
  test("extensions", () => {
    expect(extractor.extensions).toEqual([".py"]);
  });

  test("extracts top-level function", () => {
    const dir = setup({
      "hello.py": `def greet(name):
    if len(name) > 10:
        return "Hi"
    return "Hello, " + name
`,
    });
    try {
      const files = [path.join(dir, "hello.py")];
      const result = extractor.extract(dir, files);
      expect(result.entities.length).toBe(1);
      const e = result.entities[0];
      expect(e.name).toBe("greet");
      expect(e.kind).toBe("function");
      expect(e.filePath).toBe("hello.py");
      expect(e.startLine).toBe(1);
      expect(e.endLine).toBe(4);
      expect(e.metrics.parameterCount).toBe(1);
      expect(e.metrics.loc).toBe(4);
      expect(e.metrics.cyclomatic).toBe(2);
    } finally {
      cleanup(dir);
    }
  });

  test("extracts class and methods", () => {
    const dir = setup({
      "animal.py": `class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        return self.name + " speaks"
`,
    });
    try {
      const files = [path.join(dir, "animal.py")];
      const result = extractor.extract(dir, files);
      const cls = result.entities.find((e) => e.kind === "class");
      expect(cls).toBeDefined();
      expect(cls!.name).toBe("Animal");
      expect(cls!.startLine).toBe(1);

      const methods = result.entities.filter((e) => e.kind === "method");
      expect(methods.length).toBe(2);
      const init = methods.find((e) => e.name === "__init__");
      expect(init).toBeDefined();
      expect(init!.metrics.parameterCount).toBe(2);

      const speak = methods.find((e) => e.name === "speak");
      expect(speak).toBeDefined();
      expect(speak!.metrics.parameterCount).toBe(1);
    } finally {
      cleanup(dir);
    }
  });

  test("cyclomatic complexity", () => {
    const dir = setup({
      "complex.py": `def process(x, y):
    if x > 0:
        pass
    elif x < 0:
        pass
    for i in range(y):
        if i > 5 and i < 10:
            pass
    while x > 0:
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
      const files = [path.join(dir, "complex.py")];
      const result = extractor.extract(dir, files);
      const e = result.entities.find((e) => e.name === "process");
      expect(e).toBeDefined();
      // 1 (base) + if + elif + for + and + while + except + except = 8
      expect(e!.metrics.cyclomatic).toBe(8);
      expect(e!.metrics.parameterCount).toBe(2);
    } finally {
      cleanup(dir);
    }
  });

  test("cognitive complexity with nesting", () => {
    const dir = setup({
      "nested.py": `def deep(x):
    if x > 0:
        for i in range(x):
            if i > 5:
                while True:
                    break
`,
    });
    try {
      const files = [path.join(dir, "nested.py")];
      const result = extractor.extract(dir, files);
      const e = result.entities.find((e) => e.name === "deep");
      expect(e).toBeDefined();
      // cognitive: if(1) + for(1+1nest) + if(1+2nest) + while(1+3nest) = 1+2+3+4 = 10
      expect(e!.metrics.cognitive).toBe(10);
      expect(e!.metrics.maxNestingDepth).toBeGreaterThanOrEqual(4);
    } finally {
      cleanup(dir);
    }
  });

  test("call graph", () => {
    const dir = setup({
      "calls.py": `def helper():
    return 42

def main():
    x = helper()
    return x
`,
    });
    try {
      const files = [path.join(dir, "calls.py")];
      const result = extractor.extract(dir, files);
      expect(result.entities.length).toBe(2);
      expect(result.callGraph.length).toBe(1);
      const edge = result.callGraph[0];
      expect(edge.caller).toContain("main");
      expect(edge.callee).toContain("helper");
    } finally {
      cleanup(dir);
    }
  });

  test("nested functions", () => {
    const dir = setup({
      "outer.py": `def outer():
    def inner():
        return 1
    return inner()
`,
    });
    try {
      const files = [path.join(dir, "outer.py")];
      const result = extractor.extract(dir, files);
      const names = result.entities.map((e) => e.name);
      expect(names).toContain("outer");
      expect(names).toContain("inner");
    } finally {
      cleanup(dir);
    }
  });

  test("decorated functions", () => {
    const dir = setup({
      "deco.py": `class Foo:
    @staticmethod
    def bar():
        return 1

    @classmethod
    def baz(cls):
        return 2
`,
    });
    try {
      const files = [path.join(dir, "deco.py")];
      const result = extractor.extract(dir, files);
      const methods = result.entities.filter((e) => e.kind === "method");
      expect(methods.length).toBe(2);
      expect(methods.map((m) => m.name).sort()).toEqual(["bar", "baz"]);
    } finally {
      cleanup(dir);
    }
  });

  test("handles syntax errors gracefully", () => {
    const dir = setup({
      "bad.py": `def broken(
    # missing closing paren and colon
    return 1
`,
    });
    try {
      const files = [path.join(dir, "bad.py")];
      const result = extractor.extract(dir, files);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].filePath).toBe("bad.py");
    } finally {
      cleanup(dir);
    }
  });

  test("multiple files", () => {
    const dir = setup({
      "a.py": `def alpha():
    return 1
`,
      "pkg/b.py": `def beta():
    return 2
`,
    });
    try {
      const files = [path.join(dir, "a.py"), path.join(dir, "pkg/b.py")];
      const result = extractor.extract(dir, files);
      expect(result.entities.length).toBe(2);
      const paths = result.entities.map((e) => e.filePath).sort();
      expect(paths).toEqual(["a.py", "pkg/b.py"]);
    } finally {
      cleanup(dir);
    }
  });
});
