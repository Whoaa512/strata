# Visual Design Language: Change Shape & Confidence Shape

> Brainstorm for Strata's agentic IDE of the future.
> Focus: how to give humans INTUITION about change dynamics and test safety through visual bandwidth.

---

## Foundational Metaphor: The Codebase Is Terrain

Not a graph. Not a tree. **Terrain.** Land that has been shaped by geological forces (time, pressure, erosion, construction). You look at terrain and you *feel* which areas are stable bedrock vs shifting sand vs fresh construction vs crumbling cliff.

This is the right root metaphor because:
- Terrain encodes time implicitly (strata = geological layers)
- Terrain has material qualities you can read at a glance (rock vs mud vs glass)
- Terrain supports overlays naturally (weather, vegetation, construction)
- Humans have deep intuition about terrain — millions of years of evolution

Every visual choice below derives from this root.

---

## 1. Temporal Visualization — Geological Strata & Growth Rings

### The Core Idea: Visible Sediment

Every file/module has **visible layers** — like a cliff face showing geological strata. Each layer represents a time period of change. The visual encodes:

- **Layer thickness** = volume of change in that period
- **Layer color** = who changed it (ownership), or what kind of change (refactor vs feature vs fix)
- **Layer regularity** = consistent cadence (healthy) vs sudden thick bands (crisis churn)

### Concrete Representations

**A. Ring View (Tree Ring Metaphor)**

Each module rendered as a cross-section of a tree trunk. Concentric rings show change over time.

```
Module: src/auth/
         ╭───────────╮
       ╭─┤           ├─╮
     ╭─┤ │  ██core██ │ ├─╮      inner = oldest code
   ╭─┤ │ │  ██████  │ │ ├─╮    outer = recent changes
   │░│▓│ │  ██████  │ │▓│░│    thick outer ring = recent heavy churn
   ╰─┤ │ │  ██████  │ │ ├─╯    thin inner rings = stable period
     ╰─┤ │           │ ├─╯
       ╰─┤           ├─╯
         ╰───────────╯

░ = last month (thick = lots of change)
▓ = last quarter
█ = > 1 year (the "heartwood")
```

**Why this works:** A module with a thin, tight set of rings reads as "mature, stable." A module with thick recent outer rings reads as "active growth area" or "under pressure." Irregular rings with gaps read as "sporadic, possibly neglected."

**B. Strata Cross-Section (Cliff Face)**

When you click into a module, show a sideways view — like looking at a cliff face. Horizontal layers, time flowing bottom-to-top.

```
NOW    ┃████████████████████████┃  ← thick band = current sprint's heavy changes
       ┃▓▓▓▓▓▓▓▓                ┃  ← medium band = last month
       ┃░░                      ┃  ← thin band = quiet quarter
       ┃░                       ┃  ← quiet
       ┃████████████████        ┃  ← historical surge (incident? rewrite?)
       ┃▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┃  ← original construction
ORIGIN ┃▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┃
```

You can literally **read the history** of a module like a geologist reads rock. "This module was built, then stabilized, then something big happened 6 months ago, then it went quiet, and now it's getting hammered again."

**C. Activity Heatmap Timeline**

A sparkline-style row per file, showing change intensity over time as a color gradient strip.

```
src/auth/middleware.ts  ░░░░░▓▓▓████████░░░▓████████
src/auth/session.ts     ░░░░░░░░▓▓░░░░░░░░░░░░▓▓▓▓▓
src/api/routes.ts       ░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
src/lib/utils.ts        ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
                        ←── 1 year ago             now ──→
```

At a glance: middleware.ts has **two burst periods** (something happened). routes.ts has **constant medium churn** (workhorse file). utils.ts is **dead quiet** (stable, possibly abandoned).

### What These Encode from Change Shape

| Strata Signal | Visual Encoding |
|---|---|
| Churn | Layer thickness / ring width |
| Recent vs old activity | Position (outer rings = recent) |
| Hotspot growth | Accelerating outer ring thickness |
| Ownership drift | Layer color shifting (different author colors per layer) |
| Long-lived risky areas | Many thick layers throughout (never stabilizes) |

