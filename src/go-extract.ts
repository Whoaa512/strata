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

type SyntaxNode = Parser.SyntaxNode;

function entityId(filePath: string, name: string, line: number): string {
  return `${filePath}:${name}:${line}`;
}

function countParams(paramsNode: SyntaxNode | null): number {
  if (!paramsNode) return 0;
  let count = 0;
  for (const child of paramsNode.namedChildren) {
    if (child.type !== "parameter_declaration") continue;
    const identifiers = child.namedChildren.filter((c) => c.type === "identifier");
    count += identifiers.length > 0 ? identifiers.length : 1;
  }
  return count;
}

function cyclomatic(body: SyntaxNode): number {
  let cc = 1;
  function walk(node: SyntaxNode) {
    switch (node.type) {
      case "if_statement":
      case "for_statement":
      case "expression_case":
        cc++;
        break;
      case "binary_expression": {
        const op = node.childForFieldName("operator")?.text ?? node.children.find((c) => c.type === "&&" || c.type === "||")?.type;
        if (op === "&&" || op === "||") cc++;
        break;
      }
    }
    for (const child of node.namedChildren) {
      walk(child);
    }
  }
  walk(body);
  return cc;
}

function cognitive(body: SyntaxNode): { cognitive: number; maxDepth: number } {
  let score = 0;
  let maxDepth = 0;

  function walk(node: SyntaxNode, depth: number) {
    let increment = false;
    if (node.type === "if_statement" || node.type === "for_statement") {
      increment = true;
      score += 1 + depth;
      const newDepth = depth + 1;
      if (newDepth > maxDepth) maxDepth = newDepth;
      for (const child of node.namedChildren) {
        walk(child, newDepth);
      }
      return;
    }
    for (const child of node.namedChildren) {
      walk(child, depth);
    }
  }

  walk(body, 0);
  return { cognitive: score, maxDepth };
}

function extractCalls(body: SyntaxNode): string[] {
  const calls: string[] = [];
  function walk(node: SyntaxNode) {
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      if (fn) {
        const name = fn.type === "selector_expression"
          ? fn.childForFieldName("field")?.text
          : fn.text;
        if (name) calls.push(name);
      }
    }
    for (const child of node.namedChildren) {
      walk(child);
    }
  }
  walk(body);
  return calls;
}

function hasError(node: SyntaxNode): boolean {
  if (node.type === "ERROR" || node.isMissing) return true;
  for (const child of node.children) {
    if (hasError(child)) return true;
  }
  return false;
}

export class GoExtractor implements LanguageExtractor {
  extensions = [".go"];

  extract(rootDir: string, filePaths: string[]): ExtractionResult {
    const parser = new Parser();
    parser.setLanguage(GoLang);

    const entities: Entity[] = [];
    const callGraph: CallEdge[] = [];
    const errors: ExtractionResult["errors"] = [];

    for (const absPath of filePaths) {
      const relPath = path.relative(rootDir, absPath);
      const source = fs.readFileSync(absPath, "utf-8");
      const tree = parser.parse(source);

      if (hasError(tree.rootNode)) {
        errors.push({ filePath: relPath, error: "syntax error" });
      }

      const fileEntities: Entity[] = [];

      for (const node of tree.rootNode.namedChildren) {
        if (node.type !== "function_declaration" && node.type !== "method_declaration") continue;

        const nameNode = node.childForFieldName("name");
        if (!nameNode) continue;

        const name = nameNode.text;
        const kind: Entity["kind"] = node.type === "method_declaration" ? "method" : "function";
        const startLine = node.startPosition.row + 1;
        const endLine = node.endPosition.row + 1;
        const body = node.childForFieldName("body");
        const params = node.childForFieldName("parameters");
        const loc = endLine - startLine + 1;
        const cc = body ? cyclomatic(body) : 1;
        const cog = body ? cognitive(body) : { cognitive: 0, maxDepth: 0 };

        const entity: Entity = {
          id: entityId(relPath, name, startLine),
          name,
          kind,
          filePath: relPath,
          startLine,
          endLine,
          metrics: {
            cyclomatic: cc,
            cognitive: cog.cognitive,
            loc,
            maxNestingDepth: cog.maxDepth,
            parameterCount: countParams(params),
          },
        };

        fileEntities.push(entity);
        entities.push(entity);
      }

      const entityNames = new Set(fileEntities.map((e) => e.name));
      for (const entity of fileEntities) {
        const funcNode = tree.rootNode.namedChildren.find(
          (n) =>
            (n.type === "function_declaration" || n.type === "method_declaration") &&
            n.childForFieldName("name")?.text === entity.name,
        );
        const body = funcNode?.childForFieldName("body");
        if (!body) continue;

        for (const callee of extractCalls(body)) {
          if (entityNames.has(callee) && callee !== entity.name) {
            const target = fileEntities.find((e) => e.name === callee);
            if (target) {
              callGraph.push({ caller: entity.id, callee: target.id });
            }
          }
        }
      }
    }

    return { entities, callGraph, errors };
  }
}
