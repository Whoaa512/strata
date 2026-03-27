export interface CommitFile {
	hash: string;
	date: string;
	author: string;
	files: string[];
}

export interface FileChurn {
	filePath: string;
	commits: number;
	authors: Set<string>;
	lastModified: string;
}

export interface TemporalPair {
	fileA: string;
	fileB: string;
	coChangeCount: number;
	totalChangesA: number;
	totalChangesB: number;
	confidence: number;
}

export function parseGitLog(raw: string): CommitFile[] {
	const commits: CommitFile[] = [];
	const blocks = raw.split("\n\n").filter((b) => b.trim());

	for (const block of blocks) {
		const lines = block.trim().split("\n");
		if (lines.length < 2) continue;

		const headerMatch = lines[0].match(/^([a-f0-9]+)\|(.+)\|(.+)$/);
		if (!headerMatch) continue;

		const [, hash, date, author] = headerMatch;
		const files = lines
			.slice(1)
			.map((l) => l.trim())
			.filter((l) => l.length > 0 && !l.startsWith("Merge"));

		if (files.length === 0) continue;

		commits.push({ hash, date, author, files });
	}

	return commits;
}

export function computeChurn(commits: CommitFile[]): Map<string, FileChurn> {
	const churn = new Map<string, FileChurn>();

	for (const commit of commits) {
		for (const file of commit.files) {
			const existing = churn.get(file);
			if (existing) {
				existing.commits++;
				existing.authors.add(commit.author);
				if (commit.date > existing.lastModified) {
					existing.lastModified = commit.date;
				}
			} else {
				churn.set(file, {
					filePath: file,
					commits: 1,
					authors: new Set([commit.author]),
					lastModified: commit.date,
				});
			}
		}
	}

	return churn;
}

export function computeTemporalCoupling(
	commits: CommitFile[],
	minCoChanges: number,
	minConfidence: number,
): TemporalPair[] {
	const fileChangeCounts = new Map<string, number>();
	const pairCounts = new Map<string, number>();

	for (const commit of commits) {
		const uniqueFiles = [...new Set(commit.files)];

		for (const file of uniqueFiles) {
			fileChangeCounts.set(file, (fileChangeCounts.get(file) ?? 0) + 1);
		}

		for (let i = 0; i < uniqueFiles.length; i++) {
			for (let j = i + 1; j < uniqueFiles.length; j++) {
				const key = pairKey(uniqueFiles[i], uniqueFiles[j]);
				pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
			}
		}
	}

	const pairs: TemporalPair[] = [];

	for (const [key, coChangeCount] of pairCounts) {
		if (coChangeCount < minCoChanges) continue;

		const [fileA, fileB] = key.split("|||");
		const totalA = fileChangeCounts.get(fileA) ?? 0;
		const totalB = fileChangeCounts.get(fileB) ?? 0;
		const confidence = coChangeCount / Math.min(totalA, totalB);

		if (confidence < minConfidence) continue;

		pairs.push({
			fileA,
			fileB,
			coChangeCount,
			totalChangesA: totalA,
			totalChangesB: totalB,
			confidence,
		});
	}

	pairs.sort((a, b) => b.confidence - a.confidence);
	return pairs;
}

function pairKey(a: string, b: string): string {
	return a < b ? `${a}|||${b}` : `${b}|||${a}`;
}