---

## 2. Heat & Activity Encoding — Patina, Erosion, and Wear

### The Core Idea: Code Shows Its Age Through Material Wear

Not just "red = hot". Material quality that communicates age, activity, and stability:

**Active/Churning Code — Molten/Glowing**
- Code that's currently being hammered: **ember glow**. Literal heat. Orange-red pulsing edges. Like metal in a forge — it's being shaped right now. The glow intensity maps to recency × frequency of changes.

**Stable, Well-Worn Code — Polished Stone**
- Code that changes rarely but is mature: **smooth, dark granite**. Dense. Solid. No texture variation. It's been under pressure and compressed into something reliable. Think polished obsidian.

**Abandoned/Neglected Code — Weathered/Eroded**
- Code that hasn't been touched in ages: **moss and rust**. Desaturated greens and browns creeping in from the edges. Not dangerous per se, but unknown. Nobody remembers why it looks like this. Lichen on forgotten ruins.

**Recently Created Code — Fresh Construction**
- Brand new files/modules: **bright, clean, sharp edges**. Like fresh-cut wood or poured concrete. Conspicuous because it doesn't match the patina of surrounding terrain. Stands out as "new here."

**Crisis-Churned Code — Scarred/Cracked**
- Code that went through a burst of emergency changes (revert, hotfix, incident response): **stress fractures**. Visible cracks in the surface. The material was forced to change too fast and shows the strain.

### Concrete Color Mapping

```
Ember Glow          Warm Granite        Cool Slate          Weathered Stone
(active churn)      (recent stable)     (old stable)        (abandoned)
  ██████              ██████              ██████              ██████
  hot orange →        warm gray →         cool blue-gray →    desaturated green
  pulsing             smooth              smooth              textured/noisy
  bright              medium              dim                 dim, uneven
```

### Encoding in the Terrain Map

Each file/module tile's **surface treatment** communicates activity:

- **Background luminosity** = recency of last change (bright = yesterday, dim = 6 months ago)
- **Edge glow** = current churn rate (glowing edges = being actively changed)
- **Surface noise/texture** = churn variability (smooth = consistent cadence, noisy = erratic)
- **Color temperature** = warm (active) → cool (dormant)

This means you can scan the terrain map and immediately distinguish:
- The forge (orange glow, active work area)
- The bedrock (dark granite, stable foundation)
- The ruins (mossy, weathered, forgotten corners)
- The construction site (bright, sharp, new)

---

## 3. Confidence as Material Quality — Structural Integrity

### The Core Idea: Tests Make Code SOLID

Untested code is fragile material. Well-tested code is reinforced. You should be able to *see* structural integrity at a glance.

**Well-Tested Code — Reinforced Concrete / Diamond**
- Dense, solid, opaque. Visible reinforcement patterns (like rebar lines). The material resists damage. When you hover, it feels *heavy* — substantial. A module with 95% coverage and no flaky tests is rendered as a fortress block.

**Partially Tested Code — Wood / Brick**
- Functional, but you can see the grain. It'll hold up under normal conditions, but you wouldn't trust it in an earthquake. Visible seams between tested and untested regions — like mortar lines in brick.

**Untested Code — Glass / Paper**
- Translucent or thin. You can see through it (literally — lower opacity). It *looks* fragile. A file with zero tests is rendered almost transparent, like a soap bubble sitting in the terrain. One poke and it shatters.

**Snapshot-Only Code — Ice**
- Rigid but brittle. Clear and structured, but the testing is frozen — it tells you shape hasn't changed, not that behavior is correct. Rendered with a crystalline, icy texture. Looks solid until you apply force.

### Visual Encoding Table

| Coverage Level | Material | Opacity | Texture | Border |
|---|---|---|---|---|
| 90%+ unit + integration | Diamond/Steel | 100% | Smooth, dense | Solid double-line |
| 70-90% unit | Concrete | 90% | Slight grain | Solid line |
| 40-70% unit only | Wood | 75% | Visible grain | Dashed line |
| Snapshots only | Ice | 80% | Crystalline facets | Dotted blue line |
| <40% coverage | Paper | 50% | Crinkled / noisy | Thin single line |
| 0% coverage | Glass | 30% | Transparent | No border / hairline |

