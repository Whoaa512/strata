import { describe, expect, test } from "bun:test";
import { type CommitFiles, computeChurn, computeTemporalCoupling } from "../src/git-analyzer";

function makeCommit(hash: string, files: string[], date?: string, author?: string): CommitFiles {
	return {
		hash,
		date: date ?? new Date().toISOString(),
		author: author ?? "dev",
		files,
	};
}

describe("computeChurn", () => {
	test("counts total commits per file", () => {
		const commits = [
			makeCommit("a1", ["src/foo.ts", "src/bar.ts"]),
			makeCommit("a2", ["src/foo.ts"]),
			makeCommit("a3", ["src/foo.ts", "src/baz.ts"]),
		];

		const churn = computeChurn(commits);

		expect(churn.get("src/foo.ts")?.totalCommits).toBe(3);
		expect(churn.get("src/bar.ts")?.totalCommits).toBe(1);
		expect(churn.get("src/baz.ts")?.totalCommits).toBe(1);
	});

	test("tracks unique contributors", () => {
		const commits = [
			makeCommit("a1", ["src/foo.ts"], undefined, "alice"),
			makeCommit("a2", ["src/foo.ts"], undefined, "bob"),
			makeCommit("a3", ["src/foo.ts"], undefined, "alice"),
		];

		const churn = computeChurn(commits);
		expect(churn.get("src/foo.ts")?.contributors.size).toBe(2);
	});

	test("separates recent vs total commits", () => {
		const old = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
		const recent = new Date().toISOString();

		const commits = [
			makeCommit("a1", ["src/foo.ts"], old),
			makeCommit("a2", ["src/foo.ts"], recent),
		];

		const churn = computeChurn(commits);
		expect(churn.get("src/foo.ts")?.totalCommits).toBe(2);
		expect(churn.get("src/foo.ts")?.recentCommits).toBe(1);
	});
});

describe("computeTemporalCoupling", () => {
	test("identifies co-changing file pairs", () => {
		const commits = [
			makeCommit("a1", ["src/a.ts", "src/b.ts"]),
			makeCommit("a2", ["src/a.ts", "src/b.ts"]),
			makeCommit("a3", ["src/a.ts", "src/b.ts"]),
			makeCommit("a4", ["src/c.ts"]),
		];

		const pairs = computeTemporalCoupling(commits, 3);

		expect(pairs.length).toBe(1);
		expect(pairs[0].coChangeCount).toBe(3);
		expect(pairs[0].totalChangesA).toBe(3);
	});

	test("filters out pairs below threshold", () => {
		const commits = [
			makeCommit("a1", ["src/a.ts", "src/b.ts"]),
			makeCommit("a2", ["src/a.ts", "src/b.ts"]),
		];

		const pairs = computeTemporalCoupling(commits, 3);
		expect(pairs.length).toBe(0);
	});

	test("sorts by co-change count descending", () => {
		const commits = [
			makeCommit("a1", ["src/a.ts", "src/b.ts"]),
			makeCommit("a2", ["src/a.ts", "src/b.ts"]),
			makeCommit("a3", ["src/a.ts", "src/b.ts"]),
			makeCommit("a4", ["src/c.ts", "src/d.ts"]),
			makeCommit("a5", ["src/c.ts", "src/d.ts"]),
			makeCommit("a6", ["src/c.ts", "src/d.ts"]),
			makeCommit("a7", ["src/c.ts", "src/d.ts"]),
		];

		const pairs = computeTemporalCoupling(commits, 3);
		expect(pairs.length).toBe(2);
		expect(pairs[0].coChangeCount).toBe(4);
		expect(pairs[1].coChangeCount).toBe(3);
	});
});
