import { describe, expect, test, beforeAll } from "bun:test";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";

const FIXTURE_DIR = "/tmp/strata-integration-test";

beforeAll(() => {
  if (existsSync(FIXTURE_DIR)) rmSync(FIXTURE_DIR, { recursive: true });
  mkdirSync(join(FIXTURE_DIR, "src"), { recursive: true });
  mkdirSync(join(FIXTURE_DIR, "test"), { recursive: true });

  writeFileSync(
    join(FIXTURE_DIR, "src/math.ts"),
    `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  let result = 0;
  for (let i = 0; i < b; i++) {
    result = add(result, a);
  }
  return result;
}

export function complexCalc(x: number): number {
  if (x < 0) {
    throw new Error("negative");
  }
  if (x === 0) return 0;
  
  let sum = 0;
  for (let i = 0; i < x; i++) {
    if (i % 2 === 0) {
      sum = add(sum, multiply(i, 2));
    } else {
      for (let j = 0; j < i; j++) {
        sum = add(sum, j);
      }
    }
  }
  return sum;
}
`,
  );

  writeFileSync(
    join(FIXTURE_DIR, "test/math.test.ts"),
    `
import { add } from "../src/math";
function testAdd() { add(1, 2); }
`,
  );

  execSync("git init", { cwd: FIXTURE_DIR });
  execSync("git add -A && git commit -m 'init'", { cwd: FIXTURE_DIR });
  for (let i = 0; i < 5; i++) {
    writeFileSync(
      join(FIXTURE_DIR, `src/math.ts`),
      readFileSync(join(FIXTURE_DIR, "src/math.ts"), "utf-8") + `\n// v${i + 2}`,
    );
    execSync(`git add -A && git commit -m 'churn ${i}'`, { cwd: FIXTURE_DIR });
  }
});

describe("integration", () => {
  test("CLI produces valid report", () => {
    const result = execSync(
      `bun run ${join(process.cwd(), "src/cli.ts")} ${FIXTURE_DIR}`,
      { encoding: "utf-8", cwd: process.cwd() },
    );

    expect(result).toContain("STRATA ANALYSIS REPORT");
    expect(result).toContain("complexCalc");
    expect(result).toContain("multiply");
  });

  test("CLI produces valid .sv JSON", () => {
    const outPath = join(FIXTURE_DIR, "output.sv.json");
    execSync(
      `bun run ${join(process.cwd(), "src/cli.ts")} ${FIXTURE_DIR} --output ${outPath}`,
      { encoding: "utf-8", cwd: process.cwd() },
    );

    const raw = readFileSync(outPath, "utf-8");
    const sv = JSON.parse(raw);

    expect(sv.version).toBe("0.1.0");
    expect(sv.entities.length).toBeGreaterThan(0);
    expect(sv.hotspots.length).toBeGreaterThan(0);

    const complexCalcHotspot = sv.hotspots.find(
      (h: any) => h.name === "complexCalc",
    );
    expect(complexCalcHotspot).toBeDefined();
    expect(complexCalcHotspot.complexity).toBeGreaterThan(0);
    expect(complexCalcHotspot.churn).toBeGreaterThan(0);
  });

  test("hotspots are sorted by score descending", () => {
    const result = execSync(
      `bun run ${join(process.cwd(), "src/cli.ts")} ${FIXTURE_DIR} --json`,
      { encoding: "utf-8", cwd: process.cwd() },
    );

    const sv = JSON.parse(result.split("\n").filter(l => !l.startsWith("Parsing") && !l.startsWith("Analyzing")).join("\n"));
    for (let i = 1; i < sv.hotspots.length; i++) {
      expect(sv.hotspots[i - 1].score).toBeGreaterThanOrEqual(sv.hotspots[i].score);
    }
  });

  test("complexCalc has highest complexity", () => {
    const outPath = join(FIXTURE_DIR, "output2.sv.json");
    execSync(
      `bun run ${join(process.cwd(), "src/cli.ts")} ${FIXTURE_DIR} --output ${outPath}`,
      { encoding: "utf-8", cwd: process.cwd() },
    );

    const sv = JSON.parse(readFileSync(outPath, "utf-8"));
    const byComplexity = sv.hotspots.sort(
      (a: any, b: any) => b.complexity - a.complexity,
    );
    expect(byComplexity[0].name).toBe("complexCalc");
  });

  test("entities include graph metrics", () => {
    const outPath = join(FIXTURE_DIR, "output3.sv.json");
    execSync(
      `bun run ${join(process.cwd(), "src/cli.ts")} ${FIXTURE_DIR} --output ${outPath}`,
      { encoding: "utf-8", cwd: process.cwd() },
    );

    const sv = JSON.parse(readFileSync(outPath, "utf-8"));
    const complexCalc = sv.entities.find(
      (e: any) => e.name === "complexCalc" && e.kind === "function",
    );
    expect(complexCalc).toBeDefined();
    expect(complexCalc.metrics.cognitiveComplexity).toBeGreaterThan(0);
    expect(complexCalc.metrics.nestingDepth).toBeGreaterThan(0);
    expect(complexCalc.metrics.churn).toBeGreaterThan(0);
  });
});
