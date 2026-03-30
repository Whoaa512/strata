import { Parser, Language } from "web-tree-sitter";
import path from "path";
import fs from "fs";
import type { Entity, CallEdge } from "./schema";
import type { ExtractionResult } from "./extract";
import type { LanguageExtractor } from "./extractor";

await Parser.init();
const GoLang = await Language.load(
  path.join(import.meta.dir, "../node_modules/tree-sitter-go/tree-sitter-go.wasm"),
);

function entityId(filePath: string, name: string, line: number): string {
  return `${filePath}:${name}:${line}`;
}

function countParams(paramsNode: Parser.SyntaxNode): number {
  let count = 0;
  for (const child of paramsNode.namedChildren) {
    if (child.type !== "parameter_declaration") continue;
    const identifiers = child.namedChildren.filter((c) => c.type === "identifier");
    count += Math.max(identifiers.length, 1);
  }
  return count;
}

function computeCyclomatic(node: Parser.SyntaxNode): number {
  let complexity = 1;
  function walk(n: Parser.SyntaxNode) {
    switch (n.type) {
      case "if_statement":
      case "for_statement":
      case "expression_case":
        complexity++;
        break;
    }
    for (const child of n.namedChildren) {
      walk(child);
    }
  }
  walk(node);
  return complexity;
}

function computeCognitive(body: Parser.SyntaxNode): { cognitive: number; maxDepth: number } {
  let cognitive = 0;
  let maxDepth = 0;

  function walk(n: Parser.SyntaxNode, depth: number) {
    let increment = false;
    switch (n.type) {
      case "if_statement":
      case "for_statement":
        increment = true;
        break;
    }

    if (increment) {
      cognitive += 1 + depth;
      const newDepth = depth + 1;
      if (newDepth > maxDepth) maxDepth = newDepth;
      for (const child of n.namedChildren) {
        walk(child, newDepth);
      }
      return;
    }

    for (const child of n.namedChildren) {
      walk(child, depth);
    }
  }

  for (const child of body.namedChildren) {
    walk(child, 0);
  }
  return { cognitive, maxDepth };
}

function extractCalls(body: Parser.SyntaxNode): string[] {
  const calls: string[] = [];
  function walk(n: Parser.SyntaxNode) {
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function");
      if (fn) {
        const text = fn.type === "selector_expression"
          ? fn.childForFieldName("field")?.text ?? fn.text
          : fn.text;
        if (text) calls.push(text);
      }
    }
    for (const child of n.namedChildren) {
      walk(child);
    }
  }
  walk(body);
  return calls;
}

function hasError(node: Parser.SyntaxNode): boolean {
  if (node.type === "ERROR" || node.hasError) return true;
  return false;
}

export class GoExtractor implements LanguageExtractor {
  extensions = [".go"];

  extract(rootDir: string, filePaths: string[]): ExtractionResult {
    const parser = new Parser();
    parser.setLanguage(GoLang);

    const entities: Entity[] = [];
    const callGraph: CallEdge[] = [];
    const errors: Array<{ filePath: string; error: string }> = [];

    for (const absPath of filePaths) {
      const relPath = path.relative(rootDir, absPath);
      let source: string;
      try {
        source = fs.readFileSync(absPath, "utf-8");
      } catch (e: any) {
        errors.push({ filePath: relPath, error: e.message });
        continue;
      }

      const tree = parser.parse(source);

      if (tree.rootNode.hasError) {
        errors.push({ filePath: relPath, error: "syntax error" });
      }

      for (const node of tree.rootNode.namedChildren) {
        if (node.type !== "function_declaration" && node.type !== "method_declaration") continue;

        const nameNode = node.childForFieldName("name");
        if (!nameNode) continue;

        const name = nameNode.text;
        const kind = node.type === "method_declaration" ? "method" : "function";
        const startLine = node.startPosition.row + 1;
        const endLine = node.endPosition.row + 1;
        const body = node.childForFieldName("body");
        const params = node.childForFieldName("parameters");

        const parameterCount = params ? countParams(params) : 0;
        const loc = endLine - startLine + 1;
        const cyclomatic = body ? computeCyclomatic(body) : 1;
        const { cognitive, maxDepth } = body
          ? computeCognitive(body)
          : { cognitive: 0, maxDepth: 0 };

        const id = entityId(relPath, name, startLine);
        entities.push({
          id,
          name,
          kind,
          filePath: relPath,
          startLine,
          endLine,
          metrics: { cyclomatic, cognitive, loc, maxNestingDepth: maxDepth, parameterCount },
        });

        if (body) {
          const callNames = extractCalls(body);
          for (const callee of callNames) {
            callGraph.push({ caller: id, callee });
          }
        }
      }
    }

    const entityByName = new Map<string, string>();
    for (const e of entities) {
      entityByName.set(e.name, e.id);
    }
    for (let i = 0; i < callGraph.length; i++) {
      const resolved = entityByName.get(callGraph[i].callee);
      if (resolved) {
        callGraph[i] = { caller: callGraph[i].caller, callee: resolved };
      } else {
        callGraph.splice(i, 1);
        i--;
      }
    }

    return { entities, callGraph, errors };
  }
}
