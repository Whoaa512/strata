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
  open: boolean;
}

function usage(): never {
  console.log(`
Usage:
  bun scripts/make-architecture-deck.ts [options]

Options:
  --storyboard <file>  Storyboard JSON. Default: docs/architecture-video-storyboard.json
  --out-dir <dir>      Output directory. Default: dist/architecture-video
  --open               Open generated deck in browser
`);
  process.exit(0);
}

function parseArgs(): CliOptions {
  const opts: CliOptions = {
    storyboard: "docs/architecture-video-storyboard.json",
    outDir: "dist/architecture-video",
    open: false,
  };

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--storyboard") opts.storyboard = args[++i];
    else if (arg === "--out-dir") opts.outDir = args[++i];
    else if (arg === "--open") opts.open = true;
    else if (arg === "--help" || arg === "-h") usage();
    else throw new Error(`Unknown arg: ${arg}`);
  }

  return opts;
}

function loadStoryboard(filePath: string): Storyboard {
  const storyboard = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Storyboard;
  if (!storyboard.title) throw new Error("Storyboard missing title");
  if (!Array.isArray(storyboard.slides) || storyboard.slides.length === 0) throw new Error("Storyboard missing slides");

  for (const [idx, slide] of storyboard.slides.entries()) {
    if (!slide.title || !slide.narration || !slide.highlight || !Array.isArray(slide.diagram)) {
      throw new Error(`Storyboard slide ${idx + 1} is missing title, narration, highlight, or diagram[]`);
    }
  }

  return storyboard;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function className(index: number): string {
  const styles = ["split", "flow", "cards", "focus", "grid"];
  return styles[index % styles.length];
}

function renderDiagram(items: string[], index: number): string {
  const cls = className(index);
  if (cls === "flow" || items.length <= 5) {
    return `<div class="flowline">${items.map((item, i) => `
      <div class="flow-item reveal" style="--i:${i}">
        <span class="flow-num">${String(i + 1).padStart(2, "0")}</span>
        <span>${escapeHtml(item)}</span>
      </div>
      ${i < items.length - 1 ? `<div class="connector reveal" style="--i:${i}"></div>` : ""}
    `).join("")}</div>`;
  }

  return `<div class="card-grid ${items.length > 6 ? "card-grid--dense" : ""}">${items.map((item, i) => `
    <div class="signal-card reveal" style="--i:${i}">
      <span class="signal-card__index">${String(i + 1).padStart(2, "0")}</span>
      <span>${escapeHtml(item)}</span>
    </div>
  `).join("")}</div>`;
}

function renderSlide(slide: StoryboardSlide, index: number, total: number): string {
  const variant = className(index);
  const label = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;

  return `<section class="slide slide--${variant}" data-slide="${index}">
    <div class="slide-bg-mark">${String(index + 1).padStart(2, "0")}</div>
    <div class="slide-kicker reveal">${label}</div>
    <div class="slide-layout">
      <div class="slide-copy">
        <h2 class="slide-title reveal">${escapeHtml(slide.title)}</h2>
        <p class="slide-narration reveal">${escapeHtml(slide.narration)}</p>
        <div class="highlight reveal"><span>Key point</span>${escapeHtml(slide.highlight)}</div>
      </div>
      <div class="slide-diagram">${renderDiagram(slide.diagram, index)}</div>
    </div>
  </section>`;
}

function renderDeck(storyboard: Storyboard): string {
  const slides = storyboard.slides.map((slide, i) => renderSlide(slide, i, storyboard.slides.length)).join("\n");
  const dots = storyboard.slides.map((_, i) => `<button class="deck-dot" data-target="${i}" aria-label="Go to slide ${i + 1}"></button>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(storyboard.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root {
  --font-body: 'IBM Plex Sans', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
  --bg: #0b1220;
  --surface: #111827;
  --surface2: #172033;
  --surface3: #1f2d45;
  --border: rgba(212, 167, 58, 0.14);
  --border-bright: rgba(212, 167, 58, 0.34);
  --text: #f4efe2;
  --text-dim: #a9b1c4;
  --accent: #d4a73a;
  --accent2: #14b8a6;
  --accent3: #0f5f8f;
  --danger: #be123c;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f7f3ea;
    --surface: #fffaf0;
    --surface2: #ede6d6;
    --surface3: #e2dac9;
    --border: rgba(30, 58, 95, 0.16);
    --border-bright: rgba(30, 58, 95, 0.34);
    --text: #111827;
    --text-dim: #5f6572;
    --accent: #9f6f05;
    --accent2: #0f766e;
    --accent3: #1e3a5f;
    --danger: #be123c;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: var(--font-body);
  color: var(--text);
  background:
    radial-gradient(circle at 12% 10%, color-mix(in srgb, var(--accent2) 20%, transparent), transparent 32%),
    radial-gradient(circle at 82% 78%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 36%),
    linear-gradient(135deg, var(--bg), color-mix(in srgb, var(--bg) 82%, var(--accent3)));
  overflow: hidden;
}
.deck {
  height: 100dvh;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  scroll-behavior: smooth;
}
.slide {
  min-height: 100dvh;
  scroll-snap-align: start;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(40px, 7vh, 80px) clamp(48px, 8vw, 132px);
  isolation: isolate;
}
.slide::before {
  content: '';
  position: absolute;
  inset: 42px;
  border: 1px solid var(--border);
  border-radius: 36px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  z-index: -2;
}
.slide::after {
  content: '';
  position: absolute;
  inset: 42px;
  border-radius: 36px;
  background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
  background-size: 44px 44px;
  opacity: 0.16;
  z-index: -1;
}
.slide-bg-mark {
  position: absolute;
  right: 7vw;
  top: 7vh;
  font-family: var(--font-mono);
  font-size: clamp(100px, 15vw, 220px);
  font-weight: 700;
  color: color-mix(in srgb, var(--text) 7%, transparent);
  z-index: -1;
}
.slide-kicker {
  font-family: var(--font-mono);
  color: var(--accent);
  font-size: clamp(12px, 1.2vw, 16px);
  letter-spacing: .18em;
  text-transform: uppercase;
  margin-bottom: 28px;
}
.slide-layout {
  display: grid;
  grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
  gap: clamp(36px, 6vw, 88px);
  align-items: center;
}
.slide--split .slide-layout, .slide--focus .slide-layout { grid-template-columns: minmax(0, 1.12fr) minmax(0, .88fr); }
.slide--grid .slide-layout { grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); }
.slide-title {
  margin: 0 0 28px;
  font-size: clamp(46px, 6vw, 92px);
  line-height: .95;
  letter-spacing: -0.06em;
  text-wrap: balance;
}
.slide-narration {
  margin: 0;
  max-width: 760px;
  color: var(--text-dim);
  font-size: clamp(19px, 2.1vw, 28px);
  line-height: 1.45;
  text-wrap: pretty;
}
.highlight {
  margin-top: 34px;
  max-width: 760px;
  padding: 22px 26px;
  border: 1px solid var(--border-bright);
  border-left: 6px solid var(--accent);
  border-radius: 20px;
  background: color-mix(in srgb, var(--surface2) 88%, var(--accent));
  color: var(--text);
  font-size: clamp(17px, 1.6vw, 23px);
  line-height: 1.35;
}
.highlight span {
  display: block;
  margin-bottom: 8px;
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .16em;
  text-transform: uppercase;
}
.flowline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  flex-wrap: wrap;
}
.flow-item, .signal-card {
  border: 1px solid var(--border-bright);
  background: linear-gradient(160deg, color-mix(in srgb, var(--surface2) 92%, var(--accent2)), var(--surface));
  box-shadow: 0 16px 46px rgba(0,0,0,.18);
}
.flow-item {
  min-width: min(250px, 42vw);
  max-width: 320px;
  min-height: 130px;
  border-radius: 28px;
  padding: 24px;
  display: grid;
  gap: 16px;
  align-content: center;
  font-size: clamp(18px, 1.55vw, 24px);
  font-weight: 700;
}
.flow-num, .signal-card__index {
  font-family: var(--font-mono);
  color: var(--accent);
  font-size: 13px;
  letter-spacing: .12em;
}
.connector {
  width: 54px;
  height: 2px;
  background: var(--accent);
  position: relative;
}
.connector::after {
  content: '';
  position: absolute;
  right: -2px;
  top: -5px;
  width: 12px;
  height: 12px;
  border-top: 2px solid var(--accent);
  border-right: 2px solid var(--accent);
  transform: rotate(45deg);
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.card-grid--dense { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px; }
.signal-card {
  min-height: 114px;
  border-radius: 24px;
  padding: 24px;
  display: grid;
  gap: 12px;
  align-content: center;
  font-size: clamp(17px, 1.45vw, 23px);
  font-weight: 700;
}
.card-grid--dense .signal-card { min-height: 90px; padding: 18px 20px; font-size: clamp(15px, 1.25vw, 20px); }
.deck-progress {
  position: fixed;
  inset: 0 auto auto 0;
  height: 4px;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  z-index: 100;
  transition: width .25s ease;
}
.deck-dots {
  position: fixed;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 100;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 68%, transparent);
  backdrop-filter: blur(12px);
}
.deck-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  border: 0;
  background: var(--text-dim);
  opacity: .35;
  cursor: pointer;
}
.deck-dot.active { background: var(--accent); opacity: 1; transform: scale(1.45); }
.deck-counter, .deck-hints {
  position: fixed;
  z-index: 100;
  font-family: var(--font-mono);
  color: var(--text-dim);
  font-size: 12px;
}
.deck-counter { right: 28px; bottom: 22px; }
.deck-hints { left: 50%; bottom: 22px; transform: translateX(-50%); opacity: .68; }
.reveal {
  opacity: 0;
  transform: translateY(22px);
  transition: opacity .55s cubic-bezier(.16,1,.3,1), transform .55s cubic-bezier(.16,1,.3,1);
  transition-delay: calc(var(--i, 0) * 70ms + 80ms);
}
.slide.visible .reveal { opacity: 1; transform: none; }
@media (max-width: 900px) {
  body { overflow: auto; }
  .slide { padding: 72px 28px; }
  .slide::before, .slide::after { inset: 20px; border-radius: 26px; }
  .slide-layout, .slide--split .slide-layout, .slide--focus .slide-layout, .slide--grid .slide-layout { grid-template-columns: 1fr; }
  .deck-dots { display: none; }
  .deck-hints { display: none; }
  .card-grid, .card-grid--dense { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .reveal, .slide { opacity: 1 !important; transform: none !important; transition: none !important; }
}
</style>
</head>
<body>
<div class="deck-progress"></div>
<div class="deck-dots">${dots}</div>
<div class="deck-counter"></div>
<div class="deck-hints">↑↓ / space to navigate</div>
<main class="deck">
${slides}
</main>
<script>
const deck = document.querySelector('.deck');
const slides = [...document.querySelectorAll('.slide')];
const dots = [...document.querySelectorAll('.deck-dot')];
const progress = document.querySelector('.deck-progress');
const counter = document.querySelector('.deck-counter');
const hints = document.querySelector('.deck-hints');
let current = 0;
function goTo(index) {
  current = Math.max(0, Math.min(slides.length - 1, index));
  slides[current].scrollIntoView({ behavior: 'smooth', block: 'start' });
  hints.style.opacity = '0';
}
function update(index) {
  current = index;
  progress.style.width = (((index + 1) / slides.length) * 100) + '%';
  counter.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0');
  dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
}
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const index = slides.indexOf(entry.target);
    entry.target.classList.add('visible');
    update(index);
  });
}, { root: deck, threshold: 0.55 });
slides.forEach(slide => observer.observe(slide));
dots.forEach(dot => dot.addEventListener('click', () => goTo(Number(dot.dataset.target))));
window.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); goTo(current + 1); }
  if (event.key === 'ArrowUp' || event.key === 'PageUp') { event.preventDefault(); goTo(current - 1); }
  if (event.key === 'Home') { event.preventDefault(); goTo(0); }
  if (event.key === 'End') { event.preventDefault(); goTo(slides.length - 1); }
});
update(0);
slides[0]?.classList.add('visible');
setTimeout(() => { hints.style.opacity = '0'; }, 4500);
</script>
</body>
</html>`;
}

async function main() {
  const opts = parseArgs();
  const storyboard = loadStoryboard(path.resolve(opts.storyboard));
  const outDir = path.resolve(opts.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "architecture-deck.html");
  fs.writeFileSync(outPath, renderDeck(storyboard));

  if (opts.open) Bun.spawnSync(["open", outPath]);
  console.log(`Done: ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