### Combined with Activity

The magic is combining confidence (material) with activity (temperature):

- **Glowing diamond** = actively changing, well-tested. The ideal. You can send agents here confidently.
- **Glowing glass** = actively changing, no tests. **ALARM.** This is the worst case — hot, fragile code. Render with red tint bleeding through the transparency.
- **Cold granite** = stable, well-tested. Foundation. Leave it alone.
- **Mossy glass** = abandoned AND untested. Landmine. Render with a hazard pattern — diagonal stripes visible through the transparency.

---

## 4. The PR Delta View — Tectonic Shift

### The Core Idea: Before/After as Landscape Transformation

A PR is a tectonic event. Show the terrain map BEFORE and AFTER, with the shift visible.

### Representation A: Split-Screen with Animated Transition

```
┌─────────── BEFORE (HEAD~1) ──────────────┬─────────── AFTER (HEAD) ────────────────┐
│                                           │                                          │
│   ┌──────────┐  ┌────────┐               │   ┌──────────┐  ┌────────┐              │
│   │ auth/    │  │ api/   │               │   │ auth/ ███│  │ api/   │              │
│   │ ░░░░░░░░ │  │ ░░░░░░ │               │   │ ████████ │  │ ░░░░░░ │  ┌────────┐ │
│   │ ░░░░░░░░ │  │ ░░░░░░ │               │   │ ████████ │  │ ░░░░░░ │  │ NEW!   │ │
│   └──────────┘  └────────┘               │   └──────────┘  └────────┘  │rate-    │ │
│                                           │                             │limit/   │ │
│   ┌──────────────────────┐               │   ┌──────────────────────┐  └────────┘ │
│   │ lib/                 │               │   │ lib/                 │              │
│   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │               │   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │              │
│   └──────────────────────┘               │   └──────────────────────┘              │
│                                           │                                          │
└───────────────────────────────────────────┴──────────────────────────────────────────┘
                         ▲ auth/ went from yellow → red
                         ▲ new module "rate-limit/" appeared
                         ▲ lib/ unchanged
```

**With animated transition:** Morphing between before and after. The auth module visibly *heats up* (color shift). The new rate-limit module *rises out of the ground* (scale from 0). Unchanged areas stay still. The eye is drawn to motion = change.

### Representation B: Diff Overlay (Construction Markings)

Instead of split-screen, overlay the changes ON the current map:

- **Changed files:** Highlighted with construction-tape border (yellow/black diagonal stripes)
- **New files:** Bright "fresh concrete" appearance with a ⊕ badge
- **Deleted files:** Ghost outline where they used to be (dotted, fading)
- **Affected-but-not-changed files:** Ripple rings emanating outward from changed files, like earthquake epicenter waves. The further the ring, the weaker the effect.
- **Risk level change:** Directional arrows. A file that went green→yellow gets a small ▲ arrow. Yellow→red gets a larger ▲▲. Red→green gets a satisfying ▼ checkmark.

```
┌─────────────────── PR #427: Add Rate Limiting ───────────────────────┐
│                                                                       │
│   ┌──⚡CHANGED⚡──┐  ┌────────┐     ┌──────┐                        │
│   │ auth/         │  │ api/   │     │ NEW  │                        │
│   │ ████▲▲██████ │  │ ░░░░░░ │     │rate- │                        │
│   │ middleware.ts │╌╌│╌╌╌╌╌╌╌│╌╌╌╌╌│limit │                        │
│   │ ▲ yellow→red │  │ routes │     │ .ts  │                        │
│   └──────────────┘  └────┬───┘     └──────┘                        │
│          │ripple          │ripple                                     │
│          ▼                ▼                                           │
│   ╭╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╮                                    │
│   ╎ session.ts  (87% co-change)╎  ← ripple ring / affected zone     │
│   ╎ ⚠ NOT IN THIS PR          ╎                                     │
│   ╰╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╯                                    │
│                                                                       │
│   ┌──────────────────────┐                                           │
│   │ lib/ (unchanged)     │                                           │
│   │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │                                           │
│   └──────────────────────┘                                           │
└───────────────────────────────────────────────────────────────────────┘
```

