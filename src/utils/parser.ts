import type { TreeSitterParser } from "../types";
import { join } from "node:path";

let _initPromise: Promise<typeof import("web-tree-sitter")> | null = null;

async function initTreeSitter() {
  if (!_initPromise) {
    _initPromise = (async () => {
      const Parser = (await import("web-tree-sitter")).default;
      await Parser.init();
      return Parser;
    })();
  }
  return _initPromise;
}

export async function createParser(): Promise<TreeSitterParser> {
  const Parser = await initTreeSitter();

  const wasmDir = join(import.meta.dir, "../../node_modules/tree-sitter-wasms/out");

  const tsParser = new Parser();
  const tsLang = await Parser.Language.load(join(wasmDir, "tree-sitter-typescript.wasm"));
  tsParser.setLanguage(tsLang);

  const jsParser = new Parser();
  const jsLang = await Parser.Language.load(join(wasmDir, "tree-sitter-javascript.wasm"));
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
