import { describe, expect, test } from "bun:test";
import path from "path";
import { resolveBriefArgs } from "../src/cli-args";

const rootDir = path.resolve(import.meta.dir, "..");

describe("resolveBriefArgs", () => {
  test("treats a single file argument as file brief under cwd", () => {
    expect(resolveBriefArgs(["src/diff.ts"], rootDir)).toEqual({
      briefTarget: ".",
      briefFile: "src/diff.ts",
    });
  });

  test("keeps explicit root plus file", () => {
    expect(resolveBriefArgs([".", "src/diff.ts"], rootDir)).toEqual({
      briefTarget: ".",
      briefFile: "src/diff.ts",
    });
  });
});
