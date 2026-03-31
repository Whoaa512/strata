import ts from "typescript";
import path from "path";
import type { Entity, CallEdge } from "./schema";
import { runPlugins } from "./plugin";
import type { MetricPlugin } from "./plugin";
import { defaultPlugins } from "./metrics";

export interface ExtractionResult {
  entities: Entity[];
  callGraph: CallEdge[];
  errors: Array<{ filePath: string; error: string }>;
}

function entityId(filePath: string, name: string, line: number): string {
  return `${filePath}:${name}:${line}`;
}

function entityKind(
  node: ts.Node,
): Entity["kind"] {
  if (ts.isMethodDeclaration(node)) return "method";
  if (ts.isGetAccessorDeclaration(node)) return "getter";
  if (ts.isSetAccessorDeclaration(node)) return "setter";
  if (ts.isArrowFunction(node)) return "arrow";
  if (ts.isFunctionExpression(node)) return "function";
  if (ts.isFunctionDeclaration(node)) return "function";
  return "function";
}

function getFunctionName(node: ts.Node): string | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    return node.name?.getText();
  }

  if (ts.isVariableDeclaration(node.parent) && node.parent.name) {
    return node.parent.name.getText();
  }

  if (ts.isPropertyAssignment(node.parent) && node.parent.name) {
    return node.parent.name.getText();
  }

  if (ts.isPropertyDeclaration(node.parent) && node.parent.name) {
    return node.parent.name.getText();
  }

  return undefined;
}

export function createProgram(rootDir: string, filePatterns?: string[]): ts.Program {
  const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists);
  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rootDir);
    return ts.createProgram(parsed.fileNames, parsed.options);
  }

  const files = filePatterns ?? findTsFiles(rootDir);
  return ts.createProgram(files, {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    noEmit: true,
  });
}

export function createProgramFromConfig(configPath: string, rootDir: string): ts.Program {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  );
  return ts.createProgram(parsed.fileNames, parsed.options);
}

export function createLightProgram(files: string[]): ts.Program {
  return ts.createProgram(files, {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    allowJs: true,
    noEmit: true,
    noResolve: true,
  });
}

function findTsFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string) {
    for (const entry of ts.sys.readDirectory!(d, [".ts", ".tsx", ".js", ".jsx"], ["node_modules", "dist", ".git"])) {
      files.push(entry);
    }
  }
  walk(dir);
  return files;
}

export function extract(
  program: ts.Program,
  rootDir: string,
  plugins: MetricPlugin[] = defaultPlugins,
): ExtractionResult {
  const checker = program.getTypeChecker();
  const entities: Entity[] = [];
  const callGraph: CallEdge[] = [];
  const errors: ExtractionResult["errors"] = [];
  const symbolToEntityId = new Map<ts.Symbol, string>();

  const resolvedRootDir = path.resolve(rootDir);

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const absPath = path.resolve(sourceFile.fileName);
    if (!absPath.startsWith(resolvedRootDir)) continue;

    const relPath = path.relative(resolvedRootDir, absPath);

    try {
      extractEntities(sourceFile, relPath, checker, plugins, entities, symbolToEntityId);
    } catch (e) {
      errors.push({ filePath: relPath, error: String(e) });
    }
  }

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const absPath = path.resolve(sourceFile.fileName);
    if (!absPath.startsWith(resolvedRootDir)) continue;

    try {
      extractCalls(sourceFile, checker, symbolToEntityId, callGraph);
    } catch (e) {
      // call extraction errors are non-fatal
    }
  }

  return { entities, callGraph, errors };
}

function extractEntities(
  sourceFile: ts.SourceFile,
  relPath: string,
  checker: ts.TypeChecker,
  plugins: MetricPlugin[],
  entities: Entity[],
  symbolToEntityId: Map<ts.Symbol, string>,
) {
  function visit(node: ts.Node) {
    if (isFunctionLike(node)) {
      const name = getFunctionName(node) ?? "<anonymous>";
      if (name === "<anonymous>") {
        ts.forEachChild(node, visit);
        return;
      }

      const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      const id = entityId(relPath, name, startLine);
      const metrics = runPlugins(plugins, node as ts.FunctionLikeDeclaration, sourceFile);

      entities.push({
        id,
        name,
        kind: entityKind(node),
        filePath: relPath,
        startLine,
        endLine,
        metrics,
      });

      let sym: ts.Symbol | undefined;
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
        sym = node.name ? checker.getSymbolAtLocation(node.name) : undefined;
      } else if (ts.isVariableDeclaration(node.parent)) {
        sym = checker.getSymbolAtLocation(node.parent.name);
      }

      if (sym) {
        symbolToEntityId.set(sym, id);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function extractCalls(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  symbolToEntityId: Map<ts.Symbol, string>,
  callGraph: CallEdge[],
) {
  const seen = new Set<string>();

  function visit(node: ts.Node, currentEntityId: string | undefined) {
    if (isFunctionLike(node)) {
      const name = getFunctionName(node);
      if (name && name !== "<anonymous>") {
        const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const relPath = sourceFile.fileName;
        currentEntityId = findEntityIdByPosition(symbolToEntityId, node, checker);
      }
    }

    if (ts.isCallExpression(node) && currentEntityId) {
      const calledSym = resolveCallSymbol(node.expression, checker);
      if (calledSym) {
        const calleeId = symbolToEntityId.get(calledSym);
        if (calleeId && calleeId !== currentEntityId) {
          const edgeKey = `${currentEntityId}->${calleeId}`;
          if (!seen.has(edgeKey)) {
            seen.add(edgeKey);
            callGraph.push({ caller: currentEntityId, callee: calleeId });
          }
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, currentEntityId));
  }

  visit(sourceFile, undefined);
}

function findEntityIdByPosition(
  symbolToEntityId: Map<ts.Symbol, string>,
  node: ts.Node,
  checker: ts.TypeChecker,
): string | undefined {
  let sym: ts.Symbol | undefined;
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    sym = node.name ? checker.getSymbolAtLocation(node.name) : undefined;
  } else if (ts.isVariableDeclaration(node.parent)) {
    sym = checker.getSymbolAtLocation(node.parent.name);
  }
  if (sym) return symbolToEntityId.get(sym);
  return undefined;
}

function resolveCallSymbol(
  expr: ts.Expression,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  let sym = checker.getSymbolAtLocation(expr);
  if (!sym) return undefined;

  if (sym.flags & ts.SymbolFlags.Alias) {
    sym = checker.getAliasedSymbol(sym);
  }

  return sym;
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}
