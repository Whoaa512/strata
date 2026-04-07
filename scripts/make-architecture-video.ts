#!/usr/bin/env bun
import fs from "fs";
import path from "path";

interface CliOptions {
  input: string;
  outDir: string;
  title: string;
  voice?: string;
  keep: boolean;
}

interface Slide {
  title: string;
  lines: string[];
  kind: "text" | "code";
  narration: string;
}

const WIDTH = 1920;
const HEIGHT = 1080;
const MARGIN_X = 110;
const MARGIN_TOP = 120;
const LINE_GAP = 1.22;

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    input: "docs/architecture-flow.md",
    outDir: "dist/architecture-video",
    title: "Strata architecture flow",
    keep: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input") opts.input = args[++i];
    else if (arg === "--out-dir") opts.outDir = args[++i];
    else if (arg === "--title") opts.title = args[++i];
    else if (arg === "--voice") opts.voice = args[++i];
    else if (arg === "--keep") opts.keep = true;
    else if (arg === "--help" || arg === "-h") usage();
    else throw new Error(`Unknown arg: ${arg}`);
  }

  return opts;
}

function usage(): never {
  console.log(`
Usage:
  bun scripts/make-architecture-video.ts [options]

Options:
  --input <file>       Markdown source. Default: docs/architecture-flow.md
  --out-dir <dir>      Output directory. Default: dist/architecture-video
  --title <title>      Video title. Default: Strata architecture flow
  --voice <voice>      macOS say voice. Example: Samantha
  --keep               Keep per-slide mp4 segments
`);
  process.exit(0);
}

function run(cmd: string, args: string[], cwd?: string): string {
  const proc = Bun.spawnSync([cmd, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    const stderr = proc.stderr.toString().trim();
    throw new Error(`${cmd} ${args.join(" ")} failed\n${stderr}`);
  }
  return proc.stdout.toString();
}

function hasCommand(cmd: string): boolean {
  const proc = Bun.spawnSync(["which", cmd], { stdout: "pipe", stderr: "pipe" });
  return proc.exitCode === 0;
}

function requireTools() {
  const missing: string[] = [];
  if (!hasCommand("ffmpeg")) missing.push("ffmpeg");
  if (!hasCommand("ffprobe")) missing.push("ffprobe");
  if (!hasCommand("say")) missing.push("say");
  if (!hasCommand("magick") && !hasCommand("convert")) missing.push("magick or convert");
  if (missing.length > 0) throw new Error(`Missing required tools: ${missing.join(", ")}`);
}

function splitSections(markdown: string): Array<{ title: string; body: string[] }> {
  const sections: Array<{ title: string; body: string[] }> = [];
  let current = { title: "Overview", body: [] as string[] };

  for (const line of markdown.split("\n")) {
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    if (h1) {
      current.title = h1[1];
      continue;
    }
    if (h2) {
      if (current.body.some((l) => l.trim())) sections.push(current);
      current = { title: h2[1], body: [] };
      continue;
    }
    current.body.push(line);
  }

  if (current.body.some((l) => l.trim())) sections.push(current);
  return sections;
}

function stripMarkdown(line: string): string {
  return line
    .replace(/```.*$/g, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[_*#>]/g, "")
    .trim();
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
      continue;
    }
    line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function sectionToSlides(title: string, body: string[]): Slide[] {
  const slides: Slide[] = [];
  let inCode = false;
  let code: string[] = [];
  let text: string[] = [];

  function flushText() {
    const clean = text.map(stripMarkdown).filter(Boolean);
    text = [];
    if (clean.length === 0) return;

    const lines = clean.flatMap((l) => wrapText(l, 92));
    for (let i = 0; i < lines.length; i += 18) {
      const chunk = lines.slice(i, i + 18);
      slides.push({ title, lines: chunk, kind: "text", narration: narrateText(title, chunk) });
    }
  }

  function flushCode() {
    const clean = code.filter((l) => l.trim() !== "");
    code = [];
    if (clean.length === 0) return;

    for (let i = 0; i < clean.length; i += 36) {
      const chunk = clean.slice(i, i + 36);
      slides.push({ title, lines: chunk, kind: "code", narration: narrateCode(title) });
    }
  }

  for (const line of body) {
    if (line.startsWith("```")) {
      if (inCode) flushCode();
      else flushText();
      inCode = !inCode;
      continue;
    }

    if (inCode) code.push(line);
    else text.push(line);
  }

  flushText();
  flushCode();
  return slides;
}

function narrateText(title: string, lines: string[]): string {
  const summary = lines.join(" ").replace(/\s+/g, " ").slice(0, 260);
  if (!summary) return `${title}.`;
  return `${title}. ${summary}`;
}

function narrateCode(title: string): string {
  return `${title}. This diagram shows the architecture flow. Follow the arrows from top to bottom; boxes are components, and labels describe the data moving between them.`;
}

