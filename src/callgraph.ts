import type { Node } from "web-tree-sitter";
import type { CallEdge, BlastRadius, FunctionInfo } from "./types";

const CALL_NODES = new Set(["call_expression", "new_expression"]);

const FUNCTION_NODES = new Set([
  "function_declaration",
  "method_definition",
  "arrow_function",
  "function_expression",
  "function",
]);

export function extractCallEdges(
  rootNode: Node,
  filePath: string,
  allFunctions: FunctionInfo[]
): CallEdge[] {
  const edges: CallEdge[] = [];
  const fnByRange = buildFunctionRangeIndex(allFunctions, filePath);

  function walk(node: Node): void {
    if (CALL_NODES.has(node.type)) {
      const calleeName = resolveCalleeName(node);
      if (calleeName) {
        const callerFn = findEnclosingFunction(node, fnByRange);
        if (callerFn) {
          edges.push({
            caller: callerFn.name,
            callee: calleeName,
            callerFile: filePath,
            calleeFile: filePath,
          });
        }
      }
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      walk(node.namedChild(i)!);
    }
  }

  walk(rootNode);
  return edges;
}

function resolveCalleeName(callNode: Node): string | null {
  const fn = callNode.childForFieldName("function") ?? callNode.namedChild(0);
  if (!fn) return null;

  if (fn.type === "identifier") return fn.text;
  if (fn.type === "member_expression") {
    const prop = fn.childForFieldName("property");
    if (prop) return prop.text;
  }

  return null;
}

interface FnRange {
  name: string;
  startLine: number;
  endLine: number;
}

function buildFunctionRangeIndex(fns: FunctionInfo[], filePath: string): FnRange[] {
  return fns
    .filter((f) => f.filePath === filePath)
    .map((f) => ({ name: f.name, startLine: f.startLine, endLine: f.endLine }));
}

function findEnclosingFunction(node: Node, ranges: FnRange[]): FnRange | null {
  const line = node.startPosition.row + 1;
  for (const r of ranges) {
    if (line >= r.startLine && line <= r.endLine) return r;
  }
  return null;
}

export function buildCallGraph(
  edges: CallEdge[]
): { forward: Map<string, Set<string>>; reverse: Map<string, Set<string>> } {
  const forward = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();

  for (const edge of edges) {
    const callerKey = edge.callerFile + ":" + edge.caller;
    const calleeKey = edge.calleeFile + ":" + edge.callee;

    if (!forward.has(callerKey)) forward.set(callerKey, new Set());
    forward.get(callerKey)!.add(calleeKey);

    if (!reverse.has(calleeKey)) reverse.set(calleeKey, new Set());
    reverse.get(calleeKey)!.add(callerKey);
  }

  return { forward, reverse };
}

export function computeForwardSlice(
  startKey: string,
  forward: Map<string, Set<string>>,
  maxDepth: number = 10
): Set<string> {
  const visited = new Set<string>();
  const queue: Array<[string, number]> = [[startKey, 0]];

  while (queue.length > 0) {
    const [current, depth] = queue.shift()!;
    if (visited.has(current) || depth > maxDepth) continue;
    visited.add(current);

    const targets = forward.get(current);
    if (targets) {
      for (const t of targets) {
        if (!visited.has(t)) queue.push([t, depth + 1]);
      }
    }
  }

  visited.delete(startKey);
  return visited;
}

export function computeBlastRadii(
  functions: FunctionInfo[],
  edges: CallEdge[],
  testFiles: Set<string>
): BlastRadius[] {
  const { forward, reverse } = buildCallGraph(edges);
  const results: BlastRadius[] = [];

  for (const fn of functions) {
    const key = fn.filePath + ":" + fn.name;
    const forwardSlice = computeForwardSlice(key, forward);
    const forwardFiles = new Set<string>();
    for (const s of forwardSlice) {
      forwardFiles.add(s.split(":")[0]);
    }

    const fanOut = forward.get(key)?.size ?? 0;
    const fanIn = reverse.get(key)?.size ?? 0;

    const hasTestCoverage = testFiles.has(fn.filePath) ||
      Array.from(testFiles).some((tf) => tf.includes(fn.filePath.replace(/\.tsx?$/, "")));

    const riskScore = computeRiskScore(fn.complexity, fanOut, fanIn, forwardSlice.size, hasTestCoverage);

    results.push({
      entity: fn.name,
      filePath: fn.filePath,
      forwardSlice: Array.from(forwardSlice),
      forwardFileSlice: Array.from(forwardFiles),
      fanOut,
      fanIn,
      testCoverageGap: !hasTestCoverage,
      riskScore,
    });
  }

  results.sort((a, b) => b.riskScore - a.riskScore);
  return results;
}

function computeRiskScore(
  complexity: number,
  fanOut: number,
  fanIn: number,
  sliceSize: number,
  hasCoverage: boolean
): number {
  const complexityWeight = Math.min(complexity / 20, 1);
  const couplingWeight = Math.min((fanOut + fanIn) / 20, 1);
  const sliceWeight = Math.min(sliceSize / 10, 1);
  const coverageWeight = hasCoverage ? 0 : 0.3;

  return (
    complexityWeight * 0.3 +
    couplingWeight * 0.25 +
    sliceWeight * 0.25 +
    coverageWeight * 0.2
  ) / (hasCoverage ? 0.8 : 1);
}
