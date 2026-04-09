import ts from "typescript";
import path from "path";
import type { Entity, CallEdge, RuntimeEntrypoint, DataAccess, RuntimePath } from "./schema";

const MAX_DEPTH = 10;
const MAX_REACHABLE = 200;

function findEnclosingEntity(node: ts.Node, sourceFile: ts.SourceFile, entities: Entity[], rootDir: string): Entity | undefined {
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  return findEntityByLine(sourceFile, entities, rootDir, line);
}

function findEntityByLine(sourceFile: ts.SourceFile, entities: Entity[], rootDir: string, line: number): Entity | undefined {
  const relPath = path.relative(rootDir, path.resolve(sourceFile.fileName));
  let best: Entity | undefined;
  for (const e of entities) {
    if (e.filePath !== relPath) continue;
    if (line >= e.startLine && line <= e.endLine) {
      if (!best || (e.endLine - e.startLine) < (best.endLine - best.startLine)) {
        best = e;
      }
    }
  }
  return best;
}

function resolveHandlerEntity(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  entities: Entity[],
  rootDir: string,
  checker: ts.TypeChecker | undefined,
  handlerArgIndex: number,
): { entityId?: string; id?: string; filePath?: string; line?: number } {
  const handlerArg = node.arguments[handlerArgIndex];
  if (!handlerArg) return {};

  if (ts.isArrowFunction(handlerArg) || ts.isFunctionExpression(handlerArg)) {
    const handlerLine = sourceFile.getLineAndCharacterOfPosition(handlerArg.getStart()).line + 1;
    const entity = findEntityByLine(sourceFile, entities, rootDir, handlerLine);
    if (entity && entity.startLine === handlerLine) {
      return { entityId: entity.id, id: entity.id, filePath: entity.filePath, line: entity.startLine };
    }
    const relPath = path.relative(rootDir, path.resolve(sourceFile.fileName));
    return { filePath: relPath, line: handlerLine };
  }

  if (ts.isIdentifier(handlerArg) && checker) {
    const sym = checker.getSymbolAtLocation(handlerArg);
    if (sym) {
      const decls = sym.getDeclarations();
      if (decls && decls.length > 0) {
        const decl = decls[0];
        const declFile = decl.getSourceFile();
        const declLine = declFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1;
        const declRelPath = path.relative(rootDir, path.resolve(declFile.fileName));

        const entity = findEntityByLine(declFile, entities, rootDir, declLine);
        if (entity) return { entityId: entity.id, id: entity.id, filePath: entity.filePath, line: entity.startLine };
        return { filePath: declRelPath, line: declLine };
      }
    }
  }

  return {};
}

function getStringArg(node: ts.CallExpression, index: number): string | undefined {
  const arg = node.arguments[index];
  if (!arg) return undefined;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  return undefined;
}

function getPropertyAccessChain(expr: ts.Expression): string[] {
  const parts: string[] = [];
  let current = expr;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  if (ts.isIdentifier(current)) parts.unshift(current.text);
  return parts;
}

