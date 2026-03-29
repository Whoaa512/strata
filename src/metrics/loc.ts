import ts from "typescript";
import type { MetricPlugin } from "../plugin";

export const locPlugin: MetricPlugin = {
  name: "loc",
  analyze(node, sourceFile) {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return { loc: end.line - start.line + 1 };
  },
};
