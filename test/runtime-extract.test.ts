import { describe, expect, test } from "bun:test";
import { extractRuntime, composeRuntimePaths } from "../src/runtime-extract";
import { createLightProgram, extract } from "../src/extract";
import { RuntimeEntrypointSchema, DataAccessSchema, RuntimePathSchema } from "../src/schema";
import type { RuntimeEntrypoint, DataAccess, CallEdge } from "../src/schema";
import path from "path";
import fs from "fs";
import os from "os";

function withTempFile(code: string, fn: (dir: string, file: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "strata-runtime-"));
  const file = path.join(dir, "test.ts");
  fs.writeFileSync(file, code);
  try {
    fn(dir, file);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
}

function extractFromCode(code: string): { entrypoints: RuntimeEntrypoint[]; accesses: DataAccess[] } {
  let result!: { entrypoints: RuntimeEntrypoint[]; accesses: DataAccess[] };
  withTempFile(code, (dir, file) => {
    const program = createLightProgram([file]);
    const { entities } = extract(program, dir);
    result = extractRuntime(program, dir, entities);
  });
  return result;
}

describe("extractRuntime - HTTP entrypoints", () => {
  test("detects app.get with literal path", () => {
    const { entrypoints } = extractFromCode(`
      function handler(req: any, res: any) {
        const app = { get: (p: string, h: any) => {} };
        app.get("/users", handler);
      }
    `);
    expect(entrypoints.length).toBeGreaterThanOrEqual(1);
    const ep = entrypoints.find(e => e.kind === "http");
    expect(ep).toBeDefined();
    expect(ep!.method).toBe("GET");
    expect(ep!.route).toBe("/users");
    expect(ep!.confidence).toBeGreaterThan(0);
    expect(RuntimeEntrypointSchema.safeParse(ep).success).toBe(true);
  });

  test("detects router.post", () => {
    const { entrypoints } = extractFromCode(`
      function createUser() {
        const router = { post: (p: string, h: any) => {} };
        router.post("/users", () => {});
      }
    `);
    const ep = entrypoints.find(e => e.kind === "http" && e.method === "POST");
    expect(ep).toBeDefined();
    expect(ep!.route).toBe("/users");
  });

  test("detects app.use middleware", () => {
    const { entrypoints } = extractFromCode(`
      function setup() {
        const app = { use: (p: string, h: any) => {} };
        app.use("/api", () => {});
      }
    `);
    const ep = entrypoints.find(e => e.kind === "http" && e.method === "USE");
    expect(ep).toBeDefined();
  });
});

describe("extractRuntime - Queue/Cron/Event entrypoints", () => {
  test("detects queue.process", () => {
    const { entrypoints } = extractFromCode(`
      function setupWorker() {
        const queue = { process: (name: string, fn: any) => {} };
        queue.process("sendEmail", () => {});
      }
    `);
    const ep = entrypoints.find(e => e.kind === "queue");
    expect(ep).toBeDefined();
    expect(ep!.route).toBe("sendEmail");
  });

  test("detects worker.on", () => {
    const { entrypoints } = extractFromCode(`
      function setupWorker() {
        const worker = { on: (name: string, fn: any) => {} };
        worker.on("completed", () => {});
      }
    `);
    const ep = entrypoints.find(e => e.kind === "queue");
    expect(ep).toBeDefined();
  });

  test("detects cron.schedule", () => {
    const { entrypoints } = extractFromCode(`
      function setupCron() {
        const cron = { schedule: (expr: string, fn: any) => {} };
        cron.schedule("0 * * * *", () => {});
      }
    `);
    const ep = entrypoints.find(e => e.kind === "cron");
    expect(ep).toBeDefined();
  });

  test("detects eventEmitter.on", () => {
    const { entrypoints } = extractFromCode(`
      function listen() {
        const eventBus = { on: (name: string, fn: any) => {} };
        eventBus.on("userCreated", () => {});
      }
    `);
    const ep = entrypoints.find(e => e.kind === "event");
    expect(ep).toBeDefined();
    expect(ep!.route).toBe("userCreated");
  });

  test("detects emitter.subscribe", () => {
    const { entrypoints } = extractFromCode(`
      function listen() {
        const eventEmitter = { subscribe: (name: string, fn: any) => {} };
        eventEmitter.subscribe("orderPlaced", () => {});
      }
    `);
    const ep = entrypoints.find(e => e.kind === "event");
    expect(ep).toBeDefined();
    expect(ep!.route).toBe("orderPlaced");
  });
});

