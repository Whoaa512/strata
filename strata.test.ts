import { describe, test, expect, beforeAll } from "bun:test";
import Parser from "web-tree-sitter";
import { resolve, join, dirname } from "path";
import { readFileSync } from "fs";
import {
  computeCognitiveComplexity,
  extractFunctions,
  computeHotspots,
  computeBlastRadii,
  computeTemporalCoupling,
  getFileChurn,
  getCommitFiles,
  buildSvDocument,
  analyzeFile,
} from "./strata";

const ROOT = dirname(import.meta.path);
let parser: Parser;
let tsLang: Parser.Language;
let jsLang: Parser.Language;
let tsxLang: Parser.Language;

beforeAll(async () => {
  const parserWasm = resolve(ROOT, "node_modules/web-tree-sitter/tree-sitter.wasm");
  const wasmDir = resolve(ROOT, "node_modules/tree-sitter-wasms/out");

  await Parser.init({ locateFile: () => parserWasm });
  parser = new Parser();

  tsLang = await Parser.Language.load(join(wasmDir, "tree-sitter-typescript.wasm"));
  jsLang = await Parser.Language.load(join(wasmDir, "tree-sitter-javascript.wasm"));
  tsxLang = await Parser.Language.load(join(wasmDir, "tree-sitter-tsx.wasm"));
});

function parse(source: string, lang: Parser.Language): Parser.Tree {
  parser.setLanguage(lang);
  return parser.parse(source);
}

// ─── Cognitive Complexity Tests ─────────────────────────────────────────────

describe("computeCognitiveComplexity", () => {
  test("simple function has 0 complexity", () => {
    const tree = parse("function add(a, b) { return a + b; }", tsLang);
    const fn = tree.rootNode.children[0]!;
    const body = fn.childForFieldName("body")!;
    expect(computeCognitiveComplexity(body)).toBe(0);
  });

  test("single if adds 1", () => {
    const tree = parse("function f(x) { if (x) { return 1; } return 0; }", tsLang);
    const fn = tree.rootNode.children[0]!;
    const body = fn.childForFieldName("body")!;
    expect(computeCognitiveComplexity(body)).toBe(1);
  });

  test("nested if adds nesting penalty", () => {
    const tree = parse(
      "function f(x, y) { if (x) { if (y) { return 1; } } return 0; }",
      tsLang
    );
    const fn = tree.rootNode.children[0]!;
    const body = fn.childForFieldName("body")!;
    // outer if: 1 (base) + 0 (nesting=0) = 1
    // inner if: 1 (base) + 1 (nesting=1) = 2
    // total = 3
    expect(computeCognitiveComplexity(body)).toBe(3);
  });

  test("else clause adds 1 (no nesting penalty)", () => {
    const tree = parse(
      "function f(x) { if (x) { return 1; } else { return 0; } }",
      tsLang
    );
    const fn = tree.rootNode.children[0]!;
    const body = fn.childForFieldName("body")!;
    // if: 1, else: 1 = 2
    expect(computeCognitiveComplexity(body)).toBe(2);
  });

  test("logical operators add 1 each", () => {
    const tree = parse("function f(a, b, c) { return a && b || c; }", tsLang);
    const fn = tree.rootNode.children[0]!;
    const body = fn.childForFieldName("body")!;
    expect(computeCognitiveComplexity(body)).toBe(2);
  });

  test("for loop adds complexity", () => {
    const tree = parse(
      "function f(arr) { for (const x of arr) { if (x > 0) { console.log(x); } } }",
      tsLang
    );
    const fn = tree.rootNode.children[0]!;
    const body = fn.childForFieldName("body")!;
    // for: 1+0=1, if inside for: 1+1=2 → total 3
    expect(computeCognitiveComplexity(body)).toBe(3);
  });

  test("ternary adds complexity", () => {
    const tree = parse("function f(x) { return x > 0 ? 'yes' : 'no'; }", tsLang);
    const fn = tree.rootNode.children[0]!;
    const body = fn.childForFieldName("body")!;
    expect(computeCognitiveComplexity(body)).toBeGreaterThanOrEqual(1);
  });

  test("try-catch adds complexity", () => {
    const tree = parse(
      "function f() { try { doStuff(); } catch (e) { handleError(e); } }",
      tsLang
    );
    const fn = tree.rootNode.children[0]!;
    const body = fn.childForFieldName("body")!;
    expect(computeCognitiveComplexity(body)).toBeGreaterThanOrEqual(1);
  });
});

// ─── Function Extraction Tests ──────────────────────────────────────────────

