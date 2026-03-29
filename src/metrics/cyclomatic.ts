import ts from "typescript";
import type { MetricPlugin } from "../plugin";

function countBranches(node: ts.Node): number {
  let count = 0;

  ts.forEachChild(node, (child) => {
    if (
      ts.isIfStatement(child) ||
      ts.isForStatement(child) ||
      ts.isForInStatement(child) ||
      ts.isForOfStatement(child) ||
      ts.isWhileStatement(child) ||
      ts.isDoStatement(child) ||
      ts.isConditionalExpression(child) ||
      ts.isCaseClause(child)
    ) {
      count++;
    }

    if (ts.isBinaryExpression(child)) {
      if (
        child.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        child.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        child.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        count++;
      }
    }

    if (ts.isCatchClause(child)) {
      count++;
    }

    count += countBranches(child);
  });

  return count;
}

export const cyclomaticPlugin: MetricPlugin = {
  name: "cyclomatic",
  analyze(node) {
    return { cyclomatic: 1 + countBranches(node) };
  },
};
