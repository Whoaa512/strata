import { describe, expect, test } from "bun:test";
import { computeCoChanges } from "../src/git.js";
import type { FileChurn } from "../src/types.js";

describe("computeCoChanges", () => {
	test("detects pairs that co-change above threshold", () => {
		const commits = [
			{ hash: "a1", author: "dev", files: ["src/a.ts", "src/b.ts"] },
			{ hash: "a2", author: "dev", files: ["src/a.ts", "src/b.ts"] },
			{ hash: "a3", author: "dev", files: ["src/a.ts", "src/b.ts"] },
			{ hash: "a4", author: "dev", files: ["src/a.ts", "src/c.ts"] },
		];

		const churn = new Map<string, FileChurn>([
			[
				"src/a.ts",
				{
					filePath: "src/a.ts",
					commits: 4,
					linesAdded: 100,
					linesRemoved: 20,
					authors: new Set(["dev"]),
				},
			],
			[
				"src/b.ts",
				{
					filePath: "src/b.ts",
					commits: 3,
					linesAdded: 50,
					linesRemoved: 10,
					authors: new Set(["dev"]),
				},
			],
			[
				"src/c.ts",
				{
					filePath: "src/c.ts",
					commits: 1,
					linesAdded: 10,
					linesRemoved: 0,
					authors: new Set(["dev"]),
				},
			],
		]);

		const result = computeCoChanges(commits, churn, 3);

		expect(result).toHaveLength(1);
		expect(result[0].fileA).toBe("src/a.ts");
		expect(result[0].fileB).toBe("src/b.ts");
		expect(result[0].coChangeCount).toBe(3);
		expect(result[0].confidence).toBe(3 / 4);
	});

	test("skips huge commits (>50 files)", () => {
		const bigCommit = {
			hash: "big",
			author: "dev",
			files: Array.from({ length: 51 }, (_, i) => `src/f${i}.ts`),
		};
		const commits = [
			bigCommit,
			{ hash: "a1", author: "dev", files: ["src/f0.ts", "src/f1.ts"] },
		];

		const churn = new Map<string, FileChurn>();
		const result = computeCoChanges(commits, churn, 1);

		expect(result).toHaveLength(1);
	});

	test("returns empty for no co-changes above threshold", () => {
		const commits = [
			{ hash: "a1", author: "dev", files: ["src/a.ts"] },
			{ hash: "a2", author: "dev", files: ["src/b.ts"] },
		];
		const churn = new Map<string, FileChurn>();
		const result = computeCoChanges(commits, churn, 3);
		expect(result).toHaveLength(0);
	});
});
