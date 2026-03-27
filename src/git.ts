import type { CoChange, FileChurn } from "./types.js";

const SEPARATOR = "---STRATA_SEP---";
const FORMAT = `--format=${SEPARATOR}%n%H%n%ae%n%ad`;

type CommitFiles = {
	hash: string;
	author: string;
	files: string[];
};

export async function parseGitLog(
	repoPath: string,
	months = 12,
): Promise<{ churn: Map<string, FileChurn>; commits: CommitFiles[] }> {
	const since = `--since=${months} months ago`;
	const proc = Bun.spawn(
		["git", "log", FORMAT, "--numstat", "--no-merges", since],
		{ cwd: repoPath, stdout: "pipe", stderr: "pipe" },
	);

	const output = await new Response(proc.stdout).text();
	await proc.exited;

	const churn = new Map<string, FileChurn>();
	const commits: CommitFiles[] = [];

	const blocks = output.split(SEPARATOR).filter((b) => b.trim());

	for (const block of blocks) {
		const lines = block.trim().split("\n");
		if (lines.length < 3) continue;

		const hash = lines[0];
		const author = lines[1];
		const files: string[] = [];

		for (let i = 3; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;

			const parts = line.split("\t");
			if (parts.length < 3) continue;

			const [added, removed, filePath] = parts;
			if (!filePath || filePath.includes("=>")) continue;
			if (!isSourceFile(filePath)) continue;

			const linesAdded = Number.parseInt(added) || 0;
			const linesRemoved = Number.parseInt(removed) || 0;

			const existing = churn.get(filePath) ?? {
				filePath,
				commits: 0,
				linesAdded: 0,
				linesRemoved: 0,
				authors: new Set<string>(),
			};

			existing.commits++;
			existing.linesAdded += linesAdded;
			existing.linesRemoved += linesRemoved;
			existing.authors.add(author);
			churn.set(filePath, existing);
			files.push(filePath);
		}

		if (files.length > 0) {
			commits.push({ hash, author, files });
		}
	}

	return { churn, commits };
}

export function computeCoChanges(
	commits: CommitFiles[],
	churn: Map<string, FileChurn>,
	minCoChanges = 3,
): CoChange[] {
	const pairCounts = new Map<string, number>();

	for (const commit of commits) {
		const files = commit.files;
		if (files.length > 50) continue;

		for (let i = 0; i < files.length; i++) {
			for (let j = i + 1; j < files.length; j++) {
				const key = pairKey(files[i], files[j]);
				pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
			}
		}
	}

	const results: CoChange[] = [];

	for (const [key, count] of pairCounts) {
		if (count < minCoChanges) continue;

		const [fileA, fileB] = key.split("|||");
		const commitsA = churn.get(fileA)?.commits ?? 0;
		const commitsB = churn.get(fileB)?.commits ?? 0;
		const maxCommits = Math.max(commitsA, commitsB, 1);

		results.push({
			fileA,
			fileB,
			coChangeCount: count,
			totalCommitsA: commitsA,
			totalCommitsB: commitsB,
			confidence: count / maxCommits,
		});
	}

	return results.sort((a, b) => b.confidence - a.confidence);
}

function pairKey(a: string, b: string): string {
	return a < b ? `${a}|||${b}` : `${b}|||${a}`;
}

function isSourceFile(path: string): boolean {
	return /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(path);
}
