import Parser from "web-tree-sitter";
import { CodeGraph } from "./graph";

type SyntaxNode = Parser.SyntaxNode;

interface ExtractedFunction {
  id: string;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  node: SyntaxNode;
}

export function extractFromTree(
  tree: Parser.Tree,
  filePath: string,
  graph: CodeGraph,
): void {
  const fileId = `file:${filePath}`;
  graph.addEntity({
    id: fileId,
    kind: "file",
    name: filePath,
    filePath,
    startLine: 0,
    endLine: tree.rootNode.endPosition.row,
    metrics: {},
  });

  const functions: ExtractedFunction[] = [];
  const classes: { id: string; name: string; node: SyntaxNode }[] = [];

  walkNode(tree.rootNode, filePath, graph, functions, classes);
  extractCallEdges(functions, graph);
  extractImportEdges(tree.rootNode, filePath, graph);
}

function walkNode(
  node: SyntaxNode,
  filePath: string,
  graph: CodeGraph,
  functions: ExtractedFunction[],
  classes: { id: string; name: string; node: SyntaxNode }[],
  parentClass?: string,
): void {
  const fn = tryExtractFunction(node, filePath, parentClass);
  if (fn) {
    functions.push(fn);
    graph.addEntity({
      id: fn.id,
      kind: "function",
      name: fn.name,
      filePath,
      startLine: fn.startLine,
      endLine: fn.endLine,
      metrics: {},
    });
    graph.addEdge({
      source: parentClass ?? `file:${filePath}`,
      target: fn.id,
      kind: "contains",
      weight: 1,
    });
  }

  const cls = tryExtractClass(node, filePath);
  if (cls) {
    classes.push(cls);
    graph.addEntity({
      id: cls.id,
      kind: "class",
      name: cls.name,
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      metrics: {},
    });
    graph.addEdge({
      source: `file:${filePath}`,
      target: cls.id,
      kind: "contains",
      weight: 1,
    });

    const body = node.childForFieldName("body");
    if (body) {
      for (const member of body.namedChildren) {
        walkNode(member, filePath, graph, functions, classes, cls.id);
      }
    }
    return;
  }

  for (const child of node.namedChildren) {
    walkNode(child, filePath, graph, functions, classes, parentClass);
  }
}

function tryExtractFunction(
  node: SyntaxNode,
  filePath: string,
  parentClass?: string,
): ExtractedFunction | null {
  const funcTypes = [
    "function_declaration",
    "method_definition",
    "arrow_function",
    "function_expression",
    "function",
  ];

  if (!funcTypes.includes(node.type)) return null;

  const name = resolveFunctionName(node);
  if (!name) return null;

  const prefix = parentClass ? `${parentClass}.` : `file:${filePath}::`;
  const id = `${prefix}${name}`;

  return {
    id,
    name,
    filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    node,
  };
}

function resolveFunctionName(node: SyntaxNode): string | null {
  const nameNode = node.childForFieldName("name");
  if (nameNode) return nameNode.text;

  if (
    node.parent?.type === "variable_declarator" ||
    node.parent?.type === "pair" ||
    node.parent?.type === "assignment_expression"
  ) {
    const varName =
      node.parent.childForFieldName("name") ??
      node.parent.childForFieldName("key") ??
      node.parent.childForFieldName("left");
    if (varName) return varName.text;
  }

  if (node.parent?.type === "export_statement") {
    return "<default_export>";
  }

  return null;
}

function tryExtractClass(
  node: SyntaxNode,
  filePath: string,
): { id: string; name: string; node: SyntaxNode } | null {
  if (node.type !== "class_declaration" && node.type !== "class") return null;

  const nameNode = node.childForFieldName("name");
  if (!nameNode) return null;

  return {
    id: `file:${filePath}::${nameNode.text}`,
    name: nameNode.text,
    node,
  };
}

function extractCallEdges(
  functions: ExtractedFunction[],
  graph: CodeGraph,
): void {
  for (const fn of functions) {
    const callees = findCallExpressions(fn.node);
    for (const calleeName of callees) {
      const target = functions.find((f) => f.name === calleeName);
      if (target) {
        graph.addEdge({
          source: fn.id,
          target: target.id,
          kind: "calls",
          weight: 1,
        });
      }
    }
  }
}

function findCallExpressions(node: SyntaxNode): string[] {
  const calls: string[] = [];
  const queue: SyntaxNode[] = [node];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (current.type === "call_expression") {
      const fn = current.childForFieldName("function");
      if (fn) {
        if (fn.type === "member_expression") {
          const prop = fn.childForFieldName("property");
          if (prop) calls.push(prop.text);
        } else {
          calls.push(fn.text);
        }
      }
    }
    for (const child of current.namedChildren) {
      queue.push(child);
    }
  }

  return calls;
}

function extractImportEdges(
  root: SyntaxNode,
  filePath: string,
  graph: CodeGraph,
): void {
  const queue: SyntaxNode[] = [root];
  while (queue.length > 0) {
    const node = queue.pop()!;
    if (node.type === "import_statement") {
      const source = node.childForFieldName("source");
      if (source) {
        const importPath = source.text.replace(/['"]/g, "");
        if (importPath.startsWith(".")) {
          graph.addEdge({
            source: `file:${filePath}`,
            target: `file:${importPath}`,
            kind: "imports",
            weight: 1,
          });
        }
      }
    }
    for (const child of node.namedChildren) {
      queue.push(child);
    }
  }
}
