import { Parser, Language } from "web-tree-sitter";
import path from "path";
import fs from "fs";
import type { Entity, CallEdge } from "./schema";
import type { ExtractionResult } from "./extract";
import type { LanguageExtractor } from "./extractor";

await Parser.init();
const PythonLang = await Language.load(
  path.join(import.meta.dir, "../node_modules/tree-sitter-python/tree-sitter-python.wasm"),
);

type SyntaxNode = Parser.SyntaxNode;

function entityId(filePath: string, name: string, line: number): string {
  return `${filePath}:${name}:${line}`;
}

function paramCount(node: SyntaxNode): number {
  const params = node.childForFieldName("parameters");
  if (!params) return 0;
  return params.namedChildren.filter(
    (c) =>
      c.type === "identifier" ||
      c.type === "default_parameter" ||
      c.type === "typed_parameter" ||
      c.type === "typed_default_parameter" ||
      c.type === "list_splat_pattern" ||
      c.type === "dictionary_splat_pattern",
  ).length;
}

function computeCyclomatic(body: SyntaxNode): number {
  let complexity = 1;
  const walk = (node: SyntaxNode) => {
    switch (node.type) {
      case "if_statement":
      case "elif_clause":
      case "for_statement":
      case "while_statement":
      case "except_clause":
        complexity++;
        break;
      case "boolean_operator":
        complexity++;
        break;
    }
    for (const child of node.children) {
      walk(child);
    }
  };
  walk(body);
  return complexity;
}

function computeCognitive(body: SyntaxNode, baseNesting: number): { cognitive: number; maxDepth: number } {
  let cognitive = 0;
  let maxDepth = baseNesting;

  const walk = (node: SyntaxNode, nesting: number) => {
    const incrementsNesting =
      node.type === "if_statement" ||
      node.type === "for_statement" ||
      node.type === "while_statement";

    if (incrementsNesting) {
      cognitive += 1 + nesting;
      const newNesting = nesting + 1;
      if (newNesting > maxDepth) maxDepth = newNesting;
      for (const child of node.children) {
        walk(child, newNesting);
      }
      return;
    }

    if (node.type === "elif_clause" || node.type === "except_clause") {
      cognitive += 1;
    }

    if (node.type === "boolean_operator") {
      cognitive += 1;
    }

    for (const child of node.children) {
      walk(child, nesting);
    }
  };

  walk(body, baseNesting);
  return { cognitive, maxDepth };
}

function collectCalls(body: SyntaxNode): string[] {
  const calls: string[] = [];
  const walk = (node: SyntaxNode) => {
    if (node.type === "call") {
      const fn = node.childForFieldName("function");
      if (fn && fn.type === "identifier") {
        calls.push(fn.text);
      } else if (fn && fn.type === "attribute") {
        const attr = fn.childForFieldName("attribute");
        if (attr) calls.push(attr.text);
      }
    }
    for (const child of node.children) {
      walk(child);
    }
  };
  walk(body);
  return calls;
}

function hasError(node: SyntaxNode): boolean {
  if (node.type === "ERROR" || node.hasError) return true;
  return false;
}

function isInsideClass(node: SyntaxNode): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.type === "class_definition") return true;
    if (parent.type === "decorated_definition") {
      const grandparent = parent.parent;
      if (grandparent && grandparent.type === "class_definition") return true;
      if (grandparent && grandparent.type === "block") {
        const block_parent = grandparent.parent;
        if (block_parent && block_parent.type === "class_definition") return true;
      }
    }
    if (parent.type === "block") {
      const blockParent = parent.parent;
      if (blockParent && blockParent.type === "class_definition") return true;
    }
    parent = parent.parent;
  }
  return false;
}

function extractFromTree(
  tree: Parser.Tree,
  filePath: string,
): { entities: Entity[]; callsByEntity: Map<string, string[]> } {
  const entities: Entity[] = [];
  const callsByEntity = new Map<string, string[]>();

  const walk = (node: SyntaxNode) => {
    if (node.type === "function_definition") {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return;

      const name = nameNode.text;
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const kind = isInsideClass(node) ? "method" : "function";
      const body = node.childForFieldName("body");
      const params = paramCount(node);

      const cyc = body ? computeCyclomatic(body) : 1;
      const { cognitive, maxDepth } = body
        ? computeCognitive(body, 0)
        : { cognitive: 0, maxDepth: 0 };

      const id = entityId(filePath, name, startLine);
      entities.push({
        id,
        name,
        kind,
        filePath,
        startLine,
        endLine,
        metrics: {
          cyclomatic: cyc,
          cognitive,
          loc: endLine - startLine + 1,
          maxNestingDepth: maxDepth,
          parameterCount: params,
        },
      });

      if (body) {
        callsByEntity.set(id, collectCalls(body));
      }
    }

    if (node.type === "class_definition") {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return;

      const name = nameNode.text;
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const id = entityId(filePath, name, startLine);

      entities.push({
        id,
        name,
        kind: "class",
        filePath,
        startLine,
        endLine,
        metrics: {
          cyclomatic: 0,
          cognitive: 0,
          loc: endLine - startLine + 1,
          maxNestingDepth: 0,
          parameterCount: 0,
        },
      });
    }

    for (const child of node.children) {
      walk(child);
    }
  };

  walk(tree.rootNode);
  return { entities, callsByEntity };
}

export class PythonExtractor implements LanguageExtractor {
  extensions = [".py"];

  extract(rootDir: string, filePaths: string[]): ExtractionResult {
    const parser = new Parser();
    parser.setLanguage(PythonLang);

    const allEntities: Entity[] = [];
    const allCallsByEntity = new Map<string, string[]>();
    const errors: Array<{ filePath: string; error: string }> = [];

    for (const absPath of filePaths) {
      const relPath = path.relative(rootDir, absPath);
      try {
        const source = fs.readFileSync(absPath, "utf-8");
        const tree = parser.parse(source);

        if (tree.rootNode.hasError) {
          errors.push({ filePath: relPath, error: "Syntax error in file" });
        }

        const { entities, callsByEntity } = extractFromTree(tree, relPath);
        for (const e of entities) allEntities.push(e);
        for (const [k, v] of callsByEntity) allCallsByEntity.set(k, v);
      } catch (err: any) {
        errors.push({ filePath: relPath, error: err.message ?? String(err) });
      }
    }

    const nameToId = new Map<string, string>();
    for (const e of allEntities) {
      if (e.kind !== "class") {
        nameToId.set(e.name, e.id);
      }
    }

    const callGraph: CallEdge[] = [];
    for (const [callerId, calls] of allCallsByEntity) {
      for (const calleeName of calls) {
        const calleeId = nameToId.get(calleeName);
        if (calleeId && calleeId !== callerId) {
          callGraph.push({ caller: callerId, callee: calleeId });
        }
      }
    }

    return { entities: allEntities, callGraph, errors };
  }
}
