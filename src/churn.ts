import { execSync } from "child_process";
import type { FileChurn } from "./types";

interface GitLogEntry {
  hash: string;
  author: string;
  date: string;
  files: string[];
}

export function parseGitLog(repoPath: string, months: number = 12): GitLogEntry[] {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().split("T")[0];

  const raw = execSync(
    `git log --since="${sinceStr}" --pretty=format:"__COMMIT__%H|%an|%aI" --name-only`,
    { cwd: repoPath, maxBuffer: 50 * 1024 * 1024, encoding: "utf-8" }
  );

  const entries: GitLogEntry[] = [];
  let current: GitLogEntry | null = null;

  for (const line of raw.split("\n")) {
    if (line.startsWith("__COMMIT__")) {
      if (current && current.files.length > 0) {
        entries.push(current);
      }
      const [hash, author, date] = line.slice(10).split("|");
      current = { hash, author, date, files: [] };
    } else if (line.trim() && current) {
      current.files.push(line.trim());
    }
  }

  if (current && current.files.length > 0) {
    entries.push(current);
  }

  return entries;
}

export function computeChurn(repoPath: string, months: number = 12): Map<string, FileChurn> {
  const entries = parseGitLog(repoPath, months);
  const churnMap = new Map<string, FileChurn>();

  for (const entry of entries) {
    for (const file of entry.files) {
      let churn = churnMap.get(file);
      if (!churn) {
        churn = {
          filePath: file,
          commits: 0,
          linesAdded: 0,
          linesRemoved: 0,
          authors: new Set(),
        };
        churnMap.set(file, churn);
      }
      churn.commits++;
      churn.authors.add(entry.author);
    }
  }

  addLineStats(repoPath, churnMap, months);
  return churnMap;
}

function addLineStats(
  repoPath: string,
  churnMap: Map<string, FileChurn>,
  months: number
): void {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().split("T")[0];

  try {
    const raw = execSync(
      `git log --since="${sinceStr}" --numstat --pretty=format:"" --diff-filter=ACMR`,
      { cwd: repoPath, maxBuffer: 50 * 1024 * 1024, encoding: "utf-8" }
    );

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split("\t");
      if (parts.length < 3) continue;
      const [added, removed, file] = parts;
      if (added === "-" || removed === "-") continue;
      const churn = churnMap.get(file);
      if (churn) {
        churn.linesAdded += parseInt(added, 10);
        churn.linesRemoved += parseInt(removed, 10);
      }
    }
  } catch {
    // numstat can fail on binary files or weird git states
  }
}

export function getCommitFileSets(repoPath: string, months: number = 12): string[][] {
  const entries = parseGitLog(repoPath, months);
  return entries.map((e) => e.files);
}
