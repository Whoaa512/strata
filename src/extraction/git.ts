export interface NumstatEntry {
  file: string;
  added: number;
  deleted: number;
}

export interface GitCommit {
  hash: string;
  date: string;
  author: string;
  files: string[];
  numstat: NumstatEntry[];
}

export interface FileChurn {
  commits: number;
  authors: number;
  lastModified: string;
  linesAdded: number;
  linesDeleted: number;
}

export function parseGitLog(raw: string): GitCommit[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const commits: GitCommit[] = [];
  const lines = trimmed.split("\n");
  let i = 0;

  while (i < lines.length) {
    if (!lines[i]?.trim()) {
      i++;
      continue;
    }

    const hash = lines[i].trim();
    const date = lines[i + 1]?.trim() ?? "";
    const author = lines[i + 2]?.trim() ?? "";
    i += 3;

    // Skip blank line between format header and file data
    if (i < lines.length && !lines[i]?.trim()) i++;

    // Read name-only file lines (no tabs)
    const files: string[] = [];
    while (i < lines.length && lines[i]?.trim() && !lines[i].includes("\t")) {
      files.push(lines[i].trim());
      i++;
    }

    // Read numstat lines (tab-separated)
    const numstat: NumstatEntry[] = [];
    while (i < lines.length && lines[i]?.includes("\t")) {
      const parts = lines[i].split("\t");
      if (parts.length >= 3) {
        numstat.push({
          added: parseInt(parts[0]) || 0,
          deleted: parseInt(parts[1]) || 0,
          file: parts[2],
        });
      }
      i++;
    }

    // If no name-only files were found, derive from numstat
    const effectiveFiles =
      files.length > 0 ? files : numstat.map((ns) => ns.file);

    while (i < lines.length && !lines[i]?.trim()) i++;

    commits.push({ hash, date, author, files: effectiveFiles, numstat });
  }

  return commits;
}

export function computeChurn(commits: GitCommit[]): Map<string, FileChurn> {
  const churnMap = new Map<
    string,
    {
      commits: number;
      authorSet: Set<string>;
      lastModified: string;
      linesAdded: number;
      linesDeleted: number;
    }
  >();

  for (const commit of commits) {
    for (const file of commit.files) {
      let entry = churnMap.get(file);
      if (!entry) {
        entry = {
          commits: 0,
          authorSet: new Set(),
          lastModified: commit.date,
          linesAdded: 0,
          linesDeleted: 0,
        };
        churnMap.set(file, entry);
      }
      entry.commits++;
      entry.authorSet.add(commit.author);
      if (commit.date > entry.lastModified) {
        entry.lastModified = commit.date;
      }
    }

    for (const ns of commit.numstat) {
      const entry = churnMap.get(ns.file);
      if (entry) {
        entry.linesAdded += ns.added;
        entry.linesDeleted += ns.deleted;
      }
    }
  }

  const result = new Map<string, FileChurn>();
  for (const [file, entry] of churnMap) {
    result.set(file, {
      commits: entry.commits,
      authors: entry.authorSet.size,
      lastModified: entry.lastModified,
      linesAdded: entry.linesAdded,
      linesDeleted: entry.linesDeleted,
    });
  }
  return result;
}

export interface TemporalCouplingResult {
  fileA: string;
  fileB: string;
  coChangeCount: number;
  totalCommits: number;
  confidence: number;
  hasStaticDependency: boolean;
}

export function computeTemporalCoupling(
  commits: GitCommit[],
  minCoChanges: number = 2
): TemporalCouplingResult[] {
  const pairCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  for (const commit of commits) {
    const files = commit.files;
    for (const f of files) {
      fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
    }
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const key = [files[i], files[j]].sort().join("\0");
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const results: TemporalCouplingResult[] = [];
  for (const [key, count] of pairCounts) {
    if (count < minCoChanges) continue;
    const [fileA, fileB] = key.split("\0");
    const maxCommits = Math.max(
      fileCounts.get(fileA) ?? 0,
      fileCounts.get(fileB) ?? 0
    );
    results.push({
      fileA,
      fileB,
      coChangeCount: count,
      totalCommits: commits.length,
      confidence: maxCommits > 0 ? count / maxCommits : 0,
      hasStaticDependency: false,
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

export async function getGitLog(
  repoPath: string,
  months: number = 12
): Promise<string> {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().split("T")[0];

  const proc = Bun.spawn(
    [
      "git",
      "log",
      `--since=${sinceStr}`,
      "--format=%H%n%ai%n%an",
      "--numstat",
      "--",
      "*.ts",
      "*.tsx",
      "*.js",
      "*.jsx",
    ],
    { cwd: repoPath, stdout: "pipe", stderr: "pipe" }
  );

  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return output;
}
