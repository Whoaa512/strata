import { describe, expect, test } from "bun:test";
import { computeTemporalCoupling, type CommitInfo } from "../src/git";

describe("temporal coupling", () => {
  test("finds co-changing files", () => {
    const commits: CommitInfo[] = [
      { hash: "a1", date: "2024-01-01", files: ["src/a.ts", "src/b.ts"] },
      { hash: "a2", date: "2024-01-02", files: ["src/a.ts", "src/b.ts"] },
      { hash: "a3", date: "2024-01-03", files: ["src/a.ts", "src/b.ts"] },
      { hash: "a4", date: "2024-01-04", files: ["src/c.ts"] },
    ];

    const couplings = computeTemporalCoupling(commits, new Set([".ts"]), 3);
    expect(couplings.length).toBe(1);
    expect(couplings[0].fileA).toBe("src/a.ts");
    expect(couplings[0].fileB).toBe("src/b.ts");
    expect(couplings[0].cochanges).toBe(3);
    expect(couplings[0].strength).toBe(1);
  });

  test("filters by minimum cochanges", () => {
    const commits: CommitInfo[] = [
      { hash: "a1", date: "2024-01-01", files: ["src/a.ts", "src/b.ts"] },
      { hash: "a2", date: "2024-01-02", files: ["src/a.ts", "src/b.ts"] },
    ];

    const couplings = computeTemporalCoupling(commits, new Set([".ts"]), 3);
    expect(couplings.length).toBe(0);
  });

  test("filters by extension", () => {
    const commits: CommitInfo[] = [
      { hash: "a1", date: "2024-01-01", files: ["src/a.ts", "README.md"] },
      { hash: "a2", date: "2024-01-02", files: ["src/a.ts", "README.md"] },
      { hash: "a3", date: "2024-01-03", files: ["src/a.ts", "README.md"] },
    ];

    const couplings = computeTemporalCoupling(commits, new Set([".ts"]), 3);
    expect(couplings.length).toBe(0);
  });

  test("strength computation", () => {
    const commits: CommitInfo[] = [
      { hash: "a1", date: "2024-01-01", files: ["src/a.ts", "src/b.ts"] },
      { hash: "a2", date: "2024-01-02", files: ["src/a.ts", "src/b.ts"] },
      { hash: "a3", date: "2024-01-03", files: ["src/a.ts", "src/b.ts"] },
      { hash: "a4", date: "2024-01-04", files: ["src/a.ts"] },
      { hash: "a5", date: "2024-01-05", files: ["src/b.ts"] },
    ];

    const couplings = computeTemporalCoupling(commits, new Set([".ts"]), 3);
    expect(couplings.length).toBe(1);
    // a has 4 changes, b has 4 changes, 3 co-changes
    // strength = 2*3 / (4+4) = 0.75
    expect(couplings[0].strength).toBe(0.75);
  });

  test("sorts by strength descending", () => {
    const commits: CommitInfo[] = [];
    for (let i = 0; i < 5; i++) {
      commits.push({ hash: `h${i}`, date: `2024-01-0${i+1}`, files: ["src/a.ts", "src/b.ts", "src/c.ts"] });
    }
    // Add extra commits for a alone to lower its coupling strength with b
    for (let i = 0; i < 10; i++) {
      commits.push({ hash: `x${i}`, date: `2024-02-0${i+1}`, files: ["src/a.ts"] });
    }

    const couplings = computeTemporalCoupling(commits, new Set([".ts"]), 3);
    // b-c coupling should be stronger than a-b or a-c
    const bcCoupling = couplings.find(
      (c) => (c.fileA === "src/b.ts" && c.fileB === "src/c.ts")
    );
    expect(bcCoupling).toBeDefined();
    expect(couplings[0].strength).toBeGreaterThanOrEqual(couplings[couplings.length - 1].strength);
  });
});
