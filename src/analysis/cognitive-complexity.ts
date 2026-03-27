import path from "path";

let Parser: any = null;
let parserInstance: any = null;

async function getParser() {
  if (parserInstance) return parserInstance;

  Parser = require("web-tree-sitter");
  await Parser.init();
  parserInstance = new Parser();

  const wasmPath = path.join(
    path.dirname(require.resolve("tree-sitter-wasms/package.json")),
    "out",
    "tree-sitter-typescript.wasm"
  );
  const lang = await Parser.Language.load(wasmPath);
  parserInstance.setLanguage(lang);
  return parserInstance;
}

interface TSNode {
  type: string;
  parent: TSNode | null;
  children: TSNode[];
  namedChildren: TSNode[];
  childForFieldName(name: string): TSNode | null;
}

const STRUCTURAL_TYPES = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "do_statement",
  "switch_statement",
  "catch_clause",
  "ternary_expression",
]);

function computeFromTree(rootNode: TSNode): number {
  let complexity = 0;

  function walk(node: TSNode, nesting: number): void {
    if (STRUCTURAL_TYPES.has(node.type)) {
      complexity += 1 + nesting;

      if (node.type === "if_statement") {
        for (const child of node.children) {
          if (child.type === "else_clause") {
            handleElse(child, nesting);
          } else {
            walk(child, nesting + 1);
          }
        }
        return;
      }

      for (const child of node.children) {
        walk(child, nesting + 1);
      }
      return;
    }

    if (
      node.type === "binary_expression" &&
      node.children.length >= 3 &&
      (node.children[1]?.type === "&&" || node.children[1]?.type === "||")
    ) {
      const op = node.children[1].type;
      const parentOp =
        node.parent?.type === "binary_expression"
          ? node.parent.children[1]?.type
          : null;
      if (parentOp !== op) {
        complexity += 1;
      }
      for (const child of node.children) {
        walk(child, nesting);
      }
      return;
    }

    if (
      (node.type === "break_statement" ||
        node.type === "continue_statement") &&
      node.namedChildren.length > 0
    ) {
      complexity += 1;
    }

    for (const child of node.children) {
      walk(child, nesting);
    }
  }

  function handleElse(elseNode: TSNode, parentNesting: number): void {
    const child = elseNode.namedChildren[0];
    if (child && child.type === "if_statement") {
      // else-if: +1 for the else-if (no nesting increment)
      complexity += 1;
      for (const grandChild of child.children) {
        if (grandChild.type === "else_clause") {
          handleElse(grandChild, parentNesting);
        } else {
          walk(grandChild, parentNesting + 1);
        }
      }
    } else {
      // plain else: +1
      complexity += 1;
      for (const c of elseNode.children) {
        walk(c, parentNesting + 1);
      }
    }
  }

  function findFunctions(node: TSNode): void {
    const funcTypes = new Set([
      "function_declaration",
      "function",
      "arrow_function",
      "method_definition",
    ]);

    if (funcTypes.has(node.type)) {
      const body = node.childForFieldName("body");
      if (body) {
        for (const child of body.children) {
          walk(child, 0);
        }
      }
      return;
    }

    for (const child of node.children) {
      findFunctions(child);
    }
  }

  findFunctions(rootNode);
  return complexity;
}

export async function computeCognitiveComplexity(
  code: string
): Promise<number> {
  const p = await getParser();
  const tree = p.parse(code);
  return computeFromTree(tree.rootNode);
}

export interface FunctionInfo {
  id: string;
  name: string;
  kind: "function" | "method" | "class";
  startLine: number;
  endLine: number;
  complexity: number;
  nestingDepth: number;
  lineCount: number;
  parameterCount: number;
}

function maxNesting(node: TSNode, depth: number): number {
  let max = 0;
  if (STRUCTURAL_TYPES.has(node.type)) {
    max = depth + 1;
  }
  for (const child of node.children) {
    const childMax = maxNesting(
      child,
      STRUCTURAL_TYPES.has(node.type) ? depth + 1 : depth
    );
    if (childMax > max) max = childMax;
  }
  return max;
}

