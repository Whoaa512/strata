import type { Node } from "web-tree-sitter";
import type { FunctionInfo } from "./types";

const INCREMENTING_NODES = new Set([
  "if_statement",
  "else_clause",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "catch_clause",
  "switch_case",
  "ternary_expression",
  "binary_expression",
]);

const NESTING_NODES = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "catch_clause",
  "switch_statement",
  "arrow_function",
  "function_expression",
  "function_declaration",
  "method_definition",
]);

const FUNCTION_NODES = new Set([
  "function_declaration",
  "method_definition",
  "arrow_function",
  "function_expression",
  "function",
]);

const BOOLEAN_OPS = new Set(["&&", "||", "??", "and", "or"]);

function computeCognitiveComplexity(node: Node): number {
  let complexity = 0;
  const elseIfIds = new Set<number>();

  function walk(n: Node, nesting: number): void {
    if (INCREMENTING_NODES.has(n.type) && !elseIfIds.has(n.id)) {
      if (n.type === "binary_expression") {
        const op = n.childForFieldName("operator")?.text ?? n.child(1)?.text;
        if (op && BOOLEAN_OPS.has(op)) {
          const parent = n.parent;
          if (
            parent?.type !== "binary_expression" ||
            (parent.child(1)?.text ?? parent.childForFieldName("operator")?.text) !== op
          ) {
            complexity += 1;
          }
        }
      } else if (n.type === "else_clause") {
        const child = n.namedChild(0);
        if (child?.type === "if_statement") {
          complexity += 1;
          elseIfIds.add(child.id);
        } else {
          complexity += 1;
        }
      } else {
        complexity += 1 + nesting;
      }
    }

    const nestIncrement =
      NESTING_NODES.has(n.type) && !FUNCTION_NODES.has(n.type) && !elseIfIds.has(n.id) ? 1 : 0;

    for (let i = 0; i < n.namedChildCount; i++) {
      const child = n.namedChild(i)!;

      if (FUNCTION_NODES.has(child.type) && !isTopLevelFunction(child)) {
        complexity += 1 + nesting;
        walk(child, nesting + 1);
      } else {
        walk(child, nesting + nestIncrement);
      }
    }
  }

  walk(node, 0);
  return complexity;
}

function isTopLevelFunction(node: Node): boolean {
  const parent = node.parent;
  if (!parent) return true;
  if (
    parent.type === "program" ||
    parent.type === "export_statement" ||
    parent.type === "class_body"
  )
    return true;
  if (parent.type === "variable_declarator" || parent.type === "pair") {
    const grandparent = parent.parent;
    if (!grandparent) return true;
    const ggp = grandparent.parent;
    if (
      grandparent.type === "program" ||
      grandparent.type === "export_statement" ||
      ggp?.type === "program" ||
      ggp?.type === "export_statement"
    )
      return true;
  }
  return false;
}

function getFunctionName(node: Node): string {
  const nameNode = node.childForFieldName("name");
  if (nameNode) return nameNode.text;

  const parent = node.parent;
  if (parent?.type === "variable_declarator") {
    const varName = parent.childForFieldName("name");
    if (varName) return varName.text;
  }

  if (parent?.type === "pair") {
    const key = parent.childForFieldName("key");
    if (key) return key.text;
  }

  if (parent?.type === "assignment_expression") {
    const left = parent.childForFieldName("left");
    if (left) return left.text;
  }

  return `<anonymous@${node.startPosition.row + 1}>`;
}

function getParamCount(node: Node): number {
  const params = node.childForFieldName("parameters");
  if (!params) return 0;
  return params.namedChildCount;
}

function getMaxNesting(node: Node): number {
  let maxDepth = 0;

  function walk(n: Node, depth: number): void {
    if (NESTING_NODES.has(n.type) && !FUNCTION_NODES.has(n.type)) {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    }
    for (let i = 0; i < n.namedChildCount; i++) {
      walk(n.namedChild(i)!, depth);
    }
  }

  walk(node, 0);
  return maxDepth;
}

export function extractFunctions(rootNode: Node, filePath: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  function visit(node: Node): void {
    if (FUNCTION_NODES.has(node.type) && isTopLevelFunction(node)) {
      const body = node.childForFieldName("body");
      const targetNode = body ?? node;

      functions.push({
        name: getFunctionName(node),
        filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        complexity: computeCognitiveComplexity(targetNode),
        nestingDepth: getMaxNesting(targetNode),
        paramCount: getParamCount(node),
        lineCount: node.endPosition.row - node.startPosition.row + 1,
      });
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i)!;
      if (child.type === "class_declaration" || child.type === "class") {
        const classBody = child.childForFieldName("body");
        if (classBody) {
          for (let j = 0; j < classBody.namedChildCount; j++) {
            visit(classBody.namedChild(j)!);
          }
        }
      } else if (child.type === "export_statement") {
        for (let j = 0; j < child.namedChildCount; j++) {
          visit(child.namedChild(j)!);
        }
      } else if (FUNCTION_NODES.has(child.type)) {
        visit(child);
      } else if (
        child.type === "lexical_declaration" ||
        child.type === "variable_declaration"
      ) {
        for (let j = 0; j < child.namedChildCount; j++) {
          const declarator = child.namedChild(j)!;
          if (declarator.type === "variable_declarator") {
            const value = declarator.childForFieldName("value");
            if (value && FUNCTION_NODES.has(value.type)) {
              visit(value);
            }
          }
        }
      }
    }
  }

  visit(rootNode);
  return functions;
}
