import ts from "typescript";

export function parseFunction(code: string): {
  node: ts.FunctionLikeDeclaration;
  sourceFile: ts.SourceFile;
} {
  const sourceFile = ts.createSourceFile("test.ts", code, ts.ScriptTarget.Latest, true);
  let found: ts.FunctionLikeDeclaration | undefined;

  ts.forEachChild(sourceFile, (node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      found = node;
    }
    if (ts.isVariableStatement(node)) {
      const decl = node.declarationList.declarations[0];
      if (decl?.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
        found = decl.initializer;
      }
    }
  });

  if (!found) throw new Error("No function found in test code");
  return { node: found, sourceFile };
}