### Representation C: Seismic Map

The PR is an earthquake. Show the **epicenter** (changed files) and **shock waves** (blast radius / ripple zone):

- **Epicenter:** Pulsing red/orange core at the changed entities
- **Primary wave (P-wave):** Static dependencies — direct callers/callees. Strong, fast-traveling wave. Solid concentric rings.
- **Secondary wave (S-wave):** Temporal/implicit couplings. Slower, wider, more destructive. Dashed concentric rings in a different color (amber).
- **Aftershock zones:** Untested files in the ripple zone. Small tremor icons (⚡) on files that have no test coverage within the blast radius.

The seismic metaphor lets you instantly see: "This was a magnitude 7 change" (huge ripple, many waves) vs "magnitude 2" (tiny local change, waves barely visible).

---

## 5. Temporal Coupling — Invisible Forces

### The Core Idea: Gravitational Pull Between Unconnected Bodies

Files that co-change without import links are like celestial bodies locked in gravitational orbit. They *look* independent, but they're bound by invisible forces.

### Representation A: Gravitational Lanes

In the terrain map, temporally coupled files are connected by **gravity lanes** — subtle curved lines that pull between them, like the Lagrange points between celestial bodies.

- **Line style:** NOT straight lines (those mean imports). Curved, flowing, almost like magnetic field lines. They *arc* between the files.
- **Line opacity:** Maps to co-change confidence (90% = clearly visible, 30% = barely perceptible)
- **Line animation:** Slow, gentle pulsing. Like a heartbeat. The files are alive and breathing in sync.
- **Line color:** Amber/gold — distinct from blue (static deps) and red (danger). Gold = "hidden connection you should know about."

```
   ┌────────────┐                    ┌────────────┐
   │ auth.ts    │                    │ oauth.ts   │
   │            │╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│            │
   └────────────┘  ~~~~ 94% ~~~~    └────────────┘
         no import link, but they ALWAYS change together

   vs.

   ┌────────────┐────────────────────┌────────────┐
   │ routes.ts  │────── import ──────│ handler.ts │
   └────────────┘   solid = static   └────────────┘
```

### Representation B: Synchronized Pulsing

When you select a file, all temporally coupled files **pulse in unison** — like they're breathing together. The pulse rate and amplitude correspond to coupling strength.

- Select `auth.ts` → `oauth.ts` starts pulsing (94% coupling, strong pulse) → `session.ts` gently glows (45% coupling, faint pulse) → everything else stays still.
- This creates an immediate visceral sense of "these things are connected" without drawing any lines.

### Representation C: Proximity Warping

In the terrain map layout, temporally coupled files are **pulled closer together** than pure directory hierarchy would place them. The layout algorithm factors in temporal coupling as an attractive force.

- Files in different directories that co-change frequently end up **near each other** on the map, even if they're in different module groups.
- A visible "coupling bridge" connects them across the gap — like a land bridge between two continents that shouldn't be connected.

This means the spatial layout itself encodes coupling. Files that feel close ARE close (in change-behavior), even if they're far in the file tree.

### Representation D: Resonance Lines (The Best One)

Drawing on the physics of sympathetic vibration:

When one tuning fork vibrates, a nearby tuning fork at the same frequency starts vibrating too — without physical contact. **Resonance.**

Visual: When a changed file's ripple animation plays (outward rings), temporally coupled files that aren't in the static dependency tree show their own **sympathetic ripple** — a secondary vibration that appears to be triggered by the first, but through invisible medium.

```
auth.ts CHANGED  ═══wave═══▶  handler.ts (import) ═══wave═══▶  db.ts (import)
     │
     │ (no import, but...)
     │
     ╰ ~~~resonance~~~▶  oauth.ts (87% co-change)
                              └── its own ripple appears, delayed
```

The delay between the primary wave and the resonance wave communicates "this isn't a direct link — it's a pattern." The human brain picks up on this timing difference instantly.

---

## 6. Test Coverage as Armor / Protection — The Shield Layer

