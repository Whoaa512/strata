import type { StrataView } from "@strata/analysis";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

export function formatReport(sv: StrataView): string {
	const parts: string[] = [];

	parts.push(formatHeader(sv));
	parts.push(formatHotspots(sv));
	parts.push(formatBlastRadius(sv));
	parts.push(formatTemporalCouplings(sv));
	parts.push(formatSummary(sv));

	return parts.join("\n");
}

function formatHeader(sv: StrataView): string {
	const lines = [
		`${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}`,
		`${BOLD}${CYAN}║           STRATA - Code Complexity Report        ║${RESET}`,
		`${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}`,
		"",
		`${DIM}Repo:${RESET} ${sv.repoPath}`,
		`${DIM}Generated:${RESET} ${sv.generatedAt}`,
		`${DIM}Entities:${RESET} ${sv.entities.length} functions analyzed`,
		"",
	];
	return lines.join("\n");
}

function formatHotspots(sv: StrataView): string {
	if (sv.hotspots.length === 0) {
		return `${DIM}No hotspots found.${RESET}\n`;
	}

	const lines = [
		`${BOLD}${RED}🔥 TOP HOTSPOTS ${DIM}(complexity × churn)${RESET}`,
		`${"─".repeat(70)}`,
	];

	for (const h of sv.hotspots.slice(0, 10)) {
		const entity = sv.entities.find((e) => e.id === h.entityId);
		const name = entity ? `${entity.filePath}:${entity.name}` : h.entityId;
		const bar = scoreBar(h.score, sv.hotspots[0].score);
		lines.push(
			`  ${BOLD}#${h.rank}${RESET} ${bar} ${YELLOW}${h.score}${RESET} ${name}`,
		);
		lines.push(
			`      ${DIM}complexity: ${h.complexity}  churn: ${h.churn}${RESET}`,
		);
	}

	lines.push("");
	return lines.join("\n");
}

function formatBlastRadius(sv: StrataView): string {
	const risky = sv.blastRadii.filter((b) => b.riskScore > 0).slice(0, 10);

	if (risky.length === 0) {
		return `${DIM}No blast radius data.${RESET}\n`;
	}

	const lines = [
		`${BOLD}${MAGENTA}💥 HIGHEST BLAST RADIUS${RESET}`,
		`${"─".repeat(70)}`,
	];

	for (const b of risky) {
		const entity = sv.entities.find((e) => e.id === b.entityId);
		const name = entity ? `${entity.filePath}:${entity.name}` : b.entityId;
		const coverageColor =
			b.testCoverage >= 0.8 ? GREEN : b.testCoverage >= 0.5 ? YELLOW : RED;

		lines.push(
			`  ${BOLD}${name}${RESET} ${DIM}risk:${RESET} ${RED}${b.riskScore}${RESET}`,
		);
		lines.push(
			`      reaches: ${b.forwardSlice.length} fns  ` +
				`coverage: ${coverageColor}${Math.round(b.testCoverage * 100)}%${RESET}  ` +
				`coupling: ${b.changeCoupling.length} files`,
		);
	}

	lines.push("");
	return lines.join("\n");
}

function formatTemporalCouplings(sv: StrataView): string {
	const hidden = sv.temporalCouplings.filter((t) => !t.hasStaticDependency);

	if (hidden.length === 0 && sv.temporalCouplings.length === 0) {
		return `${DIM}No temporal coupling data.${RESET}\n`;
	}

	const lines = [
		`${BOLD}${YELLOW}🔗 TEMPORAL COUPLING ${DIM}(files that co-change without static dependency)${RESET}`,
		`${"─".repeat(70)}`,
	];

	const toShow =
		hidden.length > 0 ? hidden.slice(0, 10) : sv.temporalCouplings.slice(0, 5);

	for (const t of toShow) {
		const tag = t.hasStaticDependency
			? `${DIM}[static]${RESET}`
			: `${RED}[hidden]${RESET}`;
		lines.push(`  ${tag} ${t.fileA} ↔ ${t.fileB}`);
		lines.push(
			`      ${DIM}co-changes: ${t.coChangeCount}  coupling: ${t.coupling}${RESET}`,
		);
	}

	lines.push("");
	return lines.join("\n");
}

function formatSummary(sv: StrataView): string {
	const totalComplexity = sv.entities.reduce(
		(sum, e) => sum + e.metrics.cognitiveComplexity,
		0,
	);
	const avgComplexity =
		sv.entities.length > 0
			? Math.round(totalComplexity / sv.entities.length)
			: 0;
	const highComplexity = sv.entities.filter(
		(e) => e.metrics.cognitiveComplexity > 15,
	).length;

	const lines = [
		`${BOLD}${GREEN}📊 SUMMARY${RESET}`,
		`${"─".repeat(70)}`,
		`  Total functions: ${sv.entities.length}`,
		`  Avg complexity:  ${avgComplexity}`,
		`  High complexity (>15): ${highComplexity}`,
		`  Hotspots: ${sv.hotspots.length}`,
		`  Hidden couplings: ${sv.temporalCouplings.filter((t) => !t.hasStaticDependency).length}`,
		"",
	];
	return lines.join("\n");
}

function scoreBar(value: number, max: number): string {
	const width = 20;
	const filled = max > 0 ? Math.round((value / max) * width) : 0;
	const bar = "█".repeat(filled) + "░".repeat(width - filled);
	return `${RED}${bar}${RESET}`;
}
