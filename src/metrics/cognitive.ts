import ts from "typescript";
import type { MetricPlugin } from "../plugin";

function computeCognitive(root: ts.Node): number {
  let total = 0;

  function walk(node: ts.Node, nesting: number, isElseIf: boolean) {
    if (ts.isIfStatement(node)) {
      if (!isElseIf) {
        total += 1 + nesting;
      } else {
        total += 1;
      }
      walk(node.expression, nesting, false);
      walk(node.thenStatement, nesting + 1, false);
      if (node.elseStatement) {
        if (ts.isIfStatement(node.elseStatement)) {
          walk(node.elseStatement, nesting, true);
        } else {
          total += 1;
          walk(node.elseStatement, nesting + 1, false);
        }
      }
      return;
    }

    if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node)
    ) {
      total += 1 + nesting;
      ts.forEachChild(node, (child) => walk(child, nesting + 1, false));
      return;
    }

    if (ts.isSwitchStatement(node)) {
      total += 1 + nesting;
      ts.forEachChild(node, (child) => walk(child, nesting + 1, false));
      return;
    }

    if (ts.isCatchClause(node)) {
      total += 1 + nesting;
      ts.forEachChild(node, (child) => walk(child, nesting + 1, false));
      return;
    }

    if (ts.isConditionalExpression(node)) {
      total += 1 + nesting;
      walk(node.condition, nesting, false);
      walk(node.whenTrue, nesting + 1, false);
      walk(node.whenFalse, nesting + 1, false);
      return;
    }

    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        total += countBooleanSequences(node);
        return;
      }
    }

    if (
      ts.isLabeledStatement(node) &&
      (ts.isBreakStatement(node.statement) || ts.isContinueStatement(node.statement))
    ) {
      total += 1;
      return;
    }

    if (ts.isBreakStatement(node) && node.label) {
      total += 1;
      return;
    }

    if (ts.isContinueStatement(node) && node.label) {
      total += 1;
      return;
    }

    const nestingBump =
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
        ? 1
        : 0;

    ts.forEachChild(node, (child) => walk(child, nesting + nestingBump, false));
  }

  function countBooleanSequences(node: ts.BinaryExpression): number {
    const ops: ts.SyntaxKind[] = [];
    flattenBooleanChain(node, ops);

    let count = 1;
    for (let i = 1; i < ops.length; i++) {
      if (ops[i] !== ops[i - 1]) count++;
    }
    return count;
  }

  function flattenBooleanChain(node: ts.Node, ops: ts.SyntaxKind[]) {
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        flattenBooleanChain(node.left, ops);
        ops.push(op);
        flattenBooleanChain(node.right, ops);
        return;
      }
    }
  }

  walk(root, 0, false);
  return total;
}

export const cognitivePlugin: MetricPlugin = {
  name: "cognitive",
  analyze(node) {
    const body = (node as any).body;
    if (!body) return { cognitive: 0 };
    return { cognitive: computeCognitive(body) };
  },
};
