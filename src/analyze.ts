import path from "path";
import fs from "fs";
import type { StrataDoc } from "./schema";
import { StrataDocSchema } from "./schema";
import { createProgram, extract } from "./extract";
import { getChurn, getTemporalCoupling, markStaticDependencies } from "./git";
import { computeHotspots } from "./hotspot";
import { computeAllBlastRadii } from "./blast";
import { computeChangeRipple } from "./ripple";
import { computeAgentRisk } from "./risk";

export function analyze(rootDir: string): StrataDoc {
  const resolvedRoot = path.resolve(rootDir);
  const program = createProgram(resolvedRoot);
  const { entities, callGraph, errors } = extract(program, resolvedRoot);

  const churn = getChurn(resolvedRoot);
  let temporalCoupling = getTemporalCoupling(resolvedRoot);
  temporalCoupling = markStaticDependencies(temporalCoupling, callGraph, entities);

  const hotspots = computeHotspots(entities, churn);
  const blastRadius = computeAllBlastRadii(
    entities.map((e) => e.id),
    callGraph,
  );

  const changeRipple = computeChangeRipple(entities, callGraph, temporalCoupling, blastRadius, churn, resolvedRoot);
  const agentRisk = computeAgentRisk(entities, changeRipple, churn);

  const doc: StrataDoc = {
    version: "0.2.0",
    analyzedAt: new Date().toISOString(),
    rootDir: resolvedRoot,
    entities,
    callGraph,
    churn,
    temporalCoupling,
    hotspots,
    blastRadius,
    changeRipple,
    agentRisk,
    errors,
  };

  return StrataDocSchema.parse(doc);
}

export function writeSvFile(doc: StrataDoc, rootDir: string): string {
  const strataDir = path.join(rootDir, ".strata");
  fs.mkdirSync(strataDir, { recursive: true });
  const outPath = path.join(strataDir, "analysis.sv.json");
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
  return outPath;
}
