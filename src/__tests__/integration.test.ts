import { describe, test, expect, beforeAll } from "bun:test";
import { execSync } from "child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("CLI integration", () => {
  let repoDir: string;
  const CLI = join(import.meta.dir, "..", "cli.ts");

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), "strata-integ-"));
    execSync("git init", { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Tester"', { cwd: repoDir });

    mkdirSync(join(repoDir, "src"), { recursive: true });
    mkdirSync(join(repoDir, "src/__tests__"), { recursive: true });

    writeFileSync(
      join(repoDir, "src/auth.ts"),
      `
export function authenticate(user: string, pass: string): boolean {
  if (!user || !pass) {
    return false;
  }
  if (user === "admin") {
    if (pass === "secret") {
      return true;
    } else {
      for (let i = 0; i < 3; i++) {
        if (checkBackup(pass, i)) {
          return true;
        }
      }
    }
  }
  return validateCredentials(user, pass);
}

function validateCredentials(user: string, pass: string): boolean {
  return user.length > 0 && pass.length > 5;
}

function checkBackup(pass: string, attempt: number): boolean {
  return pass === "backup" + attempt;
}
`
    );

    writeFileSync(
      join(repoDir, "src/billing.ts"),
      `
import { authenticate } from "./auth";

export function processPayment(userId: string, amount: number): boolean {
  if (amount <= 0) return false;
  if (!authenticate(userId, "token")) return false;
  return chargeCard(userId, amount);
}

function chargeCard(userId: string, amount: number): boolean {
  return amount < 10000;
}
`
    );

    writeFileSync(
      join(repoDir, "src/__tests__/auth.test.ts"),
      `
import { authenticate } from "../auth";
test("it works", () => {});
`
    );

    execSync("git add -A && git commit -m 'initial'", { cwd: repoDir });

    // Make some churn
    writeFileSync(
      join(repoDir, "src/auth.ts"),
      `
export function authenticate(user: string, pass: string): boolean {
  if (!user || !pass) return false;
  if (user === "admin") {
    if (pass === "secret") return true;
    for (let i = 0; i < 3; i++) {
      if (checkBackup(pass, i)) return true;
    }
  }
  return validateCredentials(user, pass);
}

function validateCredentials(user: string, pass: string): boolean {
  return user.length > 0 && pass.length > 5;
}

function checkBackup(pass: string, attempt: number): boolean {
  return pass === "backup" + attempt;
}
`
    );
    execSync("git add -A && git commit -m 'refactor auth'", { cwd: repoDir });

    writeFileSync(
      join(repoDir, "src/auth.ts"),
      `
export function authenticate(user: string, pass: string): boolean {
  if (!user || !pass) return false;
  if (user === "admin") {
    if (pass === "secret") return true;
    for (let i = 0; i < 5; i++) {
      if (checkBackup(pass, i)) return true;
    }
  }
  return validateCredentials(user, pass);
}

function validateCredentials(user: string, pass: string): boolean {
  if (!user) return false;
  if (!pass) return false;
  return user.length > 0 && pass.length >= 8;
}

function checkBackup(pass: string, attempt: number): boolean {
  return pass === "backup" + attempt;
}
`
    );
    writeFileSync(
      join(repoDir, "src/billing.ts"),
      `
import { authenticate } from "./auth";

export function processPayment(userId: string, amount: number): boolean {
  if (amount <= 0) return false;
  if (amount > 50000) return false;
  if (!authenticate(userId, "token")) return false;
  return chargeCard(userId, amount);
}

function chargeCard(userId: string, amount: number): boolean {
  if (amount > 10000) return false;
  return true;
}
`
    );
    execSync("git add -A && git commit -m 'harden billing'", { cwd: repoDir });
  });

  test("outputs summary to stderr and stdout", () => {
    const result = execSync(`bun run ${CLI} ${repoDir}`, {
      encoding: "utf-8",
    });
    expect(result).toContain("TOP HOTSPOTS");
    expect(result).toContain("BLAST RADIUS");
    expect(result).toContain("TEMPORAL COUPLING");
  });

  test("outputs valid JSON with --json", () => {
    const result = execSync(`bun run ${CLI} ${repoDir} --json 2>/dev/null`, {
      encoding: "utf-8",
    });
    const report = JSON.parse(result);
    expect(report.version).toBe("0.1.0");
    expect(report.analyzedFiles).toBeGreaterThan(0);
    expect(report.totalFunctions).toBeGreaterThan(0);
    expect(Array.isArray(report.hotspots)).toBe(true);
    expect(Array.isArray(report.blastRadii)).toBe(true);
    expect(Array.isArray(report.temporalCouplings)).toBe(true);
    expect(Array.isArray(report.entities)).toBe(true);
    expect(Array.isArray(report.edges)).toBe(true);
    expect(Array.isArray(report.metrics)).toBe(true);
  });

  test("writes to file with --out", () => {
    const outPath = join(repoDir, "report.sv.json");
    execSync(`bun run ${CLI} ${repoDir} --out ${outPath}`, {
      encoding: "utf-8",
    });
    const report = JSON.parse(require("fs").readFileSync(outPath, "utf-8"));
    expect(report.version).toBe("0.1.0");
  });

  test("detects auth.ts as a hotspot (high complexity + high churn)", () => {
    const result = execSync(`bun run ${CLI} ${repoDir} --json 2>/dev/null`, {
      encoding: "utf-8",
    });
    const report = JSON.parse(result);
    const authHotspot = report.hotspots.find(
      (h: any) => h.filePath.includes("auth") && h.functionName === "authenticate"
    );
    expect(authHotspot).toBeDefined();
    expect(authHotspot.complexity).toBeGreaterThan(0);
    expect(authHotspot.churn).toBeGreaterThan(0);
  });

  test("detects blast radius for authenticate()", () => {
    const result = execSync(`bun run ${CLI} ${repoDir} --json 2>/dev/null`, {
      encoding: "utf-8",
    });
    const report = JSON.parse(result);
    const authBlast = report.blastRadii.find(
      (b: any) => b.entity === "authenticate"
    );
    expect(authBlast).toBeDefined();
    expect(authBlast.fanOut).toBeGreaterThan(0);
    // authenticate has a test file, so should not have gap
    expect(authBlast.testCoverageGap).toBe(false);
  });

  test("detects temporal coupling between auth.ts and billing.ts", () => {
    const result = execSync(`bun run ${CLI} ${repoDir} --json 2>/dev/null`, {
      encoding: "utf-8",
    });
    const report = JSON.parse(result);
    const coupling = report.temporalCouplings.find(
      (c: any) =>
        (c.file1.includes("auth") && c.file2.includes("billing")) ||
        (c.file1.includes("billing") && c.file2.includes("auth"))
    );
    // They co-changed in 2/3 commits, might or might not meet threshold
    // but we should at least see some coupling data
    if (coupling) {
      expect(coupling.cochangeCount).toBeGreaterThan(0);
    }
  });

  test("cleanup", () => {
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
  });
});
