import { describe, expect, it } from "bun:test";
import { parseLogOutput } from "../src/utils/git";

describe("parseLogOutput", () => {
  it("parses git log format into commits", () => {
    const raw = `abc123|2024-01-15T10:00:00+00:00|Alice
src/foo.ts
src/bar.ts

def456|2024-01-14T09:00:00+00:00|Bob
src/baz.ts`;

    const commits = parseLogOutput(raw);
    expect(commits).toHaveLength(2);
    expect(commits[0].hash).toBe("abc123");
    expect(commits[0].author).toBe("Alice");
    expect(commits[0].files).toEqual(["src/foo.ts", "src/bar.ts"]);
    expect(commits[1].hash).toBe("def456");
    expect(commits[1].files).toEqual(["src/baz.ts"]);
  });

  it("handles empty input", () => {
    expect(parseLogOutput("")).toEqual([]);
  });
});
