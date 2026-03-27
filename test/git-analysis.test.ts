import { describe, expect, test } from "bun:test";
import { parseGitLog, computeChurn, computeTemporalCoupling } from "../src/core/git-analysis";

const SAMPLE_LOG = `abc1234|2024-01-15|alice
src/auth.ts
src/utils.ts

def5678|2024-01-16|bob
src/auth.ts
src/db.ts

aaa1111|2024-01-17|alice
src/auth.ts
src/utils.ts

bbb2222|2024-01-18|charlie
src/ui.ts

ccc3333|2024-01-19|alice
src/auth.ts
src/utils.ts
src/db.ts`;

describe("parseGitLog", () => {
	test("parses commits from raw log", () => {
		const commits = parseGitLog(SAMPLE_LOG);
		expect(commits.length).toBe(5);
		expect(commits[0].hash).toBe("abc1234");
		expect(commits[0].author).toBe("alice");
		expect(commits[0].files).toEqual(["src/auth.ts", "src/utils.ts"]);
	});

	test("handles empty input", () => {
		expect(parseGitLog("")).toEqual([]);
		expect(parseGitLog("   ")).toEqual([]);
	});

	test("skips malformed headers", () => {
		const bad = "not-a-valid-line\nsomefile.ts\n\nabc|2024-01-01|dev\nfile.ts";
		const commits = parseGitLog(bad);
		expect(commits.length).toBe(1);
	});
});

describe("computeChurn", () => {
	test("counts commits per file", () => {
		const commits = parseGitLog(SAMPLE_LOG);
		const churn = computeChurn(commits);

		expect(churn.get("src/auth.ts")!.commits).toBe(4);
		expect(churn.get("src/utils.ts")!.commits).toBe(3);
		expect(churn.get("src/ui.ts")!.commits).toBe(1);
	});

	test("tracks unique authors", () => {
		const commits = parseGitLog(SAMPLE_LOG);
		const churn = computeChurn(commits);

		expect(churn.get("src/auth.ts")!.authors.size).toBe(2);
		expect(churn.get("src/ui.ts")!.authors.size).toBe(1);
	});

	test("tracks last modified date", () => {
		const commits = parseGitLog(SAMPLE_LOG);
		const churn = computeChurn(commits);

		expect(churn.get("src/auth.ts")!.lastModified).toBe("2024-01-19");
	});
});

describe("computeTemporalCoupling", () => {
	test("finds co-changing file pairs", () => {
		const commits = parseGitLog(SAMPLE_LOG);
		const pairs = computeTemporalCoupling(commits, 2, 0.3);

		const authUtils = pairs.find(
			(p) => (p.fileA === "src/auth.ts" && p.fileB === "src/utils.ts") ||
				(p.fileA === "src/utils.ts" && p.fileB === "src/auth.ts"),
		);

		expect(authUtils).toBeDefined();
		expect(authUtils!.coChangeCount).toBe(3);
	});

	test("respects minimum co-change threshold", () => {
		const commits = parseGitLog(SAMPLE_LOG);
		const pairs = computeTemporalCoupling(commits, 10, 0);
		expect(pairs.length).toBe(0);
	});

	test("respects minimum confidence threshold", () => {
		const log = `a1|2024-01-01|dev\nfile1.ts\nfile2.ts\n\na2|2024-01-02|dev\nfile1.ts\n\na3|2024-01-03|dev\nfile2.ts`;
		const commits = parseGitLog(log);
		const pairs = computeTemporalCoupling(commits, 1, 0.9);
		expect(pairs.length).toBe(0);
	});

	test("confidence is co-changes / min(totalA, totalB)", () => {
		const commits = parseGitLog(SAMPLE_LOG);
		const pairs = computeTemporalCoupling(commits, 1, 0);

		const authUtils = pairs.find(
			(p) => p.fileA === "src/auth.ts" && p.fileB === "src/utils.ts" ||
				p.fileA === "src/utils.ts" && p.fileB === "src/auth.ts",
		)!;

		expect(authUtils.confidence).toBe(3 / 3);
	});

	test("sorts by confidence descending", () => {
		const commits = parseGitLog(SAMPLE_LOG);
		const pairs = computeTemporalCoupling(commits, 1, 0);

		for (let i = 1; i < pairs.length; i++) {
			expect(pairs[i].confidence).toBeLessThanOrEqual(pairs[i - 1].confidence);
		}
	});
});
