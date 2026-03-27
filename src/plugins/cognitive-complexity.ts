import type { Plugin, AnalysisContext, PluginResult, SvEntity, FileInfo } from "../types";
import { extname } from "node:path";

interface FunctionInfo {
  name: string;
  startLine: number;
  endLine: number;
  complexity: number;
}

export const cognitiveComplexityPlugin: Plugin = {
  name: "cognitive-complexity",

  async analyze(ctx: AnalysisContext): Promise<PluginResult> {
    const entities: SvEntity[] = [];

    for (const file of ctx.files) {
      const tree = parseFile(file, ctx);
      if (!tree) continue;

      const functions = extractFunctions(tree, file.relativePath);

      for (const fn of functions) {
        entities.push({
          id: `${file.relativePath}::${fn.name}`,
          kind: "function",
          name: fn.name,
          filePath: file.relativePath,
          startLine: fn.startLine,
          endLine: fn.endLine,
          metrics: {
            cognitiveComplexity: fn.complexity,
          },
        });
      }
    }

    return { entities };
  },
};

function parseFile(file: FileInfo, ctx: AnalysisContext): any {
  const ext = extname(file.relativePath);
  if (ext === ".ts" || ext === ".tsx" || ext === ".mts") {
    return ctx.parser.parseTS(file.content);
  }
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs") {
    return ctx.parser.parseJS(file.content);
  }
  return null;
}

function extractFunctions(tree: any, filePath: string): FunctionInfo[] {
  const results: FunctionInfo[] = [];
  walkNode(tree.rootNode, results, filePath, 0);
  return results;
}

function walkNode(node: any, results: FunctionInfo[], filePath: string, depth: number) {
  const name = getFunctionName(node);
  if (name) {
    results.push({
      name,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      complexity: computeCognitiveComplexity(node.type === "arrow_function" || node.type === "function" ? node : getFunctionBody(node), 0),
    });
  }

  for (let i = 0; i < node.childCount; i++) {
    walkNode(node.child(i), results, filePath, depth + 1);
  }
}

function getFunctionName(node: any): string | null {
  const type = node.type;

  if (type === "function_declaration" || type === "method_definition") {
    return node.childForFieldName("name")?.text ?? null;
  }

  if (type === "variable_declarator") {
    const value = node.childForFieldName("value");
    if (
      value &&
      (value.type === "arrow_function" || value.type === "function")
    ) {
      return node.childForFieldName("name")?.text ?? null;
    }
  }

  return null;
}

function getFunctionBody(node: any): any {
  const body = node.childForFieldName("body");
  if (body) return body;

  const value = node.childForFieldName("value");
  if (value) return value;

  return node;
}

function computeCognitiveComplexity(node: any, nesting: number): number {
  if (!node) return 0;

  let total = 0;

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    const type = child.type;

    if (
      type === "if_statement" ||
      type === "for_statement" ||
      type === "for_in_statement" ||
      type === "while_statement" ||
      type === "do_statement" ||
      type === "switch_statement" ||
      type === "catch_clause"
    ) {
      total += 1 + nesting;

      const condition = child.childForFieldName("condition");
      if (condition) {
        total += countLogicalOperators(condition);
      }

      const body = child.childForFieldName("body") ?? child.childForFieldName("consequence");
      if (body) {
        total += computeCognitiveComplexity(body, nesting + 1);
      }

      const alt = child.childForFieldName("alternative");
      if (alt) {
        if (alt.type === "if_statement") {
          total += 1;
          const altBody = alt.childForFieldName("consequence");
          if (altBody) total += computeCognitiveComplexity(altBody, nesting + 1);
          const altAlt = alt.childForFieldName("alternative");
          if (altAlt) total += handleElseChain(altAlt, nesting);
        } else {
          total += 1;
          total += computeCognitiveComplexity(alt, nesting + 1);
        }
      }
      continue;
    }

    if (type === "ternary_expression") {
      total += 1 + nesting;
      total += computeCognitiveComplexity(child, nesting + 1);
      continue;
    }

    if (type === "binary_expression") {
      const op = child.childForFieldName("operator")?.text;
      if (op === "&&" || op === "||" || op === "??") {
        total += 1;
      }
      total += computeCognitiveComplexity(child, nesting);
      continue;
    }

    if (
      type === "arrow_function" ||
      type === "function" ||
      type === "function_declaration"
    ) {
      total += computeCognitiveComplexity(child, nesting + 1);
      continue;
    }

    total += computeCognitiveComplexity(child, nesting);
  }

  return total;
}

function countLogicalOperators(node: any): number {
  if (!node) return 0;
  let total = 0;

  if (node.type === "binary_expression") {
    const op = node.childForFieldName("operator")?.text;
    if (op === "&&" || op === "||" || op === "??") {
      total += 1;
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    total += countLogicalOperators(node.child(i));
  }
  return total;
}

function handleElseChain(node: any, nesting: number): number {
  if (!node) return 0;

  if (node.type === "if_statement") {
    let total = 1;
    const body = node.childForFieldName("consequence");
    if (body) total += computeCognitiveComplexity(body, nesting + 1);
    const alt = node.childForFieldName("alternative");
    if (alt) total += handleElseChain(alt, nesting);
    return total;
  }

  return 1 + computeCognitiveComplexity(node, nesting + 1);
}
