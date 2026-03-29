import { describe, expect, test } from "bun:test";
import { StrataDocSchema, EntitySchema, MetricsSchema } from "../src/schema";

describe("MetricsSchema", () => {
  test("accepts valid metrics", () => {
    const result = MetricsSchema.safeParse({
      cyclomatic: 5,
      cognitive: 3,
      loc: 20,
      maxNestingDepth: 2,
      parameterCount: 3,
    });
    expect(result.success).toBe(true);
  });

  test("rejects negative values", () => {
    const result = MetricsSchema.safeParse({
      cyclomatic: -1,
      cognitive: 3,
      loc: 20,
      maxNestingDepth: 2,
      parameterCount: 3,
    });
    expect(result.success).toBe(false);
  });
});

describe("EntitySchema", () => {
  test("accepts valid entity", () => {
    const result = EntitySchema.safeParse({
      id: "src/foo.ts:doThing:5",
      name: "doThing",
      kind: "function",
      filePath: "src/foo.ts",
      startLine: 5,
      endLine: 15,
      metrics: {
        cyclomatic: 3,
        cognitive: 2,
        loc: 10,
        maxNestingDepth: 1,
        parameterCount: 2,
      },
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid kind", () => {
    const result = EntitySchema.safeParse({
      id: "x",
      name: "x",
      kind: "lambda",
      filePath: "x.ts",
      startLine: 1,
      endLine: 1,
      metrics: {
        cyclomatic: 0,
        cognitive: 0,
        loc: 1,
        maxNestingDepth: 0,
        parameterCount: 0,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("StrataDocSchema", () => {
  test("accepts minimal valid doc", () => {
    const result = StrataDocSchema.safeParse({
      version: "0.1.0",
      analyzedAt: "2026-03-28T00:00:00.000Z",
      rootDir: "/tmp/project",
      entities: [],
      callGraph: [],
      churn: [],
      temporalCoupling: [],
      hotspots: [],
      blastRadius: [],
      errors: [],
    });
    expect(result.success).toBe(true);
  });

  test("rejects wrong version", () => {
    const result = StrataDocSchema.safeParse({
      version: "0.2.0",
      analyzedAt: "2026-03-28T00:00:00.000Z",
      rootDir: "/tmp/project",
      entities: [],
      callGraph: [],
      churn: [],
      temporalCoupling: [],
      hotspots: [],
      blastRadius: [],
      errors: [],
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing fields", () => {
    const result = StrataDocSchema.safeParse({
      version: "0.1.0",
    });
    expect(result.success).toBe(false);
  });
});