function extractFromFile(
  sourceFile: ts.SourceFile,
  entities: Entity[],
  rootDir: string,
  checker: ts.TypeChecker | undefined,
): { entrypoints: RuntimeEntrypoint[]; accesses: DataAccess[] } {
  const entrypoints: RuntimeEntrypoint[] = [];
  const accesses: DataAccess[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      handleCallExpression(node, sourceFile, entities, rootDir, entrypoints, accesses, checker);
    }

    if (ts.isPropertyAccessExpression(node) && !ts.isCallExpression(node.parent)) {
      handlePropertyAccess(node, sourceFile, entities, rootDir, accesses);
    }

    if (ts.isTaggedTemplateExpression(node)) {
      handleTaggedTemplate(node, sourceFile, entities, rootDir, accesses);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { entrypoints, accesses };
}

const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch", "use"]);
const QUEUE_METHODS = new Set(["process", "on", "schedule"]);
const EVENT_METHODS = new Set(["on", "subscribe"]);
const DB_READ_METHODS = new Set(["select", "findMany", "findFirst", "findUnique", "findUniqueOrThrow", "findFirstOrThrow", "count", "aggregate", "groupBy"]);
const DB_WRITE_METHODS = new Set(["insert", "create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);
const CACHE_READ_METHODS = new Set(["get", "mget", "hget", "hgetall"]);
const CACHE_WRITE_METHODS = new Set(["set", "mset", "hset", "setex"]);
const CACHE_DEL_METHODS = new Set(["del", "hdel", "expire"]);
const PUBLISH_METHODS = new Set(["publish", "emit", "send", "enqueue"]);
const HTTP_CALL_NAMES = new Set(["fetch"]);
const HTTP_CALL_METHODS = new Set(["get", "post", "put", "delete", "patch", "request"]);

function isRouterLike(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("app") || lower.includes("router") || lower.includes("server") || lower === "express" || lower === "fastify" || lower === "hono" || lower === "koa";
}

function isQueueLike(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("queue") || lower.includes("worker") || lower.includes("bull") || lower.includes("cron") || lower.includes("job") || lower.includes("consumer");
}

function isEventLike(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("emitter") || lower.includes("event") || lower.includes("bus") || lower.includes("socket") || lower.includes("pubsub");
}

function isPublishReceiver(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("emitter") || lower.includes("event") || lower.includes("bus") ||
    lower.includes("socket") || lower.includes("pubsub") || lower.includes("queue") ||
    lower.includes("channel") || lower.includes("topic") || lower.includes("producer") ||
    lower.includes("broker") || lower.includes("mq") || lower.includes("kafka") ||
    lower.includes("rabbit") || lower.includes("nats") || lower.includes("redis");
}

function isDbLike(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("prisma") || lower.includes("db") || lower.includes("knex") || lower.includes("sequelize") || lower.includes("typeorm") || lower.includes("drizzle") || lower.includes("model") || lower.includes("repo") || lower.includes("repository");
}

function isCacheLike(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("redis") || lower.includes("cache") || lower.includes("memcache") || lower.includes("store");
}

function isAxiosLike(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "axios" || lower.includes("http") || lower.includes("client") || lower.includes("api");
}

function handleCallExpression(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  entities: Entity[],
  rootDir: string,
  entrypoints: RuntimeEntrypoint[],
  accesses: DataAccess[],
  checker: ts.TypeChecker | undefined,
) {
  const expr = node.expression;

  if (ts.isPropertyAccessExpression(expr)) {
    const methodName = expr.name.text;
    const chain = getPropertyAccessChain(expr.expression);
    const receiverName = chain.join(".");
    const firstPart = chain[0] ?? "";

    if (HTTP_METHODS.has(methodName) && isRouterLike(firstPart)) {
      const route = getStringArg(node, 0);
      const lastArgIdx = node.arguments.length - 1;
      const handlerIdx = lastArgIdx >= 1 ? lastArgIdx : -1;
      const handler = handlerIdx >= 0
        ? resolveHandlerEntity(node, sourceFile, entities, rootDir, checker, handlerIdx)
        : {};

      if (handler.entityId || handler.filePath) {
        entrypoints.push({
          entityId: handler.entityId,
          id: handler.id,
          filePath: handler.filePath,
          line: handler.line,
          kind: "http",
          route: route ?? "<dynamic>",
          method: methodName === "use" ? "USE" : methodName.toUpperCase(),
          confidence: route ? 0.9 : 0.6,
          evidence: `${receiverName}.${methodName}(${route ? `"${route}"` : "..."})`,
        });
      }
    }

    if (QUEUE_METHODS.has(methodName) && isQueueLike(firstPart)) {
      const jobName = getStringArg(node, 0);
      const lastArgIdx = node.arguments.length - 1;
      const handlerIdx = lastArgIdx >= 1 ? lastArgIdx : -1;
      const handler = handlerIdx >= 0
        ? resolveHandlerEntity(node, sourceFile, entities, rootDir, checker, handlerIdx)
        : {};

      if (handler.entityId || handler.filePath) {
        const kind = methodName === "schedule" ? "cron" as const : "queue" as const;
        entrypoints.push({
          entityId: handler.entityId,
          id: handler.id,
          filePath: handler.filePath,
          line: handler.line,
          kind,
          route: jobName ?? "<dynamic>",
          confidence: jobName ? 0.8 : 0.5,
          evidence: `${receiverName}.${methodName}(${jobName ? `"${jobName}"` : "..."})`,
        });
      }
    }

    if (EVENT_METHODS.has(methodName) && isEventLike(firstPart) && !isRouterLike(firstPart) && !isQueueLike(firstPart)) {
      const eventName = getStringArg(node, 0);
      const lastArgIdx = node.arguments.length - 1;
      const handlerIdx = lastArgIdx >= 1 ? lastArgIdx : -1;
      const handler = handlerIdx >= 0
        ? resolveHandlerEntity(node, sourceFile, entities, rootDir, checker, handlerIdx)
        : {};

      if (handler.entityId || handler.filePath) {
        entrypoints.push({
          entityId: handler.entityId,
          id: handler.id,
          filePath: handler.filePath,
          line: handler.line,
          kind: "event",
          route: eventName ?? "<dynamic>",
          confidence: eventName ? 0.7 : 0.4,
          evidence: `${receiverName}.${methodName}(${eventName ? `"${eventName}"` : "..."})`,
        });
      }
    }

    if (DB_READ_METHODS.has(methodName) && isDbLike(firstPart)) {
      const entity = findEnclosingEntity(node, sourceFile, entities, rootDir);
      if (entity) {
        accesses.push({
          entityId: entity.id,
          kind: "db-read",
          target: `${receiverName}.${methodName}`,
          confidence: 0.85,
          evidence: `${receiverName}.${methodName}(...)`,
        });
      }
    }

    if (DB_WRITE_METHODS.has(methodName) && isDbLike(firstPart)) {
      const entity = findEnclosingEntity(node, sourceFile, entities, rootDir);
      if (entity) {
        accesses.push({
          entityId: entity.id,
          kind: "db-write",
          target: `${receiverName}.${methodName}`,
          confidence: 0.85,
          evidence: `${receiverName}.${methodName}(...)`,
        });
      }
    }

    if (isCacheLike(firstPart)) {
      let kind: DataAccess["kind"] | undefined;
      if (CACHE_READ_METHODS.has(methodName)) kind = "cache-read";
      else if (CACHE_WRITE_METHODS.has(methodName)) kind = "cache-write";
      else if (CACHE_DEL_METHODS.has(methodName)) kind = "cache-delete";

      if (kind) {
        const entity = findEnclosingEntity(node, sourceFile, entities, rootDir);
        if (entity) {
          accesses.push({
            entityId: entity.id,
            kind,
            target: `${receiverName}.${methodName}`,
            confidence: 0.8,
            evidence: `${receiverName}.${methodName}(...)`,
          });
        }
      }
    }

    if (PUBLISH_METHODS.has(methodName) && isPublishReceiver(firstPart)) {
      const channel = getStringArg(node, 0);
      const entity = findEnclosingEntity(node, sourceFile, entities, rootDir);
      if (entity) {
        accesses.push({
          entityId: entity.id,
          kind: "publish",
          target: channel ?? `${receiverName}.${methodName}`,
          confidence: channel ? 0.8 : 0.6,
          evidence: `${receiverName}.${methodName}(${channel ? `"${channel}"` : "..."})`,
        });
      }
    }

    if (HTTP_CALL_METHODS.has(methodName) && isAxiosLike(firstPart)) {
      const url = getStringArg(node, 0);
      const entity = findEnclosingEntity(node, sourceFile, entities, rootDir);
      if (entity) {
        accesses.push({
          entityId: entity.id,
          kind: "http-call",
          target: url ?? `${receiverName}.${methodName}`,
          confidence: url ? 0.85 : 0.6,
          evidence: `${receiverName}.${methodName}(${url ? `"${url}"` : "..."})`,
        });
      }
    }
  }

  if (ts.isIdentifier(expr)) {
    const name = expr.text;

    if (HTTP_CALL_NAMES.has(name)) {
      const url = getStringArg(node, 0);
      const entity = findEnclosingEntity(node, sourceFile, entities, rootDir);
      if (entity) {
        accesses.push({
          entityId: entity.id,
          kind: "http-call",
          target: url ?? "fetch(<dynamic>)",
          confidence: url ? 0.85 : 0.6,
          evidence: `fetch(${url ? `"${url}"` : "..."})`,
        });
      }
    }

    if (name === "featureFlag" || name === "flag") {
      const flagName = getStringArg(node, 0);
      const entity = findEnclosingEntity(node, sourceFile, entities, rootDir);
      if (entity) {
        accesses.push({
          entityId: entity.id,
          kind: "feature-flag",
          target: flagName ?? "<dynamic>",
          confidence: flagName ? 0.9 : 0.5,
          evidence: `${name}(${flagName ? `"${flagName}"` : "..."})`,
        });
      }
    }
  }
}

function handlePropertyAccess(
  node: ts.PropertyAccessExpression,
  sourceFile: ts.SourceFile,
  entities: Entity[],
  rootDir: string,
  accesses: DataAccess[],
) {
  const chain = getPropertyAccessChain(node);
  if (chain.length === 3 && chain[0] === "process" && chain[1] === "env") {
    const entity = findEnclosingEntity(node, sourceFile, entities, rootDir);
    if (entity) {
      accesses.push({
        entityId: entity.id,
        kind: "env",
        target: chain[2],
        confidence: 0.95,
        evidence: `process.env.${chain[2]}`,
      });
    }
  }
}

function handleTaggedTemplate(
  node: ts.TaggedTemplateExpression,
  sourceFile: ts.SourceFile,
  entities: Entity[],
  rootDir: string,
  accesses: DataAccess[],
) {
  const tag = ts.isIdentifier(node.tag) ? node.tag.text : "";
  if (tag === "sql" || tag === "Prisma" || tag === "knex") {
    const entity = findEnclosingEntity(node, sourceFile, entities, rootDir);
    if (entity) {
      accesses.push({
        entityId: entity.id,
        kind: "sql",
        target: `${tag}\`...\``,
        confidence: 0.9,
        evidence: `${tag}\`...\``,
      });
    }
  }
}

export function extractRuntime(
  program: ts.Program,
  rootDir: string,
  entities: Entity[],
): { entrypoints: RuntimeEntrypoint[]; accesses: DataAccess[] } {
  const resolvedRoot = path.resolve(rootDir);
  const allEntrypoints: RuntimeEntrypoint[] = [];
  const allAccesses: DataAccess[] = [];
  let checker: ts.TypeChecker | undefined;
  try {
    checker = program.getTypeChecker();
  } catch {
  }

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const absPath = path.resolve(sourceFile.fileName);
    if (!absPath.startsWith(resolvedRoot)) continue;

    try {
      const { entrypoints, accesses } = extractFromFile(sourceFile, entities, resolvedRoot, checker);
      allEntrypoints.push(...entrypoints);
      allAccesses.push(...accesses);
    } catch (err) {
      const relPath = path.relative(resolvedRoot, absPath);
      process.stderr.write(`  [runtime-extract] ${relPath}: ${err}\n`);
    }
  }

  return { entrypoints: allEntrypoints, accesses: allAccesses };
}

function buildCalleeIndex(callGraph: CallEdge[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const edge of callGraph) {
    let callees = index.get(edge.caller);
    if (!callees) {
      callees = [];
      index.set(edge.caller, callees);
    }
    callees.push(edge.callee);
  }
  return index;
}

function walkReachable(startId: string, calleeIndex: Map<string, string[]>): { reachable: string[]; depth: number } {
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  let maxDepth = 0;

  while (queue.length > 0) {
    if (visited.size >= MAX_REACHABLE) break;
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    if (depth > MAX_DEPTH) continue;
    visited.add(id);
    if (depth > maxDepth) maxDepth = depth;

    const callees = calleeIndex.get(id) ?? [];
    for (const callee of callees) {
      if (!visited.has(callee)) {
        queue.push({ id: callee, depth: depth + 1 });
      }
    }
  }

  visited.delete(startId);
  return { reachable: Array.from(visited), depth: maxDepth };
}

export function composeRuntimePaths(
  entrypoints: RuntimeEntrypoint[],
  accesses: DataAccess[],
  callGraph: CallEdge[],
): RuntimePath[] {
  const calleeIndex = buildCalleeIndex(callGraph);
  const accessByEntity = new Map<string, DataAccess[]>();
  for (const a of accesses) {
    let list = accessByEntity.get(a.entityId);
    if (!list) {
      list = [];
      accessByEntity.set(a.entityId, list);
    }
    list.push(a);
  }

  const paths: RuntimePath[] = [];

  for (const ep of entrypoints) {
    const startId = ep.entityId ?? ep.id;
    if (!startId) continue;

    const { reachable, depth } = walkReachable(startId, calleeIndex);
    const allReachable = [startId, ...reachable];

    const pathAccesses: DataAccess[] = [];
    const seen = new Set<string>();
    for (const eid of allReachable) {
      const entityAccesses = accessByEntity.get(eid);
      if (!entityAccesses) continue;
      for (const a of entityAccesses) {
        const key = `${a.entityId}:${a.kind}:${a.target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pathAccesses.push(a);
      }
    }

    paths.push({
      entrypointId: startId,
      kind: ep.kind,
      route: ep.route,
      method: ep.method,
      reachableEntities: reachable,
      dataAccesses: pathAccesses,
      depth,
    });
  }

  return paths;
}
