import { $ } from "bun";

export interface FileChurn {
	filePath: string;
	totalCommits: number;
	recentCommits: number;
	contributors: Set<string>;
}

export interface CommitFiles {
	hash: string;
	date: string;
	author: string;
	files: string[];
}

export interface TemporalCouplingRaw {
	fileA: string;
	fileB: string;
	coChangeCount: number;
	totalChangesA: number;
	totalChangesB: number;
}

const QUARTER_MS = 90 * 24 * 60 * 60 * 1000;

export async function parseGitLog(repoPath: string, maxCommits = 1000): Promise<CommitFiles[]> {
	const result =
		await $`git -C ${repoPath} log --pretty=format:"COMMIT:%H|%aI|%aN" --name-only -n ${maxCommits} -- "*.ts" "*.tsx" "*.js" "*.jsx"`.text();

	const commits: CommitFiles[] = [];
	let current: CommitFiles | null = null;

	for (const line of result.split("\n")) {
		if (line.startsWith("COMMIT:")) {
			if (current && current.files.length > 0) {
				commits.push(current);
			}
			const [hash, date, author] = line.slice(7).split("|");
			current = { hash, date, author, files: [] };
			continue;
		}

		const trimmed = line.trim();
		if (!trimmed || !current) continue;
		if (/\.(ts|tsx|js|jsx)$/.test(trimmed)) {
			current.files.push(trimmed);
		}
	}

	if (current && current.files.length > 0) {
		commits.push(current);
	}

	return commits;
}

export function computeChurn(commits: CommitFiles[]): Map<string, FileChurn> {
	const churnMap = new Map<string, FileChurn>();
	const quarterAgo = Date.now() - QUARTER_MS;

	for (const commit of commits) {
		const commitDate = new Date(commit.date).getTime();
		const isRecent = commitDate > quarterAgo;

		for (const file of commit.files) {
			let churn = churnMap.get(file);
			if (!churn) {
				churn = { filePath: file, totalCommits: 0, recentCommits: 0, contributors: new Set() };
				churnMap.set(file, churn);
			}
			churn.totalCommits++;
			if (isRecent) churn.recentCommits++;
			churn.contributors.add(commit.author);
		}
	}

	return churnMap;
}

export function computeTemporalCoupling(
	commits: CommitFiles[],
	minCoChanges = 3,
): TemporalCouplingRaw[] {
	const pairCounts = new Map<string, number>();
	const fileCounts = new Map<string, number>();

	for (const commit of commits) {
		const files = commit.files;
		for (const f of files) {
			fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
		}
		for (let i = 0; i < files.length; i++) {
			for (let j = i + 1; j < files.length; j++) {
				const key = [files[i], files[j]].sort().join("||");
				pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
			}
		}
	}

	const results: TemporalCouplingRaw[] = [];
	for (const [key, count] of pairCounts) {
		if (count < minCoChanges) continue;
		const [fileA, fileB] = key.split("||");
		results.push({
			fileA,
			fileB,
			coChangeCount: count,
			totalChangesA: fileCounts.get(fileA) ?? 0,
			totalChangesB: fileCounts.get(fileB) ?? 0,
		});
	}

	return results.sort((a, b) => b.coChangeCount - a.coChangeCount);
}

export async function getCommitRange(
	repoPath: string,
	maxCommits = 1000,
): Promise<{ from: string; to: string }> {
	const to = (await $`git -C ${repoPath} rev-parse HEAD`.text()).trim();
	const lines = (
		await $`git -C ${repoPath} log --pretty=format:%H -n ${maxCommits} -- "*.ts" "*.tsx" "*.js" "*.jsx"`.text()
	)
		.trim()
		.split("\n");
	const from = lines[lines.length - 1] ?? to;
	return { from, to };
}
