import path from "path";
import fs from "fs";
import { createProgramFromConfig, createLightProgram, extract } from "./extract";
import { PythonExtractor } from "./python-extract";
import { GoExtractor } from "./go-extract";
import type { ExtractionResult } from "./extract";
import type { LanguageExtractor } from "./extractor";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "__pycache__", "vendor", ".venv", "venv", "bazel-bin", "bazel-out", "bazel-testlogs", "bazel-genfiles", ".bazel"]);

const TS_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const PY_EXTS = new Set([".py"]);
const GO_EXTS = new Set([".go"]);

function shouldSkip(relPath: string): boolean {
  const parts = relPath.split(path.sep);
  if (parts.some((p) => SKIP_DIRS.has(p) || p.startsWith("."))) return true;
  if (relPath.endsWith(".min.js") || relPath.endsWith(".min.css")) return true;
  return false;
}

export interface FileMap {
  ts: string[];
  python: string[];
  go: string[];
}

export function findAllFiles(dir: string): FileMap {
  const result: FileMap = { ts: [], python: [], go: [] };
  const allExts = [...TS_EXTS, ...PY_EXTS, ...GO_EXTS];

  const isGit = Bun.spawnSync(["git", "rev-parse", "--git-dir"], { cwd: dir }).exitCode === 0;
  let files: string[];

  if (isGit) {
    const extArgs = allExts.flatMap((e) => ["-o", "-e", `*${e}`]).slice(1);
    const proc = Bun.spawnSync(
      ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", ...extArgs],
      { cwd: dir },
    );
    files = proc.stdout.toString().trim().split("\n").filter(Boolean)
      .filter((f) => !shouldSkip(f))
      .map((f) => path.join(dir, f));
  } else {
    const excludeArgs = [...SKIP_DIRS].flatMap((d) => ["--exclude", d]);
    const extArgs = allExts.flatMap((e) => ["-e", e.slice(1)]);
    const proc = Bun.spawnSync(["fd", "-t", "f", "--hidden", ...excludeArgs, ...extArgs, ".", dir]);
    if (proc.exitCode === 0) {
      files = proc.stdout.toString().trim().split("\n").filter(Boolean)
        .filter((f) => !shouldSkip(path.relative(dir, f)));
    } else {
      const entries = Bun.spawnSync(["find", dir, "-type", "f"]).stdout.toString().trim().split("\n").filter(Boolean);
      files = [];
      for (const entry of entries) {
        const rel = path.relative(dir, entry);
        if (shouldSkip(rel)) continue;
        const ext = path.extname(entry);
        if (allExts.includes(ext)) files.push(entry);
      }
    }
  }

  for (const f of files) {
    const ext = path.extname(f);
    if (TS_EXTS.has(ext)) result.ts.push(f);
    else if (PY_EXTS.has(ext)) result.python.push(f);
    else if (GO_EXTS.has(ext)) result.go.push(f);
  }

  return result;
}

const extractors: LanguageExtractor[] = [new PythonExtractor(), new GoExtractor()];

export function extractAll(rootDir: string): ExtractionResult {
  const resolvedRoot = path.resolve(rootDir);
  const allEntities: ExtractionResult["entities"] = [];
  const allCallGraph: ExtractionResult["callGraph"] = [];
  const allErrors: ExtractionResult["errors"] = [];

  const fileMap = findAllFiles(resolvedRoot);

  let tsPrograms: import("typescript").Program[] = [];

  if (fileMap.ts.length > 0) {
    const tsResult = extractTypeScript(resolvedRoot, fileMap.ts);
    allEntities.push(...tsResult.entities);
    allCallGraph.push(...tsResult.callGraph);
    allErrors.push(...tsResult.errors);
    tsPrograms = tsResult.tsPrograms ?? [];
  }

  const langFiles: Record<string, string[]> = {
    ".py": fileMap.python,
    ".go": fileMap.go,
  };

  for (const ext of extractors) {
    const files = ext.extensions.flatMap(e => langFiles[e] ?? []);
    if (files.length === 0) continue;
    const result = ext.extract(resolvedRoot, files);
    allEntities.push(...result.entities);
    allCallGraph.push(...result.callGraph);
    allErrors.push(...result.errors);
  }

  return { entities: allEntities, callGraph: allCallGraph, errors: allErrors, tsPrograms };
}

function findTsConfigs(rootDir: string): string[] {
  const result = Bun.spawnSync(
    ["fd", "tsconfig.json", rootDir, "-t", "f", "--exclude", "node_modules", "--exclude", "dist", "--exclude", ".git"],
  );
  if (result.exitCode !== 0) return [];
  return result.stdout.toString().trim().split("\n").filter(Boolean);
}

function extractTypeScript(rootDir: string, tsFiles: string[]): ExtractionResult {
  const rootConfig = path.join(rootDir, "tsconfig.json");
  const hasRootConfig = fs.existsSync(rootConfig);

  if (hasRootConfig) {
    const program = createProgramFromConfig(rootConfig, rootDir);
    const result = extract(program, rootDir);
    return { ...result, tsPrograms: [program] };
  }

  const configs = findTsConfigs(rootDir);

  if (configs.length === 0) {
    const program = createLightProgram(tsFiles);
    const result = extract(program, rootDir);
    return { ...result, tsPrograms: [program] };
  }

  const allEntities: ExtractionResult["entities"] = [];
  const allCallGraph: ExtractionResult["callGraph"] = [];
  const allErrors: ExtractionResult["errors"] = [];
  const processedFiles = new Set<string>();
  const tsPrograms: import("typescript").Program[] = [];

  for (const configPath of configs) {
    try {
      const program = createProgramFromConfig(configPath, rootDir);
      tsPrograms.push(program);
      const result = extract(program, rootDir);

      for (const sf of program.getSourceFiles()) {
        if (!sf.isDeclarationFile) {
          const abs = path.resolve(sf.fileName);
          processedFiles.add(abs);
        }
      }

      allEntities.push(...result.entities);
      allCallGraph.push(...result.callGraph);
      allErrors.push(...result.errors);
    } catch (err: any) {
      allErrors.push({ filePath: configPath, error: err.message ?? String(err) });
    }
  }

  const remainingFiles = tsFiles.filter(f => !processedFiles.has(f));
  if (remainingFiles.length > 0) {
    const program = createLightProgram(remainingFiles);
    tsPrograms.push(program);
    const result = extract(program, rootDir);
    allEntities.push(...result.entities);
    allCallGraph.push(...result.callGraph);
    allErrors.push(...result.errors);
  }

  return { entities: allEntities, callGraph: allCallGraph, errors: allErrors, tsPrograms };
}
