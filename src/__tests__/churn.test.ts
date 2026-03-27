import { describe, test, expect } from "bun:test";
import { parseGitLog, computeChurn, getCommitFileSets } from "../churn";
import { execSync } from "child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function createTestRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "strata-test-"));
  execSync("git init", { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });

  writeFileSync(join(dir, "a.ts"), "const a = 1;\n");
  writeFileSync(join(dir, "b.ts"), "const b = 2;\n");
  execSync("git add -A && git commit -m 'init'", { cwd: dir });

  writeFileSync(join(dir, "a.ts"), "const a = 1;\nconst a2 = 2;\n");
  execSync("git add -A && git commit -m 'update a'", { cwd: dir });

  writeFileSync(join(dir, "a.ts"), "const a = 1;\nconst a2 = 2;\nconst a3 = 3;\n");
  writeFileSync(join(dir, "b.ts"), "const b = 2;\nconst b2 = 3;\n");
  execSync("git add -A && git commit -m 'update both'", { cwd: dir });

  writeFileSync(join(dir, "a.ts"), "export const a = 1;\nexport const a2 = 2;\nexport const a3 = 3;\nexport const a4 = 4;\n");
  execSync("git add -A && git commit -m 'refactor a'", { cwd: dir });

  return dir;
}

describe("churn", () => {
  let repoDir: string;

  test("parseGitLog extracts commits and files", () => {
    repoDir = createTestRepo();
    const entries = parseGitLog(repoDir, 12);
    expect(entries.length).toBe(4);
    expect(entries[0].author).toBe("Test");
    expect(entries[0].files.length).toBeGreaterThan(0);
  });

  test("computeChurn aggregates per-file stats", () => {
    const churn = computeChurn(repoDir, 12);
    const aChurn = churn.get("a.ts");
    expect(aChurn).toBeDefined();
    expect(aChurn!.commits).toBe(4);
    expect(aChurn!.authors.size).toBe(1);

    const bChurn = churn.get("b.ts");
    expect(bChurn).toBeDefined();
    expect(bChurn!.commits).toBe(2);
  });

  test("getCommitFileSets returns file groups per commit", () => {
    const sets = getCommitFileSets(repoDir, 12);
    expect(sets.length).toBe(4);
    const bothChanged = sets.find((s) => s.includes("a.ts") && s.includes("b.ts"));
    expect(bothChanged).toBeDefined();
  });

  test("cleanup", () => {
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
  });
});
