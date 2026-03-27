import Parser from "web-tree-sitter";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

let tsParser: Parser | null = null;
let tsxParser: Parser | null = null;
let jsParser: Parser | null = null;
let initialized = false;

const GRAMMAR_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../node_modules/tree-sitter-wasms/out",
);

async function ensureInit(): Promise<void> {
  if (initialized) return;
  await Parser.init();
  initialized = true;
}

async function loadParser(langFile: string): Promise<Parser> {
  await ensureInit();
  const parser = new Parser();
  const lang = await Parser.Language.load(resolve(GRAMMAR_DIR, langFile));
  parser.setLanguage(lang);
  return parser;
}

export async function getParser(filePath: string): Promise<Parser> {
  if (filePath.endsWith(".tsx")) {
    if (!tsxParser) tsxParser = await loadParser("tree-sitter-tsx.wasm");
    return tsxParser;
  }
  if (filePath.endsWith(".ts")) {
    if (!tsParser) tsParser = await loadParser("tree-sitter-typescript.wasm");
    return tsParser;
  }
  if (!jsParser) jsParser = await loadParser("tree-sitter-javascript.wasm");
  return jsParser;
}

export function parseFile(parser: Parser, source: string): Parser.Tree {
  return parser.parse(source);
}

export function readSource(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}
