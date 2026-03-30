import path from "path";
import type Parser from "web-tree-sitter";
import { TreeSitterExtractor, loadLanguage } from "./tree-sitter-extract";
import type { LangConfig } from "./tree-sitter-extract";

type SyntaxNode = Parser.SyntaxNode;

const lang = await loadLanguage(
  path.join(import.meta.dir, "../node_modules/tree-sitter-go/tree-sitter-go.wasm"),
);

function countGoParams(node: SyntaxNode): number {
  const params = node.childForFieldName("parameters");
  if (!params) return 0;
  let count = 0;
  for (const child of params.namedChildren) {
    if (child.type !== "parameter_declaration") continue;
    const ids = child.namedChildren.filter((c) => c.type === "identifier");
    count += ids.length > 0 ? ids.length : 1;
  }
  return count;
}

const config: LangConfig = {
  extensions: [".go"],
  wasmPath: "",
  funcTypes: ["function_declaration"],
  methodTypes: ["method_declaration"],
  classTypes: [],
  cyclomaticBranches: ["if_statement", "for_statement", "expression_case"],
  cyclomaticBoolOps: ["&&", "||"],
  nestingTypes: ["if_statement", "for_statement"],
  callType: "call_expression",

  getCallName(node: SyntaxNode): string | undefined {
    const fn = node.childForFieldName("function");
    if (!fn) return undefined;
    if (fn.type === "selector_expression") return fn.childForFieldName("field")?.text;
    return fn.text;
  },

  getParamCount: countGoParams,

  isMethod(node: SyntaxNode): boolean {
    return node.type === "method_declaration";
  },

  getEntityName(node: SyntaxNode): string | undefined {
    return node.childForFieldName("name")?.text;
  },

  getClassName(): string | undefined {
    return undefined;
  },
};

export class GoExtractor extends TreeSitterExtractor {
  constructor() {
    super(config, lang);
  }
}
