import { parseGitLog, computeChurn, computeTemporalCoupling } from "../core/git-analysis.js";
import type { CommitFile, FileChurn, TemporalPair } from "../core/git-analysis.js";

const GIT_LOG_FORMAT = "--format=%H|%aI|%aN";

export async function getGitLog(repoPath: string, months = 12): Promise<CommitFile[]> {
	const since = `--since=${months} months ago`;
	const result = Bun.spawnSync(
		["git", "log", GIT_LOG_FORMAT, "--name-only", since],
		{ cwd: repoPath, stdout: "pipe", stderr: "pipe" },
	);

	if (result.exitCode !== 0) {
		throw new Error(`git log failed: ${result.stderr.toString()}`);
	}

	return parseGitLog(result.stdout.toString());
}

export async function getFileChurn(repoPath: string, months = 12): Promise<Map<string, FileChurn>> {
	const commits = await getGitLog(repoPath, months);
	return computeChurn(commits);
}

export async function getTemporalCoupling(
	repoPath: string,
	months = 12,
	minCoChanges = 3,
	minConfidence = 0.3,
): Promise<TemporalPair[]> {
	const commits = await getGitLog(repoPath, months);
	return computeTemporalCoupling(commits, minCoChanges, minConfidence);
}

export async function getTrackedFiles(repoPath: string): Promise<string[]> {
	const result = Bun.spawnSync(
		["git", "ls-files", "--cached", "--others", "--exclude-standard"],
		{ cwd: repoPath, stdout: "pipe", stderr: "pipe" },
	);

	if (result.exitCode !== 0) {
		throw new Error(`git ls-files failed: ${result.stderr.toString()}`);
	}

	return result.stdout.toString().trim().split("\n").filter(Boolean);
}

export function hasStaticDependency(
	fileA: string,
	fileB: string,
	importMap: Map<string, Set<string>>,
): boolean {
	const importsA = importMap.get(fileA);
	if (importsA?.has(fileB)) return true;

	const importsB = importMap.get(fileB);
	if (importsB?.has(fileA)) return true;

	return false;
}
