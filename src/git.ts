import { execSync } from "child_process";

export interface CommitInfo {
  hash: string;
  date: string;
  files: string[];
}

export interface FileChurn {
  filePath: string;
  commits: number;
  additions: number;
  deletions: number;
}

export interface TemporalCoupling {
  fileA: string;
  fileB: string;
  cochanges: number;
  totalChanges: number;
  strength: number;
}

export function parseGitLog(repoPath: string, months: number = 12): CommitInfo[] {
  const since = `--since="${months} months ago"`;
  const cmd = `git -C "${repoPath}" log ${since} --pretty=format:"__COMMIT__%H|%aI" --name-only`;

  let output: string;
  try {
    output = execSync(cmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
  } catch {
    return [];
  }

  const commits: CommitInfo[] = [];
  let current: CommitInfo | null = null;

  for (const line of output.split("\n")) {
    if (line.startsWith("__COMMIT__")) {
      if (current && current.files.length > 0) commits.push(current);
      const [hash, date] = line.slice("__COMMIT__".length).split("|");
      current = { hash, date, files: [] };
      continue;
    }

    if (!current || line.trim() === "") continue;
    current.files.push(line.trim());
  }

  if (current && current.files.length > 0) commits.push(current);
  return commits;
}

export function computeChurn(
  repoPath: string,
  months: number = 12,
): Map<string, FileChurn> {
  const cmd = `git -C "${repoPath}" log --since="${months} months ago" --numstat --pretty=format:"__COMMIT__%H"`;

  let output: string;
  try {
    output = execSync(cmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
  } catch {
    return new Map();
  }

  const churnMap = new Map<string, FileChurn>();

  for (const line of output.split("\n")) {
    if (line.startsWith("__COMMIT__") || line.trim() === "") continue;

    const parts = line.split("\t");
    if (parts.length !== 3) continue;

    const [addStr, delStr, filePath] = parts;
    if (addStr === "-" || delStr === "-") continue;

    const additions = parseInt(addStr, 10);
    const deletions = parseInt(delStr, 10);

    const existing = churnMap.get(filePath);
    if (existing) {
      existing.commits++;
      existing.additions += additions;
      existing.deletions += deletions;
    } else {
      churnMap.set(filePath, {
        filePath,
        commits: 1,
        additions,
        deletions,
      });
    }
  }

  return churnMap;
}

export function computeTemporalCoupling(
  commits: CommitInfo[],
  extensions: Set<string>,
  minCochanges: number = 3,
): TemporalCoupling[] {
  const pairCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  for (const commit of commits) {
    const relevant = commit.files.filter((f) => {
      const ext = f.slice(f.lastIndexOf("."));
      return extensions.has(ext);
    });

    for (const file of relevant) {
      fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
    }

    for (let i = 0; i < relevant.length; i++) {
      for (let j = i + 1; j < relevant.length; j++) {
        const key = pairKey(relevant[i], relevant[j]);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const couplings: TemporalCoupling[] = [];

  for (const [key, cochanges] of pairCounts) {
    if (cochanges < minCochanges) continue;

    const [fileA, fileB] = key.split("\0");
    const totalA = fileCounts.get(fileA) ?? 0;
    const totalB = fileCounts.get(fileB) ?? 0;
    const totalChanges = totalA + totalB;
    const strength = (2 * cochanges) / totalChanges;

    couplings.push({ fileA, fileB, cochanges, totalChanges, strength });
  }

  couplings.sort((a, b) => b.strength - a.strength);
  return couplings;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}
