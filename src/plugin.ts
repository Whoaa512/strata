import ts from "typescript";
import type { Metrics } from "./schema";

export interface MetricPlugin {
  name: string;
  analyze(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): Partial<Metrics>;
}

export function runPlugins(
  plugins: MetricPlugin[],
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
): Metrics {
  const base: Metrics = {
    cyclomatic: 1,
    cognitive: 0,
    loc: 0,
    maxNestingDepth: 0,
    parameterCount: 0,
  };
  for (const plugin of plugins) {
    Object.assign(base, plugin.analyze(node, sourceFile));
  }
  return base;
}
