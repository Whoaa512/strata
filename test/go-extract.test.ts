import { describe, expect, test } from "bun:test";
import { GoExtractor } from "../src/go-extract";
import fs from "fs";
import path from "path";
import os from "os";

function setup(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "strata-go-"));
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

const extractor = new GoExtractor();

describe("GoExtractor", () => {
  test("extensions", () => {
    expect(extractor.extensions).toEqual([".go"]);
  });

  test("extracts top-level function", () => {
    const dir = setup({
      "main.go": `package main

func greet(name string) string {
	if len(name) > 10 {
		return "Hi"
	}
	return "Hello, " + name
}
`,
    });
    try {
      const files = [path.join(dir, "main.go")];
      const result = extractor.extract(dir, files);
      expect(result.entities.length).toBe(1);
      const e = result.entities[0];
      expect(e.name).toBe("greet");
      expect(e.kind).toBe("function");
      expect(e.filePath).toBe("main.go");
      expect(e.startLine).toBe(3);
      expect(e.endLine).toBe(8);
      expect(e.metrics.parameterCount).toBe(1);
      expect(e.metrics.cyclomatic).toBe(2);
    } finally {
      cleanup(dir);
    }
  });

  test("extracts method with receiver", () => {
    const dir = setup({
      "animal.go": `package main

type Animal struct {
	Name string
}

func (a *Animal) Speak() string {
	return a.Name + " speaks"
}

func (a Animal) GetName() string {
	return a.Name
}
`,
    });
    try {
      const files = [path.join(dir, "animal.go")];
      const result = extractor.extract(dir, files);
      const methods = result.entities.filter((e) => e.kind === "method");
      expect(methods.length).toBe(2);
      expect(methods.map((m) => m.name).sort()).toEqual(["GetName", "Speak"]);
      expect(methods[0].metrics.parameterCount).toBe(0);
    } finally {
      cleanup(dir);
    }
  });

  test("cyclomatic complexity", () => {
    const dir = setup({
      "complex.go": `package main

func process(x int, y int) int {
	if x > 0 {
		return 1
	} else if x < 0 {
		return -1
	}
	for i := 0; i < y; i++ {
		if i > 5 && i < 10 {
			continue
		}
	}
	switch x {
	case 1:
		return 1
	case 2:
		return 2
	}
	return 0
}
`,
    });
    try {
      const files = [path.join(dir, "complex.go")];
      const result = extractor.extract(dir, files);
      const e = result.entities.find((e) => e.name === "process");
      expect(e).toBeDefined();
      // 1(base) + if + else if + for + && + case + case = 7
      expect(e!.metrics.cyclomatic).toBe(7);
      expect(e!.metrics.parameterCount).toBe(2);
    } finally {
      cleanup(dir);
    }
  });

  test("cognitive complexity with nesting", () => {
    const dir = setup({
      "nested.go": `package main

func deep(x int) {
	if x > 0 {
		for i := 0; i < x; i++ {
			if i > 5 {
				for j := 0; j < i; j++ {
					_ = j
				}
			}
		}
	}
}
`,
    });
    try {
      const files = [path.join(dir, "nested.go")];
      const result = extractor.extract(dir, files);
      const e = result.entities.find((e) => e.name === "deep");
      expect(e).toBeDefined();
      // if(1) + for(1+1nest) + if(1+2nest) + for(1+3nest) = 1+2+3+4 = 10
      expect(e!.metrics.cognitive).toBe(10);
      expect(e!.metrics.maxNestingDepth).toBeGreaterThanOrEqual(4);
    } finally {
      cleanup(dir);
    }
  });

  test("call graph", () => {
    const dir = setup({
      "calls.go": `package main

func helper() int {
	return 42
}

func main() {
	x := helper()
	_ = x
}
`,
    });
    try {
      const files = [path.join(dir, "calls.go")];
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

  test("anonymous functions / closures", () => {
    const dir = setup({
      "closure.go": `package main

func outer() func() int {
	inner := func() int {
		return 1
	}
	return inner
}
`,
    });
    try {
      const files = [path.join(dir, "closure.go")];
      const result = extractor.extract(dir, files);
      const names = result.entities.map((e) => e.name);
      expect(names).toContain("outer");
    } finally {
      cleanup(dir);
    }
  });

  test("handles syntax errors gracefully", () => {
    const dir = setup({
      "bad.go": `package main

func broken( {
	return 1
}
`,
    });
    try {
      const files = [path.join(dir, "bad.go")];
      const result = extractor.extract(dir, files);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].filePath).toBe("bad.go");
    } finally {
      cleanup(dir);
    }
  });

  test("multiple files", () => {
    const dir = setup({
      "a.go": `package main

func alpha() int {
	return 1
}
`,
      "pkg/b.go": `package pkg

func Beta() int {
	return 2
}
`,
    });
    try {
      const files = [path.join(dir, "a.go"), path.join(dir, "pkg/b.go")];
      const result = extractor.extract(dir, files);
      expect(result.entities.length).toBe(2);
      const paths = result.entities.map((e) => e.filePath).sort();
      expect(paths).toEqual(["a.go", "pkg/b.go"]);
    } finally {
      cleanup(dir);
    }
  });

  test("init and multiple return values", () => {
    const dir = setup({
      "multi.go": `package main

import "errors"

func divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, errors.New("division by zero")
	}
	return a / b, nil
}
`,
    });
    try {
      const files = [path.join(dir, "multi.go")];
      const result = extractor.extract(dir, files);
      const e = result.entities.find((e) => e.name === "divide");
      expect(e).toBeDefined();
      expect(e!.metrics.parameterCount).toBe(2);
      expect(e!.metrics.cyclomatic).toBe(2);
    } finally {
      cleanup(dir);
    }
  });
});