describe("extractRuntime - Data accesses", () => {
  test("detects prisma read", () => {
    const { accesses } = extractFromCode(`
      function getUsers() {
        const prisma = { user: { findMany: () => {} } };
        prisma.user.findMany();
      }
    `);
    const a = accesses.find(a => a.kind === "db-read");
    expect(a).toBeDefined();
    expect(DataAccessSchema.safeParse(a).success).toBe(true);
  });

  test("detects db write", () => {
    const { accesses } = extractFromCode(`
      function createUser() {
        const db = { users: { insert: (data: any) => {} } };
        db.users.insert({ name: "test" });
      }
    `);
    const a = accesses.find(a => a.kind === "db-write");
    expect(a).toBeDefined();
  });

  test("detects prisma create", () => {
    const { accesses } = extractFromCode(`
      function createUser() {
        const prisma = { user: { create: (data: any) => {} } };
        prisma.user.create({ data: { name: "test" } });
      }
    `);
    const a = accesses.find(a => a.kind === "db-write");
    expect(a).toBeDefined();
  });

  test("detects redis get", () => {
    const { accesses } = extractFromCode(`
      function getCached() {
        const redis = { get: (key: string) => {} };
        redis.get("session:123");
      }
    `);
    const a = accesses.find(a => a.kind === "cache-read");
    expect(a).toBeDefined();
  });

  test("detects cache set", () => {
    const { accesses } = extractFromCode(`
      function setCache() {
        const cache = { set: (key: string, val: any) => {} };
        cache.set("user:1", { name: "test" });
      }
    `);
    const a = accesses.find(a => a.kind === "cache-write");
    expect(a).toBeDefined();
  });

  test("detects cache del", () => {
    const { accesses } = extractFromCode(`
      function invalidate() {
        const redis = { del: (key: string) => {} };
        redis.del("user:1");
      }
    `);
    const a = accesses.find(a => a.kind === "cache-delete");
    expect(a).toBeDefined();
  });

  test("detects publish/emit", () => {
    const { accesses } = extractFromCode(`
      function notify() {
        const bus = { emit: (event: string, data: any) => {} };
        bus.emit("userCreated", { id: 1 });
      }
    `);
    const a = accesses.find(a => a.kind === "publish");
    expect(a).toBeDefined();
    expect(a!.target).toBe("userCreated");
  });

  test("detects process.env access", () => {
    const { accesses } = extractFromCode(`
      function getConfig() {
        const x = process.env.DATABASE_URL;
      }
    `);
    const a = accesses.find(a => a.kind === "env");
    expect(a).toBeDefined();
    expect(a!.target).toBe("DATABASE_URL");
  });

  test("detects featureFlag call", () => {
    const { accesses } = extractFromCode(`
      function checkFlag() {
        const featureFlag = (name: string) => false;
        featureFlag("new-checkout");
      }
    `);
    const a = accesses.find(a => a.kind === "feature-flag");
    expect(a).toBeDefined();
    expect(a!.target).toBe("new-checkout");
  });

  test("detects fetch call", () => {
    const { accesses } = extractFromCode(`
      function callApi() {
        fetch("https://api.example.com/users");
      }
    `);
    const a = accesses.find(a => a.kind === "http-call");
    expect(a).toBeDefined();
    expect(a!.target).toBe("https://api.example.com/users");
  });

  test("detects axios call", () => {
    const { accesses } = extractFromCode(`
      function callApi() {
        const axios = { get: (url: string) => {} };
        axios.get("https://api.example.com/data");
      }
    `);
    const a = accesses.find(a => a.kind === "http-call");
    expect(a).toBeDefined();
  });

  test("detects sql tagged template", () => {
    const { accesses } = extractFromCode(`
      function query() {
        const sql = (strings: TemplateStringsArray, ...values: any[]) => {};
        sql\`SELECT * FROM users WHERE id = 1\`;
      }
    `);
    const a = accesses.find(a => a.kind === "sql");
    expect(a).toBeDefined();
  });
});

