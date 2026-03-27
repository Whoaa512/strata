import type { Plugin, AnalysisContext, PluginResult, SvEntity, SvEdge, FileInfo } from "../types";
import { extname } from "node:path";

export const blastRadiusPlugin: Plugin = {
  name: "blast-radius",

  async analyze(ctx: AnalysisContext): Promise<PluginResult> {
    const callEdges: SvEdge[] = [];
    const functionsByFile = new Map<string, Set<string>>();

    for (const file of ctx.files) {
      const tree = parseFile(file, ctx);
      if (!tree) continue;

      const calls = extractCalls(tree.rootNode, file.relativePath);
      callEdges.push(...calls.edges);

      for (const fnName of calls.definedFunctions) {
        let set = functionsByFile.get(file.relativePath);
        if (!set) {
          set = new Set();
          functionsByFile.set(file.relativePath, set);
        }
        set.add(fnName);
      }
    }

    const callGraph = buildCallGraph(callEdges);
    const testFiles = new Set(
      ctx.files.filter((f) => isTestFile(f.relativePath)).map((f) => f.relativePath)
    );
    const testedFunctions = findTestedFunctions(ctx, testFiles);

    const entities: SvEntity[] = [];

    for (const [file, fns] of functionsByFile) {
      for (const fn of fns) {
        const entityId = `${file}::${fn}`;
        const reachable = getReachable(entityId, callGraph);
        const untestedCount = countUntested(reachable, testedFunctions);

        entities.push({
          id: entityId,
          kind: "function",
          name: fn,
          filePath: file,
          startLine: 0,
          endLine: 0,
          metrics: {
            blastRadius: reachable.size,
            untestedInRadius: untestedCount,
            testCoverageGap: reachable.size > 0 ? untestedCount / reachable.size : 0,
          },
        });
      }
    }

    return { entities, edges: callEdges };
  },
};

function parseFile(file: FileInfo, ctx: AnalysisContext): any {
  const ext = extname(file.relativePath);
  if (ext === ".ts" || ext === ".tsx" || ext === ".mts") return ctx.parser.parseTS(file.content);
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs") return ctx.parser.parseJS(file.content);
  return null;
}

interface CallExtractionResult {
  edges: SvEdge[];
  definedFunctions: string[];
}

function extractCalls(rootNode: any, filePath: string): CallExtractionResult {
  const edges: SvEdge[] = [];
  const definedFunctions: string[] = [];
  const seen = new Set<string>();

  walkForFunctions(rootNode, (fnName, fnBody) => {
    definedFunctions.push(fnName);
    const sourceId = `${filePath}::${fnName}`;

    walkForCalls(fnBody, (calleeName) => {
      const edgeKey = `${sourceId}->${calleeName}`;
      if (seen.has(edgeKey)) return;
      seen.add(edgeKey);

      edges.push({
        source: sourceId,
        target: calleeName,
        kind: "calls",
      });
    });
  });

  return { edges, definedFunctions };
}

function walkForFunctions(node: any, cb: (name: string, body: any) => void) {
  const type = node.type;

  if (type === "function_declaration" || type === "method_definition") {
    const name = node.childForFieldName("name")?.text;
    if (name) cb(name, node);
  }

  if (type === "variable_declarator") {
    const value = node.childForFieldName("value");
    if (value && (value.type === "arrow_function" || value.type === "function")) {
      const name = node.childForFieldName("name")?.text;
      if (name) cb(name, value);
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    walkForFunctions(node.child(i), cb);
  }
}

function walkForCalls(node: any, cb: (name: string) => void) {
  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (fn) {
      const name = fn.type === "identifier" ? fn.text : fn.type === "member_expression" ? fn.text : null;
      if (name) cb(name);
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    walkForCalls(node.child(i), cb);
  }
}

function buildCallGraph(edges: SvEdge[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const edge of edges) {
    let targets = graph.get(edge.source);
    if (!targets) {
      targets = new Set();
      graph.set(edge.source, targets);
    }
    targets.add(edge.target);
  }

  return graph;
}

function getReachable(start: string, graph: Map<string, Set<string>>): Set<string> {
  const visited = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = graph.get(current);
    if (!neighbors) continue;

    for (const n of neighbors) {
      if (!visited.has(n)) queue.push(n);
    }
  }

  visited.delete(start);
  return visited;
}

function isTestFile(path: string): boolean {
  return (
    path.includes(".test.") ||
    path.includes(".spec.") ||
    path.includes("__tests__/") ||
    path.includes("test/")
  );
}

function findTestedFunctions(ctx: AnalysisContext, testFiles: Set<string>): Set<string> {
  const tested = new Set<string>();

  for (const file of ctx.files) {
    if (!testFiles.has(file.relativePath)) continue;

    const tree = parseFile(file, ctx);
    if (!tree) continue;

    walkForCalls(tree.rootNode, (callee) => {
      tested.add(callee);
    });
  }

  return tested;
}

function countUntested(reachable: Set<string>, testedFunctions: Set<string>): number {
  let count = 0;
  for (const id of reachable) {
    const fnName = id.includes("::") ? id.split("::")[1] : id;
    if (!testedFunctions.has(fnName)) count++;
  }
  return count;
}
