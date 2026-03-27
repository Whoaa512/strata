import { describe, it, expect } from "bun:test";
import {
  StrataDocumentSchema,
  EntitySchema,
  EdgeSchema,
  HotspotSchema,
  BlastRadiusSchema,
  TemporalCouplingSchema,
  MetricsSchema,
  ChurnDataSchema,
  type StrataDocument,
  type Entity,
} from "../../src/schema";

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "file.ts::myFunc",
    name: "myFunc",
    kind: "function",
    location: { file: "file.ts", startLine: 1, endLine: 10 },
    metrics: {
      cognitiveComplexity: 5,
      nestingDepth: 2,
      lineCount: 10,
      fanIn: 1,
      fanOut: 2,
    },
    ...overrides,
  };
}

function makeDocument(overrides: Partial<StrataDocument> = {}): StrataDocument {
  return {
    version: "0.1.0",
    repository: "/tmp/test-repo",
    analyzedAt: "2026-03-27T00:00:00Z",
    entities: [makeEntity()],
    edges: [],
    hotspots: [],
    blastRadii: [],
    temporalCouplings: [],
    ...overrides,
  };
}

describe(".sv schema validation", () => {
  describe("StrataDocument", () => {
    it("accepts a valid minimal document", () => {
      const result = StrataDocumentSchema.safeParse(makeDocument());
      expect(result.success).toBe(true);
    });

    it("rejects missing version", () => {
      const { version, ...rest } = makeDocument();
      const result = StrataDocumentSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("rejects wrong version string", () => {
      const result = StrataDocumentSchema.safeParse(
        makeDocument({ version: "2.0.0" as any })
      );
      expect(result.success).toBe(false);
    });

    it("requires repository path", () => {
      const { repository, ...rest } = makeDocument();
      const result = StrataDocumentSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("requires analyzedAt timestamp", () => {
      const { analyzedAt, ...rest } = makeDocument();
      const result = StrataDocumentSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("accepts empty arrays for optional sections", () => {
      const result = StrataDocumentSchema.safeParse(
        makeDocument({
          entities: [],
          edges: [],
          hotspots: [],
          blastRadii: [],
          temporalCouplings: [],
        })
      );
      expect(result.success).toBe(true);
    });
  });

  describe("Entity", () => {
    it("accepts valid function entity", () => {
      const result = EntitySchema.safeParse(makeEntity());
      expect(result.success).toBe(true);
    });

    it("accepts all entity kinds", () => {
      for (const kind of [
        "function",
        "class",
        "method",
        "module",
        "file",
      ] as const) {
        const result = EntitySchema.safeParse(makeEntity({ kind }));
        expect(result.success).toBe(true);
      }
    });

    it("rejects unknown entity kind", () => {
      const result = EntitySchema.safeParse(
        makeEntity({ kind: "banana" as any })
      );
      expect(result.success).toBe(false);
    });

    it("rejects negative complexity", () => {
      const result = EntitySchema.safeParse(
        makeEntity({
          metrics: {
            cognitiveComplexity: -1,
            nestingDepth: 0,
            lineCount: 1,
            fanIn: 0,
            fanOut: 0,
          },
        })
      );
      expect(result.success).toBe(false);
    });

    it("rejects zero lineCount", () => {
      const result = EntitySchema.safeParse(
        makeEntity({
          metrics: {
            cognitiveComplexity: 0,
            nestingDepth: 0,
            lineCount: 0,
            fanIn: 0,
            fanOut: 0,
          },
        })
      );
      expect(result.success).toBe(false);
    });

    it("accepts optional churn data", () => {
      const result = EntitySchema.safeParse(
        makeEntity({
          churn: {
            commits: 10,
            authors: 3,
            lastModified: "2026-03-27",
            linesAdded: 100,
            linesDeleted: 50,
          },
        })
      );
      expect(result.success).toBe(true);
    });

    it("accepts optional metrics fields", () => {
      const result = EntitySchema.safeParse(
        makeEntity({
          metrics: {
            cognitiveComplexity: 5,
            cyclomaticComplexity: 3,
            nestingDepth: 2,
            parameterCount: 4,
            lineCount: 10,
            fanIn: 1,
            fanOut: 2,
          },
        })
      );
      expect(result.success).toBe(true);
    });
  });

  describe("Edge", () => {
    it("accepts valid call edge", () => {
      const result = EdgeSchema.safeParse({
        source: "a.ts::foo",
        target: "b.ts::bar",
        kind: "calls",
      });
      expect(result.success).toBe(true);
    });

    it("accepts all edge kinds", () => {
      for (const kind of [
        "calls",
        "depends_on",
        "contains",
        "co_changes_with",
      ] as const) {
        const result = EdgeSchema.safeParse({
          source: "a",
          target: "b",
          kind,
        });
        expect(result.success).toBe(true);
      }
    });

    it("accepts optional weight", () => {
      const result = EdgeSchema.safeParse({
        source: "a",
        target: "b",
        kind: "calls",
        weight: 0.75,
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative weight", () => {
      const result = EdgeSchema.safeParse({
        source: "a",
        target: "b",
        kind: "calls",
        weight: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Hotspot", () => {
    it("accepts valid hotspot", () => {
      const result = HotspotSchema.safeParse({
        entityId: "file.ts::fn",
        score: 50,
        complexity: 10,
        churn: 5,
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative score", () => {
      const result = HotspotSchema.safeParse({
        entityId: "x",
        score: -1,
        complexity: 0,
        churn: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("BlastRadius", () => {
    it("accepts valid blast radius", () => {
      const result = BlastRadiusSchema.safeParse({
        entityId: "file.ts::fn",
        forwardSlice: ["a.ts::bar", "b.ts::baz"],
        testCoverage: 0.8,
        changeCoupling: ["c.ts"],
        contributorCount: 3,
        riskScore: 12.5,
      });
      expect(result.success).toBe(true);
    });

    it("rejects test coverage > 1", () => {
      const result = BlastRadiusSchema.safeParse({
        entityId: "x",
        forwardSlice: [],
        testCoverage: 1.5,
        changeCoupling: [],
        contributorCount: 0,
        riskScore: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects test coverage < 0", () => {
      const result = BlastRadiusSchema.safeParse({
        entityId: "x",
        forwardSlice: [],
        testCoverage: -0.1,
        changeCoupling: [],
        contributorCount: 0,
        riskScore: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("TemporalCoupling", () => {
    it("accepts valid coupling pair", () => {
      const result = TemporalCouplingSchema.safeParse({
        fileA: "auth.ts",
        fileB: "billing.ts",
        coChangeCount: 8,
        totalCommits: 20,
        confidence: 0.4,
        hasStaticDependency: false,
      });
      expect(result.success).toBe(true);
    });

    it("rejects zero coChangeCount", () => {
      const result = TemporalCouplingSchema.safeParse({
        fileA: "a",
        fileB: "b",
        coChangeCount: 0,
        totalCommits: 1,
        confidence: 0,
        hasStaticDependency: false,
      });
      expect(result.success).toBe(false);
    });

    it("rejects confidence > 1", () => {
      const result = TemporalCouplingSchema.safeParse({
        fileA: "a",
        fileB: "b",
        coChangeCount: 1,
        totalCommits: 1,
        confidence: 1.1,
        hasStaticDependency: false,
      });
      expect(result.success).toBe(false);
    });

    it("requires hasStaticDependency boolean", () => {
      const result = TemporalCouplingSchema.safeParse({
        fileA: "a",
        fileB: "b",
        coChangeCount: 1,
        totalCommits: 1,
        confidence: 0.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("round-trip serialization", () => {
    it("survives JSON.stringify → JSON.parse → validate", () => {
      const doc = makeDocument({
        entities: [
          makeEntity(),
          makeEntity({
            id: "file.ts::otherFn",
            name: "otherFn",
            kind: "method",
          }),
        ],
        edges: [
          {
            source: "file.ts::myFunc",
            target: "file.ts::otherFn",
            kind: "calls",
          },
        ],
        hotspots: [
          {
            entityId: "file.ts::myFunc",
            score: 25,
            complexity: 5,
            churn: 5,
          },
        ],
        blastRadii: [
          {
            entityId: "file.ts::myFunc",
            forwardSlice: ["file.ts::otherFn"],
            testCoverage: 0.5,
            changeCoupling: [],
            contributorCount: 2,
            riskScore: 8.0,
          },
        ],
        temporalCouplings: [
          {
            fileA: "auth.ts",
            fileB: "billing.ts",
            coChangeCount: 5,
            totalCommits: 20,
            confidence: 0.25,
            hasStaticDependency: false,
          },
        ],
      });

      const json = JSON.stringify(doc);
      const parsed = JSON.parse(json);
      const result = StrataDocumentSchema.safeParse(parsed);
      expect(result.success).toBe(true);
    });
  });
});
