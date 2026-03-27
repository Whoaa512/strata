import { describe, expect, test } from "bun:test";
import { $ } from "bun";

const CLI = "src/cli.ts";

describe("CLI integration", () => {
	test("--help shows usage", async () => {
		const result = await $`bun run ${CLI} --help`.text();
		expect(result).toContain("strata");
		expect(result).toContain("USAGE");
		expect(result).toContain("--top");
	});

	test("--json outputs valid JSON", async () => {
		const result = await $`bun run ${CLI} . --json --quiet`.text();
		const doc = JSON.parse(result);
		expect(doc.version).toBe("0.1.0");
		expect(doc.meta).toBeDefined();
		expect(doc.entities).toBeInstanceOf(Array);
		expect(doc.edges).toBeInstanceOf(Array);
	});

	test("--json has correct meta fields", async () => {
		const result = await $`bun run ${CLI} . --json --quiet`.text();
		const doc = JSON.parse(result);
		expect(doc.meta.fileCount).toBeGreaterThan(0);
		expect(doc.meta.functionCount).toBeGreaterThan(0);
		expect(doc.meta.commitRange.from).toBeTruthy();
		expect(doc.meta.commitRange.to).toBeTruthy();
	});

	test("--output writes .sv file", async () => {
		const outFile = "/tmp/strata-cli-test.sv.json";
		await $`bun run ${CLI} . --output ${outFile} --quiet`.text();
		const content = await Bun.file(outFile).text();
		const doc = JSON.parse(content);
		expect(doc.version).toBe("0.1.0");
		expect(doc.entities.length).toBeGreaterThan(0);
	});

	test("entities have required metrics", async () => {
		const result = await $`bun run ${CLI} . --json --quiet`.text();
		const doc = JSON.parse(result);
		const entity = doc.entities[0];
		expect(entity.id).toBeTruthy();
		expect(entity.kind).toBe("function");
		expect(entity.metrics.cognitiveComplexity).toBeGreaterThanOrEqual(0);
		expect(entity.metrics.churn).toBeGreaterThanOrEqual(0);
		expect(entity.metrics.fanOut).toBeGreaterThanOrEqual(0);
	});

	test("--top limits results", async () => {
		const result = await $`bun run ${CLI} . --json --quiet --top 3`.text();
		const doc = JSON.parse(result);
		expect(doc.entities.length).toBeGreaterThan(0);
	});

	test("pretty output contains section headers", async () => {
		const result = await $`bun run ${CLI} . --quiet 2>&1`.text();
		expect(result).toContain("HOTSPOTS");
		expect(result).toContain("BLAST RADIUS");
		expect(result).toContain("SUMMARY");
	});
});
