import { describe, expect, test } from "bun:test";
import { analyze } from "../src/analyze";
import { StrataDocSchema } from "../src/schema";
import path from "path";

const rootDir = path.resolve(import.meta.dir, "..");

describe("integration: self-analyze strata", () => {
  const doc = analyze(rootDir);

  test("produces schema-valid output", () => {
    const result = StrataDocSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  test("finds entities in src/", () => {
    const srcEntities = doc.entities.filter((e) => e.filePath.startsWith("src/"));
    expect(srcEntities.length).toBeGreaterThan(10);
  });

  test("finds call edges", () => {
    expect(doc.callGraph.length).toBeGreaterThan(5);
  });

  test("computes churn data", () => {
    expect(doc.churn.length).toBeGreaterThan(0);
  });

  test("computes hotspots", () => {
    expect(doc.hotspots.length).toBeGreaterThan(0);
    for (const h of doc.hotspots) {
      expect(h.score).toBeGreaterThan(0);
    }
  });

  test("computes blast radius for functions with callers", () => {
    expect(doc.blastRadius.length).toBeGreaterThan(0);
    const top = doc.blastRadius[0];
    expect(top.radius).toBeGreaterThan(0);
  });

  test("cognitive complexity of computeCognitive is high", () => {
    const cogFn = doc.entities.find(
      (e) => e.name === "computeCognitive" && e.filePath.includes("cognitive"),
    );
    expect(cogFn).toBeDefined();
    expect(cogFn!.metrics.cognitive).toBeGreaterThan(20);
  });

  test("no errors on own source", () => {
    expect(doc.errors.length).toBe(0);
  });
});
