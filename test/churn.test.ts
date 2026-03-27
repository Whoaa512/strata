import { describe, expect, it } from "bun:test";
import { churnPlugin } from "../src/plugins/churn";
import type { AnalysisContext, GitCommit } from "../src/types";

function makeCtx(
  files: { path: string; content: string }[],
  gitLog: GitCommit[]
): AnalysisContext {
  return {
    repoPath: "/tmp/test",
    files: files.map((f) => ({
      path: `/tmp/test/${f.path}`,
      relativePath: f.path,
      content: f.content,
    })),
    parser: { parseTS: () => null, parseJS: () => null },
    gitLog,
  };
}

describe("churn plugin", () => {
  it("counts file changes from git log", async () => {
    const ctx = makeCtx(
      [{ path: "src/a.ts", content: "" }, { path: "src/b.ts", content: "" }],
      [
        { hash: "1", date: "2024-01-01", author: "A", files: ["src/a.ts"] },
        { hash: "2", date: "2024-01-02", author: "A", files: ["src/a.ts", "src/b.ts"] },
        { hash: "3", date: "2024-01-03", author: "B", files: ["src/a.ts"] },
      ]
    );

    const result = await churnPlugin.analyze(ctx);

    const aEntity = result.entities!.find((e) => e.name === "src/a.ts");
    const bEntity = result.entities!.find((e) => e.name === "src/b.ts");

    expect(aEntity!.metrics.churn).toBe(3);
    expect(bEntity!.metrics.churn).toBe(1);
  });

  it("returns 0 churn for files not in git log", async () => {
    const ctx = makeCtx(
      [{ path: "src/new.ts", content: "" }],
      [{ hash: "1", date: "2024-01-01", author: "A", files: ["src/other.ts"] }]
    );

    const result = await churnPlugin.analyze(ctx);
    expect(result.entities![0].metrics.churn).toBe(0);
  });
});