describe("composeRuntimePaths", () => {
  test("walks call graph to compose path", () => {
    const entrypoints: RuntimeEntrypoint[] = [{
      entityId: "a.ts:handler:1",
      kind: "http",
      route: "/users",
      method: "GET",
      confidence: 0.9,
      evidence: 'app.get("/users")',
    }];

    const accesses: DataAccess[] = [
      { entityId: "b.ts:getUsers:1", kind: "db-read", target: "prisma.user.findMany", confidence: 0.85, evidence: "prisma.user.findMany(...)" },
      { entityId: "c.ts:unrelated:1", kind: "db-write", target: "prisma.log.create", confidence: 0.85, evidence: "prisma.log.create(...)" },
    ];

    const callGraph: CallEdge[] = [
      { caller: "a.ts:handler:1", callee: "b.ts:getUsers:1" },
    ];

    const paths = composeRuntimePaths(entrypoints, accesses, callGraph);
    expect(paths).toHaveLength(1);
    expect(paths[0].entrypointId).toBe("a.ts:handler:1");
    expect(paths[0].route).toBe("/users");
    expect(paths[0].reachableEntities).toContain("b.ts:getUsers:1");
    expect(paths[0].dataAccesses).toHaveLength(1);
    expect(paths[0].dataAccesses[0].target).toBe("prisma.user.findMany");
    expect(RuntimePathSchema.safeParse(paths[0]).success).toBe(true);
  });

  test("walks transitive callees", () => {
    const entrypoints: RuntimeEntrypoint[] = [{
      entityId: "a:h:1",
      kind: "http",
      route: "/test",
      method: "POST",
      confidence: 0.9,
      evidence: 'app.post("/test")',
    }];

    const accesses: DataAccess[] = [
      { entityId: "c:deep:1", kind: "cache-read", target: "redis.get", confidence: 0.8, evidence: "redis.get(...)" },
    ];

    const callGraph: CallEdge[] = [
      { caller: "a:h:1", callee: "b:mid:1" },
      { caller: "b:mid:1", callee: "c:deep:1" },
    ];

    const paths = composeRuntimePaths(entrypoints, accesses, callGraph);
    expect(paths[0].reachableEntities).toContain("c:deep:1");
    expect(paths[0].dataAccesses).toHaveLength(1);
    expect(paths[0].depth).toBeGreaterThanOrEqual(2);
  });

  test("handles cycles without infinite loop", () => {
    const entrypoints: RuntimeEntrypoint[] = [{
      entityId: "a:h:1",
      kind: "http",
      route: "/loop",
      method: "GET",
      confidence: 0.9,
      evidence: 'app.get("/loop")',
    }];

    const callGraph: CallEdge[] = [
      { caller: "a:h:1", callee: "b:x:1" },
      { caller: "b:x:1", callee: "a:h:1" },
    ];

    const paths = composeRuntimePaths(entrypoints, [], callGraph);
    expect(paths).toHaveLength(1);
    expect(paths[0].reachableEntities).toContain("b:x:1");
  });

  test("deduplicates data accesses", () => {
    const entrypoints: RuntimeEntrypoint[] = [{
      entityId: "a:h:1",
      kind: "http",
      route: "/dup",
      method: "GET",
      confidence: 0.9,
      evidence: 'test',
    }];

    const accesses: DataAccess[] = [
      { entityId: "a:h:1", kind: "db-read", target: "prisma.user.findMany", confidence: 0.85, evidence: "test" },
      { entityId: "b:x:1", kind: "db-read", target: "prisma.user.findMany", confidence: 0.85, evidence: "test" },
    ];

    const callGraph: CallEdge[] = [
      { caller: "a:h:1", callee: "b:x:1" },
    ];

    const paths = composeRuntimePaths(entrypoints, accesses, callGraph);
    const dbReads = paths[0].dataAccesses.filter(a => a.target === "prisma.user.findMany");
    expect(dbReads).toHaveLength(2);
  });

  test("empty entrypoints yields empty paths", () => {
    const paths = composeRuntimePaths([], [], []);
    expect(paths).toHaveLength(0);
  });
});

