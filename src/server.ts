#!/usr/bin/env bun
import { analyze, writeSvFile } from "./analyze";
import { buildFlowNeighborhood } from "./flow";
import { buildCodebaseShape } from "./shape";
import { computeDelegationLevel } from "./delegation";
import path from "path";
import fs from "fs";

const target = process.argv[2] ?? ".";
const rootDir = path.resolve(target);
const port = parseInt(process.env.PORT ?? "4747", 10);

console.log(`Analyzing ${rootDir}...`);
const start = performance.now();
const doc = analyze(rootDir);
const elapsed = ((performance.now() - start) / 1000).toFixed(2);
writeSvFile(doc, rootDir);
console.log(`Analysis complete: ${doc.entities.length} entities, ${doc.callGraph.length} edges (${elapsed}s)`);

const webDir = path.join(import.meta.dir, "..", "web");

const server = Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/data") {
      const rippleMap = new Map((doc.changeRipple || []).map(r => [r.entityId, r]));
      const blastMap = new Map(doc.blastRadius.map(b => [b.entityId, b]));
      const enriched = {
        ...doc,
        agentRisk: doc.agentRisk.map(r => ({
          ...r,
          delegationLevel: computeDelegationLevel(r, rippleMap.get(r.entityId), blastMap.get(r.entityId)),
        })),
      };
      return new Response(JSON.stringify(enriched), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/api/flow") {
      const entityId = url.searchParams.get("entityId");
      if (!entityId) return new Response("Missing entityId", { status: 400 });

      const depth = parseInt(url.searchParams.get("depth") ?? "1", 10);
      const flow = buildFlowNeighborhood(doc, entityId, { depth: Number.isFinite(depth) ? depth : 1 });
      return new Response(JSON.stringify(flow), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/api/shape") {
      return new Response(JSON.stringify(buildCodebaseShape(doc)), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const fullPath = path.join(webDir, filePath);

    if (!fs.existsSync(fullPath)) {
      return new Response("Not Found", { status: 404 });
    }

    const ext = path.extname(fullPath);
    const contentType: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
    };

    return new Response(fs.readFileSync(fullPath), {
      headers: { "Content-Type": contentType[ext] ?? "text/plain" },
    });
  },
});

const url = `http://localhost:${server.port}`;
console.log(`Explorer running at ${url}`);
Bun.spawn(["open", url]);
