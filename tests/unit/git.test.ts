import { describe, it, expect } from "bun:test";
import {
  parseGitLog,
  computeChurn,
  computeTemporalCoupling,
  type GitCommit,
} from "../../src/extraction/git";

describe("git log parsing", () => {
  const sampleLog = `abc1234
2026-03-01
alice
src/auth.ts
3	1	src/auth.ts

def5678
2026-03-02
bob
src/auth.ts
src/billing.ts
5	2	src/auth.ts
10	3	src/billing.ts

aaa1111
2026-03-03
alice
src/auth.ts
src/billing.ts
src/utils.ts
1	0	src/auth.ts
2	1	src/billing.ts
0	0	src/utils.ts
`;

  describe("parseGitLog", () => {
    it("parses commits from git log output", () => {
      const commits = parseGitLog(sampleLog);
      expect(commits.length).toBe(3);
    });

    it("extracts correct fields from first commit", () => {
      const commits = parseGitLog(sampleLog);
      expect(commits[0].hash).toBe("abc1234");
      expect(commits[0].date).toBe("2026-03-01");
      expect(commits[0].author).toBe("alice");
      expect(commits[0].files).toEqual(["src/auth.ts"]);
    });

    it("extracts numstat data per file", () => {
      const commits = parseGitLog(sampleLog);
      expect(commits[0].numstat).toEqual([
        { file: "src/auth.ts", added: 3, deleted: 1 },
      ]);
    });

    it("handles multi-file commits", () => {
      const commits = parseGitLog(sampleLog);
      expect(commits[1].files).toEqual(["src/auth.ts", "src/billing.ts"]);
      expect(commits[1].numstat.length).toBe(2);
    });

    it("returns empty array for empty input", () => {
      expect(parseGitLog("")).toEqual([]);
      expect(parseGitLog("\n")).toEqual([]);
    });
  });

  describe("computeChurn", () => {
    it("aggregates churn per file", () => {
      const commits = parseGitLog(sampleLog);
      const churn = computeChurn(commits);

      expect(churn.get("src/auth.ts")).toBeDefined();
      const authChurn = churn.get("src/auth.ts")!;
      expect(authChurn.commits).toBe(3);
      expect(authChurn.authors).toBe(2);
      expect(authChurn.linesAdded).toBe(9);
      expect(authChurn.linesDeleted).toBe(3);
    });

    it("tracks last modified date", () => {
      const commits = parseGitLog(sampleLog);
      const churn = computeChurn(commits);
      expect(churn.get("src/auth.ts")!.lastModified).toBe("2026-03-03");
    });

    it("handles files with single commit", () => {
      const commits = parseGitLog(sampleLog);
      const churn = computeChurn(commits);
      const utilsChurn = churn.get("src/utils.ts")!;
      expect(utilsChurn.commits).toBe(1);
      expect(utilsChurn.authors).toBe(1);
    });
  });

  describe("computeTemporalCoupling", () => {
    it("finds files that co-change", () => {
      const commits = parseGitLog(sampleLog);
      const couplings = computeTemporalCoupling(commits, 1);

      const authBilling = couplings.find(
        (c) =>
          (c.fileA === "src/auth.ts" && c.fileB === "src/billing.ts") ||
          (c.fileA === "src/billing.ts" && c.fileB === "src/auth.ts")
      );
      expect(authBilling).toBeDefined();
      expect(authBilling!.coChangeCount).toBe(2);
    });

    it("computes confidence as coChanges / max(commitsA, commitsB)", () => {
      const commits = parseGitLog(sampleLog);
      const couplings = computeTemporalCoupling(commits, 1);

      const authBilling = couplings.find(
        (c) =>
          (c.fileA === "src/auth.ts" && c.fileB === "src/billing.ts") ||
          (c.fileA === "src/billing.ts" && c.fileB === "src/auth.ts")
      );
      // auth has 3 commits, billing has 2, co-change 2 times
      // confidence = 2 / 3 ≈ 0.667
      expect(authBilling!.confidence).toBeCloseTo(2 / 3, 2);
    });

    it("respects minimum co-change threshold", () => {
      const commits = parseGitLog(sampleLog);
      const couplings = computeTemporalCoupling(commits, 3);
      expect(couplings.length).toBe(0);
    });

    it("returns empty for single-file commits only", () => {
      const singleFileLog = `abc1234
2026-03-01
alice
src/a.ts
1	0	src/a.ts

def5678
2026-03-02
bob
src/b.ts
1	0	src/b.ts
`;
      const commits = parseGitLog(singleFileLog);
      const couplings = computeTemporalCoupling(commits, 1);
      expect(couplings.length).toBe(0);
    });
  });
});
