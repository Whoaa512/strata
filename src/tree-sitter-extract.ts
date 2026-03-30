import { Parser, Language, type Node, type Tree } from "web-tree-sitter";
import path from "path";
import fs from "fs";
import type { Entity, CallEdge, Metrics } from "./schema";
import type { ExtractionResult } from "./extract";
import type { LanguageExtractor } from "./extractor";

await Parser.init();

type SyntaxNode = Node;

export interface LangConfig {
  extensions: string[];
  wasmPath: string;
  funcTypes: string[];
  methodTypes: string[];
  classTypes: string[];
  cyclomaticBranches: string[];
  cyclomaticBoolOps: string[];
  nestingTypes: string[];
  callType: string;
  getCallName: (node: SyntaxNode) => string | undefined;
  getParamCount: (node: SyntaxNode) => number;
  isMethod: (node: SyntaxNode) => boolean;
  getEntityName: (node: SyntaxNode) => string | undefined;
  getClassName: (node: SyntaxNode) => string | undefined;
}

function entityId(filePath: string, name: string, line: number): string {
  return `${filePath}:${name}:${line}`;
}

function computeCyclomatic(body: SyntaxNode, config: LangConfig): number {
  let cc = 1;
  const walk = (node: SyntaxNode) => {
    if (config.cyclomaticBranches.includes(node.type)) {
      cc++;
    } else if (config.cyclomaticBoolOps.length > 0) {
      if (node.type === "boolean_operator") {
        cc++;
      } else if (node.type === "binary_expression") {
        const op = node.childForFieldName("operator")?.text
          ?? node.children.find((c: SyntaxNode) => config.cyclomaticBoolOps.includes(c.type ?? ""))?.type;
        if (op && config.cyclomaticBoolOps.includes(op)) cc++;
      }
    }
    for (const child of node.children) {
      walk(child);
    }
  };
  walk(body);
  return cc;
}

function computeCognitive(body: SyntaxNode, config: LangConfig): { cognitive: number; maxDepth: number } {
  let cognitive = 0;
  let maxDepth = 0;

  const walk = (node: SyntaxNode, nesting: number) => {
    if (config.nestingTypes.includes(node.type)) {
      cognitive += 1 + nesting;
      const newNesting = nesting + 1;
      if (newNesting > maxDepth) maxDepth = newNesting;
      for (const child of node.children) {
        walk(child, newNesting);
      }
      return;
    }

    if (node.type === "elif_clause" || node.type === "except_clause" || node.type === "else_clause") {
      cognitive += 1;
    }

    if (node.type === "boolean_operator") {
      cognitive += 1;
    } else if (node.type === "binary_expression") {
      const op = node.childForFieldName("operator")?.text
        ?? node.children.find((c: SyntaxNode) => config.cyclomaticBoolOps.includes(c.type ?? ""))?.type;
      if (op && config.cyclomaticBoolOps.includes(op)) cognitive += 1;
    }

    for (const child of node.children) {
      walk(child, nesting);
    }
  };

  walk(body, 0);
  return { cognitive, maxDepth };
}

function collectCalls(body: SyntaxNode, config: LangConfig): string[] {
  const calls: string[] = [];
  const walk = (node: SyntaxNode) => {
    if (node.type === config.callType) {
      const name = config.getCallName(node);
      if (name) calls.push(name);
    }
    for (const child of node.children) {
      walk(child);
    }
  };
  walk(body);
  return calls;
}

interface ExtractedEntity {
  entity: Entity;
  calls: string[];
}

function extractFromTree(
  tree: Tree,
  filePath: string,
  config: LangConfig,
): { entities: ExtractedEntity[]; classEntities: Entity[] } {
  const entities: ExtractedEntity[] = [];
  const classEntities: Entity[] = [];
  const allFuncTypes = [...config.funcTypes, ...config.methodTypes];

  const walk = (node: SyntaxNode) => {
    if (allFuncTypes.includes(node.type)) {
      const name = config.getEntityName(node);
      if (!name) {
        for (const child of node.children) walk(child);
        return;
      }

      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const kind: Entity["kind"] = config.isMethod(node) ? "method" : "function";
      const body = node.childForFieldName("body");
      const params = config.getParamCount(node);

      const cc = body ? computeCyclomatic(body, config) : 1;
      const cog = body ? computeCognitive(body, config) : { cognitive: 0, maxDepth: 0 };

      const id = entityId(filePath, name, startLine);
      entities.push({
        entity: {
          id,
          name,
          kind,
          filePath,
          startLine,
          endLine,
          metrics: {
            cyclomatic: cc,
            cognitive: cog.cognitive,
            loc: endLine - startLine + 1,
            maxNestingDepth: cog.maxDepth,
            parameterCount: params,
          },
        },
        calls: body ? collectCalls(body, config) : [],
      });
    }

    if (config.classTypes.includes(node.type)) {
      const name = config.getClassName(node);
      if (name) {
        const startLine = node.startPosition.row + 1;
        const endLine = node.endPosition.row + 1;
        classEntities.push({
          id: entityId(filePath, name, startLine),
          name,
          kind: "class",
          filePath,
          startLine,
          endLine,
          metrics: { cyclomatic: 0, cognitive: 0, loc: endLine - startLine + 1, maxNestingDepth: 0, parameterCount: 0 },
        });
      }
    }

    for (const child of node.children) {
      walk(child);
    }
  };

  walk(tree.rootNode);
  return { entities, classEntities };
}

export class TreeSitterExtractor implements LanguageExtractor {
  extensions: string[];
  private config: LangConfig;
  private lang: Language;

  constructor(config: LangConfig, lang: Language) {
    this.extensions = config.extensions;
    this.config = config;
    this.lang = lang;
  }

  extract(rootDir: string, filePaths: string[]): ExtractionResult {
    const parser = new Parser();
    parser.setLanguage(this.lang);

    const allExtracted: ExtractedEntity[] = [];
    const allClassEntities: Entity[] = [];
    const errors: ExtractionResult["errors"] = [];

    for (const absPath of filePaths) {
      const relPath = path.relative(rootDir, absPath);
      try {
        const source = fs.readFileSync(absPath, "utf-8");
        const tree = parser.parse(source);
        if (!tree) {
          errors.push({ filePath: relPath, error: "Parser returned null" });
          continue;
        }

        if (tree.rootNode.hasError) {
          errors.push({ filePath: relPath, error: "Syntax error in file" });
        }

        const { entities, classEntities } = extractFromTree(tree, relPath, this.config);
        allExtracted.push(...entities);
        allClassEntities.push(...classEntities);
      } catch (err: any) {
        errors.push({ filePath: relPath, error: err.message ?? String(err) });
      }
    }

    const nameToId = new Map<string, string>();
    for (const { entity } of allExtracted) {
      nameToId.set(entity.name, entity.id);
    }

    const callGraph: CallEdge[] = [];
    const seen = new Set<string>();
    for (const { entity, calls } of allExtracted) {
      for (const calleeName of calls) {
        const calleeId = nameToId.get(calleeName);
        if (!calleeId || calleeId === entity.id) continue;
        const key = `${entity.id}->${calleeId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        callGraph.push({ caller: entity.id, callee: calleeId });
      }
    }

    return {
      entities: [...allExtracted.map((e) => e.entity), ...allClassEntities],
      callGraph,
      errors,
    };
  }
}

export async function loadLanguage(wasmPath: string): Promise<Language> {
  return Language.load(wasmPath);
}