describe("extractFunctions", () => {
  test("extracts named function declarations", () => {
    const source = readFileSync(resolve(ROOT, "fixtures/sample.ts"), "utf-8");
    parser.setLanguage(tsLang);
    const tree = parser.parse(source);
    const funcs = extractFunctions(tree, "fixtures/sample.ts");

    const names = funcs.map((f) => f.name);
    expect(names).toContain("simpleAdd");
    expect(names).toContain("complexFunction");
    expect(names).toContain("withLogicalOps");
    expect(names).toContain("withTernary");
    expect(names).toContain("withSwitch");
    expect(names).toContain("withTryCatch");
  });

  test("extracts arrow functions assigned to variables", () => {
    const source = readFileSync(resolve(ROOT, "fixtures/sample.ts"), "utf-8");
    parser.setLanguage(tsLang);
    const tree = parser.parse(source);
    const funcs = extractFunctions(tree, "fixtures/sample.ts");

    const names = funcs.map((f) => f.name);
    expect(names).toContain("arrowFn");
    expect(names).toContain("complexArrow");
  });

  test("captures line numbers correctly", () => {
    const source = readFileSync(resolve(ROOT, "fixtures/sample.ts"), "utf-8");
    parser.setLanguage(tsLang);
    const tree = parser.parse(source);
    const funcs = extractFunctions(tree, "fixtures/sample.ts");

    const simpleAdd = funcs.find((f) => f.name === "simpleAdd")!;
    expect(simpleAdd.startLine).toBe(1);
    expect(simpleAdd.endLine).toBe(3);
    expect(simpleAdd.params).toBe(2);
  });

  test("complexFunction has higher complexity than simpleAdd", () => {
    const source = readFileSync(resolve(ROOT, "fixtures/sample.ts"), "utf-8");
    parser.setLanguage(tsLang);
    const tree = parser.parse(source);
    const funcs = extractFunctions(tree, "fixtures/sample.ts");

    const simple = funcs.find((f) => f.name === "simpleAdd")!;
    const complex = funcs.find((f) => f.name === "complexFunction")!;
    expect(complex.cognitiveComplexity).toBeGreaterThan(simple.cognitiveComplexity);
    expect(simple.cognitiveComplexity).toBe(0);
  });

  test("extracts call expressions", () => {
    const source = readFileSync(resolve(ROOT, "fixtures/callgraph.ts"), "utf-8");
    parser.setLanguage(tsLang);
    const tree = parser.parse(source);
    const funcs = extractFunctions(tree, "fixtures/callgraph.ts");

    const helperA = funcs.find((f) => f.name === "helperA")!;
    expect(helperA.calls).toContain("helperB");

    const orchestrator = funcs.find((f) => f.name === "orchestrator")!;
    expect(orchestrator.calls).toContain("helperA");
    expect(orchestrator.calls).toContain("helperB");
  });

  test("parses JavaScript files", () => {
    const source = readFileSync(resolve(ROOT, "fixtures/sample.js"), "utf-8");
    parser.setLanguage(jsLang);
    const tree = parser.parse(source);
    const funcs = extractFunctions(tree, "fixtures/sample.js");

    const names = funcs.map((f) => f.name);
    expect(names).toContain("add");
    expect(names).toContain("conditionalLogic");
  });

  test("parses TSX files", () => {
    const source = readFileSync(resolve(ROOT, "fixtures/component.tsx"), "utf-8");
    parser.setLanguage(tsxLang);
    const tree = parser.parse(source);
    const funcs = extractFunctions(tree, "fixtures/component.tsx");

    const names = funcs.map((f) => f.name);
    expect(names).toContain("Greeting");
  });
});

// ─── Call Graph & Blast Radius Tests ────────────────────────────────────────

describe("computeBlastRadii", () => {
  test("orchestrator has higher blast radius than isolated", () => {
    const source = readFileSync(resolve(ROOT, "fixtures/callgraph.ts"), "utf-8");
    parser.setLanguage(tsLang);
    const tree = parser.parse(source);
    const funcs = extractFunctions(tree, "fixtures/callgraph.ts");

    const radii = computeBlastRadii(funcs, new Set());

    const orchRadius = radii.find((r) => r.function === "orchestrator")!;
    const isoRadius = radii.find((r) => r.function === "isolated")!;

    expect(orchRadius.forwardDeps.length).toBeGreaterThan(0);
    expect(isoRadius.forwardDeps.length).toBe(0);
  });

  test("helperA reaches helperC through helperB", () => {
    const source = readFileSync(resolve(ROOT, "fixtures/callgraph.ts"), "utf-8");
    parser.setLanguage(tsLang);
    const tree = parser.parse(source);
    const funcs = extractFunctions(tree, "fixtures/callgraph.ts");

    const radii = computeBlastRadii(funcs, new Set());
    const helperARadius = radii.find((r) => r.function === "helperA")!;

    expect(helperARadius.forwardDeps.length).toBeGreaterThanOrEqual(2);
    expect(helperARadius.depth).toBeGreaterThanOrEqual(2);
  });

  test("coverage is 0 when no test files exist", () => {
    const source = readFileSync(resolve(ROOT, "fixtures/callgraph.ts"), "utf-8");
    parser.setLanguage(tsLang);
    const tree = parser.parse(source);
    const funcs = extractFunctions(tree, "fixtures/callgraph.ts");

    const radii = computeBlastRadii(funcs, new Set());
    for (const r of radii) {
      if (r.forwardDeps.length > 0) {
        expect(r.testCoverage).toBe(0);
      }
    }
  });
});

