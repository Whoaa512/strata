const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";
const UNDERLINE = "\x1b[4m";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const WHITE = "\x1b[37m";
const GRAY = "\x1b[90m";

const BG_RED = "\x1b[41m";
const BG_GREEN = "\x1b[42m";
const BG_YELLOW = "\x1b[43m";
const BG_BLUE = "\x1b[44m";
const BG_MAGENTA = "\x1b[45m";

const RGB = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
const BG_RGB = (r: number, g: number, b: number) => `\x1b[48;2;${r};${g};${b}m`;

export const c = {
	reset: (s: string) => `${RESET}${s}${RESET}`,
	bold: (s: string) => `${BOLD}${s}${RESET}`,
	dim: (s: string) => `${DIM}${s}${RESET}`,
	italic: (s: string) => `${ITALIC}${s}${RESET}`,
	underline: (s: string) => `${UNDERLINE}${s}${RESET}`,

	red: (s: string) => `${RED}${s}${RESET}`,
	green: (s: string) => `${GREEN}${s}${RESET}`,
	yellow: (s: string) => `${YELLOW}${s}${RESET}`,
	blue: (s: string) => `${BLUE}${s}${RESET}`,
	magenta: (s: string) => `${MAGENTA}${s}${RESET}`,
	cyan: (s: string) => `${CYAN}${s}${RESET}`,
	white: (s: string) => `${WHITE}${s}${RESET}`,
	gray: (s: string) => `${GRAY}${s}${RESET}`,

	bgRed: (s: string) => `${BG_RED}${WHITE}${s}${RESET}`,
	bgGreen: (s: string) => `${BG_GREEN}${WHITE}${s}${RESET}`,
	bgYellow: (s: string) => `${BG_YELLOW}${WHITE}${s}${RESET}`,
	bgBlue: (s: string) => `${BG_BLUE}${WHITE}${s}${RESET}`,
	bgMagenta: (s: string) => `${BG_MAGENTA}${WHITE}${s}${RESET}`,

	rgb: (r: number, g: number, b: number, s: string) => `${RGB(r, g, b)}${s}${RESET}`,
	bgRgb: (r: number, g: number, b: number, s: string) => `${BG_RGB(r, g, b)}${s}${RESET}`,

	heatColor: (value: number, max: number, s: string): string => {
		const ratio = Math.min(value / Math.max(max, 1), 1);
		if (ratio < 0.33) return `${GREEN}${s}${RESET}`;
		if (ratio < 0.66) return `${YELLOW}${s}${RESET}`;
		return `${RED}${s}${RESET}`;
	},
};

export function heatBar(value: number, max: number, width = 20): string {
	const filled = Math.round((value / Math.max(max, 1)) * width);
	const ratio = value / Math.max(max, 1);
	let color: string;
	if (ratio < 0.33) color = GREEN;
	else if (ratio < 0.66) color = YELLOW;
	else color = RED;

	return `${color}${"█".repeat(Math.min(filled, width))}${GRAY}${"░".repeat(Math.max(width - filled, 0))}${RESET}`;
}

export function sparkline(values: number[]): string {
	const sparks = "▁▂▃▄▅▆▇█";
	const max = Math.max(...values, 1);
	return values
		.map((v) => {
			const idx = Math.min(Math.round((v / max) * (sparks.length - 1)), sparks.length - 1);
			const ratio = v / max;
			let color: string;
			if (ratio < 0.33) color = GREEN;
			else if (ratio < 0.66) color = YELLOW;
			else color = RED;
			return `${color}${sparks[idx]}${RESET}`;
		})
		.join("");
}

export function progressBar(current: number, total: number, width = 30): string {
	const pct = current / Math.max(total, 1);
	const filled = Math.round(pct * width);
	const bar = `${CYAN}${"━".repeat(filled)}${GRAY}${"─".repeat(width - filled)}${RESET}`;
	const label = `${BOLD}${Math.round(pct * 100)}%${RESET}`;
	return `${bar} ${label}`;
}