### The Core Idea: Tests Are Defensive Infrastructure

Like medieval fortification — walls, moats, watchtowers. You can see how well-defended an area is.

### Representation A: Shield Overlay

Toggle-able overlay that renders protective "shields" around tested code:

- **Full test suite (unit + integration + e2e):** Triple concentric shield. Think Captain America's shield — layered rings of protection. Each ring = a test tier.

```
            ╔═══════╗
          ╔═║ e2e   ║═╗
        ╔═║ ║ integ ║ ║═╗
        ║ ║ ║ unit  ║ ║ ║
        ║ ║ ║ CODE  ║ ║ ║
        ╚═║ ║       ║ ║═╝
          ╚═║       ║═╝
            ╚═══════╝
```

- **Unit only:** Single thin shield ring. Protects against obvious breakage but won't catch integration issues.
- **Integration only:** Shield ring with gaps. Like chain mail — strong in some directions, exposed in others.
- **No tests:** No shield. The module sits naked on the terrain, exposed to the elements.

### Representation B: Fortress Walls (The Moat Metaphor)

Draw literal **walls** around well-tested modules. The wall height/thickness corresponds to coverage depth:

- **Thick walls + moat:** 90%+ coverage with multiple test types. This is a castle. Agents can operate inside safely — the walls catch escaping bugs.
- **Low walls:** Partial coverage. Some protection, but things can climb over.
- **No walls, just open ground:** Zero coverage. Anything goes. Render the ground as exposed soil rather than paved/protected surface.

The moat specifically represents **integration tests** — they catch things at the boundaries. Unit tests are the inner walls. E2e tests are the outer watchtowers.

### Representation C: Umbrella / Canopy Coverage

View from above: tested code has a **canopy** (like tree cover in a forest seen from satellite):

- Dense canopy (dark green) = well-tested. You can't see the ground underneath.
- Sparse canopy (light green, holes) = partial coverage. You see patches of exposed ground.
- No canopy = bare terrain. Fully exposed.

The gaps in the canopy are WHERE specific functions lack coverage. You can zoom in and see exactly which functions are roofed vs exposed.

### The "Armor + Heat" Combination (Most Important Insight)

The killer visualization is showing BOTH activity AND protection simultaneously. This creates four quadrants that matter enormously for agent risk:

```
                    WELL-TESTED                  UNTESTED
                    (armored)                    (exposed)
              ┌─────────────────────┬─────────────────────┐
  ACTIVE      │                     │                     │
  (hot)       │   ✅ SAFE TO SEND   │  🚨 DANGER ZONE    │
              │   AGENTS HERE       │  STOP AND ADD TESTS │
              │                     │  FIRST              │
              │   warm diamond      │  glowing glass      │
              │                     │                     │
              ├─────────────────────┼─────────────────────┤
  STABLE      │                     │                     │
  (cold)      │   💤 LEAVE ALONE    │  💣 HIDDEN LANDMINE │
              │   IT'S FINE         │  LOOKS SAFE BUT     │
              │                     │  ISN'T              │
              │   cold granite      │  mossy glass        │
              │                     │                     │
              └─────────────────────┴─────────────────────┘
```

The **glowing glass** quadrant (upper-right) is the single most important thing to show. This is where agents are actively changing fragile code. Every visual encoding should make this quadrant SCREAM.

---

## 7. Risk Trajectory — Directional Indicators

### The Core Idea: Show the Derivative, Not Just the Value

Knowing something is yellow isn't enough. Is it yellow-trending-red or yellow-trending-green? The trajectory matters more than the current state.

### Representation A: Trailing Indicators (Comet Tails)

Each module has a **trail** showing where it came from risk-wise:

```
  ╭──────────╮
  │ auth/    │
  │ 🔴 RED   │◀──◀──◀── (was yellow 2 months ago, was green 6 months ago)
  │          │     trail shows trajectory: accelerating toward danger
  ╰──────────╯

  ╭──────────╮
  │ lib/     │
  │ 🟡 YELLOW│──▶──▶──▶ (was red 3 months ago, improving)
  │          │     trail shows: recovering, trending safe
  ╰──────────╯
```

