import { describe, expect, test } from "bun:test";
import path from "path";

describe("file discovery", () => {
  test("findAllFiles returns files once, tagged by language", async () => {
    const { findAllFiles } = await import("../src/multi-extract");
    const root = path.resolve(__dirname, "..");
    const fileMap = findAllFiles(root);

    expect(fileMap.ts.length).toBeGreaterThan(0);

    const allFiles = [...fileMap.ts, ...fileMap.python, ...fileMap.go];
    const uniqueFiles = new Set(allFiles);
    expect(allFiles.length).toBe(uniqueFiles.size);

    for (const f of fileMap.ts) {
      expect(f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx")).toBe(true);
    }
    for (const f of fileMap.python) {
      expect(f.endsWith(".py")).toBe(true);
    }
    for (const f of fileMap.go) {
      expect(f.endsWith(".go")).toBe(true);
    }
  });

  test("findAllFiles excludes node_modules and hidden dirs", async () => {
    const { findAllFiles } = await import("../src/multi-extract");
    const root = path.resolve(__dirname, "..");
    const fileMap = findAllFiles(root);

    const allFiles = [...fileMap.ts, ...fileMap.python, ...fileMap.go];
    for (const f of allFiles) {
      const rel = path.relative(root, f);
      expect(rel).not.toContain("node_modules");
      expect(rel.split(path.sep).some(p => p.startsWith("."))).toBe(false);
    }
  });
});
