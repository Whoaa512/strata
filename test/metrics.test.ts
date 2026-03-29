import { describe, expect, test } from "bun:test";
import { cyclomaticPlugin } from "../src/metrics/cyclomatic";
import { cognitivePlugin } from "../src/metrics/cognitive";
import { locPlugin } from "../src/metrics/loc";
import { nestingPlugin } from "../src/metrics/nesting";
import { paramsPlugin } from "../src/metrics/params";
import { runPlugins } from "../src/plugin";
import { defaultPlugins } from "../src/metrics";
import { parseFunction } from "./helpers";

describe("locPlugin", () => {
  test("counts lines of function body", () => {
    const { node, sourceFile } = parseFunction(`function foo() {
  const a = 1;
  return a;
}`);
    expect(locPlugin.analyze(node, sourceFile).loc).toBe(4);
  });
});

describe("paramsPlugin", () => {
  test("counts parameters", () => {
    const { node, sourceFile } = parseFunction(`function foo(a: number, b: string, c: boolean) {}`);
    expect(paramsPlugin.analyze(node, sourceFile).parameterCount).toBe(3);
  });

  test("zero params", () => {
    const { node, sourceFile } = parseFunction(`function foo() {}`);
    expect(paramsPlugin.analyze(node, sourceFile).parameterCount).toBe(0);
  });
});

describe("nestingPlugin", () => {
  test("flat function", () => {
    const { node, sourceFile } = parseFunction(`function foo() { return 1; }`);
    expect(nestingPlugin.analyze(node, sourceFile).maxNestingDepth).toBe(0);
  });

  test("nested if/for", () => {
    const { node, sourceFile } = parseFunction(`function foo(x: number) {
  if (x > 0) {
    for (let i = 0; i < x; i++) {
      if (i % 2 === 0) {
        console.log(i);
      }
    }
  }
}`);
    expect(nestingPlugin.analyze(node, sourceFile).maxNestingDepth).toBe(3);
  });
});

describe("cyclomaticPlugin", () => {
  test("empty function = 1", () => {
    const { node, sourceFile } = parseFunction(`function foo() {}`);
    expect(cyclomaticPlugin.analyze(node, sourceFile).cyclomatic).toBe(1);
  });

  test("single if = 2", () => {
    const { node, sourceFile } = parseFunction(`function foo(x: number) {
  if (x > 0) return x;
  return -x;
}`);
    expect(cyclomaticPlugin.analyze(node, sourceFile).cyclomatic).toBe(2);
  });

  test("if + else if = 3", () => {
    const { node, sourceFile } = parseFunction(`function foo(x: number) {
  if (x > 0) return 1;
  else if (x < 0) return -1;
  return 0;
}`);
    expect(cyclomaticPlugin.analyze(node, sourceFile).cyclomatic).toBe(3);
  });

  test("logical operators", () => {
    const { node, sourceFile } = parseFunction(`function foo(a: boolean, b: boolean, c: boolean) {
  if (a && b || c) return true;
  return false;
}`);
    expect(cyclomaticPlugin.analyze(node, sourceFile).cyclomatic).toBe(4);
  });

  test("switch with cases", () => {
    const { node, sourceFile } = parseFunction(`function foo(x: string) {
  switch (x) {
    case "a": return 1;
    case "b": return 2;
    case "c": return 3;
    default: return 0;
  }
}`);
    expect(cyclomaticPlugin.analyze(node, sourceFile).cyclomatic).toBe(4);
  });

  test("try/catch", () => {
    const { node, sourceFile } = parseFunction(`function foo() {
  try { JSON.parse("{}"); } catch (e) { return null; }
}`);
    expect(cyclomaticPlugin.analyze(node, sourceFile).cyclomatic).toBe(2);
  });

  test("ternary", () => {
    const { node, sourceFile } = parseFunction(`function foo(x: number) {
  return x > 0 ? x : -x;
}`);
    expect(cyclomaticPlugin.analyze(node, sourceFile).cyclomatic).toBe(2);
  });
});

