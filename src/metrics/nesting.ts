import ts from "typescript";
import type { MetricPlugin } from "../plugin";

function maxNesting(node: ts.Node, depth: number): number {
  let max = depth;

  ts.forEachChild(node, (child) => {
    let childDepth = depth;
    if (
      ts.isIfStatement(child) ||
      ts.isForStatement(child) ||
      ts.isForInStatement(child) ||
      ts.isForOfStatement(child) ||
      ts.isWhileStatement(child) ||
      ts.isDoStatement(child) ||
      ts.isSwitchStatement(child) ||
      ts.isTryStatement(child) ||
      ts.isCatchClause(child)
    ) {
      childDepth = depth + 1;
    }
    const sub = maxNesting(child, childDepth);
    if (sub > max) max = sub;
  });

  return max;
}

export const nestingPlugin: MetricPlugin = {
  name: "nesting",
  analyze(node) {
    return { maxNestingDepth: maxNesting(node, 0) };
  },
};
