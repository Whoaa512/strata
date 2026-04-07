#!/usr/bin/env bun
import fs from "fs";
import path from "path";

interface Storyboard {
  title: string;
  targetDuration?: string;
  slides: StoryboardSlide[];
}

interface StoryboardSlide {
  title: string;
  duration?: string;
  narration: string;
  diagram: string[];
  highlight: string;
}

interface CliOptions {
  storyboard: string;
  outDir: string;
  voice?: string;
  keep: boolean;
}

const WIDTH = 1920;
const HEIGHT = 1080;
const CARD_X = 70;
const CARD_Y = 70;
const CARD_W = 1780;
const CARD_H = 940;

function usage(): never {
  console.log(`
Usage:
  bun scripts/make-architecture-video.ts [options]

Options:
  --storyboard <file>  Storyboard JSON. Default: docs/architecture-video-storyboard.json
  --out-dir <dir>      Output directory. Default: dist/architecture-video
  --voice <voice>      macOS say voice. Example: Samantha
  --keep               Keep per-slide mp4 segments
`);
  process.exit(0);
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    storyboard: "docs/architecture-video-storyboard.json",
    outDir: "dist/architecture-video",
    keep: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--storyboard") opts.storyboard = args[++i];
    else if (arg === "--out-dir") opts.outDir = args[++i];
    else if (arg === "--voice") opts.voice = args[++i];
    else if (arg === "--keep") opts.keep = true;
    else if (arg === "--help" || arg === "-h") usage();
    else throw new Error(`Unknown arg: ${arg}`);
  }

  return opts;
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
  return Bun.spawnSync(["which", cmd], { stdout: "pipe", stderr: "pipe" }).exitCode === 0;
}

function requireTools() {
  const missing: string[] = [];
  if (!hasCommand("ffmpeg")) missing.push("ffmpeg");
  if (!hasCommand("ffprobe")) missing.push("ffprobe");
  if (!hasCommand("say")) missing.push("say");
  if (!hasCommand("magick") && !hasCommand("convert")) missing.push("magick or convert");
  if (missing.length > 0) throw new Error(`Missing required tools: ${missing.join(", ")}`);
}

