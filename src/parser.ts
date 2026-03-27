import path from "path";

let Parser: any = null;
let parserInstance: any = null;

export async function getParser() {
  if (parserInstance) return parserInstance;

  Parser = require("web-tree-sitter");
  await Parser.init();
  parserInstance = new Parser();

  const wasmPath = path.join(
    path.dirname(require.resolve("tree-sitter-wasms/package.json")),
    "out",
    "tree-sitter-typescript.wasm"
  );
  const lang = await Parser.Language.load(wasmPath);
  parserInstance.setLanguage(lang);
  return parserInstance;
}
