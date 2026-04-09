import { describe, expect, test } from "bun:test";
import { renderDiffAnalysis } from "../src/diff-render";
import type { DiffAnalysis } from "../src/diff";

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("renderDiffAnalysis", () => {
  test("renders test confidence, boundary crossings, and changed entity names", () => {
    const analysis: DiffAnalysis = {
      changedFiles: [{ filePath: "src/auth.ts", status: "modified" }],
      changedEntities: [
        { id: "src/auth.ts:validateToken:1", name: "validateToken", kind: "function", filePath: "src/auth.ts", startLine: 1, endLine: 10, metrics: { cyclomatic: 1, cognitive: 1, loc: 10, maxNestingDepth: 0, parameterCount: 1 } },
        { id: "src/auth.ts:refreshSession:20", name: "refreshSession", kind: "function", filePath: "src/auth.ts", startLine: 20, endLine: 30, metrics: { cyclomatic: 1, cognitive: 1, loc: 11, maxNestingDepth: 0, parameterCount: 1 } },
      ],
      missedFiles: [],
      missedTests: [],
      affectedCallers: [],
      shapeDelta: {
        changedFileCount: 1,
        affectedFileCount: 3,
        attention: "YELLOW",
        testConfidence: "PARTIAL",
        testRecommendations: ["test/auth.test.ts"],
        uncoveredRipple: ["src/session.ts"],
        boundaryCrossings: ["src -> test"],
        invariantHints: [],
        affectedDirs: ["src", "test"],
        runtimeHints: ["runtime path hint: src/auth.ts"],
        changedPackages: ["src"],
        affectedPackages: ["src", "test"],
        changedRisk: { red: 1, yellow: 0, green: 1 },
        affectedRisk: { red: 1, yellow: 1, green: 1 },
        shapeMovements: ["ripple widened beyond changed files", "crossed package boundary: src -> test", "weak tests in affected zone"],
        why: ["test confidence partial: affected ripple tests still need review"],
        likelyMissed: [],
        reviewFocus: ["Add/update tests covering affected ripple zone"],
        runtimeImpacts: [],
        dataImpacts: [],
        summary: {
          changedFiles: ["src/auth.ts"],
          affectedFiles: ["src/auth.ts", "test/auth.test.ts"],
          affectedDirs: ["src", "test"],
          changedPackages: ["src"],
          affectedPackages: ["src", "test"],
          hiddenCouplings: [],
          uncoveredRipple: ["src/session.ts"],
          testConfidence: "PARTIAL",
          invariantHints: [],
          runtimeHints: ["runtime path hint: src/auth.ts"],
          boundaryCrossings: ["src -> test"],
          reviewFocus: ["Add/update tests covering affected ripple zone"],
        },
      },
    };

    const output = stripAnsi(renderDiffAnalysis(analysis, "HEAD~1"));

    expect(output).toContain("Test confidence: PARTIAL");
    expect(output).toContain("Consider running/updating likely guard tests: test/auth.test.ts");
    expect(output).toContain("Affected files with no likely guard test: src/session.ts");
    expect(output).toContain("Boundary crossings: src -> test");
    expect(output).toContain("Changed packages: src");
    expect(output).toContain("Affected packages: src, test");
    expect(output).toContain("Affected dirs: src, test");
    expect(output).toContain("Changed risk: 1 red, 0 yellow, 1 green");
    expect(output).toContain("Affected risk: 1 red, 1 yellow, 1 green");
    expect(output).toContain("ripple widened beyond changed files");
    expect(output).toContain("runtime path hint: src/auth.ts");
    expect(output).toContain("src/auth.ts: validateToken, refreshSession");
  });

  test("renders runtime and data impacts when present", () => {
    const analysis: DiffAnalysis = {
      changedFiles: [{ filePath: "src/order.ts", status: "modified" }],
      changedEntities: [],
      missedFiles: [],
      missedTests: [],
      affectedCallers: [],
      shapeDelta: {
        changedFileCount: 1,
        affectedFileCount: 1,
        attention: "YELLOW",
        testConfidence: "UNKNOWN",
        testRecommendations: [],
        uncoveredRipple: [],
        boundaryCrossings: [],
        invariantHints: [],
        affectedDirs: ["src"],
        runtimeHints: [],
        changedPackages: [],
        affectedPackages: [],
        changedRisk: { red: 0, yellow: 0, green: 0 },
        affectedRisk: { red: 0, yellow: 0, green: 0 },
        shapeMovements: ["runtime path touched: POST /api/orders"],
        why: ["runtime path touched: 1 entrypoint affected"],
        likelyMissed: [],
        reviewFocus: ["Verify runtime entrypoints still behave correctly"],
        runtimeImpacts: [
          { kind: "http", route: "/api/orders", method: "POST", entrypointId: "ep1", confidence: 0.9, evidence: "express route" },
        ],
        dataImpacts: [
          { kind: "db-write", target: "orders", entityId: "src/order.ts:create:1", confidence: 0.85, evidence: "prisma.orders.create" },
          { kind: "publish", target: "order.created", entityId: "src/order.ts:create:1", confidence: 0.8, evidence: "emit order.created" },
          { kind: "db-read", target: "users", entityId: "src/order.ts:create:1", confidence: 0.7, evidence: "prisma.users.findFirst" },
        ],
        summary: {
          changedFiles: ["src/order.ts"],
          affectedFiles: ["src/order.ts"],
          affectedDirs: ["src"],
          changedPackages: [],
          affectedPackages: [],
          hiddenCouplings: [],
          uncoveredRipple: [],
          testConfidence: "UNKNOWN",
          invariantHints: [],
          runtimeHints: [],
          boundaryCrossings: [],
          reviewFocus: ["Verify runtime entrypoints still behave correctly"],
        },
      },
    };

    const output = stripAnsi(renderDiffAnalysis(analysis, "HEAD~1"));

    expect(output).toContain("Runtime/data impacts:");
    expect(output).toContain("http POST /api/orders");
    expect(output).toContain("90%");
    expect(output).toContain("express route");
    expect(output).toContain("db-write");
    expect(output).toContain("orders");
    expect(output).toContain("publish");
    expect(output).toContain("order.created");
    expect(output).toContain("db-read");
    expect(output).toContain("users");
  });

  test("does not render runtime/data impacts when absent", () => {
    const analysis: DiffAnalysis = {
      changedFiles: [{ filePath: "src/util.ts", status: "modified" }],
      changedEntities: [],
      missedFiles: [],
      missedTests: [],
      affectedCallers: [],
      shapeDelta: {
        changedFileCount: 1,
        affectedFileCount: 1,
        attention: "GREEN",
        testConfidence: "UNKNOWN",
        testRecommendations: [],
        uncoveredRipple: [],
        boundaryCrossings: [],
        invariantHints: [],
        affectedDirs: ["src"],
        runtimeHints: [],
        changedPackages: [],
        affectedPackages: [],
        changedRisk: { red: 0, yellow: 0, green: 0 },
        affectedRisk: { red: 0, yellow: 0, green: 0 },
        shapeMovements: [],
        why: [],
        likelyMissed: [],
        reviewFocus: ["Review changed files for local correctness"],
        runtimeImpacts: [],
        dataImpacts: [],
        summary: {
          changedFiles: ["src/util.ts"],
          affectedFiles: ["src/util.ts"],
          affectedDirs: ["src"],
          changedPackages: [],
          affectedPackages: [],
          hiddenCouplings: [],
          uncoveredRipple: [],
          testConfidence: "UNKNOWN",
          invariantHints: [],
          runtimeHints: [],
          boundaryCrossings: [],
          reviewFocus: ["Review changed files for local correctness"],
        },
      },
    };

    const output = stripAnsi(renderDiffAnalysis(analysis, "HEAD~1"));
    expect(output).not.toContain("Runtime/data impacts:");
  });
});