function countParams(node: TSNode): number {
  const params = node.childForFieldName("parameters");
  if (!params) return 0;
  return params.namedChildren.length;
}

function extractFunctionsFromTree(
  rootNode: TSNode,
  filePath: string
): FunctionInfo[] {
  const functions: FunctionInfo[] = [];

  function visit(node: TSNode, parentClass?: string): void {
    if (node.type === "class_declaration" || node.type === "class") {
      const nameNode = node.childForFieldName("name");
      const className = (nameNode as any)?.text || "anonymous";
      for (const child of node.children) {
        visit(child, className);
      }
      return;
    }

    const funcTypes = new Set([
      "function_declaration",
      "method_definition",
    ]);

    if (funcTypes.has(node.type)) {
      const nameNode = node.childForFieldName("name");
      const name = (nameNode as any)?.text || "anonymous";
      const kind = node.type === "method_definition" ? "method" : "function";
      const startLine = (node as any).startPosition?.row ?? 0;
      const endLine = (node as any).endPosition?.row ?? 0;
      const lineCount = endLine - startLine + 1;

      let fnComplexity = 0;
      const body = node.childForFieldName("body");
      if (body) {
        const tempRoot: TSNode = {
          type: "program",
          parent: null,
          children: [node],
          namedChildren: [node],
          childForFieldName: () => null,
        };
        // Compute complexity for just this function
        let c = 0;
        function walkFn(n: TSNode, nesting: number): void {
          if (STRUCTURAL_TYPES.has(n.type)) {
            c += 1 + nesting;
            if (n.type === "if_statement") {
              for (const ch of n.children) {
                if (ch.type === "else_clause") {
                  handleElseFn(ch, nesting);
                } else {
                  walkFn(ch, nesting + 1);
                }
              }
              return;
            }
            for (const ch of n.children) {
              walkFn(ch, nesting + 1);
            }
            return;
          }
          if (
            n.type === "binary_expression" &&
            n.children.length >= 3 &&
            (n.children[1]?.type === "&&" || n.children[1]?.type === "||")
          ) {
            const op = n.children[1].type;
            const parentOp =
              n.parent?.type === "binary_expression"
                ? n.parent.children[1]?.type
                : null;
            if (parentOp !== op) c += 1;
            for (const ch of n.children) walkFn(ch, nesting);
            return;
          }
          if (
            (n.type === "break_statement" || n.type === "continue_statement") &&
            n.namedChildren.length > 0
          ) {
            c += 1;
          }
          for (const ch of n.children) walkFn(ch, nesting);
        }
        function handleElseFn(elseNode: TSNode, parentNesting: number): void {
          const child = elseNode.namedChildren[0];
          if (child?.type === "if_statement") {
            c += 1;
            for (const gc of child.children) {
              if (gc.type === "else_clause") handleElseFn(gc, parentNesting);
              else walkFn(gc, parentNesting + 1);
            }
          } else {
            c += 1;
            for (const ch of elseNode.children) walkFn(ch, parentNesting + 1);
          }
        }
        for (const ch of body.children) walkFn(ch, 0);
        fnComplexity = c;
      }

      const nesting = body ? maxNesting(body, 0) : 0;
      const prefix = parentClass ? `${parentClass}.` : "";
      const id = `${filePath}::${prefix}${name}`;

      functions.push({
        id,
        name: parentClass ? `${prefix}${name}` : name,
        kind: kind as "function" | "method",
        startLine,
        endLine,
        complexity: fnComplexity,
        nestingDepth: nesting,
        lineCount,
        parameterCount: countParams(node),
      });
      return;
    }

    for (const child of node.children) {
      visit(child, parentClass);
    }
  }

  visit(rootNode);
  return functions;
}

export async function extractFunctions(
  code: string,
  filePath: string
): Promise<FunctionInfo[]> {
  const p = await getParser();
  const tree = p.parse(code);
  return extractFunctionsFromTree(tree.rootNode, filePath);
}
