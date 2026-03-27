import { describe, expect, it } from "bun:test";
import { blastRadiusPlugin } from "../src/plugins/blast-radius";
import { createParser } from "../src/utils/parser";
import type { AnalysisContext } from "../src/types";

async function analyzeFiles(
  files: { path: string; content: string }[],
  testFiles: { path: string; content: string }[] = []
) {
  const parser = await createParser();
  const allFiles = [...files, ...testFiles].map((f) => ({
    path: `/tmp/test/${f.path}`,
    relativePath: f.path,
    content: f.content,
  }));

  const ctx: AnalysisContext = {
    repoPath: "/tmp/test",
    files: allFiles,
    parser,
    gitLog: [],
  };

  return blastRadiusPlugin.analyze(ctx);
}

describe("blast-radius plugin", () => {
  it("extracts call edges between functions", async () => {
    const result = await analyzeFiles([
      {
        path: "src/a.ts",
        content: `
          function foo() { bar(); }
          function bar() { baz(); }
          function baz() { return 1; }
        `,
      },
    ]);

    const edges = result.edges!;
    expect(edges.length).toBeGreaterThanOrEqual(2);

    const fooCallsBar = edges.find(
      (e) => e.source === "src/a.ts::foo" && e.target === "bar"
    );
    expect(fooCallsBar).toBeDefined();
  });

  it("computes blast radius as reachable function count", async () => {
    const result = await analyzeFiles([
      {
        path: "src/a.ts",
        content: `
          function foo() { bar(); }
          function bar() { baz(); }
          function baz() { return 1; }
        `,
      },
    ]);

    const foo = result.entities!.find((e) => e.name === "foo");
    expect(foo!.metrics.blastRadius).toBeGreaterThanOrEqual(1);
  });

  it("detects untested functions in blast radius", async () => {
    const result = await analyzeFiles(
      [
        {
          path: "src/a.ts",
          content: `
            function foo() { bar(); }
            function bar() { return 1; }
          `,
        },
      ],
      [
        {
          path: "test/a.test.ts",
          content: `
            import { foo } from '../src/a';
            foo();
          `,
        },
      ]
    );

    const foo = result.entities!.find((e) => e.name === "foo");
    expect(foo!.metrics.blastRadius).toBeGreaterThanOrEqual(1);
  });

  it("handles arrow function calls", async () => {
    const result = await analyzeFiles([
      {
        path: "src/b.ts",
        content: `
          const greet = (name: string) => { return hello(name); }
          const hello = (n: string) => "hi " + n;
        `,
      },
    ]);

    const edges = result.edges!;
    const greetCallsHello = edges.find(
      (e) => e.source === "src/b.ts::greet" && e.target === "hello"
    );
    expect(greetCallsHello).toBeDefined();
  });

  it("returns 0 blast radius for leaf functions", async () => {
    const result = await analyzeFiles([
      {
        path: "src/c.ts",
        content: `function leaf() { return 42; }`,
      },
    ]);

    const leaf = result.entities!.find((e) => e.name === "leaf");
    expect(leaf!.metrics.blastRadius).toBe(0);
  });
});
