import type { ChurnEntry, CoChangeEntry } from "./types.js";

const COMMIT_SEPARATOR = "---COMMIT---";
const GIT_LOG_FORMAT = `${COMMIT_SEPARATOR}%n%H%n%an%n%aI`;

export async function parseGitLog(
	repoPath: string,
	months = 12,
): Promise<{ churn: ChurnEntry[]; coChanges: CoChangeEntry[] }> {
	const since = new Date();
	since.setMonth(since.getMonth() - months);
	const sinceStr = since.toISOString().split("T")[0];

	const proc = Bun.spawn(
		[
			"git",
			"log",
			`--since=${sinceStr}`,
			`--format=${GIT_LOG_FORMAT}`,
			"--name-only",
			"--diff-filter=AMRC",
			"--no-merges",
		],
		{ cwd: repoPath, stdout: "pipe", stderr: "pipe" },
	);

	const output = await new Response(proc.stdout).text();
	await proc.exited;

	return parseLogOutput(output);
}

type CommitData = {
	author: string;
	date: string;
	files: string[];
};

function parseLogOutput(output: string): {
	churn: ChurnEntry[];
	coChanges: CoChangeEntry[];
} {
	const commits = parseCommits(output);
	const churn = computeChurn(commits);
	const coChanges = computeCoChanges(commits);
	return { churn, coChanges };
}

function parseCommits(output: string): CommitData[] {
	const commits: CommitData[] = [];
	const blocks = output.split(COMMIT_SEPARATOR).filter((b) => b.trim());

	for (const block of blocks) {
		const lines = block.trim().split("\n");
		if (lines.length < 3) continue;

		const [, author, date, ...fileLines] = lines;
		const files = fileLines.map((f) => f.trim()).filter((f) => f.length > 0);

		if (files.length === 0) continue;

		commits.push({ author, date, files });
	}

	return commits;
}

function computeChurn(commits: CommitData[]): ChurnEntry[] {
	const fileMap = new Map<
		string,
		{ commits: number; authors: Set<string>; lastModified: string }
	>();

	for (const commit of commits) {
		for (const file of commit.files) {
			const entry = fileMap.get(file) ?? {
				commits: 0,
				authors: new Set(),
				lastModified: commit.date,
			};
			entry.commits++;
			entry.authors.add(commit.author);
			if (commit.date > entry.lastModified) {
				entry.lastModified = commit.date;
			}
			fileMap.set(file, entry);
		}
	}

	return Array.from(fileMap.entries())
		.map(([filePath, data]) => ({
			filePath,
			commits: data.commits,
			authors: Array.from(data.authors),
			lastModified: data.lastModified,
		}))
		.sort((a, b) => b.commits - a.commits);
}

function computeCoChanges(commits: CommitData[]): CoChangeEntry[] {
	const pairCounts = new Map<string, number>();
	const fileCounts = new Map<string, number>();

	for (const commit of commits) {
		const files = commit.files;

		for (const file of files) {
			fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
		}

		for (let i = 0; i < files.length; i++) {
			for (let j = i + 1; j < files.length; j++) {
				const key = [files[i], files[j]].sort().join("\0");
				pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
			}
		}
	}

	const entries: CoChangeEntry[] = [];
	for (const [key, count] of pairCounts) {
		if (count < 2) continue;

		const [fileA, fileB] = key.split("\0");
		entries.push({
			fileA,
			fileB,
			coChangeCount: count,
			totalChangesA: fileCounts.get(fileA) ?? 0,
			totalChangesB: fileCounts.get(fileB) ?? 0,
		});
	}

	return entries.sort((a, b) => b.coChangeCount - a.coChangeCount);
}

export { parseLogOutput as _parseLogOutput };
