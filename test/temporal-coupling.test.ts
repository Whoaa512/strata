import { describe, expect, it } from "bun:test";
import { temporalCouplingPlugin } from "../src/plugins/temporal-coupling";
import type { AnalysisContext, GitCommit } from "../src/types";

function makeCtx(
  files: string[],
  commits: { files: string[] }[]
): AnalysisContext {
  return {
    repoPath: "/tmp/test",
    files: files.map((f) => ({
      path: `/tmp/test/${f}`,
      relativePath: f,
      content: "",
    })),
    parser: { parseTS: () => null, parseJS: () => null },
    gitLog: commits.map((c, i) => ({
      hash: `${i}`,
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      author: "dev",
      files: c.files,
    })),
  };
}

describe("temporal-coupling plugin", () => {
  it("finds files that frequently co-change", async () => {
    const ctx = makeCtx(
      ["src/a.ts", "src/b.ts", "src/c.ts"],
      [
        { files: ["src/a.ts", "src/b.ts"] },
        { files: ["src/a.ts", "src/b.ts"] },
        { files: ["src/a.ts", "src/b.ts"] },
        { files: ["src/a.ts", "src/c.ts"] },
      ]
    );

    const result = await temporalCouplingPlugin.analyze(ctx);
    const edges = result.edges!;

    expect(edges.length).toBe(1);
    expect(edges[0].weight).toBe(3);

    const files = [edges[0].source, edges[0].target].sort();
    expect(files).toEqual(["file::src/a.ts", "file::src/b.ts"]);
  });

  it("excludes pairs with fewer than 3 co-changes", async () => {
    const ctx = makeCtx(
      ["src/a.ts", "src/b.ts"],
      [
        { files: ["src/a.ts", "src/b.ts"] },
        { files: ["src/a.ts", "src/b.ts"] },
      ]
    );

    const result = await temporalCouplingPlugin.analyze(ctx);
    expect(result.edges!).toHaveLength(0);
  });

  it("ignores large commits (>20 files) as noise", async () => {
    const manyFiles = Array.from({ length: 25 }, (_, i) => `src/f${i}.ts`);
    const ctx = makeCtx(manyFiles, [
      { files: manyFiles },
      { files: manyFiles },
      { files: manyFiles },
    ]);

    const result = await temporalCouplingPlugin.analyze(ctx);
    expect(result.edges!).toHaveLength(0);
  });

  it("sorts results by weight descending", async () => {
    const ctx = makeCtx(
      ["src/a.ts", "src/b.ts", "src/c.ts"],
      [
        { files: ["src/a.ts", "src/b.ts"] },
        { files: ["src/a.ts", "src/b.ts"] },
        { files: ["src/a.ts", "src/b.ts"] },
        { files: ["src/b.ts", "src/c.ts"] },
        { files: ["src/b.ts", "src/c.ts"] },
        { files: ["src/b.ts", "src/c.ts"] },
        { files: ["src/b.ts", "src/c.ts"] },
        { files: ["src/b.ts", "src/c.ts"] },
      ]
    );

    const result = await temporalCouplingPlugin.analyze(ctx);
    const edges = result.edges!;

    expect(edges.length).toBe(2);
    expect(edges[0].weight!).toBeGreaterThan(edges[1].weight!);
  });

  it("only counts files that exist in the repo", async () => {
    const ctx = makeCtx(
      ["src/a.ts", "src/b.ts"],
      [
        { files: ["src/a.ts", "src/b.ts", "deleted-file.ts"] },
        { files: ["src/a.ts", "src/b.ts", "deleted-file.ts"] },
        { files: ["src/a.ts", "src/b.ts", "deleted-file.ts"] },
      ]
    );

    const result = await temporalCouplingPlugin.analyze(ctx);
    expect(result.edges!).toHaveLength(1);
  });
});
