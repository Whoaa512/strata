import type { DiffAnalysis } from "./diff";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const WHITE = "\x1b[37m";

function confBar(confidence: number): string {
  const pct = Math.round(confidence * 100);
  const color = pct >= 70 ? RED : pct >= 40 ? YELLOW : DIM;
  return `${color}${pct}%${RESET}`;
}

export function renderDiffAnalysis(analysis: DiffAnalysis, diffSpec: string): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`${BOLD}${MAGENTA}  STRATA DIFF REVIEW${RESET}`);
  lines.push(`${DIM}  ${diffSpec} · ${analysis.changedFiles.length} files changed · ${analysis.changedEntities.length} entities${RESET}`);
  lines.push(`${DIM}  ${"━".repeat(50)}${RESET}`);
  lines.push("");

  lines.push(`${BOLD}${WHITE}  Changed${RESET}`);
  for (const f of analysis.changedFiles) {
    const icon = f.status === "added" ? `${GREEN}+` : f.status === "deleted" ? `${RED}-` : `${CYAN}~`;
    lines.push(`    ${icon}${RESET} ${f.filePath}`);
  }
  lines.push("");

  if (analysis.missedFiles.length > 0) {
    lines.push(`${BOLD}${RED}  ⚠ Probably Missed${RESET} ${DIM}(${analysis.missedFiles.length} files)${RESET}`);
    lines.push("");
    for (const m of analysis.missedFiles) {
      lines.push(`    ${RED}●${RESET} ${WHITE}${m.filePath}${RESET}  ${confBar(m.confidence)}`);
      lines.push(`      ${DIM}${m.reason}${RESET}`);
    }
    lines.push("");
  } else {
    lines.push(`  ${GREEN}✓ No obviously missed files${RESET}`);
    lines.push("");
  }

  if (analysis.missedTests.length > 0) {
    lines.push(`${BOLD}${YELLOW}  ⚠ Tests to Update${RESET} ${DIM}(${analysis.missedTests.length} files)${RESET}`);
    lines.push("");
    for (const t of analysis.missedTests) {
      lines.push(`    ${YELLOW}●${RESET} ${t.filePath}  ${confBar(t.confidence)}`);
      lines.push(`      ${DIM}${t.reason}${RESET}`);
    }
    lines.push("");
  }

  if (analysis.affectedCallers.length > 0) {
    lines.push(`${BOLD}${CYAN}  Affected Callers${RESET} ${DIM}(${analysis.affectedCallers.length} functions may be impacted)${RESET}`);
    lines.push("");

    const byFile = new Map<string, string[]>();
    for (const c of analysis.affectedCallers) {
      let names = byFile.get(c.filePath);
      if (!names) { names = []; byFile.set(c.filePath, names); }
      names.push(c.name);
    }

    for (const [file, names] of byFile) {
      lines.push(`    ${DIM}${file}:${RESET} ${names.join(", ")}`);
    }
    lines.push("");
  }

  const total = analysis.missedFiles.length + analysis.missedTests.length;
  if (total > 0) {
    lines.push(`${DIM}  ─────────────────────────────────────────${RESET}`);
    lines.push(`  ${YELLOW}${total} item${total > 1 ? "s" : ""} to review${RESET} · ${analysis.affectedCallers.length} callers in blast zone`);
  } else {
    lines.push(`${DIM}  ─────────────────────────────────────────${RESET}`);
    lines.push(`  ${GREEN}Change looks contained.${RESET} ${DIM}${analysis.affectedCallers.length} callers in blast zone.${RESET}`);
  }
  lines.push("");

  return lines.join("\n");
}
