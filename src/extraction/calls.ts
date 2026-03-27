import { getParser } from "../parser";

export interface CallEdge {
  caller: string;
  callee: string;
}

export async function extractCallEdges(
  code: string,
  filePath: string
): Promise<CallEdge[]> {
  const p = await getParser();
  const tree = p.parse(code);
  const edges: CallEdge[] = [];

  function findCalls(node: any, currentFunc: string | null): void {
    const funcTypes = new Set([
      "function_declaration",
      "method_definition",
    ]);

    if (funcTypes.has(node.type)) {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text || "anonymous";

      let parentClass: string | null = null;
      let p = node.parent;
      while (p) {
        if (p.type === "class_declaration" || p.type === "class") {
          const cn = p.childForFieldName("name");
          parentClass = cn?.text || null;
          break;
        }
        p = p.parent;
      }

      const prefix = parentClass ? `${parentClass}.` : "";
      const funcId = `${filePath}::${prefix}${name}`;

      const body = node.childForFieldName("body");
      if (body) {
        scanForCalls(body, funcId);
      }
      return;
    }

    for (const child of node.children) {
      findCalls(child, currentFunc);
    }
  }

  function scanForCalls(node: any, callerId: string): void {
    if (node.type === "call_expression") {
      const fnNode = node.childForFieldName("function");
      if (fnNode) {
        const calleeName = fnNode.text;
        if (calleeName && !isBuiltin(calleeName)) {
          edges.push({ caller: callerId, callee: calleeName });
        }
      }
    }

    // Don't descend into nested function declarations
    const funcTypes = new Set([
      "function_declaration",
      "method_definition",
      "arrow_function",
      "function",
    ]);
    if (funcTypes.has(node.type) && node.parent?.type !== "program") {
      return;
    }

    for (const child of node.children) {
      scanForCalls(child, callerId);
    }
  }

  findCalls(tree.rootNode, null);
  return edges;
}

function isBuiltin(name: string): boolean {
  const builtins = new Set([
    "console.log",
    "console.error",
    "console.warn",
    "console.info",
    "require",
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "JSON.stringify",
    "JSON.parse",
    "Object.keys",
    "Object.values",
    "Object.entries",
    "Object.assign",
    "Array.isArray",
    "Promise.resolve",
    "Promise.reject",
    "Promise.all",
    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
  ]);
  return builtins.has(name);
}

export interface ImportInfo {
  specifier: string;
  source: string;
}

export async function extractImports(
  code: string,
  filePath: string
): Promise<ImportInfo[]> {
  const p = await getParser();
  const tree = p.parse(code);
  const imports: ImportInfo[] = [];

  function visit(node: any): void {
    if (node.type === "import_statement") {
      const source = node.childForFieldName("source");
      if (source) {
        const srcText = source.text.replace(/['"]/g, "");
        const clause = node.children.find(
          (c: any) => c.type === "import_clause"
        );
        if (clause) {
          const namedImports = clause.children.find(
            (c: any) => c.type === "named_imports"
          );
          if (namedImports) {
            for (const spec of namedImports.namedChildren) {
              if (spec.type === "import_specifier") {
                const name =
                  spec.childForFieldName("name")?.text || spec.text;
                imports.push({ specifier: name, source: srcText });
              }
            }
          }
          const defaultImport = clause.children.find(
            (c: any) => c.type === "identifier"
          );
          if (defaultImport) {
            imports.push({
              specifier: defaultImport.text,
              source: srcText,
            });
          }
        }
      }
    }

    for (const child of node.children) {
      visit(child);
    }
  }

  visit(tree.rootNode);
  return imports;
}
