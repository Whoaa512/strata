import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { analyze } from "../../src/pipeline";
import { StrataDocumentSchema } from "../../src/schema";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

async function run(cmd: string, cwd: string) {
  const proc = Bun.spawn(["bash", "-c", cmd], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@test.com", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@test.com" },
  });
  await proc.exited;
  return await new Response(proc.stdout).text();
}

let repoPath: string;

beforeAll(async () => {
  repoPath = await mkdtemp(path.join(tmpdir(), "strata-test-"));

  await run("git init", repoPath);
  await run('git config user.email "test@test.com" && git config user.name "test"', repoPath);

  // Commit 1: initial files
  await Bun.write(
    path.join(repoPath, "src/auth.ts"),
    `export function validateToken(token: string): boolean {
  if (!token) {
    return false;
  }
  if (token.length < 10) {
    return false;
  }
  for (const char of token) {
    if (char === ' ') {
      return false;
    }
  }
  return true;
}

export function refreshToken(token: string): string {
  return token + "-refreshed";
}
`
  );

  await Bun.write(
    path.join(repoPath, "src/billing.ts"),
    `import { validateToken } from "./auth";

export function processPayment(token: string, amount: number): boolean {
  if (!validateToken(token)) {
    return false;
  }
  if (amount <= 0) {
    return false;
  }
  return true;
}

export function calculateTax(amount: number, rate: number): number {
  return amount * rate;
}
`
  );

  await Bun.write(
    path.join(repoPath, "src/utils.ts"),
    `export function formatCurrency(amount: number): string {
  return "$" + amount.toFixed(2);
}
`
  );

  await run("git add -A && git commit -m 'initial'", repoPath);

  // Commit 2: modify auth and billing together
  await Bun.write(
    path.join(repoPath, "src/auth.ts"),
    `export function validateToken(token: string): boolean {
  if (!token || token.length === 0) {
    return false;
  }
  if (token.length < 10) {
    if (token.startsWith("dev_")) {
      return true;
    }
    return false;
  }
  for (const char of token) {
    if (char === ' ') {
      return false;
    }
  }
  return true;
}

export function refreshToken(token: string): string {
  if (!token) {
    throw new Error("no token");
  }
  return token + "-refreshed";
}
`
  );

  await Bun.write(
    path.join(repoPath, "src/billing.ts"),
    `import { validateToken } from "./auth";

export function processPayment(token: string, amount: number): boolean {
  if (!validateToken(token)) {
    return false;
  }
  if (amount <= 0) {
    return false;
  }
  if (amount > 10000) {
    if (!validateToken(token + "_large")) {
      return false;
    }
  }
  return true;
}

export function calculateTax(amount: number, rate: number): number {
  if (rate < 0 || rate > 1) {
    throw new Error("invalid rate");
  }
  return amount * rate;
}
`
  );

  await run("git add -A && git commit -m 'add validation'", repoPath);

  // Commit 3: more changes to auth and billing
  const authContent = await Bun.file(path.join(repoPath, "src/auth.ts")).text();
  await Bun.write(
    path.join(repoPath, "src/auth.ts"),
    authContent + "\n// updated\n"
  );
  const billingContent = await Bun.file(path.join(repoPath, "src/billing.ts")).text();
  await Bun.write(
    path.join(repoPath, "src/billing.ts"),
    billingContent + "\n// updated\n"
  );
  await run("git add -A && git commit -m 'minor updates'", repoPath);
});

afterAll(async () => {
  if (repoPath) {
    await rm(repoPath, { recursive: true, force: true });
  }
});

describe("integration: full pipeline", () => {
  it("produces a valid .sv document", async () => {
    const doc = await analyze({ repoPath, months: 12, topN: 10, minCoChanges: 2 });
    const result = StrataDocumentSchema.safeParse(doc);
    if (!result.success) {
      console.error("Validation errors:", result.error);
    }
    expect(result.success).toBe(true);
  });

  it("finds functions across all files", async () => {
    const doc = await analyze({ repoPath });
    const names = doc.entities.map((e) => e.name).sort();
    expect(names).toContain("validateToken");
    expect(names).toContain("processPayment");
    expect(names).toContain("calculateTax");
    expect(names).toContain("formatCurrency");
    expect(names).toContain("refreshToken");
  });

  it("computes nonzero complexity for complex functions", async () => {
    const doc = await analyze({ repoPath });
    const validate = doc.entities.find((e) => e.name === "validateToken");
    expect(validate).toBeDefined();
    expect(validate!.metrics.cognitiveComplexity).toBeGreaterThan(0);
  });

  it("attaches churn data to entities", async () => {
    const doc = await analyze({ repoPath });
    const authFns = doc.entities.filter(
      (e) => e.location.file === "src/auth.ts"
    );
    expect(authFns.length).toBeGreaterThan(0);
    expect(authFns[0].churn).toBeDefined();
    expect(authFns[0].churn!.commits).toBeGreaterThanOrEqual(2);
  });

  it("produces hotspots sorted by score", async () => {
    const doc = await analyze({ repoPath });
    for (let i = 1; i < doc.hotspots.length; i++) {
      expect(doc.hotspots[i - 1].score).toBeGreaterThanOrEqual(
        doc.hotspots[i].score
      );
    }
  });

  it("detects temporal coupling between auth and billing", async () => {
    const doc = await analyze({ repoPath, minCoChanges: 2 });
    const coupling = doc.temporalCouplings.find(
      (tc) =>
        (tc.fileA.includes("auth") && tc.fileB.includes("billing")) ||
        (tc.fileA.includes("billing") && tc.fileB.includes("auth"))
    );
    expect(coupling).toBeDefined();
    expect(coupling!.coChangeCount).toBeGreaterThanOrEqual(2);
  });

  it("produces blast radii for hotspots", async () => {
    const doc = await analyze({ repoPath });
    const hotspotsWithComplexity = doc.hotspots.filter((h) => h.score > 0);
    if (hotspotsWithComplexity.length > 0) {
      expect(doc.blastRadii.length).toBeGreaterThan(0);
      for (const br of doc.blastRadii) {
        expect(br.testCoverage).toBeGreaterThanOrEqual(0);
        expect(br.testCoverage).toBeLessThanOrEqual(1);
      }
    }
  });

  it("JSON round-trips through schema validation", async () => {
    const doc = await analyze({ repoPath });
    const json = JSON.stringify(doc);
    const parsed = JSON.parse(json);
    const result = StrataDocumentSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });
});
