import { Parser, Language, Node as SyntaxNode } from "web-tree-sitter";
import path from "path";
import fs from "fs";
import type { Entity, CallEdge } from "./schema";
import type { ExtractionResult } from "./extract";
import type { LanguageExtractor } from "./extractor";

await Parser.init();
const PythonLang = await Language.load(
  path.join(import.meta.dir, "../node_modules/tree-sitter-python/tree-sitter-python.wasm"),
);

function entityId(filePath: string, name: string, line: number): string {
  return `${filePath}:${name}:${line}`;
}

function isInsideClass(node: SyntaxNode): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.type === "class_definition") return true;
    if (parent.type === "function_definition") return false;
    if (parent.type === "decorated_definition") {
      const dd = parent;
      parent = dd.parent;
      continue;
    }
    parent = parent.parent;
  }
  return false;
}

function paramCount(funcNode: SyntaxNode): number {
  const params = funcNode.childForFieldName("parameters");
  if (!params) return 0;
  let count = 0;
  for (const child of params.namedChildren) {
    if (child.type === "identifier" || child.type === "default_parameter" ||
        child.type === "typed_parameter" || child.type === "typed_default_parameter" ||
        child.type === "list_splat_pattern" || child.type === "dictionary_splat_pattern") {
      count++;
    }
  }
  return count;
}

function calcCyclomatic(bodyNode: SyntaxNode): number {
  let complexity = 1;
  function walk(node: SyntaxNode) {
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
  }
  walk(bodyNode);
  return complexity;
}

function calcCognitive(bodyNode: SyntaxNode): number {
  let total = 0;

  function walk(node: SyntaxNode, nesting: number) {
    for (const child of node.children) {
      let childNesting = nesting;
      switch (child.type) {
        case "if_statement":
        case "for_statement":
        case "while_statement":
          total += 1 + nesting;
          walkChildren(child, nesting + 1);
          continue;
        case "elif_clause":
          total += 1 + nesting;
          walkChildren(child, nesting + 1);
          continue;
        case "else_clause":
          walkChildren(child, nesting + 1);
          continue;
        case "boolean_operator":
          total += 1;
          walk(child, nesting);
          continue;
      }
      walk(child, childNesting);
    }
  }

  function walkChildren(node: SyntaxNode, nesting: number) {
    for (const child of node.children) {
      walk(child, nesting);
    }
  }

  walk(bodyNode, 0);
  return total;
}

function calcMaxNesting(bodyNode: SyntaxNode): number {
  let maxDepth = 0;

  function walk(node: SyntaxNode, depth: number) {
    for (const child of node.children) {
      switch (child.type) {
        case "if_statement":
        case "for_statement":
        case "while_statement":
        case "try_statement": {
          const newDepth = depth + 1;
          if (newDepth > maxDepth) maxDepth = newDepth;
          walk(child, newDepth);
          continue;
        }
        case "elif_clause":
        case "else_clause":
        case "except_clause": {
          if (depth > maxDepth) maxDepth = depth;
          walk(child, depth);
          continue;
        }
      }
      walk(child, depth);
    }
  }

  walk(bodyNode, 0);
  return maxDepth;
}

function extractCalls(bodyNode: SyntaxNode): string[] {
  const calls: string[] = [];
  function walk(node: SyntaxNode) {
    if (node.type === "call") {
      const fn = node.childForFieldName("function");
      if (fn) {
        if (fn.type === "identifier") {
          calls.push(fn.text);
        } else if (fn.type === "attribute") {
          const attr = fn.childForFieldName("attribute");
          if (attr) calls.push(attr.text);
        }
      }
    }
    for (const child of node.children) {
      walk(child);
    }
  }
  walk(bodyNode);
  return calls;
}

function hasError(node: SyntaxNode): boolean {
  if (node.type === "ERROR" || node.hasError) return true;
  return false;
}

function extractFile(
  filePath: string,
  source: string,
): { entities: Entity[]; callsMap: Map<string, string[]>; hasErrors: boolean } {
  const parser = new Parser();
  parser.setLanguage(PythonLang);
  const tree = parser.parse(source);

  const entities: Entity[] = [];
  const callsMap = new Map<string, string[]>();
  const rootHasErrors = tree.rootNode.hasError;

  function visitFunction(node: SyntaxNode, insideClass: boolean) {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const name = nameNode.text;
    const kind = insideClass ? "method" : "function";
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const body = node.childForFieldName("body");
    const id = entityId(filePath, name, startLine);

    const entity: Entity = {
      id,
      name,
      kind,
      filePath,
      startLine,
      endLine,
      metrics: {
        cyclomatic: calcCyclomatic(node),
        cognitive: calcCognitive(node),
        loc: endLine - startLine + 1,
        maxNestingDepth: calcMaxNesting(node),
        parameterCount: paramCount(node),
      },
    };
    entities.push(entity);

    if (body) {
      callsMap.set(id, extractCalls(body));
    }

    if (body) {
      walkNodes(body, false);
    }
  }

  function visitClass(node: SyntaxNode) {
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

    const body = node.childForFieldName("body");
    if (body) {
      walkNodes(body, true);
    }
  }

  function walkNodes(node: SyntaxNode, insideClass: boolean) {
    for (const child of node.namedChildren) {
      if (child.type === "function_definition") {
        visitFunction(child, insideClass);
      } else if (child.type === "class_definition") {
        visitClass(child);
      } else if (child.type === "decorated_definition") {
        const inner = child.namedChildren.find(
          (c) => c.type === "function_definition" || c.type === "class_definition",
        );
        if (inner?.type === "function_definition") {
          visitFunction(inner, insideClass);
        } else if (inner?.type === "class_definition") {
          visitClass(inner);
        }
      }
    }
  }

  walkNodes(tree.rootNode, false);

  return { entities, callsMap, hasErrors: rootHasErrors };
}

export class PythonExtractor implements LanguageExtractor {
  extensions = [".py"];

  extract(rootDir: string, filePaths: string[]): ExtractionResult {
    const allEntities: Entity[] = [];
    const allCallsMap = new Map<string, string[]>();
    const errors: Array<{ filePath: string; error: string }> = [];

    for (const absPath of filePaths) {
      const relPath = path.relative(rootDir, absPath);
      let source: string;
      try {
        source = fs.readFileSync(absPath, "utf-8");
      } catch (err) {
        errors.push({ filePath: relPath, error: String(err) });
        continue;
      }

      const result = extractFile(relPath, source);
      allEntities.push(...result.entities);
      for (const [k, v] of result.callsMap) {
        allCallsMap.set(k, v);
      }
      if (result.hasErrors) {
        errors.push({ filePath: relPath, error: "Parse error" });
      }
    }

    const entityNameToId = new Map<string, string>();
    for (const e of allEntities) {
      if (e.kind !== "class") {
        entityNameToId.set(e.name, e.id);
      }
    }

    const callGraph: CallEdge[] = [];
    for (const [callerId, calls] of allCallsMap) {
      for (const calleeName of calls) {
        const calleeId = entityNameToId.get(calleeName);
        if (calleeId && calleeId !== callerId) {
          callGraph.push({ caller: callerId, callee: calleeId });
        }
      }
    }

    return { entities: allEntities, callGraph, errors };
  }
}
