import ts from "typescript";
import type { MetricPlugin } from "../plugin";

export const paramsPlugin: MetricPlugin = {
  name: "params",
  analyze(node) {
    return { parameterCount: node.parameters.length };
  },
};
