import { describe, expect, test } from "bun:test";
import { extractAll } from "../src/multi-extract";
import fs from "fs";
import path from "path";
import os from "os";

function setup(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "strata-multi-"));
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

describe("multi-language extraction", () => {
  test("extracts from mixed TS + Python + Go project", () => {
    const dir = setup({
      "tsconfig.json": JSON.stringify({
        compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true },
        include: ["**/*.ts"],
      }),
      "app.ts": `export function serve(port: number): void {
  console.log("listening on " + port);
}
`,
      "utils.py": `def helper():
    return 42
`,
      "cmd/main.go": `package main

func run() {
    return
}
`,
    });
    try {
      const result = extractAll(dir);
      const names = result.entities.map((e) => e.name).sort();
      expect(names).toContain("serve");
      expect(names).toContain("helper");
      expect(names).toContain("run");
      expect(result.entities.length).toBeGreaterThanOrEqual(3);

      const tsPaths = result.entities.filter((e) => e.filePath.endsWith(".ts"));
      const pyPaths = result.entities.filter((e) => e.filePath.endsWith(".py"));
      const goPaths = result.entities.filter((e) => e.filePath.endsWith(".go"));
      expect(tsPaths.length).toBeGreaterThanOrEqual(1);
      expect(pyPaths.length).toBeGreaterThanOrEqual(1);
      expect(goPaths.length).toBeGreaterThanOrEqual(1);
    } finally {
      cleanup(dir);
    }
  });

  test("works with Python-only project", () => {
    const dir = setup({
      "main.py": `def main():
    return 0
`,
    });
    try {
      const result = extractAll(dir);
      expect(result.entities.length).toBe(1);
      expect(result.entities[0].name).toBe("main");
    } finally {
      cleanup(dir);
    }
  });

  test("works with Go-only project", () => {
    const dir = setup({
      "main.go": `package main

func main() {
    return
}
`,
    });
    try {
      const result = extractAll(dir);
      expect(result.entities.length).toBe(1);
      expect(result.entities[0].name).toBe("main");
    } finally {
      cleanup(dir);
    }
  });

  test("skips node_modules and hidden dirs", () => {
    const dir = setup({
      "main.py": `def ok():
    pass
`,
      "node_modules/dep/index.py": `def bad():
    pass
`,
      ".hidden/secret.py": `def hidden():
    pass
`,
    });
    try {
      const result = extractAll(dir);
      expect(result.entities.length).toBe(1);
      expect(result.entities[0].name).toBe("ok");
    } finally {
      cleanup(dir);
    }
  });
});