describe("cognitivePlugin", () => {
  test("empty function = 0", () => {
    const { node, sourceFile } = parseFunction(`function foo() {}`);
    expect(cognitivePlugin.analyze(node, sourceFile).cognitive).toBe(0);
  });

  test("single if = 1", () => {
    const { node, sourceFile } = parseFunction(`function foo(x: number) {
  if (x > 0) return x;
}`);
    expect(cognitivePlugin.analyze(node, sourceFile).cognitive).toBe(1);
  });

  test("if + else = 2", () => {
    const { node, sourceFile } = parseFunction(`function foo(x: number) {
  if (x > 0) {
    return x;
  } else {
    return -x;
  }
}`);
    expect(cognitivePlugin.analyze(node, sourceFile).cognitive).toBe(2);
  });

  test("else-if does not double count nesting", () => {
    const { node, sourceFile } = parseFunction(`function foo(x: number) {
  if (x > 0) {
    return 1;
  } else if (x < 0) {
    return -1;
  } else {
    return 0;
  }
}`);
    expect(cognitivePlugin.analyze(node, sourceFile).cognitive).toBe(3);
  });

  test("nested if adds nesting penalty", () => {
    const { node, sourceFile } = parseFunction(`function foo(x: number, y: number) {
  if (x > 0) {
    if (y > 0) {
      return 1;
    }
  }
}`);
    expect(cognitivePlugin.analyze(node, sourceFile).cognitive).toBe(3);
  });

  test("switch gets +1+nesting, cases do not add", () => {
    const { node, sourceFile } = parseFunction(`function foo(x: string) {
  switch (x) {
    case "a": return 1;
    case "b": return 2;
    default: return 0;
  }
}`);
    expect(cognitivePlugin.analyze(node, sourceFile).cognitive).toBe(1);
  });

  test("boolean sequence grouping: a && b && c = +1", () => {
    const { node, sourceFile } = parseFunction(`function foo(a: boolean, b: boolean, c: boolean) {
  if (a && b && c) return true;
}`);
    expect(cognitivePlugin.analyze(node, sourceFile).cognitive).toBe(2);
  });

  test("boolean mixed operators: a && b || c = +2", () => {
    const { node, sourceFile } = parseFunction(`function foo(a: boolean, b: boolean, c: boolean) {
  if (a && b || c) return true;
}`);
    expect(cognitivePlugin.analyze(node, sourceFile).cognitive).toBe(3);
  });

  test("for loop with nesting", () => {
    const { node, sourceFile } = parseFunction(`function foo(arr: number[]) {
  for (const x of arr) {
    if (x > 0) {
      console.log(x);
    }
  }
}`);
    expect(cognitivePlugin.analyze(node, sourceFile).cognitive).toBe(3);
  });

  test("nested function adds nesting level", () => {
    const { node, sourceFile } = parseFunction(`function foo() {
  function bar() {
    if (true) return;
  }
}`);
    expect(cognitivePlugin.analyze(node, sourceFile).cognitive).toBe(2);
  });

  test("try/catch", () => {
    const { node, sourceFile } = parseFunction(`function foo() {
  try {
    doSomething();
  } catch (e) {
    handleError(e);
  }
}`);
    expect(cognitivePlugin.analyze(node, sourceFile).cognitive).toBe(1);
  });

  test("labeled break", () => {
    const { node, sourceFile } = parseFunction(`function foo() {
  outer:
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      if (i === j) break outer;
    }
  }
}`);
    const cog = cognitivePlugin.analyze(node, sourceFile).cognitive!;
    expect(cog).toBeGreaterThanOrEqual(5);
  });
});

describe("runPlugins", () => {
  test("merges all plugin results", () => {
    const { node, sourceFile } = parseFunction(`function foo(a: number, b: number) {
  if (a > b) return a;
  return b;
}`);
    const metrics = runPlugins(defaultPlugins, node, sourceFile);
    expect(metrics.cyclomatic).toBe(2);
    expect(metrics.cognitive).toBe(1);
    expect(metrics.loc).toBe(4);
    expect(metrics.parameterCount).toBe(2);
    expect(metrics.maxNestingDepth).toBe(1);
  });
});
