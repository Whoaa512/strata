import { Parser, Language, Tree } from "web-tree-sitter";
import { readFileSync } from "fs";
import { join, resolve } from "path";

let initialized = false;
let tsLang: Language;
let tsxLang: Language;
let jsLang: Language;

const WASM_DIR = resolve(join(import.meta.dir, "..", "node_modules"));

export async function initParser(): Promise<void> {
  if (initialized) return;

  await Parser.init();

  const [ts, tsx, js] = await Promise.all([
    Language.load(
      join(WASM_DIR, "tree-sitter-typescript/tree-sitter-typescript.wasm")
    ),
    Language.load(
      join(WASM_DIR, "tree-sitter-typescript/tree-sitter-tsx.wasm")
    ),
    Language.load(
      join(WASM_DIR, "tree-sitter-javascript/tree-sitter-javascript.wasm")
    ),
  ]);

  tsLang = ts;
  tsxLang = tsx;
  jsLang = js;
  initialized = true;
}

export type LangId = "typescript" | "tsx" | "javascript";

export function detectLang(filePath: string): LangId | null {
  if (filePath.endsWith(".tsx")) return "tsx";
  if (filePath.endsWith(".ts") && !filePath.endsWith(".d.ts")) return "typescript";
  if (filePath.endsWith(".jsx")) return "tsx";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs"))
    return "javascript";
  return null;
}

function getLang(langId: LangId): Language {
  switch (langId) {
    case "typescript":
      return tsLang;
    case "tsx":
      return tsxLang;
    case "javascript":
      return jsLang;
  }
}

const parserPool: Parser[] = [];

function acquireParser(langId: LangId): Parser {
  const p = parserPool.pop() ?? new Parser();
  p.setLanguage(getLang(langId));
  return p;
}

function releaseParser(p: Parser): void {
  parserPool.push(p);
}

export function parseSource(source: string, langId: LangId): Tree {
  const p = acquireParser(langId);
  const tree = p.parse(source);
  releaseParser(p);
  return tree;
}

export function parseFile(filePath: string): Tree | null {
  const langId = detectLang(filePath);
  if (!langId) return null;
  const source = readFileSync(filePath, "utf-8");
  return parseSource(source, langId);
}
