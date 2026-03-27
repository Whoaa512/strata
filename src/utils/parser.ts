import type { TreeSitterParser } from "../types";
import { join } from "node:path";
import Parser from "web-tree-sitter";

let _initDone = false;

async function ensureInit() {
  if (_initDone) return;
  await Parser.init();
  _initDone = true;
}

export async function createParser(): Promise<TreeSitterParser> {
  await ensureInit();

  const grammarDir = join(import.meta.dir, "../../grammars");

  const tsParser = new Parser();
  const tsLang = await Parser.Language.load(join(grammarDir, "tree-sitter-typescript.wasm"));
  tsParser.setLanguage(tsLang);

  const jsParser = new Parser();
  const jsLang = await Parser.Language.load(join(grammarDir, "tree-sitter-javascript.wasm"));
  jsParser.setLanguage(jsLang);

  return {
    parseTS(content: string) {
      return tsParser.parse(content);
    },
    parseJS(content: string) {
      return jsParser.parse(content);
    },
  };
}