The trail's color gradient tells the story: green→yellow→red means degrading. Red→yellow→green means improving. The tail length = how far back the trend extends.

### Representation B: Risk Contour Lines (Topographic)

Treat risk as elevation. Higher = more dangerous. Draw topographic contour lines on the terrain map.

Over time, the contour lines MOVE:
- **Rising terrain:** Contour lines getting closer together = risk is concentrating, steepening. A cliff forming.
- **Subsiding terrain:** Contour lines spreading out = risk is dissipating. Flattening.
- **New peak:** A contour circle appearing where there was flat ground = new risk emerging.

Show with a time scrubber: drag the slider and watch the contours shift. Like watching tectonic plates move over geological time.

### Representation C: Weathervane Arrows (Simplest & Best)

Small directional arrows on each module/file tile:

- **↗ Arrow pointing up-right (red):** Getting riskier. Bigger arrow = faster deterioration.
- **↘ Arrow pointing down-right (green):** Getting safer. Bigger arrow = faster improvement.
- **→ Arrow pointing right (gray):** Stable. No significant change in risk.
- **No arrow:** Insufficient history to determine trend.

```
  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ auth/    │   │ api/     │   │ lib/     │   │ tests/   │
  │ 🔴  ↗↗   │   │ 🟡  →    │   │ 🟢  ↘    │   │ 🟢  →    │
  └──────────┘   └──────────┘   └──────────┘   └──────────┘
   getting        stable         improving       stable
   worse fast
```

The double-arrow ↗↗ is alarming. The single-arrow ↘ is reassuring. No clutter, instant read.

### Representation D: Erosion / Growth Animation

Over a time-lapse (scrubber):
- **Growing risk:** Module visually expands and heats up, like lava slowly filling a valley
- **Shrinking risk:** Module cools and contracts, like lava hardening into stone
- **Coupling creep:** New gravity lanes (temporal coupling lines) slowly appear between modules, like cracks spreading
- **New dependency edges:** New import arrows fade in, thickening the web

Playing this animation at 10x speed over 6 months would reveal: "Oh, auth has been slowly swallowing the system. It's pulling everything toward it gravitationally. Three months ago it wasn't this connected."

---

## 8. Flaky Tests as Unreliable Protection — Cracked Shields

### The Core Idea: A Shield With Cracks Is Worse Than No Shield

Flaky tests are like armor that randomly disappears mid-battle. The protection is unreliable. This needs a DISTINCT visual from "well-tested" and "untested."

### Representation A: Flickering Shield

The protection overlay for flaky-test-guarded code **flickers.** It blinks in and out, randomly. Sometimes the shield is visible, sometimes it's not. The flicker rate corresponds to flake rate:

- 5% flake rate: Occasional, subtle flicker. You barely notice.
- 30% flake rate: Distracting, rapid flicker. Something is clearly wrong.
- 80% flake rate: Strobing. This protection is basically random.

The flicker is deeply unsettling — it creates the *feeling* of unreliability. You look at a module with flickering shields and your gut says "I don't trust this."

### Representation B: Cracked / Fractured Shield

The shield overlay has visible **fracture lines.** Like cracked glass or cracked ceramic armor:

```
  Solid shield (reliable):     Cracked shield (flaky):
      ╔═══════╗                    ╔═══╗╔══╗
      ║ UNIT  ║                    ║ UN╱╱T ║
      ║ TESTS ║                    ║ TE╲TS ║
      ║       ║                    ╠═══╝╚══╣
      ╚═══════╝                    ╚════════╝

  The cracks show: this shield MIGHT protect you.
  Or the pieces might fall off when struck.
```

### Representation C: Rust / Corrosion on Armor

Flaky tests render their protection layer with **rust spots** — orange-brown patches eating into the shield material. The more flaky tests, the more corroded the armor looks. This communicates:

- The tests existed (it was once good armor)
- They're degrading (rust is spreading)
- The protection is becoming unreliable over time
- Someone needs to maintain this armor

### Representation D: Signal Noise Visualization

Show test confidence as a **signal strength** indicator (like WiFi bars):

