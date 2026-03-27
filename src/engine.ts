import type {
  AnalysisContext,
  FileInfo,
  GitCommit,
  Hotspot,
  Plugin,
  PluginResult,
  SvDocument,
  SvEntity,
} from "./types";
import { createParser } from "./utils/parser";
import { parseGitLog } from "./utils/git";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";

const TS_JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]);

export class Engine {
  private plugins: Plugin[] = [];

  use(plugin: Plugin): this {
    this.plugins.push(plugin);
    return this;
  }

  async analyze(repoPath: string): Promise<SvDocument> {
    const files = await collectFiles(repoPath);
    const gitLog = await parseGitLog(repoPath);
    const parser = await createParser();

    const context: AnalysisContext = { repoPath, files, parser, gitLog };

    const allEntities: SvEntity[] = [];
    const allEdges: PluginResult["edges"] = [];

    for (const plugin of this.plugins) {
      const result = await plugin.analyze(context);
      if (result.entities) allEntities.push(...result.entities);
      if (result.edges) allEdges.push(...result.edges);
    }

    const hotspots = computeHotspots(allEntities);

    return {
      version: "0.1.0",
      repo: repoPath,
      analyzedAt: new Date().toISOString(),
      entities: allEntities,
      edges: allEdges ?? [],
      hotspots,
    };
  }
}

function computeHotspots(entities: SvEntity[]): Hotspot[] {
  return entities
    .filter((e) => e.kind === "function")
    .map((e) => {
      const complexity = e.metrics.cognitiveComplexity ?? 0;
      const churn = e.metrics.churn ?? 0;
      const blastRadius = e.metrics.blastRadius;
      return {
        entityId: e.id,
        score: complexity * churn,
        complexity,
        churn,
        blastRadius,
      };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function collectFiles(dir: string, base?: string): Promise<FileInfo[]> {
  const root = base ?? dir;
  const results: FileInfo[] = [];
  const entries = await readdir(dir);

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "build") {
      continue;
    }

    const fullPath = join(dir, entry);
    const s = await stat(fullPath);

    if (s.isDirectory()) {
      results.push(...(await collectFiles(fullPath, root)));
      continue;
    }

    if (!TS_JS_EXTENSIONS.has(extname(entry))) continue;

    const content = await readFile(fullPath, "utf-8");
    results.push({
      path: fullPath,
      relativePath: relative(root, fullPath),
      content,
    });
  }

  return results;
}
