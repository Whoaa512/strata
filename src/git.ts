import { execSync } from "child_process";
import type { ChurnEntry, TemporalCoupling } from "./schema";

export function getChurn(rootDir: string, maxCommits = 500): ChurnEntry[] {
  let output: string;
  try {
    output = execSync(
      `git log --no-merges -n ${maxCommits} --format="" --numstat`,
      { cwd: rootDir, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 },
    );
  } catch {
    return [];
  }

  const fileStats = new Map<string, { commits: Set<string>; added: number; deleted: number }>();
  let commitIdx = 0;

  for (const line of output.split("\n")) {
    if (line.trim() === "") {
      commitIdx++;
      continue;
    }

    const parts = line.split("\t");
    if (parts.length < 3) continue;

    const [addedStr, deletedStr, filePath] = parts;
    if (addedStr === "-" || deletedStr === "-") continue;

    const added = parseInt(addedStr, 10);
    const deleted = parseInt(deletedStr, 10);
    if (isNaN(added) || isNaN(deleted)) continue;

    let entry = fileStats.get(filePath);
    if (!entry) {
      entry = { commits: new Set(), added: 0, deleted: 0 };
      fileStats.set(filePath, entry);
    }
    entry.commits.add(String(commitIdx));
    entry.added += added;
    entry.deleted += deleted;
  }

  return Array.from(fileStats.entries()).map(([filePath, stats]) => ({
    filePath,
    commits: stats.commits.size,
    linesAdded: stats.added,
    linesDeleted: stats.deleted,
  }));
}

export function getTemporalCoupling(
  rootDir: string,
  maxCommits = 500,
  minCochanges = 3,
  maxFilesPerCommit = 20,
): TemporalCoupling[] {
  let output: string;
  try {
    output = execSync(
      `git log --no-merges -n ${maxCommits} --pretty=format:"---COMMIT---" --name-only`,
      { cwd: rootDir, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 },
    );
  } catch {
    return [];
  }

  const pairCount = new Map<string, number>();
  const fileCommitCount = new Map<string, number>();
  let totalCommits = 0;

  const commits = output.split("---COMMIT---").filter((c) => c.trim());

  for (const commit of commits) {
    const files = commit
      .trim()
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f && !f.startsWith("."));

    if (files.length === 0 || files.length > maxFilesPerCommit) continue;
    totalCommits++;

    for (const file of files) {
      fileCommitCount.set(file, (fileCommitCount.get(file) ?? 0) + 1);
    }

    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const key = [files[i], files[j]].sort().join("|||");
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  const results: TemporalCoupling[] = [];

  for (const [key, count] of pairCount) {
    if (count < minCochanges) continue;

    const [fileA, fileB] = key.split("|||");
    const maxFileCommits = Math.max(
      fileCommitCount.get(fileA) ?? 0,
      fileCommitCount.get(fileB) ?? 0,
    );
    const confidence = maxFileCommits > 0 ? count / maxFileCommits : 0;

    results.push({
      fileA,
      fileB,
      cochangeCount: count,
      confidence,
      hasStaticDependency: false,
    });
  }

  return results.sort((a, b) => b.cochangeCount - a.cochangeCount);
}

export function markStaticDependencies(
  couplings: TemporalCoupling[],
  callGraph: Array<{ caller: string; callee: string }>,
  entities: Array<{ id: string; filePath: string }>,
): TemporalCoupling[] {
  const fileImports = new Set<string>();
  for (const edge of callGraph) {
    const callerEntity = entities.find((e) => e.id === edge.caller);
    const calleeEntity = entities.find((e) => e.id === edge.callee);
    if (callerEntity && calleeEntity && callerEntity.filePath !== calleeEntity.filePath) {
      const key = [callerEntity.filePath, calleeEntity.filePath].sort().join("|||");
      fileImports.add(key);
    }
  }

  return couplings.map((c) => {
    const key = [c.fileA, c.fileB].sort().join("|||");
    return { ...c, hasStaticDependency: fileImports.has(key) };
  });
}
