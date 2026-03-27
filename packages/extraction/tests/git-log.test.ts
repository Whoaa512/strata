import { describe, expect, test } from "bun:test";
import { _parseLogOutput } from "../src/git-log.js";

const SAMPLE_LOG = `---COMMIT---
abc123
Alice
2024-06-15T10:00:00Z
src/auth.ts
src/db.ts

---COMMIT---
def456
Bob
2024-06-14T09:00:00Z
src/auth.ts
src/utils.ts

---COMMIT---
ghi789
Alice
2024-06-13T08:00:00Z
src/auth.ts
src/db.ts
src/config.ts

---COMMIT---
jkl012
Charlie
2024-06-12T07:00:00Z
src/utils.ts
`;

describe("git log parsing", () => {
	test("computes churn correctly", () => {
		const { churn } = _parseLogOutput(SAMPLE_LOG);
		const authEntry = churn.find((e) => e.filePath === "src/auth.ts");
		expect(authEntry).toBeDefined();
		expect(authEntry?.commits).toBe(3);
		expect(authEntry?.authors.sort()).toEqual(["Alice", "Bob"]);
	});

	test("sorts churn by commit count descending", () => {
		const { churn } = _parseLogOutput(SAMPLE_LOG);
		for (let i = 1; i < churn.length; i++) {
			expect(churn[i].commits).toBeLessThanOrEqual(churn[i - 1].commits);
		}
	});

	test("computes co-changes with minimum threshold of 2", () => {
		const { coChanges } = _parseLogOutput(SAMPLE_LOG);
		for (const entry of coChanges) {
			expect(entry.coChangeCount).toBeGreaterThanOrEqual(2);
		}
	});

	test("auth and db co-change twice", () => {
		const { coChanges } = _parseLogOutput(SAMPLE_LOG);
		const pair = coChanges.find(
			(e) =>
				(e.fileA === "src/auth.ts" && e.fileB === "src/db.ts") ||
				(e.fileA === "src/db.ts" && e.fileB === "src/auth.ts"),
		);
		expect(pair).toBeDefined();
		expect(pair?.coChangeCount).toBe(2);
	});

	test("handles empty input", () => {
		const { churn, coChanges } = _parseLogOutput("");
		expect(churn).toHaveLength(0);
		expect(coChanges).toHaveLength(0);
	});

	test("includes total change counts in co-change entries", () => {
		const { coChanges } = _parseLogOutput(SAMPLE_LOG);
		const pair = coChanges.find(
			(e) =>
				(e.fileA === "src/auth.ts" && e.fileB === "src/db.ts") ||
				(e.fileA === "src/db.ts" && e.fileB === "src/auth.ts"),
		);
		expect(pair).toBeDefined();
		const authTotal =
			pair?.fileA === "src/auth.ts" ? pair?.totalChangesA : pair?.totalChangesB;
		expect(authTotal).toBe(3);
	});
});
