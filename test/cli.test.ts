import { describe, expect, test } from "bun:test";
import path from "path";

const rootDir = path.resolve(import.meta.dir, "..");

describe("cli", () => {
  test("brief accepts a file path without explicit root", () => {
    const proc = Bun.spawnSync(["bun", "src/cli.ts", "brief", "src/diff.ts"], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("STRATA BRIEFING");
    expect(proc.stdout.toString()).toContain("src/diff.ts");
  });
});
