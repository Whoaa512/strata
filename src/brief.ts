import type { StrataDoc, ChangeRipple, AgentRisk, Entity, TemporalCoupling } from "./schema";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const WHITE = "\x1b[37m";

const SAFETY_ICON: Record<string, string> = {
  green: `${GREEN}●${RESET}`,
  yellow: `${YELLOW}●${RESET}`,
  red: `${RED}●${RESET}`,
};

const SAFETY_LABEL: Record<string, string> = {
  green: `${GREEN}SAFE${RESET}`,
  yellow: `${YELLOW}CAUTION${RESET}`,
  red: `${RED}DANGER${RESET}`,
};

export function renderBrief(doc: StrataDoc, taskDescription?: string): string {
  const lines: string[] = [];
  const riskByEntity = new Map(doc.agentRisk.map(r => [r.entityId, r]));
  const rippleByEntity = new Map(doc.changeRipple.map(r => [r.entityId, r]));
  const entityById = new Map(doc.entities.map(e => [e.id, e]));

  lines.push("");
  lines.push(`${BOLD}${MAGENTA}  STRATA BRIEFING${RESET}`);
  if (taskDescription) {
    lines.push(`${DIM}  ${taskDescription}${RESET}`);
  }
  lines.push(`${DIM}  ${"━".repeat(50)}${RESET}`);
  lines.push("");

  const fileRisk = aggregateFileRisk(doc);
  const sortedFiles = Array.from(fileRisk.entries())
    .sort((a, b) => ratingOrder(a[1].worstRating) - ratingOrder(b[1].worstRating));

  lines.push(`${BOLD}${WHITE}  Risk Map${RESET} ${DIM}(${sortedFiles.length} files)${RESET}`);
  lines.push("");

  const redFiles = sortedFiles.filter(([, r]) => r.worstRating === "red");
  const yellowFiles = sortedFiles.filter(([, r]) => r.worstRating === "yellow");
  const greenFiles = sortedFiles.filter(([, r]) => r.worstRating === "green");

  if (redFiles.length > 0) {
    lines.push(`  ${RED}${BOLD}▸ Danger zones${RESET} ${DIM}(need careful briefing)${RESET}`);
    for (const [file, info] of redFiles) {
      lines.push(`    ${SAFETY_ICON.red} ${WHITE}${file}${RESET}`);
      lines.push(`      ${DIM}ripple: ${info.maxRipple.toFixed(1)} · context: ~${formatTokens(info.contextCost)} · ${info.entityCount} entities${RESET}`);
      for (const factor of info.topFactors.slice(0, 2)) {
        lines.push(`      ${YELLOW}⚠ ${factor}${RESET}`);
      }
    }
    lines.push("");
  }

  if (yellowFiles.length > 0) {
    lines.push(`  ${YELLOW}${BOLD}▸ Caution${RESET} ${DIM}(review agent output carefully)${RESET}`);
    for (const [file, info] of yellowFiles) {
      lines.push(`    ${SAFETY_ICON.yellow} ${file}`);
      lines.push(`      ${DIM}ripple: ${info.maxRipple.toFixed(1)} · context: ~${formatTokens(info.contextCost)} · ${info.entityCount} entities${RESET}`);
      for (const factor of info.topFactors.slice(0, 1)) {
        lines.push(`      ${DIM}⚠ ${factor}${RESET}`);
      }
    }
    lines.push("");
  }

  if (greenFiles.length > 0) {
    lines.push(`  ${GREEN}${BOLD}▸ Safe to send agents${RESET}`);
    for (const [file] of greenFiles) {
      lines.push(`    ${SAFETY_ICON.green} ${DIM}${file}${RESET}`);
    }
    lines.push("");
  }

  const implicitCouplings = getImplicitCouplings(doc);
  if (implicitCouplings.length > 0) {
    lines.push(`${BOLD}${WHITE}  Implicit Couplings${RESET} ${DIM}(files that co-change without import link)${RESET}`);
    lines.push("");
    for (const c of implicitCouplings.slice(0, 10)) {
      lines.push(`    ${YELLOW}⚠${RESET} ${c.fileA} ${DIM}↔${RESET} ${c.fileB} ${DIM}(${Math.round(c.confidence * 100)}% co-change, ${c.cochangeCount} commits)${RESET}`);
    }
    lines.push("");
  }

  const highRipple = doc.changeRipple
    .filter(r => r.affectedFiles.length > 2)
    .slice(0, 10);

  if (highRipple.length > 0) {
    lines.push(`${BOLD}${WHITE}  Highest Change Ripple${RESET} ${DIM}(touching these cascades far)${RESET}`);
    lines.push("");
    for (const r of highRipple) {
      const entity = entityById.get(r.entityId);
      if (!entity) continue;
      const risk = riskByEntity.get(r.entityId);
      const icon = risk ? SAFETY_ICON[risk.safetyRating] : "·";
      lines.push(`    ${icon} ${CYAN}${entity.name}${RESET} ${DIM}${entity.filePath}:${entity.startLine}${RESET}`);
      lines.push(`      ${DIM}→ ${r.affectedFiles.length} files: ${r.affectedFiles.slice(0, 4).join(", ")}${r.affectedFiles.length > 4 ? ` +${r.affectedFiles.length - 4} more` : ""}${RESET}`);
    }
    lines.push("");
  }

  const totalContextCost = doc.agentRisk.reduce((sum, r) => sum + r.contextCost, 0);
  const avgContextCost = doc.agentRisk.length > 0 ? totalContextCost / doc.agentRisk.length : 0;

  lines.push(`${DIM}  ─────────────────────────────────────────${RESET}`);
  lines.push(`  ${DIM}Entities: ${doc.entities.length} · Avg context cost: ~${formatTokens(avgContextCost)} · ` +
    `${RED}${redFiles.length}${RESET}${DIM} danger · ${YELLOW}${yellowFiles.length}${RESET}${DIM} caution · ${GREEN}${greenFiles.length}${RESET}${DIM} safe${RESET}`);
  lines.push("");

  return lines.join("\n");
}

