import Parser from "web-tree-sitter";

type SyntaxNode = Parser.SyntaxNode;

const NESTING_INCREMENT_TYPES = new Set([
  "if_statement",
  "else_clause",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "switch_statement",
  "try_statement",
  "catch_clause",
  "ternary_expression",
]);

const STRUCTURAL_INCREMENT_TYPES = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "switch_statement",
  "try_statement",
  "catch_clause",
  "ternary_expression",
  "break_statement",
  "continue_statement",
]);

const BOOLEAN_SEQUENCE_TYPES = new Set([
  "binary_expression",
]);

export function cognitiveComplexity(node: SyntaxNode): number {
  let score = 0;
  score += walk(node, 0);
  return score;
}

function walk(node: SyntaxNode, nesting: number): number {
  let score = 0;

  if (STRUCTURAL_INCREMENT_TYPES.has(node.type)) {
    score += 1;

    if (NESTING_INCREMENT_TYPES.has(node.type)) {
      score += nesting;
    }
  }

  if (isTopLevelBooleanSequence(node)) {
    score += countMixedOperators(node);
  }

  const nextNesting = NESTING_INCREMENT_TYPES.has(node.type)
    ? nesting + 1
    : nesting;

  for (const child of node.namedChildren) {
    if (isNestedFunction(child)) {
      score += 1 + nesting;
      score += walk(child, nesting + 1);
      continue;
    }
    score += walk(child, nextNesting);
  }

  return score;
}

function isNestedFunction(node: SyntaxNode): boolean {
  return (
    node.type === "arrow_function" ||
    node.type === "function_expression" ||
    node.type === "function"
  );
}

function isBooleanSequence(node: SyntaxNode): boolean {
  if (!BOOLEAN_SEQUENCE_TYPES.has(node.type)) return false;
  const op = node.childForFieldName("operator");
  return op?.text === "&&" || op?.text === "||";
}

function isTopLevelBooleanSequence(node: SyntaxNode): boolean {
  if (!isBooleanSequence(node)) return false;
  const parent = node.parent;
  if (!parent) return true;
  return !isBooleanSequence(parent);
}

function countMixedOperators(node: SyntaxNode): number {
  const ops = collectBooleanOps(node);
  if (ops.length === 0) return 0;

  let count = 1;
  for (let i = 1; i < ops.length; i++) {
    if (ops[i] !== ops[i - 1]) count++;
  }
  return count;
}

function collectBooleanOps(node: SyntaxNode): string[] {
  if (!BOOLEAN_SEQUENCE_TYPES.has(node.type)) return [];
  const op = node.childForFieldName("operator");
  if (!op || (op.text !== "&&" && op.text !== "||")) return [];

  const left = node.childForFieldName("left");
  const leftOps = left ? collectBooleanOps(left) : [];

  return [...leftOps, op.text];
}

export function nestingDepth(node: SyntaxNode): number {
  let maxDepth = 0;
  walkDepth(node, 0, (d) => {
    if (d > maxDepth) maxDepth = d;
  });
  return maxDepth;
}

function walkDepth(
  node: SyntaxNode,
  depth: number,
  onDepth: (d: number) => void,
): void {
  if (NESTING_INCREMENT_TYPES.has(node.type)) {
    depth++;
    onDepth(depth);
  }
  for (const child of node.namedChildren) {
    walkDepth(child, depth, onDepth);
  }
}

export function parameterCount(node: SyntaxNode): number {
  const params = node.childForFieldName("parameters");
  if (!params) return 0;
  return params.namedChildren.length;
}
