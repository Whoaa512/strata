import type { Plugin, AnalysisContext, PluginResult, SvEntity } from "../types";

export const churnPlugin: Plugin = {
  name: "churn",

  async analyze(ctx: AnalysisContext): Promise<PluginResult> {
    const fileChurn = computeFileChurn(ctx);
    const entities: SvEntity[] = [];

    for (const file of ctx.files) {
      const churn = fileChurn.get(file.relativePath) ?? 0;
      entities.push({
        id: `file::${file.relativePath}`,
        kind: "file",
        name: file.relativePath,
        filePath: file.relativePath,
        startLine: 1,
        endLine: file.content.split("\n").length,
        metrics: { churn },
      });
    }

    return { entities };
  },
};

function computeFileChurn(ctx: AnalysisContext): Map<string, number> {
  const counts = new Map<string, number>();

  for (const commit of ctx.gitLog) {
    for (const file of commit.files) {
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
  }

  return counts;
}
