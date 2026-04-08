import { describe, expect, test } from "bun:test";
import { buildFlowNeighborhood } from "../src/flow";
import type { Entity, StrataDoc } from "../src/schema";

function makeEntity(id: string, filePath: string): Entity {
  return {
    id,
    name: id.split(":")[1] ?? id,
    kind: "function",
    filePath,
    startLine: 1,
    endLine: 10,
    metrics: { cyclomatic: 1, cognitive: 1, loc: 10, maxNestingDepth: 0, parameterCount: 1 },
  };
}

function makeDoc(overrides: Partial<StrataDoc> = {}): StrataDoc {
  const entities = [
    makeEntity("src/auth.ts:validateToken:1", "src/auth.ts"),
    makeEntity("src/routes.ts:handleAuth:1", "src/routes.ts"),
    makeEntity("src/session.ts:getSession:1", "src/session.ts"),
    makeEntity("src/audit.ts:recordAudit:1", "src/audit.ts"),
  ];

  return {
    version: "0.2.0",
    analyzedAt: "2026-04-07T00:00:00.000Z",
    rootDir: "/tmp/project",
    entities,
    callGraph: [
      { caller: "src/routes.ts:handleAuth:1", callee: "src/auth.ts:validateToken:1" },
      { caller: "src/auth.ts:validateToken:1", callee: "src/session.ts:getSession:1" },
    ],
    churn: [],
    temporalCoupling: [
      { fileA: "src/auth.ts", fileB: "src/audit.ts", cochangeCount: 8, confidence: 0.8, hasStaticDependency: false },
    ],
    hotspots: [],
    blastRadius: [],
    changeRipple: [
      { entityId: "src/auth.ts:validateToken:1", rippleScore: 4, staticDeps: ["src/session.ts"], temporalDeps: ["src/audit.ts"], implicitCouplings: [{ filePath: "src/audit.ts", cochangeRate: 0.8 }], affectedFiles: ["src/session.ts", "src/audit.ts"] },
    ],
    agentRisk: [
      { entityId: "src/auth.ts:validateToken:1", rippleScore: 4, contextCost: 1000, safetyRating: "red", riskFactors: ["implicit coupling"] },
      { entityId: "src/routes.ts:handleAuth:1", rippleScore: 1, contextCost: 300, safetyRating: "yellow", riskFactors: [] },
      { entityId: "src/session.ts:getSession:1", rippleScore: 1, contextCost: 300, safetyRating: "green", riskFactors: [] },
      { entityId: "src/audit.ts:recordAudit:1", rippleScore: 1, contextCost: 300, safetyRating: "yellow", riskFactors: [] },
    ],
    errors: [],
    ...overrides,
  };
}

describe("buildFlowNeighborhood", () => {
  test("returns center, callers, callees, and call edges", () => {
    const flow = buildFlowNeighborhood(makeDoc(), "src/auth.ts:validateToken:1");

    expect(flow.centerId).toBe("src/auth.ts:validateToken:1");
    expect(flow.nodes.map(n => n.id)).toEqual(expect.arrayContaining([
      "src/auth.ts:validateToken:1",
      "src/routes.ts:handleAuth:1",
      "src/session.ts:getSession:1",
    ]));
    expect(flow.nodes.find(n => n.id === "src/routes.ts:handleAuth:1")?.roles).toContain("caller");
    expect(flow.nodes.find(n => n.id === "src/session.ts:getSession:1")?.roles).toContain("callee");
    expect(flow.edges).toContainEqual({ from: "src/routes.ts:handleAuth:1", to: "src/auth.ts:validateToken:1", type: "call", confidence: 1 });
  });

  test("adds implicit temporal edges as dashed flow candidates", () => {
    const flow = buildFlowNeighborhood(makeDoc(), "src/auth.ts:validateToken:1");

    expect(flow.nodes.find(n => n.id === "src/audit.ts:recordAudit:1")?.roles).toContain("implicit");
    expect(flow.edges).toContainEqual({ from: "src/auth.ts:validateToken:1", to: "src/audit.ts:recordAudit:1", type: "temporal", confidence: 0.8 });
  });

  test("uses file nodes when implicit coupling has no extracted entity", () => {
    const doc = makeDoc({
      entities: makeDoc().entities.filter(e => e.filePath !== "src/audit.ts"),
    });
    const flow = buildFlowNeighborhood(doc, "src/auth.ts:validateToken:1");

    expect(flow.nodes.find(n => n.id === "file:src/audit.ts")?.kind).toBe("file");
    expect(flow.edges).toContainEqual({ from: "src/auth.ts:validateToken:1", to: "file:src/audit.ts", type: "temporal", confidence: 0.8 });
  });

  test("respects max node cap", () => {
    const base = makeDoc();
    const extraEntities = Array.from({ length: 20 }, (_, i) => makeEntity(`src/extra${i}.ts:fn${i}:1`, `src/extra${i}.ts`));
    const doc = makeDoc({
      entities: [...base.entities, ...extraEntities],
      callGraph: [
        ...base.callGraph,
        ...extraEntities.map(e => ({ caller: "src/auth.ts:validateToken:1", callee: e.id })),
      ],
    });

    const flow = buildFlowNeighborhood(doc, "src/auth.ts:validateToken:1", { maxNodes: 6 });

    expect(flow.nodes.length).toBeLessThanOrEqual(6);
    expect(flow.truncated).toBe(true);
  });
});
