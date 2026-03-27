import type { GitCommit } from "../types";
import { $ } from "bun";
import { relative, resolve } from "node:path";

export async function parseGitLog(repoPath: string): Promise<GitCommit[]> {
  try {
    const gitRoot = (await $`git -C ${repoPath} rev-parse --show-toplevel`.text()).trim();
    const relPrefix = relative(gitRoot, resolve(repoPath));

    const result =
      await $`git -C ${repoPath} log --pretty=format:'%H|%aI|%an' --name-only -n 500`.text();

    const commits = parseLogOutput(result);

    if (!relPrefix) return commits;

    return commits.map((c) => ({
      ...c,
      files: c.files
        .filter((f) => f.startsWith(relPrefix + "/"))
        .map((f) => f.slice(relPrefix.length + 1)),
    }));
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
