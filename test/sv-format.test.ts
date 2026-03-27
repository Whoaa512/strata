import { describe, expect, test } from "bun:test";
import { CodeGraph } from "../src/graph";
import { buildStrataView, type StrataView } from "../src/sv-format";

describe("sv format", () => {
  test("produces valid structure", () => {
    const g = new CodeGraph();
    g.addEntity({
      id: "file:test.ts::foo",
      kind: "function",
      name: "foo",
      filePath: "test.ts",
      startLine: 1,
      endLine: 5,
      metrics: { cognitiveComplexity: 3, churn: 2 },
    });

    const sv = buildStrataView(
      g,
      "/tmp/repo",
      [
        {
          entity: g.getEntity("file:test.ts::foo")!,
          complexity: 3,
          churn: 2,
          score: 6,
        },
      ],
      [],
      [],
    );

    expect(sv.version).toBe("0.1.0");
    expect(sv.repoPath).toBe("/tmp/repo");
    expect(sv.entities.length).toBe(1);
    expect(sv.hotspots.length).toBe(1);
    expect(sv.hotspots[0].score).toBe(6);

    const json = JSON.stringify(sv);
    const parsed: StrataView = JSON.parse(json);
    expect(parsed.version).toBe("0.1.0");
  });

  test("serializes temporal couplings", () => {
    const g = new CodeGraph();
    const sv = buildStrataView(g, "/tmp/repo", [], [], [
      {
        fileA: "src/a.ts",
        fileB: "src/b.ts",
        cochanges: 5,
        totalChanges: 10,
        strength: 1.0,
      },
    ]);

    expect(sv.temporalCouplings.length).toBe(1);
    expect(sv.temporalCouplings[0].strength).toBe(1.0);
  });
});
