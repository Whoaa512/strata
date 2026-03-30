import path from "path";
import { createProgram, extract } from "./extract";
import { PythonExtractor } from "./python-extract";
import { GoExtractor } from "./go-extract";
import type { ExtractionResult } from "./extract";
import type { LanguageExtractor } from "./extractor";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "__pycache__", "vendor", ".venv", "venv"]);

function shouldSkip(relPath: string): boolean {
  const parts = relPath.split(path.sep);
  return parts.some((p) => SKIP_DIRS.has(p) || p.startsWith("."));
}

function findFiles(dir: string, extensions: Set<string>): string[] {
  const isGit = Bun.spawnSync(["git", "rev-parse", "--git-dir"], { cwd: dir }).exitCode === 0;

  if (isGit) {
    const extArgs = [...extensions].flatMap((e) => ["-o", "-e", `*${e}`]).slice(1);
    const result = Bun.spawnSync(
      ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", ...extArgs],
      { cwd: dir },
    );
    return result.stdout.toString().trim().split("\n").filter(Boolean)
      .filter((f) => !shouldSkip(f))
      .map((f) => path.join(dir, f));
  }

  const excludeArgs = [...SKIP_DIRS].flatMap((d) => ["--exclude", d]);
  const extArgs = [...extensions].flatMap((e) => ["-e", e.slice(1)]);
  const result = Bun.spawnSync(["fd", "-t", "f", "--hidden", ...excludeArgs, ...extArgs, ".", dir]);
  if (result.exitCode === 0) {
    const files = result.stdout.toString().trim().split("\n").filter(Boolean);
    return files.filter((f) => !shouldSkip(path.relative(dir, f)));
  }

  const entries = Bun.spawnSync(["find", dir, "-type", "f"]).stdout.toString().trim().split("\n").filter(Boolean);
  const results: string[] = [];
  for (const entry of entries) {
    const rel = path.relative(dir, entry);
    if (shouldSkip(rel)) continue;
    const ext = path.extname(entry);
    if (extensions.has(ext)) results.push(entry);
  }
  return results;
}

const extractors: LanguageExtractor[] = [new PythonExtractor(), new GoExtractor()];
const treeSitterExts = new Set(extractors.flatMap((e) => e.extensions));

export function extractAll(rootDir: string): ExtractionResult {
  const resolvedRoot = path.resolve(rootDir);
  const allEntities: ExtractionResult["entities"] = [];
  const allCallGraph: ExtractionResult["callGraph"] = [];
  const allErrors: ExtractionResult["errors"] = [];

  const tsFiles = findFiles(resolvedRoot, new Set([".ts", ".tsx", ".js", ".jsx"]));
  if (tsFiles.length > 0) {
    const program = createProgram(resolvedRoot);
    const result = extract(program, resolvedRoot);
    allEntities.push(...result.entities);
    allCallGraph.push(...result.callGraph);
    allErrors.push(...result.errors);
  }

  for (const ext of extractors) {
    const files = findFiles(resolvedRoot, new Set(ext.extensions));
    if (files.length === 0) continue;
    const result = ext.extract(resolvedRoot, files);
    allEntities.push(...result.entities);
    allCallGraph.push(...result.callGraph);
    allErrors.push(...result.errors);
  }

  return { entities: allEntities, callGraph: allCallGraph, errors: allErrors };
}
