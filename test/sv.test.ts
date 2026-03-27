import { describe, expect, test } from "bun:test";
import { buildSvDocument } from "../src/sv.js";
import type { FunctionInfo } from "../src/types.js";

describe("buildSvDocument", () => {
	test("produces valid .sv structure", () => {
		const functions: FunctionInfo[] = [
			{
				id: "src/a.ts:foo",
				name: "foo",
				filePath: "src/a.ts",
				startLine: 1,
				endLine: 10,
				complexity: 5,
				nestingDepth: 2,
				parameterCount: 1,
				calls: ["src/b.ts:bar"],
				isExported: true,
				isTestFile: false,
			},
			{
				id: "src/b.ts:bar",
				name: "bar",
				filePath: "src/b.ts",
				startLine: 1,
				endLine: 5,
				complexity: 0,
				nestingDepth: 0,
				parameterCount: 0,
				calls: [],
				isExported: true,
				isTestFile: false,
			},
		];

		const doc = buildSvDocument(
			"/repo",
			functions,
			[
				{
					functionId: "src/a.ts:foo",
					name: "foo",
					filePath: "src/a.ts",
					startLine: 1,
					complexity: 5,
					churn: 10,
					score: 50,
				},
			],
			[],
			[
				{
					fileA: "src/a.ts",
					fileB: "src/c.ts",
					coChangeCount: 5,
					confidence: 0.5,
					hasStaticDep: false,
				},
			],
		);

		expect(doc.version).toBe("0.1.0");
		expect(doc.repository).toBe("/repo");
		expect(doc.entities).toHaveLength(4);
		expect(doc.entities.filter((e) => e.type === "file")).toHaveLength(2);
		expect(doc.entities.filter((e) => e.type === "function")).toHaveLength(2);

		const callEdges = doc.edges.filter((e) => e.type === "calls");
		expect(callEdges).toHaveLength(1);
		expect(callEdges[0].source).toBe("src/a.ts:foo");
		expect(callEdges[0].target).toBe("src/b.ts:bar");

		const coChangeEdges = doc.edges.filter((e) => e.type === "co_changes_with");
		expect(coChangeEdges).toHaveLength(1);
		expect(coChangeEdges[0].weight).toBe(0.5);

		expect(doc.metrics.hotspots).toHaveLength(1);
		expect(doc.metrics.temporalCouplings).toHaveLength(1);
	});

	test("serializes to valid JSON", () => {
		const doc = buildSvDocument("/repo", [], [], [], []);
		const json = JSON.stringify(doc, null, 2);
		const parsed = JSON.parse(json);
		expect(parsed.version).toBe("0.1.0");
		expect(parsed.entities).toEqual([]);
	});
});