describe("handler resolution", () => {
  test("top-level route registration resolves handler entity", () => {
    let result!: { entrypoints: RuntimeEntrypoint[]; accesses: DataAccess[] };
    withTempFile(`
const app = { get: (p: string, h: any) => {} };

function handleUsers(req: any, res: any) {
  return res.json([]);
}

app.get("/users", handleUsers);
    `, (dir, file) => {
      const program = createLightProgram([file]);
      const { entities } = extract(program, dir);
      result = extractRuntime(program, dir, entities);
    });
    const ep = result.entrypoints.find(e => e.kind === "http" && e.route === "/users");
    expect(ep).toBeDefined();
    expect(ep!.entityId).toContain("handleUsers");
    expect(ep!.id).toContain("handleUsers");
    expect(ep!.filePath).toBe("test.ts");
    expect(ep!.line).toBeDefined();
  });

  test("setup() registering separate handler points to handler not setup", () => {
    let result!: { entrypoints: RuntimeEntrypoint[]; accesses: DataAccess[] };
    let entities!: any[];
    withTempFile(`
function getUsers(req: any, res: any) {
  const db = { users: { findMany: () => {} } };
  return db.users.findMany();
}

function setup() {
  const app = { get: (p: string, h: any) => {} };
  app.get("/users", getUsers);
}
    `, (dir, file) => {
      const program = createLightProgram([file]);
      const extracted = extract(program, dir);
      entities = extracted.entities;
      result = extractRuntime(program, dir, entities);
    });
    const ep = result.entrypoints.find(e => e.kind === "http" && e.route === "/users");
    expect(ep).toBeDefined();
    expect(ep!.entityId).toContain("getUsers");
    expect(ep!.entityId).not.toContain("setup");
  });

  test("path from handler finds downstream db access", () => {
    const handlerId = "a.ts:getUsers:2";
    const dbEntityId = "b.ts:fetchFromDb:1";

    const entrypoints: RuntimeEntrypoint[] = [{
      entityId: handlerId,
      id: handlerId,
      filePath: "a.ts",
      line: 2,
      kind: "http",
      route: "/users",
      method: "GET",
      confidence: 0.9,
      evidence: 'app.get("/users")',
    }];

    const accesses: DataAccess[] = [
      { entityId: dbEntityId, kind: "db-read", target: "prisma.user.findMany", confidence: 0.85, evidence: "prisma.user.findMany(...)" },
    ];

    const callGraph: CallEdge[] = [
      { caller: handlerId, callee: dbEntityId },
    ];

    const paths = composeRuntimePaths(entrypoints, accesses, callGraph);
    expect(paths).toHaveLength(1);
    expect(paths[0].entrypointId).toBe(handlerId);
    expect(paths[0].reachableEntities).toContain(dbEntityId);
    expect(paths[0].dataAccesses).toHaveLength(1);
    expect(paths[0].dataAccesses[0].kind).toBe("db-read");
  });

  test("composeRuntimePaths skips entries without entityId", () => {
    const entrypoints: RuntimeEntrypoint[] = [{
      filePath: "a.ts",
      line: 5,
      kind: "http",
      route: "/anon",
      method: "GET",
      confidence: 0.9,
      evidence: 'app.get("/anon")',
    }];

    const paths = composeRuntimePaths(entrypoints, [], []);
    expect(paths).toHaveLength(0);
  });
});

describe("publish gating", () => {
  test("res.send is not detected as publish", () => {
    const { accesses } = extractFromCode(`
      function handler(req: any, res: any) {
        res.send("hello");
        res.emit("finish");
      }
    `);
    const publishAccesses = accesses.filter(a => a.kind === "publish");
    expect(publishAccesses).toHaveLength(0);
  });

  test("eventBus.emit is detected as publish", () => {
    const { accesses } = extractFromCode(`
      function notify() {
        const eventBus = { emit: (e: string, d: any) => {} };
        eventBus.emit("userCreated", { id: 1 });
      }
    `);
    const a = accesses.find(a => a.kind === "publish");
    expect(a).toBeDefined();
    expect(a!.target).toBe("userCreated");
  });

  test("queue.send is detected as publish", () => {
    const { accesses } = extractFromCode(`
      function enqueue() {
        const queue = { send: (msg: any) => {} };
        queue.send({ type: "process" });
      }
    `);
    const a = accesses.find(a => a.kind === "publish");
    expect(a).toBeDefined();
  });
});

describe("schema validation", () => {
  test("RuntimeEntrypointSchema validates", () => {
    const result = RuntimeEntrypointSchema.safeParse({
      entityId: "a:b:1",
      kind: "http",
      route: "/test",
      method: "GET",
      confidence: 0.9,
      evidence: "app.get(\"/test\")",
    });
    expect(result.success).toBe(true);
  });

  test("DataAccessSchema validates", () => {
    const result = DataAccessSchema.safeParse({
      entityId: "a:b:1",
      kind: "db-read",
      target: "prisma.user.findMany",
      confidence: 0.85,
      evidence: "prisma.user.findMany(...)",
    });
    expect(result.success).toBe(true);
  });

  test("RuntimePathSchema validates", () => {
    const result = RuntimePathSchema.safeParse({
      entrypointId: "a:b:1",
      kind: "http",
      route: "/test",
      method: "GET",
      reachableEntities: ["c:d:1"],
      dataAccesses: [{
        entityId: "c:d:1",
        kind: "db-read",
        target: "prisma.user.findMany",
        confidence: 0.85,
        evidence: "test",
      }],
      depth: 1,
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid entrypoint kind", () => {
    const result = RuntimeEntrypointSchema.safeParse({
      entityId: "a:b:1",
      kind: "websocket",
      confidence: 0.5,
      evidence: "test",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid access kind", () => {
    const result = DataAccessSchema.safeParse({
      entityId: "a:b:1",
      kind: "graphql",
      target: "test",
      confidence: 0.5,
      evidence: "test",
    });
    expect(result.success).toBe(false);
  });
});