```
  Strong signal (reliable):    Noisy signal (flaky):       No signal (untested):
      ████                         █ █                         
      ████                         ██                          
      ████                         █  █                        
      ████                         █                           
```

The noise pattern in flaky-test-covered code reads as "there's a signal here, but it's unreliable." Clean bars = trustworthy. Choppy bars = suspicious. Empty = exposed.

### The Combined Flaky Encoding

Best approach combines subtle elements:
1. **Border treatment:** Shield border switches from solid → dashed (cracked)
2. **Opacity oscillation:** Gentle, slow breathe-in/breathe-out opacity change (5-10% range)
3. **Color shift:** Shield hue shifts slightly toward amber/orange (rust)
4. **Badge:** Small ⚡ icon on the tile (lightning = intermittent)

This way, from a distance you see "something's off with that shield." Up close you see exactly what.

---

## 9. Cross-Cutting Visualizations — Where Dimensions Combine

The individual encodings above become powerful when layered:

### The "Agent Go/No-Go" Dashboard View

A single-screen view for deciding "should I send an agent into this area?"

```
┌─────────────────────────── AGENT MISSION BRIEFING ──────────────────────────┐
│                                                                              │
│  Target: src/auth/                                                          │
│                                                                              │
│  ┌─── MATERIAL ───┐  ┌─── ACTIVITY ────┐  ┌─── PROTECTION ──┐             │
│  │                 │  │                  │  │                  │             │
│  │  ██████████     │  │  ████░░░░████   │  │  ╔══╗  ╔╱═╗     │             │
│  │  Wood (60%      │  │  Two burst      │  │  ║OK║  ║⚡ ║     │             │
│  │  coverage →     │  │  periods,       │  │  ╚══╝  ╚══╝     │             │
│  │  moderate       │  │  currently      │  │  middleware:     │             │
│  │  integrity)     │  │  HOT            │  │  solid           │             │
│  │                 │  │                  │  │  session: flaky  │             │
│  └─────────────────┘  └──────────────────┘  └──────────────────┘             │
│                                                                              │
│  ┌─── COUPLING ────────────────────────────────────────────────┐             │
│  │                                                              │             │
│  │  auth.ts ═══▶ handler.ts ═══▶ db.ts          (static)      │             │
│  │  auth.ts ~~~▶ oauth.ts                       (94% temporal) │             │
│  │  auth.ts ~~~▶ session.ts                     (87% temporal) │             │
│  │                                                              │             │
│  └──────────────────────────────────────────────────────────────┘             │
│                                                                              │
│  ┌─── TRAJECTORY ──┐  ┌─── VERDICT ─────────────────────────┐              │
│  │                  │  │                                      │              │
│  │  6mo: 🟢 → 🟡 → 🔴 │  │  🔴 DO NOT SEND AGENT UNSUPERVISED  │              │
│  │  ↗↗ accelerating │  │                                      │              │
│  │                  │  │  Reasons:                            │              │
│  │                  │  │  - Active churn + flaky tests        │              │
│  │                  │  │  - 2 implicit couplings agent will   │              │
│  │                  │  │    miss                              │              │
│  │                  │  │  - Risk trajectory worsening         │              │
│  └──────────────────┘  └──────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### The "Test Coverage vs Change Hotspot" Heat Correlation Map

A scatter-plot-style overlay where:
- **X-axis:** Churn rate (how often it changes)
- **Y-axis:** Test coverage depth
- **Each dot:** A file/module
- **Dot size:** Blast radius (bigger = more downstream impact)

```
  Coverage ▲
    100%   │  ●           ● ●  ●        ← SAFE: high coverage, high churn
           │     ●    ●
     50%   │  ●     ●        ●  ●       ← WARNING: moderate coverage, moderate churn
           │          ●
      0%   │      ●     ●  ⬤     ●     ← DANGER: low coverage, high churn (⬤ = big blast)
           └──────────────────────────▶ Churn
                low              high
