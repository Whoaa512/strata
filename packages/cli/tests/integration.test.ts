import { describe, expect, test } from "bun:test";
import { runAnalysis } from "../src/runner.js";

describe("integration: self-analysis", () => {
	test("analyzes the strata-v2 repo itself", async () => {
		const sv = await runAnalysis(`${import.meta.dir}/../../..`);
		expect(sv.version).toBe("0.1.0");
		expect(sv.entities.length).toBeGreaterThan(10);
		expect(sv.hotspots.length).toBeGreaterThan(0);
		expect(sv.edges.length).toBeGreaterThan(0);

		const topHotspot = sv.hotspots[0];
		expect(topHotspot.rank).toBe(1);
		expect(topHotspot.complexity).toBeGreaterThan(0);
		expect(topHotspot.score).toBeGreaterThan(0);
	});

	test("produces valid .sv format", async () => {
		const sv = await runAnalysis(`${import.meta.dir}/../../..`);

		expect(sv).toHaveProperty("version");
		expect(sv).toHaveProperty("generatedAt");
		expect(sv).toHaveProperty("repoPath");
		expect(sv).toHaveProperty("entities");
		expect(sv).toHaveProperty("edges");
		expect(sv).toHaveProperty("hotspots");
		expect(sv).toHaveProperty("blastRadii");
		expect(sv).toHaveProperty("temporalCouplings");

		for (const entity of sv.entities.slice(0, 5)) {
			expect(entity).toHaveProperty("id");
			expect(entity).toHaveProperty("name");
			expect(entity).toHaveProperty("filePath");
			expect(entity).toHaveProperty("metrics");
			expect(entity.metrics).toHaveProperty("cognitiveComplexity");
			expect(entity.metrics).toHaveProperty("fanIn");
			expect(entity.metrics).toHaveProperty("fanOut");
			expect(entity.metrics).toHaveProperty("churn");
		}

		for (const hotspot of sv.hotspots) {
			expect(hotspot).toHaveProperty("entityId");
			expect(hotspot).toHaveProperty("score");
			expect(hotspot).toHaveProperty("rank");
			expect(hotspot.score).toBe(hotspot.complexity * hotspot.churn);
		}

		const jsonStr = JSON.stringify(sv);
		const parsed = JSON.parse(jsonStr);
		expect(parsed.version).toBe("0.1.0");
	});

	test("finds blast radii for functions", async () => {
		const sv = await runAnalysis(`${import.meta.dir}/../../..`);
		const withReach = sv.blastRadii.filter((b) => b.forwardSlice.length > 0);
		expect(withReach.length).toBeGreaterThan(0);

		const topRisk = sv.blastRadii[0];
		expect(topRisk.riskScore).toBeGreaterThan(0);
	});

	test("detects function metrics", async () => {
		const sv = await runAnalysis(`${import.meta.dir}/../../..`);

		const complexFns = sv.entities.filter(
			(e) => e.metrics.cognitiveComplexity > 5,
		);
		expect(complexFns.length).toBeGreaterThan(0);

		const withFanOut = sv.entities.filter((e) => e.metrics.fanOut > 0);
		expect(withFanOut.length).toBeGreaterThan(0);
	});
});
