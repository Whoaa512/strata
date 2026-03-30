import path from "path";
import fs from "fs";
import type { StrataDoc } from "./schema";
import { StrataDocSchema } from "./schema";
import { extractAll } from "./multi-extract";
import { getChurn, getTemporalCoupling, markStaticDependencies } from "./git";
import { computeHotspots } from "./hotspot";
import { computeAllBlastRadii } from "./blast";
import { computeChangeRipple } from "./ripple";
import { computeAgentRisk } from "./risk";

export function analyze(rootDir: string): StrataDoc {
  const resolvedRoot = path.resolve(rootDir);
  const t0 = performance.now();
  const { entities, callGraph, errors } = extractAll(resolvedRoot);
  const t1 = performance.now();
  process.stderr.write(`  extract: ${((t1 - t0) / 1000).toFixed(2)}s (${entities.length} entities, ${callGraph.length} edges)\n`);

  const churn = getChurn(resolvedRoot);
  const t2 = performance.now();
  process.stderr.write(`  churn: ${((t2 - t1) / 1000).toFixed(2)}s (${churn.length} files)\n`);

  let temporalCoupling = getTemporalCoupling(resolvedRoot);
  temporalCoupling = markStaticDependencies(temporalCoupling, callGraph, entities);
  const t3 = performance.now();
  process.stderr.write(`  temporal: ${((t3 - t2) / 1000).toFixed(2)}s (${temporalCoupling.length} pairs)\n`);

  const hotspots = computeHotspots(entities, churn);
  const blastRadius = computeAllBlastRadii(
    entities.map((e) => e.id),
    callGraph,
  );
  const t4 = performance.now();
  process.stderr.write(`  hotspots+blast: ${((t4 - t3) / 1000).toFixed(2)}s\n`);

  const changeRipple = computeChangeRipple(entities, callGraph, temporalCoupling, blastRadius, churn, resolvedRoot);
  const agentRisk = computeAgentRisk(entities, changeRipple, churn);
  const t5 = performance.now();
  process.stderr.write(`  ripple+risk: ${((t5 - t4) / 1000).toFixed(2)}s\n`);

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

  const fd = fs.openSync(outPath, "w");
  fs.writeSync(fd, '{');
  const keys = Object.keys(doc) as (keyof StrataDoc)[];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (i > 0) fs.writeSync(fd, ',');
    fs.writeSync(fd, `"${key}":`);
    const val = doc[key];
    if (Array.isArray(val)) {
      fs.writeSync(fd, '[');
      for (let j = 0; j < val.length; j++) {
        if (j > 0) fs.writeSync(fd, ',');
        fs.writeSync(fd, JSON.stringify(val[j]));
      }
      fs.writeSync(fd, ']');
    } else {
      fs.writeSync(fd, JSON.stringify(val));
    }
  }
  fs.writeSync(fd, '}');
  fs.closeSync(fd);
  return outPath;
}
