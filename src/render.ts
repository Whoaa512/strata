import type { StrataDoc, Entity, Hotspot, BlastRadius, TemporalCoupling } from "./schema";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";
const BG_RED = "\x1b[41m";
const BG_YELLOW = "\x1b[43m";
const BG_GREEN = "\x1b[42m";

function heatColor(value: number, max: number): string {
  if (max === 0) return GREEN;
  const ratio = value / max;
  if (ratio > 0.7) return RED;
  if (ratio > 0.4) return YELLOW;
  return GREEN;
}

function heatBar(value: number, max: number, width = 20): string {
  if (max === 0) return DIM + "░".repeat(width) + RESET;
  const filled = Math.round((value / max) * width);
  const color = heatColor(value, max);
  return color + "█".repeat(filled) + DIM + "░".repeat(width - filled) + RESET;
}

function badge(text: string, color: string): string {
  return `${color}${BOLD} ${text} ${RESET}`;
}

function riskBadge(score: number): string {
  if (score > 0.7) return badge("HIGH", BG_RED);
  if (score > 0.3) return badge("MED", BG_YELLOW);
  return badge("LOW", BG_GREEN);
}

function pad(s: string, n: number): string {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
  return s + " ".repeat(Math.max(0, n - stripped.length));
}

function rpad(s: string, n: number): string {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
  return " ".repeat(Math.max(0, n - stripped.length)) + s;
}

function header(title: string): string {
  return `\n${BOLD}${CYAN}┌${"─".repeat(60)}┐${RESET}\n${BOLD}${CYAN}│${RESET} ${BOLD}${WHITE}${title}${RESET}${" ".repeat(Math.max(0, 59 - title.length))}${BOLD}${CYAN}│${RESET}\n${BOLD}${CYAN}└${"─".repeat(60)}┘${RESET}\n`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function renderReport(doc: StrataDoc): string {
  const lines: string[] = [];

  lines.push(`\n${BOLD}${MAGENTA}  ╔═══════════════════════════════╗${RESET}`);
  lines.push(`${BOLD}${MAGENTA}  ║     STRATA ANALYSIS REPORT    ║${RESET}`);
  lines.push(`${BOLD}${MAGENTA}  ╚═══════════════════════════════╝${RESET}`);
  lines.push(`${DIM}  ${doc.analyzedAt} • ${doc.entities.length} entities • ${doc.callGraph.length} call edges${RESET}\n`);

  // Summary
  lines.push(header("Summary"));
  lines.push(`  ${BOLD}Files analyzed:${RESET}    ${new Set(doc.entities.map((e) => e.filePath)).size}`);
  lines.push(`  ${BOLD}Entities:${RESET}          ${doc.entities.length}`);
  lines.push(`  ${BOLD}Call edges:${RESET}        ${doc.callGraph.length}`);
  lines.push(`  ${BOLD}Hotspots:${RESET}          ${doc.hotspots.length}`);
  lines.push(`  ${BOLD}Temporal couples:${RESET}  ${doc.temporalCoupling.length}`);
  if (doc.errors.length > 0) {
    lines.push(`  ${RED}${BOLD}Errors:${RESET}            ${doc.errors.length}`);
  }

  // Top complex entities
  const sortedByComplexity = [...doc.entities]
    .sort((a, b) => b.metrics.cognitive - a.metrics.cognitive)
    .slice(0, 15);

  if (sortedByComplexity.length > 0) {
    lines.push(header("Most Complex Functions"));
    const maxCog = Math.max(...sortedByComplexity.map((e) => e.metrics.cognitive));
    lines.push(`  ${DIM}${pad("Function", 40)} Cogn  Cycl  Nest  LOC${RESET}`);
    lines.push(`  ${DIM}${"─".repeat(60)}${RESET}`);
    for (const e of sortedByComplexity) {
      const name = truncate(`${e.filePath}:${e.name}`, 38);
      const bar = heatBar(e.metrics.cognitive, maxCog, 8);
      lines.push(
        `  ${pad(name, 40)} ${bar} ${rpad(String(e.metrics.cognitive), 3)}  ${rpad(String(e.metrics.cyclomatic), 4)}  ${rpad(String(e.metrics.maxNestingDepth), 4)}  ${rpad(String(e.metrics.loc), 4)}`,
      );
    }
  }

  // Hotspots
  if (doc.hotspots.length > 0) {
    lines.push(header("Hotspots (Churn × Complexity)"));
    const top = doc.hotspots.slice(0, 10);
    lines.push(`  ${DIM}${pad("Function", 40)} Score   Complexity  Churn${RESET}`);
    lines.push(`  ${DIM}${"─".repeat(60)}${RESET}`);
    for (const h of top) {
      const entity = doc.entities.find((e) => e.id === h.entityId);
      const name = entity ? truncate(`${entity.filePath}:${entity.name}`, 38) : truncate(h.entityId, 38);
      lines.push(
        `  ${pad(name, 40)} ${riskBadge(h.score)} ${rpad(h.score.toFixed(3), 6)}  ${rpad(String(h.complexity), 10)}  ${rpad(String(h.churn), 5)}`,
      );
    }
  }

  // Blast radius
  const topBlast = doc.blastRadius.slice(0, 10);
  if (topBlast.length > 0) {
    lines.push(header("Blast Radius (Most Impactful)"));
    lines.push(`  ${DIM}${pad("Function", 45)} Direct  Transitive${RESET}`);
    lines.push(`  ${DIM}${"─".repeat(60)}${RESET}`);
    for (const br of topBlast) {
      const entity = doc.entities.find((e) => e.id === br.entityId);
      const name = entity ? truncate(`${entity.filePath}:${entity.name}`, 43) : truncate(br.entityId, 43);
      lines.push(
        `  ${pad(name, 45)} ${rpad(String(br.directCallers.length), 6)}  ${rpad(String(br.radius), 10)}`,
      );
    }
  }

  // Temporal coupling (non-static only — the surprising ones)
  const surprisingCoupling = doc.temporalCoupling
    .filter((c) => !c.hasStaticDependency)
    .slice(0, 10);
  if (surprisingCoupling.length > 0) {
    lines.push(header("Surprising Temporal Coupling"));
    lines.push(`  ${DIM}${pad("File A", 25)} ${pad("File B", 25)} Co-changes${RESET}`);
    lines.push(`  ${DIM}${"─".repeat(60)}${RESET}`);
    for (const c of surprisingCoupling) {
      lines.push(
        `  ${pad(truncate(c.fileA, 23), 25)} ${pad(truncate(c.fileB, 23), 25)} ${rpad(String(c.cochangeCount), 5)}`,
      );
    }
  }

  // Errors
  if (doc.errors.length > 0) {
    lines.push(header("Errors"));
    for (const err of doc.errors.slice(0, 10)) {
      lines.push(`  ${RED}✗${RESET} ${err.filePath}: ${DIM}${err.error}${RESET}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