function loadStoryboard(filePath: string): Storyboard {
  const raw = fs.readFileSync(filePath, "utf-8");
  const storyboard = JSON.parse(raw) as Storyboard;
  if (!storyboard.title) throw new Error("Storyboard missing title");
  if (!Array.isArray(storyboard.slides) || storyboard.slides.length === 0) throw new Error("Storyboard missing slides");
  for (const [i, slide] of storyboard.slides.entries()) {
    if (!slide.title || !slide.narration || !slide.highlight || !Array.isArray(slide.diagram)) {
      throw new Error(`Storyboard slide ${i + 1} is missing title, narration, highlight, or diagram[]`);
    }
  }
  return storyboard;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function textBlock(text: string, x: number, y: number, size: number, maxChars: number, fill = "#e5e7eb", weight = "400"): string {
  return wrapText(text, maxChars).map((line, i) => (
    `<text x="${x}" y="${y + i * Math.ceil(size * 1.28)}" fill="${fill}" font-size="${size}" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="${weight}">${escapeXml(line)}</text>`
  )).join("\n");
}

function nodeBox(label: string, x: number, y: number, w: number, h: number, fill: string): string {
  const lines = wrapText(label, Math.max(12, Math.floor(w / 18)));
  const textY = y + h / 2 - ((lines.length - 1) * 15) + 8;
  const body = lines.map((line, i) => (
    `<text x="${x + w / 2}" y="${textY + i * 30}" text-anchor="middle" fill="#f8fafc" font-size="24" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="700">${escapeXml(line)}</text>`
  )).join("\n");

  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${fill}" stroke="#93c5fd" stroke-width="2"/>
    ${body}
  `;
}

function arrow(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#60a5fa" stroke-width="5" marker-end="url(#arrow)" opacity="0.9"/>`;
}

function renderFlow(items: string[]): string {
  const colors = ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#ca8a04", "#dc2626", "#4f46e5"];
  if (items.length <= 5) {
    const w = 260;
    const h = 130;
    const gap = (CARD_W - 160 - items.length * w) / Math.max(1, items.length - 1);
    const y = 420;
    return items.map((item, i) => {
      const x = 150 + i * (w + gap);
      const pieces = [nodeBox(item, x, y, w, h, colors[i % colors.length])];
      if (i < items.length - 1) pieces.push(arrow(x + w + 12, y + h / 2, x + w + gap - 12, y + h / 2));
      return pieces.join("\n");
    }).join("\n");
  }

  const cols = items.length > 6 ? 4 : 3;
  const w = 360;
  const h = 110;
  const gapX = 50;
  const gapY = 45;
  const startX = 180;
  const startY = 340;

  return items.map((item, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = startX + col * (w + gapX);
    const y = startY + row * (h + gapY);
    return nodeBox(item, x, y, w, h, colors[i % colors.length]);
  }).join("\n");
}

function slideSvg(storyboard: Storyboard, slide: StoryboardSlide, index: number): string {
  const title = escapeXml(slide.title);
  const subtitle = `${index + 1} / ${storyboard.slides.length} · ${storyboard.title}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#09090b"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <marker id="arrow" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto" markerUnits="strokeWidth">
      <path d="M2,2 L12,7 L2,12 Z" fill="#60a5fa"/>
    </marker>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" rx="36" fill="#0f172a" stroke="#334155" stroke-width="3"/>
  <text x="120" y="130" fill="#f8fafc" font-size="56" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="800">${title}</text>
  <text x="120" y="178" fill="#94a3b8" font-size="24" font-family="Inter, Helvetica, Arial, sans-serif">${escapeXml(subtitle)}</text>
  ${renderFlow(slide.diagram)}
  <rect x="120" y="810" width="1680" height="130" rx="28" fill="#172554" stroke="#60a5fa" stroke-width="2"/>
  <text x="155" y="858" fill="#bfdbfe" font-size="28" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="800">Key point</text>
  ${textBlock(slide.highlight, 155, 900, 30, 88, "#eff6ff", "700")}
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

  const storyboardPath = path.resolve(opts.storyboard);
  const storyboard = loadStoryboard(storyboardPath);
  const outDir = path.resolve(opts.outDir);
  const slideDir = path.join(outDir, "slides");
  const audioDir = path.join(outDir, "audio");
  const segmentDir = path.join(outDir, "segments");
  const outputPath = path.join(outDir, "architecture-flow.mp4");

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(slideDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(segmentDir, { recursive: true });

  const segmentPaths: string[] = [];
  console.log(`Generating ${storyboard.slides.length} storyboard slides from ${opts.storyboard}`);

  for (let i = 0; i < storyboard.slides.length; i++) {
    const id = String(i + 1).padStart(3, "0");
    const svgPath = path.join(slideDir, `${id}.svg`);
    const pngPath = path.join(slideDir, `${id}.png`);
    const audioPath = path.join(audioDir, `${id}.aiff`);
    const segmentPath = path.join(segmentDir, `${id}.mp4`);

    fs.writeFileSync(svgPath, slideSvg(storyboard, storyboard.slides[i], i));
    convertSvgToPng(svgPath, pngPath);
    sayToAudio(storyboard.slides[i].narration, audioPath, opts.voice);
    makeSegment(pngPath, audioPath, segmentPath);
    segmentPaths.push(segmentPath);
    console.log(`  ${id}/${storyboard.slides.length}`);
  }

  concatSegments(segmentPaths, path.join(outDir, "segments.txt"), outputPath);
  if (!opts.keep) fs.rmSync(segmentDir, { recursive: true, force: true });

  console.log(`Done: ${outputPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