```

The lower-right quadrant is where you look for trouble. Big dots in the lower-right are sirens.

---

## 10. Interaction Design — How You Navigate This

### Modes

1. **Terrain Mode (default):** Bird's eye. Material + activity encoding. Quick scan.
2. **Flow Mode (click entity):** Node-wire view centered on selection. Shows coupling.
3. **Delta Mode (PR context):** Seismic/construction overlay showing what changed.
4. **Timeline Mode (scrubber):** Animated evolution of terrain over time.

### Overlay Toggles (keyboard shortcuts)

| Key | Overlay | What it shows |
|-----|---------|--------------|
| `1` | Safety Rating | Current risk level (green/yellow/red material) |
| `2` | Activity/Heat | Churn intensity (ember glow / cold granite / moss) |
| `3` | Protection | Test coverage as shield/armor layer |
| `4` | Coupling | Gravity lanes for temporal coupling |
| `5` | Trajectory | Directional arrows showing risk trend |
| `6` | Blast Radius | Seismic rings showing change propagation |

### Progressive Disclosure

- **Distance (zoomed out):** See material quality + color temperature only. "Where are the hot fragile zones?"
- **Medium zoom:** See individual files. Shields become visible. Coupling lanes appear.
- **Close zoom:** See entity-level detail. Shield cracks visible. Individual function heat. Resonance lines.
- **Click:** Open flow view / detail panel with full metrics.

---

## 11. Design Principles Summary

1. **Parallel visual channels beat sequential text.** Use material, color, animation, spatial position, opacity, border, and size simultaneously. Humans process these in parallel.

2. **Metaphors must be consistent.** Everything derives from "codebase is terrain." Don't mix metaphors — no dashboards, no spreadsheet-thinking. Stay in the world.

3. **The most important thing to show is the COMBINATION of change + confidence.** Not either one alone. Hot+fragile is the killer insight. Cold+solid is boring (good). These combos need distinct visual signatures.

4. **Animation communicates liveness and uncertainty.** Static = certain/stable. Pulsing = active/changing. Flickering = unreliable. These map perfectly to change and confidence dimensions.

5. **Temporal coupling is the hardest to show and the most valuable.** It's invisible in code. It must be FELT not just labeled. Resonance and gravitational pull metaphors make the invisible tangible.

6. **Trajectory matters more than state.** A green module trending red is more alarming than a yellow module that's been yellow forever. Always show the derivative.

7. **The viz should feel like a living organism, not a dashboard.** The codebase breathes, grows, erodes, and heals. The visual language should reflect this organic quality.

---

## 12. What to Build First

Given Strata's current state (circle-packing terrain map + diff analysis working):

1. **Material encoding on existing terrain map** — Replace uniform color fill with material-quality rendering (opacity for coverage, glow for activity, texture for churn variability). This enhances the existing view without changing layout.

2. **Temporal coupling gravity lanes** — Add animated curved lines for implicit coupling on the terrain map. Toggle with keyboard. Biggest differentiation from any existing tool.

3. **PR delta construction overlay** — When in diff mode, render changed files with construction-tape borders + ripple rings for blast zone. Connects to existing `strata diff` data.

4. **Risk trajectory arrows** — Small directional indicators on tiles. Requires storing 2+ snapshots over time (new infrastructure, but simple — just `.sv` file diff between analysis runs).

5. **Flaky test flickering** — Requires test flakiness data (new signal), but the rendering is trivial once you have it.

---

## 13. Research References & Prior Art to Study

- **Gource** — Git history as animated tree growth. Beautiful but doesn't encode risk/coverage.
- **CodeCity / Software Cartography** — 3D city metaphor for code. Buildings = classes. Height = complexity. Good spatial encoding, but loses material quality.
- **Flame graphs** — Width = time, depth = call stack. Perfect for one dimension, doesn't combine with coverage.
- **Unreal Blueprints** — Node-wire for game logic. Best existing reference for flow view. Study how they handle density and subgraph scoping.
- **Observable Plot** — Declarative visualization library. Study their encoding channels.
- **Windy.com** — Weather visualization. Study how they layer wind (animation), temperature (color), pressure (contours). This is the gold standard for multi-channel geo visualization.
- **John Snow's cholera map** — The original data viz. Spatial encoding revealed invisible structure (the pump). Temporal coupling viz should aspire to this.