// ─── Hotspot Tests ──────────────────────────────────────────────────────────

describe("computeHotspots", () => {
  test("scores are complexity × churn", () => {
    const funcs = [
      {
        name: "highComplexity",
        file: "a.ts",
        startLine: 1,
        endLine: 20,
        cognitiveComplexity: 15,
        lineCount: 20,
        params: 2,
        calls: [],
      },
      {
        name: "lowComplexity",
        file: "b.ts",
        startLine: 1,
        endLine: 5,
        cognitiveComplexity: 2,
        lineCount: 5,
        params: 1,
        calls: [],
      },
    ];

    const churn = [
      { path: "a.ts", commits: 10, linesAdded: 100, linesRemoved: 50 },
      { path: "b.ts", commits: 20, linesAdded: 50, linesRemoved: 20 },
    ];

    const hotspots = computeHotspots(funcs, churn);

    expect(hotspots[0]!.score).toBe(150); // 15 × 10
    expect(hotspots[1]!.score).toBe(40); // 2 × 20
  });

  test("excludes test files", () => {
    const funcs = [
      {
        name: "testFn",
        file: "src/utils.test.ts",
        startLine: 1,
        endLine: 5,
        cognitiveComplexity: 10,
        lineCount: 5,
        params: 0,
        calls: [],
      },
    ];

    const churn = [{ path: "src/utils.test.ts", commits: 10, linesAdded: 50, linesRemoved: 20 }];

    const hotspots = computeHotspots(funcs, churn);
    expect(hotspots.length).toBe(0);
  });

  test("excludes zero complexity functions", () => {
    const funcs = [
      {
        name: "simple",
        file: "a.ts",
        startLine: 1,
        endLine: 3,
        cognitiveComplexity: 0,
        lineCount: 3,
        params: 1,
        calls: [],
      },
    ];

    const churn = [{ path: "a.ts", commits: 100, linesAdded: 500, linesRemoved: 200 }];

    const hotspots = computeHotspots(funcs, churn);
    expect(hotspots.length).toBe(0);
  });
});

// ─── Temporal Coupling Tests ────────────────────────────────────────────────

describe("computeTemporalCoupling", () => {
  test("detects files that co-change", () => {
    const commits = [
      { hash: "a1", timestamp: 1, files: ["src/a.ts", "src/b.ts"] },
      { hash: "a2", timestamp: 2, files: ["src/a.ts", "src/b.ts"] },
      { hash: "a3", timestamp: 3, files: ["src/a.ts", "src/b.ts"] },
      { hash: "a4", timestamp: 4, files: ["src/c.ts"] },
    ];

    const couplings = computeTemporalCoupling(commits, 3);

    expect(couplings.length).toBe(1);
    expect(couplings[0]!.cochanges).toBe(3);
    expect(couplings[0]!.couplingStrength).toBe(1); // 3/3
  });

  test("respects minCochanges threshold", () => {
    const commits = [
      { hash: "a1", timestamp: 1, files: ["src/a.ts", "src/b.ts"] },
      { hash: "a2", timestamp: 2, files: ["src/a.ts", "src/b.ts"] },
    ];

    const couplings = computeTemporalCoupling(commits, 3);
    expect(couplings.length).toBe(0);
  });

  test("coupling strength accounts for asymmetric changes", () => {
    const commits = [
      { hash: "a1", timestamp: 1, files: ["src/a.ts", "src/b.ts"] },
      { hash: "a2", timestamp: 2, files: ["src/a.ts", "src/b.ts"] },
      { hash: "a3", timestamp: 3, files: ["src/a.ts", "src/b.ts"] },
      { hash: "a4", timestamp: 4, files: ["src/a.ts"] },
      { hash: "a5", timestamp: 5, files: ["src/a.ts"] },
    ];

    const couplings = computeTemporalCoupling(commits, 3);
    expect(couplings[0]!.couplingStrength).toBe(3 / 5); // 3 co-changes / 5 changes to a
  });

  test("handles multiple pairs", () => {
    const commits = [
      { hash: "a1", timestamp: 1, files: ["src/a.ts", "src/b.ts", "src/c.ts"] },
      { hash: "a2", timestamp: 2, files: ["src/a.ts", "src/b.ts", "src/c.ts"] },
      { hash: "a3", timestamp: 3, files: ["src/a.ts", "src/b.ts", "src/c.ts"] },
    ];

    const couplings = computeTemporalCoupling(commits, 3);
    expect(couplings.length).toBe(3); // a-b, a-c, b-c
  });
});

