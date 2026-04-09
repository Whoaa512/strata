# Visual Design Language: Org Shape, Agentic Steering, and Unified Visual Language

> Brainstorm for Strata's agentic IDE of the future.
> Focus: Human/Org shape as visual territory, the agent steering interface, and how ALL dimensions compose into one coherent visual system.
>
> Builds on: `visual-design-language-brainstorm.md` (terrain metaphor, change shape, confidence shape)
> References: `codebase-dimensions-landscape.md` (dimension #11: Human/Org Shape)

---

## Part I: Human / Org Shape — Who Owns This Land?

### The Core Insight

A codebase is not just structure and behavior. It's a *social artifact*. Every file has an author trail, a review history, an expertise gradient. The question "who can safely change this?" is as important as "what does this connect to?"

For agent steering, org shape answers: **"If the agent breaks this, who do I pull in? And is anyone even there?"**

### 1. Ownership as Territory — The Political Map

**Metaphor: Political geography.** Countries have borders, capital cities, contested regions, and uninhabited wilderness. A codebase's org shape is the same.

**Visual encoding:**

| Signal | Visual Channel | Encoding |
|--------|---------------|----------|
| Primary owner (CODEOWNERS) | Background tint (hue) | Each team/person gets a consistent hue. Tint bleeds into the terrain. |
| Ownership strength | Saturation | Strong owner (many recent reviews) = vivid. Weak/stale = desaturated, approaching gray. |
| Bus factor | Border pattern | Bus factor 1: dashed red border ("fragile sovereignty"). Bus factor 2-3: solid. Bus factor 4+: thick/confident. |
| Contested territory | Hatching/crosshatch | Multiple frequent authors with no clear owner → diagonal hatching, mixing their hues. |
| Abandoned territory | Desaturation + moss texture | No commits/reviews in >6 months → the terrain color fades toward gray-green. Like an abandoned building overgrown with moss. |
| Expert-required zone | Icon badge | ⚠ or 🔬 badge on nodes that have high complexity + single expert contributor. "Only one person understands this." |

**Concrete example:**

```
┌──────────── src/auth/ ─────────────────────────────────┐
│                                                         │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │  session.ts  │  │  middleware.ts  │  │  oauth.ts    │ │
│  │  ██████████  │  │  ░░░░░░░░░░░░  │  │  ▒▒▒▒▒▒▒▒▒  │ │
│  │  BLUE vivid  │  │  BLUE faded    │  │  CROSSHATCH  │ │
│  │  (Alice: 42  │  │  (Alice: last  │  │  (Alice+Bob  │ │
│  │   commits,   │  │   touch 8mo    │  │   equal      │ │
│  │   5 reviews) │  │   ago — STALE) │  │   commits)   │ │
│  │  ┄┄┄┄┄┄┄┄┄  │  │  ╌╌╌╌╌╌╌╌╌╌╌  │  │  ───────────│ │
│  │  bus=1 🔬    │  │  bus=1 ⚠       │  │  bus=2       │ │
│  └─────────────┘  └────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

Session: Alice owns it solidly (vivid blue), but she's the only one (bus=1, dashed border, expert badge).  
Middleware: Same owner but stale — the blue has faded toward gray-green. Nobody's been here.  
OAuth: Contested territory — crosshatch of two colors. But bus=2 is actually healthier.

### 2. The Ownership Gradient — Heat Map of Human Attention

Beyond binary "who owns it," show **how much human attention flows here.**

**Encoding: A warmth layer** (separate from the activity/churn warmth layer):

- **Warm (amber glow):** Actively reviewed, multiple recent contributors, healthy discussion in PRs.
- **Cool (blue-gray):** Code exists, gets occasionally touched, but reviews are rubber-stamps or missing.
- **Cold (dark, nearly invisible):** Nobody has meaningfully reviewed or changed this in a long time. It still runs. It might be fine. But nobody's watching.

**The insight:** Combine org-warmth with risk. A RED-risk module that's ORG-COLD is the worst combination — high danger, nobody watching. A RED-risk module that's ORG-WARM is at least being actively managed.

```
               Risk LOW              Risk HIGH
           ┌────────────────┬────────────────────┐
Org WARM   │  Healthy       │  Actively managed   │
           │  (boring, good)│  (somebody's on it)  │
           ├────────────────┼────────────────────┤
Org COLD   │  Stable legacy │  ██ DANGER ZONE ██  │
           │  (fine... prob) │  (high risk, nobody  │
           │                │   watching)           │
           └────────────────┴────────────────────┘
```

**This 2×2 is the single most important org-shape insight.** The bottom-right quadrant is where agents will cause the most damage and where the system has the least ability to self-correct.

### 3. PR Review Latency as Response Time

**Metaphor: Emergency response.** Some neighborhoods have fire stations nearby (fast review, fast fix). Others are in the wilderness (a PR sits for days, nobody reviews).

**Visual encoding:**

- Small clock icon on territories with review latency >48h.
- The clock subtly fills (like a loading bar) based on average review wait time.
- Fast review (<4h): No indicator (absence = health).
- Medium review (4-48h): Small translucent clock.
- Slow review (>48h): Visible, filled clock. The territory feels "far from help."

For agent steering: if you're about to change code in a slow-response territory, the human needs to know that course-corrections will be slow. The feedback loop is stretched.

### 4. Expertise Density — The Knowledge Topology

Not just "who owns this" but "how much does the team collectively understand this?"

**Signals to extract:**
- Number of distinct meaningful contributors (>3 commits)
- Review comment depth (substantive vs LGTM)
- Whether the same people who wrote it also review it (healthy) vs different people review it (potential understanding gap)
- Code age vs author tenure (if the author left the company, that's a knowledge hole)

**Visual encoding: Terrain elevation metaphor.**

High expertise density = elevated terrain (plateaus, hills). The ground is built up by accumulated knowledge.  
Low expertise density = valleys, depressions. The ground is thin.

This layers naturally on the existing circle-packing terrain: expertise-dense areas appear "raised" (subtle shadow, highlight on upper edge), while thin-knowledge areas appear "sunken" (darker, no highlight, subtle inward shadow).

### 5. The "Who Do I Call?" Overlay

When a human is deciding whether to let an agent proceed, one critical question: **"If this goes wrong, who can fix it?"**

**Interaction:** hover over a risk zone → see a small "responder" card:

```
┌─── RESPONDERS for src/auth/ ───┐
│                                  │
│  🟢 Alice Chen (primary, active) │
│     Last review: 2 days ago      │
│     Response: ~3h avg            │
│                                  │
│  🟡 Bob Park (secondary)         │
│     Last touch: 3 months ago     │
│     Response: ~12h avg           │
│                                  │
│  No tertiary owner.              │
│  Bus factor: 2                   │
│  ⚠ Alice on PTO this week       │
│                                  │
│  Effective bus factor: 1 (Bob)   │
└──────────────────────────────────┘
```

This is information you can't get from the code. It requires integration with CODEOWNERS, git history, calendar/status (PTO), and review history. But it directly answers: **"Should I let this agent run at 2am on a Friday when Alice is on vacation?"**

---

## Part II: The Agentic Steering Interface

### The Core Problem

An agent is about to change code. The human needs to make a decision in seconds:

1. **Let it run** (delegate fully)
2. **Let it run, but watch** (delegate with monitoring)
3. **Review the plan first** (human approval required)
4. **Stop — I need to think about this** (human takes over)

The visual interface must give the human enough information to make this call **before** the agent writes a single line. Not after. Not during code review. **Before.**

### 6. The Blast Preview — "What Will This Touch?"

**Trigger:** The human says "change X" or the agent proposes a change plan.

**What the IDE shows instantly:**

The terrain map highlights the **blast zone** — every file/entity the agent will directly touch, plus everything connected by static deps, temporal coupling, and implicit coupling.

```
BLAST PREVIEW — "Refactor auth middleware to use new token format"

┌─────────────────────────────────────────────────────────┐
│                                                          │
│   ┌───────────┐                                         │
│   │ middleware │  ← DIRECT CHANGE (solid bright border)  │
│   │  .ts      │                                         │
│   └─────┬─────┘                                         │
│         │                                                │
│   ┌─────▼─────┐  ┌──────────┐  ┌──────────────┐        │
│   │ session   │  │ handler  │  │ rate-limit   │        │
│   │  .ts      │  │  .ts     │  │  .ts         │        │
│   │ (static)  │  │ (static) │  │ (static)     │        │
│   └───────────┘  └──────────┘  └──────────────┘        │
│                                                          │
│   ┌──────────┐  ┌──────────┐    ← IMPLICIT              │
│   │ oauth.ts │  │ api-keys │    (dashed pulsing border,  │
│   │ ~~94%~~  │  │  .ts     │     the agent will MISS     │
│   │ temporal │  │ ~~72%~~  │     these without guidance)  │
│   └──────────┘  └──────────┘                             │
│                                                          │
│   ┌──────────────────────────────────┐                   │
│   │ tests/auth.test.ts  ✅ covers    │                   │
│   │ tests/session.test.ts ⚠ partial │                   │
│   │ tests/oauth.test.ts  ❌ missing  │ ← TEST COVERAGE  │
│   │ tests/rate-limit.test.ts ❌ none │   of blast zone   │
│   └──────────────────────────────────┘                   │
│                                                          │
│   VERDICT: 🟡 YELLOW — agent can proceed, but must       │
│   be given explicit context about oauth.ts + api-keys.ts │
│   Test gap in rate-limit.ts should be flagged.           │
└──────────────────────────────────────────────────────────┘
```

**Visual channel allocation for blast preview:**

| Zone Type | Border | Fill | Animation | Opacity |
|-----------|--------|------|-----------|---------|
| Direct change target | Thick solid, high contrast | Bright accent (purple/white) | None (solid = certain) | 100% |
| Static dependents | Medium solid | Muted accent | None | 80% |
| Temporal coupling (agent will likely hit) | Medium dashed | Warm amber | Slow pulse | 70% |
| Implicit coupling (agent will likely MISS) | Thin dashed | Cool red-orange | Fast pulse | 60%, attention-grabbing |
| Unaffected code | No border change | — | None | Dims to 20-30% |

**The key insight: animation speed encodes agent-miss-likelihood.** Fast-pulsing = the agent is almost certainly going to miss this. Slow-pulsing = the agent might handle it but should be checked.

### 7. The Confidence Meter — "How Likely Is Success?"

Not a simple green/yellow/red traffic light. A **composite confidence gauge** that decomposes into its contributing signals.

**Design: Stacked bar + decomposition.**

```
AGENT CONFIDENCE for this change:

  ████████████░░░░░░░░░░░  52%  MODERATE
  ├─ Static coverage:  ████████████████████░  85%
  ├─ Implicit coverage: █████░░░░░░░░░░░░░░  30%
  ├─ Test confidence:    ████████░░░░░░░░░░░  45%
  ├─ Owner available:    ████████████████░░░░  78%
  └─ Domain complexity:  ██████████░░░░░░░░░  55%
```

Each sub-bar is clickable — drill into "why is implicit coverage only 30%?" and it shows you the specific temporal couplings the agent plan doesn't address.

**Progressive disclosure:**
- **Glance (1 second):** Single bar + percentage + color. "52% moderate."
- **Scan (5 seconds):** See which sub-dimensions are dragging it down.
- **Investigate (30 seconds):** Click into a sub-bar to see specific files/entities.

### 8. The Danger Zone Overlay — Domain-Specific Risk

Some code is dangerous not because of its structure but because of its *domain*. Auth, billing, PII, rate limiting, idempotency — touching these wrong has outsized consequences.

**Visual encoding: A hazard aura.**

Domain-dangerous code gets a subtle glow/aura that's visible even when zoomed out on the terrain map. The glow color indicates the danger type:

| Domain | Aura Color | Rationale |
|--------|-----------|-----------|
| Auth/Security | Red-orange | Universal danger color |
| Billing/Payment | Gold/amber | Money = gold |
| PII/Privacy | Purple | GDPR purple (established convention in compliance tools) |
| Data writes | Deep red | Destructive potential |
| External APIs | Electric blue | External = uncontrollable |
| Rate limiting | Amber stripes | Caution tape |
| Feature flags | Cyan flicker | Conditional/unstable |

The aura is always-on in a subtle way (low opacity, ~15%) so you always feel when you're near dangerous territory. When the blast preview activates, dangerous zones in the blast radius get their aura intensified to full opacity.

**Combined with blast preview, this gives you:**

"The agent is going to change middleware.ts. The blast zone includes billing-adjacent code (gold aura, 80% opacity) and an auth path (red-orange aura). The agent's plan doesn't mention either of these domain concerns."

### 9. The Agent Work Visualization — Watching It Execute

Once you've approved the agent's plan, the IDE should show *what the agent is doing in real time* on the terrain map.

**Metaphor: Construction crews on the map.**

- **Active file:** The entity the agent is currently editing pulses with a bright "work light" effect (similar to how construction sites have floodlights at night).
- **Completed files:** Transition from "work light" to a subtle green checkmark or green border (done, tests passed) or amber border (done, tests pending/failing).
- **Queued files:** Show a subtle outline — these are in the plan but not yet touched.
- **Unexpected touches:** If the agent touches a file NOT in the original blast preview, it gets a **red flash border** — "the agent has gone off-plan." This is critical for human monitoring.

```
AGENT WORKING — 3/7 files complete

  ┌──────────────┐   ✅ done
  │ middleware.ts │
  └──────────────┘

  ┌──────────────┐   🔨 active (pulsing work light)
  │ session.ts   │
  └──────────────┘

  ┌──────────────┐   ⏳ queued (faint outline)
  │ handler.ts   │
  └──────────────┘

  ┌──────────────┐   🔴 UNEXPECTED — agent touched this
  │ config.ts    │      but it wasn't in the plan!
  └──────────────┘
```

**The key affordance:** The human can click on the "UNEXPECTED" indicator and instantly see a diff. They can then decide: "that makes sense, continue" or "stop, something's wrong."

### 10. The Steering Interaction Flow

The full human-agent steering loop as an interaction sequence:

```
1. INTENT        Human: "Refactor auth to use JWT"
                 ↓
2. PREVIEW       IDE: Shows blast preview on terrain map.
                 Agent confidence: 52%. Implicit risks highlighted.
                 Domain dangers: auth (red-orange aura), session (amber).
                 Org context: Alice (primary) on PTO, Bob available.
                 ↓
3. DECISION      Human sees the visual and makes a call:
                 [Delegate] [Watch] [Review Plan] [Take Over]
                 ↓
4. REFINEMENT    Human: "Also update oauth.ts, the implicit coupling"
   (optional)    IDE: Blast preview updates. Confidence rises to 68%.
                 ↓
5. EXECUTION     Agent begins work. Terrain map shows progress.
                 Active file glows. Completed files get checkmarks.
                 ↓
6. ALERT         Agent touches unexpected file → red flash.
   (if needed)   Human: [Continue] [Pause] [Rollback]
                 ↓
7. REVIEW        Agent finishes. IDE shows before/after terrain diff.
                 What changed: structural comparison overlaid on map.
                 What got missed: implicit couplings NOT addressed
                 highlighted with a "still pulsing" indicator.
                 ↓
8. DEPLOY        Human: "Ship it" or "Agent, fix these missed files too"
                 → Loop back to step 2 with narrower scope.
```

**Each step has a visual state on the terrain map.** The map is not a passive display — it's the control surface. The human reads the map, makes decisions, and watches outcomes, all in the same visual space.

---

## Part III: Unified Visual Language — Composing All Dimensions

### The Fundamental Challenge

Strata has identified 17 dimensions. Each dimension could be its own visualization. Showing them all simultaneously would be visual noise — a 17-dimensional encoding exceeds any human's parallel processing capacity.

But showing them one at a time (current overlay toggle approach) loses the *combinations* that matter most. "High churn + low test coverage + no owner + auth domain" is a very different signal than any of those facts alone.

**The answer is NOT "show everything." The answer is "show the right projection for the current task."**

### 11. The Layer Architecture — What Is Always On, What Is On-Demand

Bertin's semaphiology distinguishes **levels of information** by how essential they are to the reading. Tufte's principle of smallest effective difference says: encode only as much as needed, no more.

**Three tiers:**

#### Tier 1: Always On (The Base Map)

These are encoded into the terrain itself. You can't turn them off. They're like the ground you're standing on.

| Dimension | Visual Channel | Why Always-On |
|-----------|---------------|---------------|
| File/entity structure | Position, containment (circle-packing layout) | This IS the map. Without it, nothing has spatial meaning. |
| Entity size (LOC) | Circle radius | Establishes visual weight. Bigger = more code = more context cost. Always relevant. |
| Safety rating (green/yellow/red) | Fill color hue | THE core output of Strata. Always visible. The single most important encoding. |
| Safety rating confidence | Fill color saturation | Vivid = high confidence in the rating. Muted = "we're guessing." |

**That's it.** Four things. Position, size, hue, saturation. The base map is minimal and high-signal.

#### Tier 2: Context Layers (Toggled, But Composable)

These are overlays you activate based on what question you're asking. Multiple can be active simultaneously — they use different visual channels so they don't fight.

| Dimension | Visual Channel | Toggle Key | Composable With |
|-----------|---------------|------------|-----------------|
| Ownership/org shape | Background tint + border pattern | `O` | Everything (uses background, won't fight fill) |
| Activity/churn heat | Glow intensity (outer glow on circles) | `H` | Everything (glow is separate from fill) |
| Test confidence | Border thickness + style | `T` | Everything (border channel is separate) |
| Temporal coupling | Connecting lines (curves between circles) | `C` | Everything (line layer sits above circles) |
| Blast radius | Concentric rings around selected entity | `B` | Everything (rings are a separate layer) |
| Domain danger | Aura/haze around regions | `D` | Everything (semi-transparent overlay) |
| Risk trajectory | Small arrow badge on entities | `→` | Everything (icon layer) |

**The key: each overlay uses a DIFFERENT visual channel.** This is Bertin's retinal variables principle applied rigorously.

You can have ownership (tint) + activity (glow) + test confidence (border) + temporal coupling (lines) active simultaneously, and they don't interfere because they occupy separate perceptual channels.

But — cognitive load. More than 3-4 simultaneous overlays will overwhelm. The UI should have **presets:**

| Preset | Active Layers | When to Use |
|--------|--------------|-------------|
| **Risk Scan** | Safety rating + activity + test confidence | "Where are the danger zones?" |
| **Org Health** | Safety rating + ownership + risk trajectory | "Who's watching what? Where are the gaps?" |
| **Agent Prep** | Safety rating + temporal coupling + domain danger | "What will the agent miss?" |
| **Change Review** | Safety rating + blast radius + test confidence + temporal coupling | "Is this PR safe?" |

#### Tier 3: On-Demand / Drill-Down (Activated by Interaction)

These appear only when you click, hover, or enter a specific mode. They're too detailed for the map view.

| Dimension | Trigger | Display |
|-----------|---------|---------|
| Entity-level metrics (cyclomatic, cognitive, params) | Click entity | Detail panel |
| Full caller/callee graph | Click entity, press `F` | Flow view overlay |
| Churn timeline (growth rings) | Click entity/file | Timeline sparkline in detail panel |
| Runtime paths (HTTP → handler → DB) | Enter runtime mode | Full-screen flow diagram |
| Data access patterns | Enter data mode | Colored data-flow lines |
| PR review history | Click entity in org mode | Review timeline in panel |
| Implicit coupling details | Click coupling line | Confidence %, co-change history |

### 12. The Visual Channel Budget — A Formal Allocation

Inspired by Bertin's retinal variables and Munzner's channel effectiveness ranking:

```
VISUAL CHANNEL ALLOCATION TABLE
════════════════════════════════════════════════════════════════

Channel              Effectiveness  Assigned To           Tier
─────────────────────────────────────────────────────────────
Position (x,y)       ★★★★★         File/module structure  T1 (always)
Size (radius)        ★★★★★         LOC / code volume      T1 (always)
Color Hue            ★★★★☆         Safety rating          T1 (always)
Color Saturation     ★★★★☆         Rating confidence      T1 (always)
Color Lightness      ★★★☆☆         RESERVED (accessibility T1 fallback)
─────────────────────────────────────────────────────────────
Border thickness     ★★★☆☆         Test confidence        T2 (toggle)
Border style         ★★★☆☆         Bus factor / ownership T2 (toggle)
  (solid/dash/dot)                  strength
Background tint      ★★★☆☆         Owner identity         T2 (toggle)
Outer glow           ★★☆☆☆         Churn/activity heat    T2 (toggle)
Connecting lines     ★★★☆☆         Coupling (static +     T2 (toggle)
  (curves)                          temporal)
Line style           ★★★☆☆         Coupling type          T2 (toggle)
  (solid vs dashed)                 (static vs implicit)
Concentric rings     ★★☆☆☆         Blast radius           T2 (toggle)
Aura/haze            ★★☆☆☆         Domain danger           T2 (toggle)
Icon badge           ★★☆☆☆         Risk trajectory, bus   T2 (toggle)
                                    factor, expert-needed
─────────────────────────────────────────────────────────────
Opacity              ★★★★☆         Focus/defocus          T2 (context)
                                    (dims non-relevant 
                                    items in any mode)
Animation: pulse     ★★★☆☆         Agent activity /       T2 (agent mode)
                                    implicit-miss warning
Animation: flicker   ★★☆☆☆         Flaky test coverage    T2 (toggle)
Blur                 ★★☆☆☆         Depth of field /       T3 (interaction)
                                    attention funnel
Shadow (inner)       ★☆☆☆☆         Expertise depth        T3 (drill-down)
Texture/pattern      ★☆☆☆☆         RESERVED               future
Orientation          ★☆☆☆☆         RESERVED               future
Shape (non-circle)   ★★★☆☆         Entity kind            future
                                    (fn vs class vs route)
─────────────────────────────────────────────────────────────

CONFLICT-FREE COMPOSITIONS (verified):
  Safety (hue) + Ownership (tint) + Activity (glow) + Tests (border)
  Safety (hue) + Coupling (lines) + Blast (rings) + Domain (aura)
  Safety (hue) + Org (tint+border) + Trajectory (badge) + Agent (pulse)

CONFLICTING COMBINATIONS (avoid):
  Ownership hue + Safety hue (both use color → fight)
    → Resolved by: ownership uses TINT (background bleed),
      safety uses FILL (foreground). Different visual layers.
  Activity glow + Domain aura (both are outer effects → may blur together)
    → Resolved by: activity glow is tight (2-4px), domain aura is wide (20-40px).
      Different radii. But recommend not stacking at high intensity.
```

### 13. The Attention Budget — Reducing to What Matters Now

The whole point of Strata is NOT to show everything. It's to show what matters for the current decision.

**Mechanism: The Attention Funnel.**

When a user enters any task-oriented mode (agent preview, PR review, risk scan), the IDE applies an attention funnel:

1. **Everything outside the relevant zone dims to 20-30% opacity.** It's still there — you can see the map structure — but it's muted, like peripheral vision.

2. **The relevant zone stays at full opacity.** This is the blast zone, or the risk cluster, or the ownership territory you're examining.

3. **Within the relevant zone, entities sort by attention-need.** Red items are visually prominent (full saturation, glow, strong border). Yellow items are present but less loud. Green items are slightly muted — they're in the zone but they're fine.

**This is Tufte's "erase non-data-ink" principle applied dynamically.** Instead of erasing permanently, we modulate opacity based on relevance.

**Depth of field analogy:** Like a camera focusing on a subject. The background blurs. You see it, but your eye is drawn to the sharp subject. In our case, "sharpness" = full opacity + full saturation + full border detail. "Blur" = low opacity, desaturated, no border detail.

```
WITHOUT attention funnel (everything at full intensity):
  🔴🟡🟢🔴🟢🟢🟡🟢🔴🟡🟢🟢🟢🟡🟢🔴🟢🟢🟡🟢🟢🟢🟢🟡🟢🟢
  (Overwhelming. Where do I look? Everything is competing.)

WITH attention funnel (focused on auth module blast zone):
  ░░░░🔴🟡░░░🔴░░░░░░░░░░░░░░░░░░
         ^^      ^
   (Background faded. Only blast zone entities are vivid.
    My eye goes immediately to the two red items.)
```

### 14. The Fog of War — What Strata Doesn't Know

Equally important to showing what we know: **showing what we DON'T know.**

Some regions of the codebase are poorly analyzed:
- No git history (new files, vendored code)
- No test linkage (can't determine coverage)
- Extraction errors (TypeScript compiler couldn't parse)
- No CODEOWNERS entry
- No runtime analysis

**Visual encoding: Literal fog.**

Regions with low analysis confidence get a semi-transparent fog overlay. The denser the fog, the less Strata knows about that area.

```
  Clear terrain (well-analyzed):     Foggy terrain (uncertain):
  ┌──────────────┐                   ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
  │ 🔴 session   │                   ╎  ░░░░░░░░░░░░  ╎
  │  ripple: 8.2 │                   ╎  ░ vendor/ ░░  ╎
  │  tests: weak │                   ╎  ░░░░░░░░░░░░  ╎
  └──────────────┘                   └╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
                                      (fog = "we don't really
                                       know what's in here")
```

**For agent steering:** Fog is a strong risk signal. An agent changing code in or near foggy regions is operating blind. The human should know: "Strata can't tell you the blast radius here because the analysis was incomplete."

### 15. The Lens Metaphor vs The Layer Metaphor

Two competing UX metaphors for dimension switching:

**Layers (Photoshop model):**
- Toggle individual overlays on/off.
- Combine freely.
- Pro: Maximum flexibility.
- Con: Combinatorial explosion. Users don't know which layers to stack.

**Lenses (Camera model):**
- Pre-composed views optimized for a question.
- "Risk lens," "Org lens," "Agent lens," "Change lens."
- Pro: Opinionated, guided. Each lens is tested to be readable.
- Con: Less flexibility. Power users feel constrained.

**Recommendation: BOTH, with lenses as primary and layers as advanced.**

Default UX: Pick a lens (4-5 presets that compose well-tested layer combinations).  
Power UX: Press `L` to enter layer mode, toggle individual channels.

```
LENS BAR (default mode):
  [Risk Scan] [Org Health] [Agent Prep] [Change Review] [Custom ▾]

LAYER PANEL (advanced mode, press L):
  ☑ Safety rating (always on)
  ☐ Ownership
  ☑ Activity heat
  ☐ Test confidence
  ☐ Temporal coupling
  ☐ Blast radius
  ☐ Domain danger
  ☐ Risk trajectory
  ☐ Fog of war
```

### 16. Composing the Full Picture — The Unified Visual Space

**The Base Map:**
Circle-packing treemap. Position = file/module hierarchy. Size = code volume. Color = safety rating. This never changes.

**The Mid-Ground (Context Layers):**
Toggled overlays using non-conflicting visual channels: tint, glow, border, lines, rings, aura, badges. Composable up to 3-4 simultaneously.

**The Foreground (Interactive Overlays):**
Blast preview, agent progress, attention funnel, fog of war. These are mode-specific and take priority when active.

**The Chrome (Panels & Controls):**
Detail panel (right sidebar). Confidence meter. Responder card. Lens bar. Layer panel. These are UI — not part of the map.

```
LAYER STACK (back to front):

  ┌───────────────────────────────────────┐
  │  CHROME (panels, controls, meters)     │  ← UI elements
  ├───────────────────────────────────────┤
  │  FOREGROUND                            │  ← Blast preview,
  │  (interactive overlays)                │     agent progress,
  │  Attention funnel (opacity mask)       │     fog of war
  ├───────────────────────────────────────┤
  │  MID-GROUND                            │  ← Ownership tint,
  │  (context layers)                      │     coupling lines,
  │  Composable, togglable                 │     domain aura,
  │                                        │     activity glow
  ├───────────────────────────────────────┤
  │  BASE MAP                              │  ← Circle-packing,
  │  (always on)                           │     position, size,
  │  Position + Size + Hue + Saturation    │     safety color
  └───────────────────────────────────────┘
```

### 17. The "Safe to Delegate" Spectrum — The Core Visual Output

Everything above converges on ONE question: **"Can I trust the agent here?"**

This must be the clearest, most immediate visual signal in the entire system.

**Current Strata approach:** Green / Yellow / Red traffic light on entities. Good start. But the spectrum needs more nuance for agent steering.

**Proposed 5-point spectrum with distinct visual signatures:**

| Level | Label | Visual Signature | Meaning |
|-------|-------|-----------------|---------|
| 1 | **AUTO** | Green fill, no border emphasis, slightly muted. The entity almost disappears — by design. | Fully delegatable. Agent can change this without human review. Low risk, good tests, low coupling. |
| 2 | **GLANCE** | Green-yellow fill, thin border. Visible but not demanding. | Agent can proceed; human should glance at the diff. Quick scan, not deep review. |
| 3 | **REVIEW** | Yellow fill, medium border, subtle pulse. Your eye is drawn here but it's not alarming. | Human should review the agent's work in this area. Moderate risk or coupling. |
| 4 | **COLLABORATE** | Orange fill, thick border, steady glow. Clearly demands attention. | Human and agent should work together. High coupling, domain risk, or weak tests. Human provides context, agent executes. |
| 5 | **HUMAN** | Red fill, thick dashed border, prominent glow. Unmissable. | Human must do this themselves or pair very closely with agent. Critical domain, no tests, single expert, high blast radius. |

**Why 5 levels, not 3:**

The current 3-level (green/yellow/red) loses the most actionable distinction: the difference between "auto-merge" and "glance at the diff" (both currently green), and between "review carefully" and "you'd better do this yourself" (both currently red).

The 5-point scale maps to **specific human actions**, not abstract risk levels.

### 18. Interaction Summary — The Complete Steering Flow Visuals

```
STATE 1: EXPLORING
  Map: Base map only. Safety colors. Maybe one lens active.
  Human: Understanding the codebase shape.
  Key visual: Circle-packing terrain, safety hue, LOD-based detail.

STATE 2: PLANNING (agent preview mode)
  Trigger: Human describes a change intent.
  Map: Attention funnel activates. Blast zone highlighted.
         Implicit couplings pulse. Domain auras intensify.
         Ownership tint fades in on blast zone.
         Fog of war visible on uncertain regions.
  Chrome: Confidence meter appears. Responder card available.
  Key visual: Vivid blast zone against dimmed background.
  Human action: [Delegate] [Watch] [Review Plan] [Take Over]

STATE 3: EXECUTING (agent working)
  Trigger: Human approves the plan.
  Map: Blast preview stays. Active file pulses with work light.
         Completed files get green check border.
         Unexpected touches flash red.
  Chrome: Progress indicator. Live diff stream.
  Key visual: "Construction site" on the map — visible activity.
  Human action: [Continue] [Pause] [Rollback] (on unexpected touches)

STATE 4: REVIEWING (agent finished)
  Trigger: Agent completes work.
  Map: Before/after delta overlay. Changed entities have
         construction-tape borders. Newly created entities glow.
         Still-pulsing implicit couplings = things agent MISSED.
  Chrome: Full diff. Test results. Shape delta summary.
  Key visual: What changed, what still needs attention.
  Human action: [Accept] [Request fixes] [Manual cleanup] [Loop back to Step 2]
```

---

## Part IV: Design Principles for the Unified System

### P1: One Map, Many Readings

The spatial layout (circle-packing treemap) is the constant. Everything else is a "reading" of that same terrain. You never leave the map to see ownership, or coupling, or agent progress. The map IS the interface. Different lenses give you different readings of the same territory.

### P2: The Most Important Channel Is Opacity

Opacity is the attention controller. It's how you implement the attention funnel, the fog of war, the dimming of irrelevant regions, and the focus on what matters. Every other channel carries specific information; opacity carries *relevance*.

### P3: Animation Carries Urgency and Uncertainty

Static = stable, known, handled.  
Slow pulse = active, changing, in progress.  
Fast pulse = urgent, likely missed, needs attention.  
Flicker = unreliable, untrustworthy.  
No animation = calm, safe, resolved.

Animation should be *rare.* If everything pulses, nothing pulses. Reserve animation for the things that genuinely need human attention right now.

### P4: Color Hue Is Precious — Spend It on the Most Important Dimension

Hue is the most powerful discriminator after position. Strata spends it on **safety rating** (green/yellow/red). This is the right call. Ownership gets tint (a different perceptual channel than fill hue). Domain danger gets aura. Don't let anything else steal hue.

### P5: Every Visual Choice Must Survive at 3 Zoom Levels

- **Zoomed out (entire codebase):** Only Tier 1 channels visible. Hue + size. "Where are the red zones?"
- **Module level:** Tier 1 + Tier 2 visible. Hue + size + glow + border + lines. "What's happening in auth?"
- **Entity level:** All tiers available. Full detail. "Tell me everything about this function."

If a visual encoding only works at one zoom level, it's a bad encoding.

### P6: The System Should Have a "Calm State"

When nothing requires attention, the map should feel quiet. Mostly green or muted, no animations, no glows, no auras. The calm state communicates: "Everything is fine. You can focus on building."

The visual system is not a dashboard that always demands reading. It's a *warning system* that's silent when safe and loud when dangerous.

### P7: Combine Dimensions to Show Compound Risk, Not Individual Metrics

Never show "cyclomatic complexity: 47." Show "this function is structurally dense, heavily coupled, poorly tested, in an auth-critical domain, owned by someone on PTO, with a worsening trend." That compound assessment collapses into a single visual state: **bright red, thick dashed border, pulsing glow, red-orange aura, faded ownership tint, upward-trending arrow badge.**

The human doesn't decode these channels individually. They see the gestalt and *feel* that this area is dangerous. That's the bandwidth advantage of visual over text.

---

## Part V: What to Build Next (Prioritized)

Given Strata's current state (circle-packing explorer + diff analysis + risk scoring), the highest-value additions to the visual system:

### Phase 1: Attention Funnel + Delegation Spectrum (enhances existing)

- Implement 5-point delegation spectrum (AUTO → HUMAN) instead of 3-point safety.
- Add opacity-based attention funnel to existing overlays.
- When an overlay is active, dim non-relevant entities to 20-30%.
- **Why first:** Zero new data required. Pure visual enhancement of existing data. Immediately makes the explorer more useful.

### Phase 2: Blast Preview Mode (bridges to agent steering)

- When user selects an entity and presses `P` (preview), show blast zone with visual channels from section 6.
- Direct changes = solid bright. Static deps = solid muted. Temporal deps = pulsing. Implicit-miss = fast pulsing.
- Test coverage status for blast zone entities shown as border treatment.
- **Why second:** Uses existing blast radius + temporal coupling + diff data. The interaction pattern (select → preview → decide) is the core of agent steering.

### Phase 3: Org Shape Data + Ownership Overlay

- Extract from git history: per-file author distribution, last-touch dates, bus factor.
- Add ownership overlay (background tint, border pattern for bus factor).
- Integrate into blast preview: "who can help if this goes wrong?"
- **Why third:** Requires new data extraction (git log analysis), but the visual encoding is simple and composable.

### Phase 4: Fog of War + Confidence Meta-Layer

- Track what Strata does/doesn't know about each region.
- Show fog overlay on poorly-analyzed areas.
- Factor analysis confidence into the delegation spectrum.
- **Why fourth:** This is a meta-feature — it makes all other features more honest. But it requires tracking confidence across all analysis passes.

### Phase 5: Full Agent Steering Loop

- Agent preview → approval → execution monitoring → review.
- Requires integration with an actual agent runtime.
- The visual language is already defined by Phases 1-4; this phase is integration, not new visual design.

---

## Appendix: Research References

- **Jacques Bertin, *Semiology of Graphics* (1967):** The foundation. Retinal variables (position, size, shape, value, color, orientation, texture). Our channel allocation table is a direct application of Bertin's system.
- **Edward Tufte, *The Visual Display of Quantitative Information* (1983):** Data-ink ratio, smallest effective difference, avoiding chartjunk. Our principle of "calm state" and "opacity as relevance" are Tuftean.
- **Tamara Munzner, *Visualization Analysis & Design* (2014):** Channel effectiveness rankings. Why we put safety on hue (most effective for categorical) and activity on glow (lower effectiveness, supplementary role).
- **Ben Shneiderman, "The Eyes Have It" (1996):** Overview first, zoom and filter, then details on demand. Our three-tier layer architecture follows this exactly.
- **Matthew Brehmer & Tamara Munzner, "A Multi-Level Typology of Abstract Visualization Tasks" (2013):** The lens/preset system maps to task-oriented visualization — you don't pick channels, you pick questions.
- **Windy.com:** Best real-world example of multi-channel geo-visualization (wind=animation, temperature=hue, pressure=contours). The gold standard for what we're attempting: multiple data dimensions on a single spatial map without visual noise.
- **Fog of war (strategy games):** The concept of showing unknown/unanalyzed territory as literally obscured. Starcraft, Civilization — players intuitively understand that fog = uncertainty. We apply this to analysis confidence.
