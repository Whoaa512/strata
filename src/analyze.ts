import path from "path";
import fs from "fs";
import type { DataAccess, RuntimeEntrypoint, RuntimePath, StrataDoc, StrataDocCompact } from "./schema";
import { StrataDocSchema } from "./schema";
import { extractAll } from "./multi-extract";
import { getChurn, getTemporalCoupling, markStaticDependencies } from "./git";
import { computeHotspots } from "./hotspot";
import { computeAllBlastRadii } from "./blast";
import { computeChangeRipple } from "./ripple";
import { computeAgentRisk } from "./risk";
import { extractRuntime, composeRuntimePaths } from "./runtime-extract";

export function analyze(rootDir: string): StrataDoc {
  const resolvedRoot = path.resolve(rootDir);
  const t0 = performance.now();
  const { entities, callGraph, errors, tsPrograms } = extractAll(resolvedRoot);
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

  const runtimeEntrypoints: RuntimeEntrypoint[] = [];
  const dataAccesses: DataAccess[] = [];
  let runtimePaths: RuntimePath[] = [];
  try {
    for (const program of tsPrograms ?? []) {
      const runtime = extractRuntime(program, resolvedRoot, entities);
      runtimeEntrypoints.push(...runtime.entrypoints);
      dataAccesses.push(...runtime.accesses);
    }
    runtimePaths = composeRuntimePaths(runtimeEntrypoints, dataAccesses, callGraph);
    const t6 = performance.now();
    process.stderr.write(`  runtime: ${((t6 - t5) / 1000).toFixed(2)}s (${runtimeEntrypoints.length} entrypoints, ${dataAccesses.length} accesses, ${runtimePaths.length} paths)\n`);
  } catch (err) {
    process.stderr.write(`  [runtime] extraction failed: ${err}\n`);
  }

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
    runtimeEntrypoints,
    dataAccesses,
    runtimePaths,
    errors,
  };

  if (process.env.STRATA_VALIDATE) {
    return StrataDocSchema.parse(doc);
  }
  return doc;
}

export function toCompact(doc: StrataDoc): StrataDocCompact {
  return {
    ...doc,
    blastRadius: doc.blastRadius.map(br => ({
      entityId: br.entityId,
      directCallerCount: br.directCallers.length,
      radius: br.radius,
    })),
    changeRipple: doc.changeRipple.map(cr => ({
      entityId: cr.entityId,
      rippleScore: cr.rippleScore,
      affectedFileCount: cr.affectedFiles.length,
      implicitCouplingCount: cr.implicitCouplings.length,
    })),
    runtimePaths: doc.runtimePaths?.map(rp => ({
      entrypointId: rp.entrypointId,
      kind: rp.kind,
      route: rp.route,
      method: rp.method,
      reachableCount: rp.reachableEntities.length,
      dataAccessCount: rp.dataAccesses.length,
      depth: rp.depth,
    })),
  };
}

function streamWrite(fd: number, doc: StrataDocCompact): void {
  fs.writeSync(fd, '{');
  const keys = Object.keys(doc) as (keyof StrataDocCompact)[];
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
}

export function writeSvFile(doc: StrataDoc, rootDir: string): string {
  const strataDir = path.join(rootDir, ".strata");
  fs.mkdirSync(strataDir, { recursive: true });
  const outPath = path.join(strataDir, "analysis.sv.json");

  const compact = toCompact(doc);
  const fd = fs.openSync(outPath, "w");
  streamWrite(fd, compact);
  fs.closeSync(fd);
  return outPath;
}