// ─── .sv Document Format Tests ──────────────────────────────────────────────

describe("buildSvDocument", () => {
  test("produces valid .sv JSON structure", () => {
    const funcs = [
      {
        name: "fn1",
        file: "src/a.ts",
        startLine: 1,
        endLine: 10,
        cognitiveComplexity: 5,
        lineCount: 10,
        params: 2,
        calls: ["fn2"],
      },
      {
        name: "fn2",
        file: "src/b.ts",
        startLine: 1,
        endLine: 5,
        cognitiveComplexity: 2,
        lineCount: 5,
        params: 1,
        calls: [],
      },
    ];

    const doc = buildSvDocument(
      "/test/repo",
      funcs,
      [{ file: "src/a.ts", function: "fn1", startLine: 1, cognitiveComplexity: 5, churn: 10, score: 50 }],
      [],
      [{ fileA: "src/a.ts", fileB: "src/c.ts", cochanges: 5, totalChangesA: 10, totalChangesB: 8, couplingStrength: 0.5 }]
    );

    expect(doc.version).toBe("0.1.0");
    expect(doc.timestamp).toBeTruthy();
    expect(doc.repository).toBe("/test/repo");

    const funcEntities = doc.entities.filter((e) => e.type === "function");
    expect(funcEntities.length).toBe(2);

    const fileEntities = doc.entities.filter((e) => e.type === "file");
    expect(fileEntities.length).toBe(2);

    const callEdges = doc.edges.filter((e) => e.type === "calls");
    expect(callEdges.length).toBe(1);

    const containsEdges = doc.edges.filter((e) => e.type === "contains");
    expect(containsEdges.length).toBe(2);

    const cochangeEdges = doc.edges.filter((e) => e.type === "co_changes_with");
    expect(cochangeEdges.length).toBe(1);
    expect(cochangeEdges[0]!.weight).toBe(0.5);

    expect(doc.hotspots.length).toBe(1);
    expect(doc.temporalCouplings.length).toBe(1);
  });

  test(".sv document is valid JSON", () => {
    const doc = buildSvDocument("/repo", [], [], [], []);
    const json = JSON.stringify(doc);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe("0.1.0");
  });
});

// ─── Integration: analyzeFile ───────────────────────────────────────────────

describe("analyzeFile", () => {
  test("analyzes a TypeScript file from disk", async () => {
    const funcs = await analyzeFile("fixtures/sample.ts", ROOT);
    expect(funcs.length).toBeGreaterThan(0);

    const simpleAdd = funcs.find((f) => f.name === "simpleAdd");
    expect(simpleAdd).toBeTruthy();
    expect(simpleAdd!.cognitiveComplexity).toBe(0);
  });

  test("analyzes a JavaScript file from disk", async () => {
    const funcs = await analyzeFile("fixtures/sample.js", ROOT);
    expect(funcs.length).toBeGreaterThan(0);

    const add = funcs.find((f) => f.name === "add");
    expect(add).toBeTruthy();
  });

  test("analyzes a TSX file from disk", async () => {
    const funcs = await analyzeFile("fixtures/component.tsx", ROOT);
    expect(funcs.length).toBeGreaterThan(0);

    const greeting = funcs.find((f) => f.name === "Greeting");
    expect(greeting).toBeTruthy();
  });

  test("returns empty array for non-existent file", async () => {
    const funcs = await analyzeFile("nonexistent.ts", ROOT);
    expect(funcs.length).toBe(0);
  });

  test("returns empty array for non-target extensions", async () => {
    const funcs = await analyzeFile("readme.md", ROOT);
    expect(funcs.length).toBe(0);
  });
});

// ─── Git Integration Tests (uses actual repo) ──────────────────────────────

describe("git integration", () => {
  test("getFileChurn returns churn data for this repo", async () => {
    const churn = await getFileChurn(ROOT);
    expect(Array.isArray(churn)).toBe(true);
    // After committing strata.ts, it should appear
    if (churn.length > 0) {
      expect(churn[0]!.path).toBeTruthy();
      expect(churn[0]!.commits).toBeGreaterThan(0);
    }
  });

  test("getCommitFiles returns structured commit data", async () => {
    const commits = await getCommitFiles(ROOT);
    expect(Array.isArray(commits)).toBe(true);
  });
});
