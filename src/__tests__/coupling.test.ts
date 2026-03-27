import { describe, test, expect } from "bun:test";
import { computeTemporalCoupling } from "../coupling";
import type { CallEdge } from "../types";

describe("temporal coupling", () => {
  test("detects co-changing files", () => {
    const commits = [
      ["a.ts", "b.ts"],
      ["a.ts", "b.ts"],
      ["a.ts", "b.ts"],
      ["a.ts", "c.ts"],
      ["c.ts", "d.ts"],
    ];

    const couplings = computeTemporalCoupling(commits, [], 3, 0.25);
    expect(couplings.length).toBe(1);
    expect(couplings[0].file1).toBe("a.ts");
    expect(couplings[0].file2).toBe("b.ts");
    expect(couplings[0].cochangeCount).toBe(3);
    expect(couplings[0].confidence).toBeGreaterThan(0.5);
  });

  test("filters by minimum cochanges", () => {
    const commits = [
      ["a.ts", "b.ts"],
      ["a.ts", "b.ts"],
      ["a.ts", "c.ts"],
    ];

    const couplings = computeTemporalCoupling(commits, [], 3, 0.1);
    expect(couplings.length).toBe(0);
  });

  test("filters by minimum confidence", () => {
    const commits = [
      ["a.ts", "b.ts"],
      ["a.ts", "b.ts"],
      ["a.ts", "b.ts"],
      ["a.ts"],
      ["a.ts"],
      ["a.ts"],
      ["a.ts"],
      ["a.ts"],
      ["a.ts"],
      ["a.ts"],
    ];

    // a.ts has 10 commits, b.ts has 3, cochange=3
    // confidence = 3/10 = 0.3
    const high = computeTemporalCoupling(commits, [], 3, 0.5);
    expect(high.length).toBe(0);

    const low = computeTemporalCoupling(commits, [], 3, 0.25);
    expect(low.length).toBe(1);
  });

  test("marks static dependencies", () => {
    const commits = [
      ["a.ts", "b.ts"],
      ["a.ts", "b.ts"],
      ["a.ts", "b.ts"],
    ];

    const edges: CallEdge[] = [
      { caller: "foo", callee: "bar", callerFile: "a.ts", calleeFile: "b.ts" },
    ];

    const couplings = computeTemporalCoupling(commits, edges, 3, 0.25);
    expect(couplings[0].hasStaticDependency).toBe(true);
  });

  test("filters non-TS/JS files", () => {
    const commits = [
      ["a.ts", "readme.md"],
      ["a.ts", "readme.md"],
      ["a.ts", "readme.md"],
    ];

    const couplings = computeTemporalCoupling(commits, [], 3, 0.25);
    expect(couplings.length).toBe(0);
  });

  test("sorts by confidence descending", () => {
    const commits: string[][] = [];
    // a-b: 5 cochanges out of 5 total each = 100% confidence
    for (let i = 0; i < 5; i++) commits.push(["a.ts", "b.ts"]);
    // c-d: 3 cochanges out of 10 total for c = 30% confidence
    for (let i = 0; i < 3; i++) commits.push(["c.ts", "d.ts"]);
    for (let i = 0; i < 7; i++) commits.push(["c.ts"]);

    const couplings = computeTemporalCoupling(commits, [], 3, 0.25);
    expect(couplings.length).toBe(2);
    expect(couplings[0].confidence).toBeGreaterThan(couplings[1].confidence);
  });
});
