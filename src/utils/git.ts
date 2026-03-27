import type { GitCommit } from "../types";
import { $ } from "bun";

export async function parseGitLog(repoPath: string): Promise<GitCommit[]> {
  try {
    const result =
      await $`git -C ${repoPath} log --pretty=format:'%H|%aI|%an' --name-only -n 500`.text();
    return parseLogOutput(result);
  } catch {
    return [];
  }
}

export function parseLogOutput(raw: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const blocks = raw.trim().split("\n\n");

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length === 0) continue;

    const header = lines[0].replace(/^'|'$/g, "");
    const parts = header.split("|");
    if (parts.length < 3) continue;

    const [hash, date, author] = parts;
    const files = lines.slice(1).filter((l) => l.trim().length > 0);

    commits.push({ hash, date, author, files });
  }

  return commits;
}