function makeSlides(markdown: string, videoTitle: string): Slide[] {
  const sections = splitSections(markdown);
  const slides: Slide[] = [{
    title: videoTitle,
    lines: ["A programmatic walkthrough of how Strata parses code, collects metrics, reads git history, and turns those signals into agent risk."],
    kind: "text",
    narration: `${videoTitle}. A programmatic walkthrough of how Strata parses code, collects metrics, reads git history, and turns those signals into agent risk.`,
  }];

  for (const section of sections) slides.push(...sectionToSlides(section.title, section.body));
  return slides;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fontSizeFor(lines: string[], kind: Slide["kind"]): number {
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  const maxWidth = WIDTH - MARGIN_X * 2;
  const widthSize = Math.floor(maxWidth / (maxLen * 0.62));
  const maxHeight = HEIGHT - MARGIN_TOP - 110;
  const heightSize = Math.floor(maxHeight / (Math.max(1, lines.length) * LINE_GAP));
  const preferred = kind === "code" ? 22 : 34;
  const min = kind === "code" ? 12 : 24;
  return Math.max(min, Math.min(preferred, widthSize, heightSize));
}

function slideSvg(slide: Slide, index: number, total: number): string {
  const fontSize = fontSizeFor(slide.lines, slide.kind);
  const lineHeight = Math.ceil(fontSize * LINE_GAP);
  const bodyY = MARGIN_TOP + 50;
  const fontFamily = slide.kind === "code" ? "Menlo, Consolas, monospace" : "Inter, Helvetica, Arial, sans-serif";
  const title = escapeXml(slide.title);

  const tspans = slide.lines.map((line, i) => {
    const y = bodyY + i * lineHeight;
    return `<tspan x="${MARGIN_X}" y="${y}">${escapeXml(line)}</tspan>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#101522"/>
      <stop offset="100%" stop-color="#1f2937"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect x="70" y="70" width="1780" height="940" rx="34" fill="#0b1020" stroke="#334155" stroke-width="3"/>
  <text x="${MARGIN_X}" y="102" fill="#93c5fd" font-size="34" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="700">${title}</text>
  <line x1="${MARGIN_X}" y1="126" x2="1810" y2="126" stroke="#334155" stroke-width="2"/>
  <text fill="#e5e7eb" font-size="${fontSize}" font-family="${fontFamily}" xml:space="preserve">
${tspans}
  </text>
  <text x="${MARGIN_X}" y="980" fill="#64748b" font-size="24" font-family="Inter, Helvetica, Arial, sans-serif">${index + 1} / ${total}</text>
</svg>
`;
}

function convertSvgToPng(svgPath: string, pngPath: string) {
  const cmd = hasCommand("magick") ? "magick" : "convert";
  run(cmd, [svgPath, pngPath]);
}

function sayToAudio(text: string, audioPath: string, voice?: string) {
  const args = voice ? ["-v", voice, "-o", audioPath, text] : ["-o", audioPath, text];
  run("say", args);
}

function durationSeconds(audioPath: string): number {
  const out = run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    audioPath,
  ]).trim();
  const duration = Number(out);
  if (!Number.isFinite(duration) || duration <= 0) return 4;
  return Math.max(3, duration + 0.5);
}

function makeSegment(pngPath: string, audioPath: string, segmentPath: string) {
  const duration = durationSeconds(audioPath).toFixed(2);
  run("ffmpeg", [
    "-y",
    "-loop", "1",
    "-framerate", "30",
    "-t", duration,
    "-i", pngPath,
    "-i", audioPath,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-vf", `scale=${WIDTH}:${HEIGHT}`,
    "-c:a", "aac",
    "-b:a", "160k",
    "-shortest",
    segmentPath,
  ]);
}

function concatSegments(segmentPaths: string[], listPath: string, outputPath: string) {
  fs.writeFileSync(listPath, segmentPaths.map((p) => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`).join("\n"));
  run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath]);
}

async function main() {
  const opts = parseArgs();
  requireTools();

  const inputPath = path.resolve(opts.input);
  const outDir = path.resolve(opts.outDir);
  const slideDir = path.join(outDir, "slides");
  const audioDir = path.join(outDir, "audio");
  const segmentDir = path.join(outDir, "segments");
  const outputPath = path.join(outDir, "architecture-flow.mp4");

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(slideDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(segmentDir, { recursive: true });

  const markdown = fs.readFileSync(inputPath, "utf-8");
  const slides = makeSlides(markdown, opts.title);
  const segmentPaths: string[] = [];

  console.log(`Generating ${slides.length} slides from ${opts.input}`);
  for (let i = 0; i < slides.length; i++) {
    const id = String(i + 1).padStart(3, "0");
    const svgPath = path.join(slideDir, `${id}.svg`);
    const pngPath = path.join(slideDir, `${id}.png`);
    const audioPath = path.join(audioDir, `${id}.aiff`);
    const segmentPath = path.join(segmentDir, `${id}.mp4`);

    fs.writeFileSync(svgPath, slideSvg(slides[i], i, slides.length));
    convertSvgToPng(svgPath, pngPath);
    sayToAudio(slides[i].narration, audioPath, opts.voice);
    makeSegment(pngPath, audioPath, segmentPath);
    segmentPaths.push(segmentPath);
    console.log(`  ${id}/${slides.length}`);
  }

  concatSegments(segmentPaths, path.join(outDir, "segments.txt"), outputPath);

  if (!opts.keep) fs.rmSync(segmentDir, { recursive: true, force: true });

  console.log(`Done: ${outputPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
