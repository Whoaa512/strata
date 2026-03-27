import { describe, test, expect } from "bun:test";
import { buildReport } from "../report";
import type { FunctionInfo, Hotspot, BlastRadius, TemporalCoupling, CallEdge } from "../types";

describe("report builder", () => {
  test("builds valid .sv report", () => {
    const fns: FunctionInfo[] = [
      { name: "foo", filePath: "a.ts", startLine: 1, endLine: 10, complexity: 5, nestingDepth: 2, paramCount: 1, lineCount: 10 },
    ];

    const hotspots: Hotspot[] = [
      { filePath: "a.ts", functionName: "foo", startLine: 1, complexity: 5, churn: 10, score: 0.5 },
    ];

    const blastRadii: BlastRadius[] = [
      { entity: "foo", filePath: "a.ts", forwardSlice: ["a.ts:bar"], forwardFileSlice: ["a.ts"], fanOut: 1, fanIn: 0, testCoverageGap: true, riskScore: 0.3 },
    ];

    const couplings: TemporalCoupling[] = [
      { file1: "a.ts", file2: "b.ts", cochangeCount: 5, totalCommits1: 10, totalCommits2: 8, confidence: 0.5, hasStaticDependency: false },
    ];

    const edges: CallEdge[] = [
      { caller: "foo", callee: "bar", callerFile: "a.ts", calleeFile: "a.ts" },
    ];

    const report = buildReport("/test", fns, hotspots, blastRadii, couplings, edges, 2);

    expect(report.version).toBe("0.1.0");
    expect(report.analyzedFiles).toBe(2);
    expect(report.totalFunctions).toBe(1);
    expect(report.hotspots.length).toBe(1);
    expect(report.blastRadii.length).toBe(1);
    expect(report.temporalCouplings.length).toBe(1);
    expect(report.entities.length).toBe(2); // 1 fn + 1 file
    expect(report.edges.length).toBe(2); // 1 call + 1 co_changes_with
    expect(report.metrics.length).toBe(1);

    const json = JSON.stringify(report);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe("0.1.0");
  });
});
