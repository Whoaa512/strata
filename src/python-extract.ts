import path from "path";
import type Parser from "web-tree-sitter";
import { TreeSitterExtractor, loadLanguage } from "./tree-sitter-extract";
import type { LangConfig } from "./tree-sitter-extract";

type SyntaxNode = Parser.SyntaxNode;

const lang = await loadLanguage(
  path.join(import.meta.dir, "../node_modules/tree-sitter-python/tree-sitter-python.wasm"),
);

const config: LangConfig = {
  extensions: [".py"],
  wasmPath: "",
  funcTypes: ["function_definition"],
  methodTypes: [],
  classTypes: ["class_definition"],
  cyclomaticBranches: ["if_statement", "elif_clause", "for_statement", "while_statement", "except_clause"],
  cyclomaticBoolOps: ["and", "or"],
  nestingTypes: ["if_statement", "for_statement", "while_statement"],
  callType: "call",

  getCallName(node: SyntaxNode): string | undefined {
    const fn = node.childForFieldName("function");
    if (!fn) return undefined;
    if (fn.type === "identifier") return fn.text;
    if (fn.type === "attribute") return fn.childForFieldName("attribute")?.text;
    return undefined;
  },

  getParamCount(node: SyntaxNode): number {
    const params = node.childForFieldName("parameters");
    if (!params) return 0;
    return params.namedChildren.filter(
      (c) =>
        c.type === "identifier" ||
        c.type === "default_parameter" ||
        c.type === "typed_parameter" ||
        c.type === "typed_default_parameter" ||
        c.type === "list_splat_pattern" ||
        c.type === "dictionary_splat_pattern",
    ).length;
  },

  isMethod(node: SyntaxNode): boolean {
    let parent = node.parent;
    while (parent) {
      if (parent.type === "class_definition") return true;
      parent = parent.parent;
    }
    return false;
  },

  getEntityName(node: SyntaxNode): string | undefined {
    return node.childForFieldName("name")?.text;
  },

  getClassName(node: SyntaxNode): string | undefined {
    return node.childForFieldName("name")?.text;
  },
};

export class PythonExtractor extends TreeSitterExtractor {
  constructor() {
    super(config, lang);
  }
}
