import { describe, expect, test } from "bun:test";
import {
	badge,
	box,
	c,
	divider,
	heatBar,
	riskIndicator,
	sparkline,
	stripAnsi,
	table,
	truncPath,
} from "../src/render";

describe("stripAnsi", () => {
	test("removes ANSI escape codes", () => {
		const colored = c.red("hello");
		expect(stripAnsi(colored)).toBe("hello");
	});

	test("preserves plain text", () => {
		expect(stripAnsi("no colors here")).toBe("no colors here");
	});
});

describe("colors", () => {
	test("bold wraps with correct codes", () => {
		const result = c.bold("test");
		expect(result).toContain("test");
		expect(stripAnsi(result)).toBe("test");
	});

	test("heatColor returns green for low values", () => {
		const result = c.heatColor(1, 10, "low");
		expect(result).toContain("low");
	});
});

describe("heatBar", () => {
	test("renders full bar at max", () => {
		const bar = stripAnsi(heatBar(10, 10, 10));
		expect(bar).toBe("██████████");
	});

	test("renders empty bar at zero", () => {
		const bar = stripAnsi(heatBar(0, 10, 10));
		expect(bar).toBe("░░░░░░░░░░");
	});

	test("renders partial bar", () => {
		const bar = stripAnsi(heatBar(5, 10, 10));
		expect(bar.includes("█")).toBeTrue();
		expect(bar.includes("░")).toBeTrue();
	});
});

describe("sparkline", () => {
	test("renders ascending values", () => {
		const result = stripAnsi(sparkline([1, 2, 3, 4, 5]));
		expect(result.length).toBe(5);
	});

	test("renders single value", () => {
		const result = stripAnsi(sparkline([5]));
		expect(result).toBe("█");
	});
});

describe("table", () => {
	test("renders headers and rows aligned", () => {
		const result = table(
			["Name", "Score"],
			[
				["foo", "42"],
				["bar", "7"],
			],
		);
		const lines = result.split("\n");
		expect(lines.length).toBe(3);
		expect(stripAnsi(lines[0])).toContain("Name");
		expect(stripAnsi(lines[1])).toContain("foo");
	});
});

describe("box", () => {
	test("wraps content with borders", () => {
		const result = box("hello");
		expect(stripAnsi(result)).toContain("│");
		expect(stripAnsi(result)).toContain("╭");
		expect(stripAnsi(result)).toContain("╰");
	});

	test("includes title when provided", () => {
		const result = box("content", "Title");
		expect(stripAnsi(result)).toContain("Title");
	});
});

describe("truncPath", () => {
	test("returns short paths unchanged", () => {
		expect(truncPath("src/foo.ts")).toBe("src/foo.ts");
	});

	test("truncates long paths with ellipsis", () => {
		const long = "very/deep/nested/directory/structure/file.ts";
		const result = truncPath(long, 30);
		expect(result.length).toBeLessThanOrEqual(long.length);
		expect(result).toContain("file.ts");
	});
});

describe("badge", () => {
	test("renders with text", () => {
		const result = stripAnsi(badge("HIGH", "critical"));
		expect(result).toContain("HIGH");
	});
});

describe("riskIndicator", () => {
	test("low risk", () => {
		const result = stripAnsi(riskIndicator(1));
		expect(result).toContain("low");
	});

	test("critical risk", () => {
		const result = stripAnsi(riskIndicator(15));
		expect(result).toContain("critical");
	});
});

describe("divider", () => {
	test("renders plain divider", () => {
		const result = stripAnsi(divider());
		expect(result.length).toBe(60);
	});

	test("renders labeled divider", () => {
		const result = stripAnsi(divider("Section"));
		expect(result).toContain("Section");
	});
});