export function renderFileBrief(doc: StrataDoc, targetFile: string): string {
  const lines: string[] = [];
  const entities = doc.entities.filter(e => e.filePath === targetFile);
  const riskByEntity = new Map(doc.agentRisk.map(r => [r.entityId, r]));
  const rippleByEntity = new Map(doc.changeRipple.map(r => [r.entityId, r]));

  if (entities.length === 0) {
    return `  No entities found in ${targetFile}`;
  }

  lines.push("");
  lines.push(`${BOLD}${MAGENTA}  STRATA BRIEFING${RESET} ${DIM}— ${targetFile}${RESET}`);
  lines.push(`${DIM}  ${"━".repeat(50)}${RESET}`);
  lines.push("");

  for (const entity of entities) {
    const risk = riskByEntity.get(entity.id);
    const ripple = rippleByEntity.get(entity.id);
    const icon = risk ? SAFETY_ICON[risk.safetyRating] : "·";
    const label = risk ? SAFETY_LABEL[risk.safetyRating] : "";

    lines.push(`  ${icon} ${BOLD}${CYAN}${entity.name}${RESET} ${DIM}L${entity.startLine}-${entity.endLine} · ${entity.kind}${RESET} ${label}`);

    if (risk) {
      lines.push(`    ${DIM}context cost: ~${formatTokens(risk.contextCost)}${RESET}`);
      for (const factor of risk.riskFactors) {
        lines.push(`    ${YELLOW}⚠ ${factor}${RESET}`);
      }
    }

    if (ripple && ripple.affectedFiles.length > 0) {
      lines.push(`    ${DIM}ripple → ${ripple.affectedFiles.join(", ")}${RESET}`);
    }

    if (ripple && ripple.implicitCouplings.length > 0) {
      for (const ic of ripple.implicitCouplings) {
        lines.push(`    ${YELLOW}⚠ implicit coupling: ${ic.filePath} (${Math.round(ic.cochangeRate * 100)}% co-change)${RESET}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

interface FileRiskInfo {
  worstRating: "green" | "yellow" | "red";
  maxRipple: number;
  contextCost: number;
  entityCount: number;
  topFactors: string[];
}

function aggregateFileRisk(doc: StrataDoc): Map<string, FileRiskInfo> {
  const riskByEntity = new Map(doc.agentRisk.map(r => [r.entityId, r]));
  const fileMap = new Map<string, FileRiskInfo>();

  for (const entity of doc.entities) {
    const risk = riskByEntity.get(entity.id);
    if (!risk) continue;

    let info = fileMap.get(entity.filePath);
    if (!info) {
      info = { worstRating: "green", maxRipple: 0, contextCost: 0, entityCount: 0, topFactors: [] };
      fileMap.set(entity.filePath, info);
    }

    info.entityCount++;
    if (ratingOrder(risk.safetyRating) < ratingOrder(info.worstRating)) {
      info.worstRating = risk.safetyRating;
    }
    info.maxRipple = Math.max(info.maxRipple, risk.rippleScore);
    info.contextCost = Math.max(info.contextCost, risk.contextCost);
    info.topFactors.push(...risk.riskFactors);
  }

  for (const info of fileMap.values()) {
    info.topFactors = [...new Set(info.topFactors)];
  }

  return fileMap;
}

function getImplicitCouplings(doc: StrataDoc): TemporalCoupling[] {
  return doc.temporalCoupling
    .filter(c => !c.hasStaticDependency && c.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence);
}

function ratingOrder(r: string): number {
  if (r === "red") return 0;
  if (r === "yellow") return 1;
  return 2;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k tokens`;
  return `${Math.round(n)} tokens`;
}