export function badge(text: string, severity: "info" | "warn" | "critical"): string {
	const colors = {
		info: BG_BLUE,
		warn: BG_YELLOW,
		critical: BG_RED,
	};
	return `${colors[severity]}${WHITE}${BOLD} ${text} ${RESET}`;
}

export function riskIndicator(score: number): string {
	if (score <= 2) return `${GREEN}●${RESET} low`;
	if (score <= 5) return `${YELLOW}●${RESET} med`;
	if (score <= 10) return `${RED}●${RESET} high`;
	return `${BOLD}${RED}◉${RESET}${RED} critical${RESET}`;
}

export function truncPath(filePath: string, maxLen = 40): string {
	if (filePath.length <= maxLen) return filePath;
	const parts = filePath.split("/");
	let result = parts.pop() ?? filePath;
	while (parts.length > 0 && result.length < maxLen - 4) {
		result = `${parts.pop()}/${result}`;
	}
	if (filePath.length > result.length) {
		result = `…/${result}`;
	}
	return result;
}

export function table(headers: string[], rows: string[][], opts?: { padding?: number }): string {
	const pad = opts?.padding ?? 2;
	const allRows = [headers, ...rows];
	const colWidths = headers.map((_, colIdx) =>
		Math.max(...allRows.map((row) => stripAnsi(row[colIdx] ?? "").length)),
	);

	const lines: string[] = [];

	const headerLine = headers
		.map((h, i) => `${BOLD}${UNDERLINE}${padRight(h, colWidths[i])}${RESET}`)
		.join(" ".repeat(pad));
	lines.push(headerLine);

	for (const row of rows) {
		const line = row
			.map((cell, i) => {
				const visible = stripAnsi(cell);
				const extra = cell.length - visible.length;
				return cell.padEnd(colWidths[i] + extra);
			})
			.join(" ".repeat(pad));
		lines.push(line);
	}

	return lines.join("\n");
}

function padRight(s: string, len: number): string {
	const visible = stripAnsi(s);
	return s + " ".repeat(Math.max(len - visible.length, 0));
}

export function stripAnsi(s: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape sequences requires matching ESC
	return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export function box(content: string, title?: string): string {
	const lines = content.split("\n");
	const maxLen = Math.max(
		...lines.map((l) => stripAnsi(l).length),
		title ? stripAnsi(title).length + 4 : 0,
	);
	const w = maxLen + 2;

	const out: string[] = [];
	if (title) {
		out.push(
			`${GRAY}╭─${RESET} ${BOLD}${title}${RESET} ${GRAY}${"─".repeat(Math.max(w - stripAnsi(title).length - 3, 0))}╮${RESET}`,
		);
	} else {
		out.push(`${GRAY}╭${"─".repeat(w)}╮${RESET}`);
	}

	for (const line of lines) {
		const visible = stripAnsi(line).length;
		const padding = Math.max(w - visible - 1, 0);
		out.push(`${GRAY}│${RESET} ${line}${" ".repeat(padding)}${GRAY}│${RESET}`);
	}

	out.push(`${GRAY}╰${"─".repeat(w)}╯${RESET}`);
	return out.join("\n");
}

export function divider(label?: string, width = 60): string {
	if (!label) return `${GRAY}${"─".repeat(width)}${RESET}`;
	const labelLen = label.length + 2;
	const leftLen = Math.floor((width - labelLen) / 2);
	const rightLen = width - leftLen - labelLen;
	return `${GRAY}${"─".repeat(leftLen)}${RESET} ${BOLD}${label}${RESET} ${GRAY}${"─".repeat(rightLen)}${RESET}`;
}

export function spinner(): { update: (msg: string) => void; done: (msg: string) => void } {
	const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	let i = 0;
	let interval: ReturnType<typeof setInterval>;

	return {
		update(msg: string) {
			clearInterval(interval);
			interval = setInterval(() => {
				process.stderr.write(`\r${CYAN}${frames[i % frames.length]}${RESET} ${msg}`);
				i++;
			}, 80);
		},
		done(msg: string) {
			clearInterval(interval);
			process.stderr.write(`\r${GREEN}✓${RESET} ${msg}\n`);
		},
	};
}
