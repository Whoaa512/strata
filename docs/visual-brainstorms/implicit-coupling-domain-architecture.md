# Visual Design Language: Implicit Coupling, Domain Semantics & Architecture Boundaries

> Brainstorm for Strata's agentic IDE of the future.
> Focus: Making the invisible visible — coupling without imports, business rules that bite, and the architectural intent that agents routinely violate.
>
> Builds on: `code-shape-connection-shape.md` (terrain metaphor, material textures), `change-shape-confidence-shape.md` (geological strata, temporal heat), `org-shape-agentic-steering-unified-language.md` (unified visual language principles, channel allocation), `runtime-visual-language.md` (flow metaphors)
>
> References: `../codebase-dimensions-landscape.md` (dimensions #7, #8, #9)

---

## Why This Is the Most Important Brainstorm

The previous brainstorms covered dimensions you can *see* in code: structure, connections, change patterns, ownership, runtime flow. This brainstorm covers **the things you can't see** — and those are exactly what agents miss.

Strata's thesis: **implicit coupling is the #1 thing agents miss.** An agent can follow an import graph. It can read function signatures. What it can't do is know that `pricing-rules.ts` and `checkout-validation.ts` always change together even though neither imports the other, because they both implement the same business invariant from different angles. Or that `user-service/` and `notification-service/` share a DB table nobody documented. Or that the "layers" the original architect intended have been eroding for two years and three critical reverse dependencies now exist.

These three dimensions — implicit coupling, domain semantics, architecture boundaries — form a **single coherent visual problem**: how do you show the hidden structure that actually governs safe change?

---

## Part I: Implicit Coupling — The Invisible Web

### The Core Problem

Static analysis sees edges that exist in code: imports, function calls, type references. But real coupling is richer than that. Two files can be deeply coupled through:

- **Temporal co-change** — they always change together in commits
- **Naming convention** — `UserService.ts` / `UserService.test.ts` / `UserServiceTypes.ts`
- **Sibling structure** — parallel directories (`api/user/`, `models/user/`, `tests/user/`)
- **Shared abstraction** — both implement the same interface or route shape
- **Shared config** — both read the same feature flag or config key
- **Shared infrastructure** — both write to the same DB table, queue, or cache
- **Shared domain concept** — both encode "reservation cancellation" even if named differently
- **Structural clones** — copy-paste with local modifications
- **Convention clusters** — files that follow the same pattern (all route handlers, all migration files)

An import is a *declared* relationship. Implicit coupling is an *emergent* relationship. The former is visible in syntax; the latter is visible only in behavior, convention, or domain knowledge.

### Metaphor Selection: Magnetic Fields & Resonance

Edges (lines between nodes) are the standard visual for connections. But implicit coupling is fundamentally different from explicit edges — it's **probabilistic, multi-causal, and gradient** rather than binary. Drawing the same kind of line for "imports X" and "co-changes with X 73% of the time" conflates two very different things.

**Primary metaphor: Magnetic field lines.**

Magnets create invisible fields that influence objects at a distance. You can't see the field, but you can see its effects — iron filings align, compasses deflect, objects attract or repel. This is exactly what implicit coupling does to files in a codebase.

**Why magnetic fields win:**

| Property of implicit coupling | Magnetic field analog |
|---|---|
| Invisible in code | Invisible to the eye |
| Varies in strength | Field intensity (dense vs sparse lines) |
| Multi-body (A↔B and A↔C create A↔B↔C fields) | Superposition of fields |
| Has directionality (A pulls B more than B pulls A) | Field polarity |
| Falls off with distance (related modules couple more than distant ones) | Inverse-square falloff |
| Can be shielded (good boundaries reduce coupling) | Faraday cage |
| Multiple causes can reinforce | Multiple magnets strengthen the field |

**Rejected alternatives:**

| Alternative | Why rejected |
|---|---|
| Dashed/dotted edges | Still looks like a connection. Doesn't convey gradient strength. At scale, becomes spaghetti. |
| Color-coded edges | Color already allocated to safety rating (P4 from unified doc). |
| Ghost nodes | Adds visual clutter. Where do you place them? |
| Shared halos | Works for 2-3 files, fails at 20. |
| Proximity in layout | Forces layout to serve coupling, destroying other spatial encodings. |

### 1. The Field View — Ambient Coupling Visualization

**How it works:** When the "Implicit Coupling" lens is active, the terrain map gains a new layer: field lines that flow between implicitly coupled regions, like iron filings revealing a magnetic field.

```
                    ┌─────── src/pricing/ ──────────┐
                    │                                │
                    │   rules.ts ◉───╮               │
                    │                │ ≋≋≋≋≋≋≋≋≋≋≋  │
                    │   engine.ts ◉──╯  field lines  │
                    │              ╲    (curved,     │
                    └───────────────╲── flowing) ────┘
                                    ╲
                  ≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋╲≋≋≋≋≋≋  (cross-module field)
                                      ╲
                    ┌─────── src/checkout/ ──────────┐
                    │                ╱               │
                    │   validation.ts ◉──╮           │
                    │                    │ ≋≋≋≋≋≋≋  │
                    │   cart.ts ◉────────╯           │
                    │                                │
                    └────────────────────────────────┘
```

**Visual encoding of field lines:**

| Coupling signal | Visual treatment |
|---|---|
| **Temporal co-change** | Flowing animated lines, like particle streams. Speed = co-change frequency. |
| **Naming similarity** | Subtle static dotted arcs. Low visual weight — naming is suggestive, not conclusive. |
| **Sibling structure** | Parallel lines between mirrored directory structures. Like railroad tracks. |
| **Shared config/flag** | Lines converge to a shared anchor point (the config key), creating a hub-spoke pattern. |
| **Shared DB table** | Lines pass through a shared "well" icon (⊕). Multiple files touching the same well. |
| **Structural clone** | Mirror-image contour outlines. Like seeing double — two shapes that look eerily similar. |

**Field line density = coupling strength.** A pair of files with 90% co-change rate gets dense, vivid field lines. A pair with 30% gets sparse, faint ones. This uses the same perceptual channel as topographic contour density — areas where lines pack tight are areas of steep gradient (strong force).

**Field line color:** A dedicated hue not used elsewhere — **violet/purple.** This distinguishes implicit coupling from all other visual channels. The unified design doc reserves hue for safety (red/yellow/green). Purple field lines are clearly "a different kind of information" at a glance.

### 2. Resonance Rings — "These Things Vibrate Together"

**For the zoomed-out view** where individual field lines would be noise, use **resonance rings**: concentric pulsing circles around entities that share implicit coupling, synchronized in phase.

```
     ◉ pricing/rules.ts            ◉ checkout/validation.ts
    (( ))                          (( ))
   ((   ))     ← same pulse       ((   ))
  ((     ))      frequency &      ((     ))
   ((   ))       phase             ((   ))
    (( ))                          (( ))
```

**Synchronized pulsing** is a powerful pre-attentive signal. When two distant entities pulse at the same rate and phase, the human visual system immediately groups them — even if they're on opposite sides of the map. This exploits the Gestalt principle of common fate (things that move together are perceived as related).

**Pulse frequency encodes coupling type:**
- **Slow deep pulse (1Hz):** Temporal co-change. The most reliable signal.
- **Medium pulse (2Hz):** Shared infrastructure (DB table, queue, config).
- **Fast shimmer (3-4Hz):** Convention/structural similarity. Suggestive, not definitive.

**Pulse color matches field line color — violet/purple — at low opacity.** The rings fade as they expand, like ripples in water. A strongly-coupled cluster creates overlapping ripple patterns that form interference patterns — visually striking and information-rich.

### 3. The Entanglement Indicator — Entity-Level Detail

When you hover or select a single entity, show its **entanglement profile**: all the implicit couplings radiating from that point, ranked by strength.

```
╔══════════════════════════════════════════╗
║  src/auth/session.ts — Entanglement      ║
╠══════════════════════════════════════════╣
║                                          ║
║  STRONG (co-change > 70%)                ║
║  ████████████ auth/middleware.ts    87%   ║
║  ████████░░░░ auth/token.ts        68%   ║
║                                          ║
║  MODERATE (co-change 40-70%)             ║
║  ██████░░░░░░ api/routes/login.ts  52%   ║
║  █████░░░░░░░ db/migrations/003.ts 44%   ║
║                                          ║
║  WEAK (structural/naming)                ║
║  ░░░░░░░░░░░░ auth/session.test.ts  name ║
║  ░░░░░░░░░░░░ types/session.d.ts    name ║
║                                          ║
║  INFRASTRUCTURE                          ║
║  ⊕ sessions_table — also touched by:     ║
║    auth/cleanup-job.ts                   ║
║    admin/user-management.ts              ║
║                                          ║
║  CONFIG                                  ║
║  ⚑ SESSION_TIMEOUT_MS — also read by:    ║
║    auth/middleware.ts                     ║
║    health/session-check.ts               ║
║                                          ║
╚══════════════════════════════════════════╝
```

This panel is the "detailed reading" — it decomposes the ambient field into its specific causes. An agent given this panel would know: "if I change session.ts, I should also look at middleware.ts, token.ts, and the login route — and I should check whether the sessions_table contract is affected."

### 4. Coupling Constellations — Convention Clusters

Files that follow the same convention (all route handlers, all migration files, all Redux reducers) form **constellations** — named groups connected by thin lines, like star patterns on a sky map.

```
                    ★ routes/user.ts
                   ╱
        ★ routes/auth.ts ──── ★ routes/booking.ts
                   ╲                   ╱
                    ★ routes/search.ts ★
                    
           ── "Route Handler" constellation ──
```

**Visual encoding:**

- **Constellation lines** are thin, static, gray — they show membership, not coupling strength.
- **The constellation name** appears as a faint label when the group is hovered or the "Conventions" lens is active.
- **Convention violation** — a file that *should* be in the constellation but deviates from the pattern — is shown with a **broken line** connecting it, and the file itself gets a small ⚡ badge ("convention drift").

**Why constellations, not coloring?**

Coloring convention membership would burn the color channel (already used for safety). Constellations use the spatial-grouping channel instead — they're a structural overlay, not a property overlay. A file can be part of multiple constellations (it's a route handler AND a public API endpoint), and the thin lines make this legible without clutter.

**Agent value:** When an agent modifies one member of a constellation, the system highlights the constellation: "This file follows the Route Handler convention. 14 other files follow the same convention. Should the agent apply the same change to all of them?"

---

## Part II: Domain Semantics — Here Be Dragons

### The Core Problem

Some code is mechanical plumbing — utility functions, serialization, config loading. An agent can modify this with relatively low risk. Other code encodes **business invariants** — rules the system depends on for correctness. Changing this code without understanding the domain is like performing surgery without understanding anatomy.

The visual problem: **how do you mark "this area requires domain understanding" without turning the entire map into a warning sign?**

### Metaphor Selection: Sacred Ground & Rune Stones

Domain invariants are like laws of nature within the codebase — they constrain what's possible, they're non-obvious from the code alone, and violating them causes catastrophic failures that may not manifest immediately.

**Primary metaphor: Sacred ground.** In cartography, sacred sites are marked differently from ordinary terrain — they carry cultural significance beyond their physical properties. In strategy games, "special terrain" has rules that differ from the surrounding land.

**Secondary metaphor: Rune stones.** Specific invariants are inscribed as visible markers within the sacred ground — you can read them to understand *why* this ground is sacred.

### 5. Domain Aura — The Sacred Ground Glow

**How it works:** Files/modules with detected domain invariants get a warm **amber aura** — a soft glow that bleeds outward from the entity's boundary, visible even at low zoom.

```
Normal module:                     Domain-heavy module:
┌──────────────┐                   ┌──────────────┐
│              │                  ╱│░░░░░░░░░░░░░░│╲
│  utilities/  │                ╱░░│  billing/     │░░╲
│  string.ts   │               │░░░│  invoice.ts   │░░░│
│              │                ╲░░│  ▣ ▣ ▣       │░░╱
└──────────────┘                  ╲│░░░░░░░░░░░░░░│╱
                                   └──────────────┘
                                   ▣ = invariant markers (rune stones)
                                   ░ = amber aura glow
```

**Aura intensity encodes domain density:**

| Domain signal density | Aura treatment |
|---|---|
| 1-2 assertions/guards | Faint amber edge glow. "Slightly sacred." |
| 3-5 invariants, validation functions | Moderate amber aura extending ~10px beyond boundary. |
| 6+ invariants, policy engines, complex validation | Intense amber aura extending ~25px, visible at zoomed-out view. |
| "Must/never/always" in comments + assertions + domain naming | Full amber aura + visible rune stones. This is a temple. |

**Why amber?** Green/yellow/red are taken by safety rating. Purple is taken by implicit coupling. Blue is taken by connection/flow. Amber (warm gold-orange) is perceptually distinct from all of these and carries a universal connotation of "caution/significant" (amber alerts, amber lights, amber = preserved-in-time).

**Aura does NOT mean "dangerous."** It means "meaningful." A billing module with strong domain aura might be perfectly well-tested and green-rated. The aura tells you: "even though this is safe to change today, you need domain understanding to change it safely." Safety rating answers "how risky?"; domain aura answers "how much do you need to know?"

### 6. Rune Stones — Individual Invariant Markers

Within the sacred ground, individual invariants appear as **rune stone markers** (▣) — small glyphs positioned within or beside entities, each representing a specific business rule.

**Rune stone encoding:**

| Rune glyph | Meaning | Detected by |
|---|---|---|
| **▣** (filled square) | Assertion/guard — code enforces a rule | `assert()`, `throw`, `if (!x) throw` patterns |
| **◈** (diamond) | Validation rule — input constraint | Validation function calls, schema validators, `zod`/`joi`/`yup` |
| **⊞** (cross-square) | Ordering constraint — sequence matters | Comments with "before/after/first/then", middleware ordering |
| **⊛** (star-circle) | Policy rule — business policy encoded | Policy engine calls, permission checks, rate limit configs |
| **⊘** (circle-slash) | Prohibition — "this must never happen" | Comments with "never/must not/forbidden", negation guards |
| **⊜** (circle-equals) | Idempotency/invariant — must always hold | Idempotency keys, dedup logic, "exactly once" patterns |

**Interaction:** Hovering a rune stone reveals the invariant in plain language:

```
◈ Reservation cancellation window
  "Reservation cannot be cancelled less than 24h before check-in"
  
  Detected from:
    - validation guard at line 47
    - comment at line 45: "must not allow cancellation within 24h"
    - test: "rejects cancellation for same-day reservation"
```

**Why glyphs, not text labels?** Text competes with code and labels for the reading channel. Glyphs are a **parallel visual channel** — they're pattern-matched rather than read. A developer scanning the map sees "three rune stones in this module" before they read any of them. The density of glyphs itself communicates domain richness.

### 7. The Invariant Membrane — Domain Boundary Marking

When a cluster of files shares the same domain invariants, they form a **domain region** with a visible membrane — a soft, organic boundary line (not a hard rectangle) that shows where the invariant's jurisdiction extends.

```
╭ · · · · · · · · · · · · · · · · · · · ╮
·                                         ·
·   ▣ billing/invoice.ts                  ·
·   ▣ billing/payment.ts     "Billing     ·
·   ◈ billing/validation.ts   Domain"     ·
·   ⊜ billing/idempotency.ts              ·
·                                         ·
╰ · · · · · · · · · · · · · · · · · · · ╯
    ·                           ·
    ·   (membrane extends to    ·
    ·    API routes that expose  ·
    ·    billing endpoints)      ·
    ·                           ·
    · · · api/routes/billing.ts · ·
```

The membrane is drawn with a **dotted organic line** (not a straight box) — this communicates "fuzzy boundary defined by semantics, not by directory structure." The membrane may not align with package boundaries, which is itself valuable information.

### 8. Domain Knowledge Density — The Depth Map

**How deep do you have to go to change this safely?**

This is a gradient overlay — like a bathymetric map (ocean depth chart). Shallow areas are bright and accessible; deep areas are dark and require expertise.

**Depth encoding:**

| Depth level | Visual treatment | Meaning |
|---|---|---|
| **Surface** (light, bright) | Minimal tinting, high visibility | Mechanical plumbing. Change freely. Utility functions, config, generated code. |
| **Shallow** (slightly tinted) | Light blue-gray wash | Framework conventions. Understand the pattern, apply it. Route definitions, standard CRUD. |
| **Mid-depth** (moderate tinting) | Medium blue-gray wash, becoming harder to "see through" | Domain-adjacent. Need to understand the business context. Service layer, business logic. |
| **Deep** (dark, dense) | Dark blue-gray, low contrast | Core domain. Requires deep business understanding. Policy engines, pricing rules, reservation logic. |
| **Abyss** (near-black, amber-edged) | Very dark with amber glow at edges | Domain + invariants + poor documentation + high coupling. "Nobody fully understands this. Proceed with extreme caution." |

**At zoomed-out view,** the depth map creates a natural topography — you can literally see where the "deep water" is. Light areas are safe shallows. Dark areas are deep water. This gives an architect instant intuition about where domain knowledge concentrates.

**Agent value:** An agent's context window is a flashlight. In shallow water, the flashlight illuminates everything it needs. In deep water, the flashlight only shows what's immediately around it — the agent doesn't know what lurks below. The depth map tells the human: "the agent can handle this shallow area autonomously, but it will need human guidance in the deep zones."

---

## Part III: Architecture Boundaries — The Walls and Gates

### The Core Problem

Architectures are *intended* structure. They exist in architects' heads, in documentation (maybe), and in directory conventions (hopefully). But they're not enforced by the language or the runtime. Over time, they erode: reverse dependencies sneak in, modules reach across boundaries, and the intended layers dissolve into a mesh.

The visual problem: **show intended boundaries AND the violations that erode them, without making the map look like a blueprint that nobody follows.**

### Metaphor Selection: Topographic Elevation & Cell Membranes

Architecture layers are literally *layers* — they have ordering (UI above Service above Data), they have direction (dependencies flow downward), and they have boundaries (you shouldn't skip layers).

**Primary metaphor: Topographic elevation.** Higher layers sit visually higher. Dependencies flow downhill. Reverse dependencies are water flowing uphill — immediately visually wrong.

**Secondary metaphor: Cell membranes.** Each bounded context is a cell with a semi-permeable membrane. Allowed dependencies pass through the membrane normally. Violations puncture it.

### 9. Topographic Layers — Architectural Elevation

**How it works:** The map gains a subtle elevation dimension. Layers higher in the architecture sit on higher "plateaus" with visible contour lines marking the elevation change.

```
                    ═══════════════════════════════  (plateau edge)
                    ┃  UI / Presentation Layer     ┃  ← highest elevation
                    ┃  routes.ts   components/     ┃
                    ═══════════════════════════════
                              │ (waterfall)
                    ═══════════════════════════════
                    ┃  Application / Service Layer ┃  ← mid elevation
                    ┃  user-service.ts  billing/   ┃
                    ═══════════════════════════════
                              │ (waterfall)
                    ═══════════════════════════════
                    ┃  Domain / Core Layer         ┃  ← ground level
                    ┃  entities/  rules/  types/   ┃
                    ═══════════════════════════════
                              │ (waterfall)
                    ═══════════════════════════════
                    ┃  Infrastructure / Data Layer ┃  ← below ground
                    ┃  db/  cache/  queue/         ┃
                    ═══════════════════════════════
```

**The visual rule is simple: dependencies should always flow downhill.** This makes violations instantly visible — they're rivers flowing uphill, which is physically impossible and visually jarring.

**Contour line encoding:**

| Boundary property | Visual treatment |
|---|---|
| Intended layer boundary | Contour line (thin, consistent, like a topographic map) |
| Strong boundary (well-respected) | Solid contour line, clearly visible |
| Eroding boundary (some violations) | Contour line with gaps/breaks where violations cross |
| Collapsed boundary (many violations) | Contour line barely visible, reduced to scattered dashes |
| Package boundary (sub-division within a layer) | Lighter, thinner contour lines. Minor elevation changes. |

### 10. Boundary Violation — Cracks, Uphill Rivers, and Puncture Wounds

This is where the architecture view gets visually dramatic. Violations *should* look wrong. They should trigger the "that's not right" instinct before conscious analysis.

**A. Uphill Rivers (Reverse Dependencies)**

When module A (lower layer) imports module B (higher layer), the dependency edge is drawn as a **red stream flowing uphill** — visually straining against gravity, with turbulence marks and a glow.

```
                    ═══════════════════════════════
                    ┃  UI Layer                    ┃
                    ┃       component.tsx  ◉        ┃
                    ═══════════╱════════════════════
                             ╱  ← RED uphill stream
                            ╱     (animated, turbulent)
                    ═══════╱══════════════════════
                    ┃    ◉  service.ts             ┃
                    ┃    Service Layer              ┃
                    ═══════════════════════════════
```

**Why this is effective:** Every human understands that water doesn't flow uphill. A red stream moving against the established flow direction triggers pre-attentive "wrongness" detection. You see it instantly, even in a complex map.

**B. Membrane Punctures (Boundary Crossing)**

Each bounded context or package has a **cell membrane** — a visible border. When a dependency crosses this membrane, it creates a **puncture point** marked with a small ✕ or tear mark.

```
    ╭───────── Auth Context ─────────╮      ╭──── Billing Context ────╮
    │                                │      │                        │
    │  session.ts ──────────────────────✕──────► invoice.ts          │
    │                                │      │                        │
    │  middleware.ts                  │      │  payment.ts            │
    │                                │      │                        │
    ╰────────────────────────────────╯      ╰────────────────────────╯
                                       ✕
                                  (puncture point)
```

**Puncture accumulation:** A membrane with many punctures shows visible damage — the boundary line near the puncture points becomes frayed, broken, or discolored. This communicates "this boundary exists in name but is no longer effective."

A membrane with zero or few punctures appears smooth and healthy — the boundary is well-respected.

**C. Crack Patterns (Cycle Detection)**

Architectural cycles — A depends on B depends on C depends on A — are shown as **crack patterns** radiating from the cycle. Like a cracked windshield, the cracks form a web that connects the cyclic dependencies.

```
         ◉ A ─────► ◉ B
          ╲╲        ╱╱
           ╲╲      ╱╱     ← crack pattern:
            ╲╲    ╱╱        hairline fractures
             ╲╲  ╱╱         radiating from cycle
              ◉ C ◄─────╯
```

The crack pattern uses a **dark red / oxidized** color — like rust on metal, communicating structural decay.

### 11. Bounded Context Visualization — The Kingdom Map

DDD bounded contexts are the highest-level architectural unit. They represent **language boundaries** — places where the ubiquitous language changes, where the same word means different things, where translation is required.

**Metaphor: Political kingdoms on a fantasy map.**

Each bounded context is a **distinct territory** with:
- Its own **background color** (very light tint, not competing with safety hue)
- A **name banner** visible at all zoom levels (like country labels on a world map)
- **Border walls** that are visually heavier than internal module boundaries
- **Gate icons** (⊞) at the anti-corruption layers / translation points

```
╔═══════════════════════════════╗           ╔═══════════════════════════╗
║                               ║           ║                           ║
║     ┌ RESERVATION CONTEXT ┐   ║           ║   ┌ PAYMENT CONTEXT ┐    ║
║     │                     │   ║           ║   │                 │    ║
║     │  reservation.ts     │   ║           ║   │  charge.ts      │    ║
║     │  availability.ts    │   ║           ║   │  refund.ts      │    ║
║     │  calendar.ts        │   ║           ║   │  payout.ts      │    ║
║     │                     │   ║           ║   │                 │    ║
║     └─────────────────────┘   ║           ║   └─────────────────┘    ║
║                               ║           ║                           ║
║            "booking"          ║     ⊞     ║       "transaction"      ║
║         (ubiquitous lang)     ║   (gate)  ║      (ubiquitous lang)   ║
║                               ║           ║                           ║
╚═══════════════════════════════╝           ╚═══════════════════════════╝
                                     │
                              Translation Layer
                           (anti-corruption layer)
```

**Gate icons** mark the official crossing points between contexts — the places where translation happens. These are the *healthy* boundary crossings. Any dependency that crosses a context boundary but doesn't go through a gate is a violation (puncture, per section 10B).

**Language boundary indicator:** At the border between two contexts, a subtle **gradient shift** in background tint signals "the vocabulary changes here." The tooltip at the border explains: "In Reservation Context, 'booking' means a confirmed stay. In Payment Context, 'booking' means a billable transaction."

---

## Part IV: The "Agent Will Miss This" Signal

### The Core Insight

Everything above describes dimensions of hidden structure. But the ultimate question isn't "what's here?" — it's **"what will the agent miss when it makes a change?"**

This requires a *composite* signal that combines implicit coupling, domain density, architecture boundaries, test coverage, and ownership into a single visual indicator: **the agent blind spot.**

### 12. Agent Blind Spots — The Attention Debt Indicator

**Metaphor: Fog of war from strategy games, but inverted.** In a strategy game, fog covers what *you* don't know. Here, fog covers what the *agent* doesn't know — but the *human* can see through it.

**How it works:** When the user activates "Agent View" (or the diff analysis highlights affected areas), entities that the agent is likely to miss get a **pulsing frost overlay** — a cool blue-white semi-transparent layer that makes the entity appear "frozen" or "in shadow."

```
Normal view:                          Agent View:
┌──────────────────────┐              ┌──────────────────────┐
│  ◉ auth/session.ts   │              │  ◉ auth/session.ts   │  ← agent sees this
│  ◉ auth/middleware.ts │              │  ◉ auth/middleware.ts │  ← agent sees this
│  ◉ auth/token.ts     │              │  ❄ auth/token.ts     │  ← agent misses (co-change)
│  ◉ auth/cleanup.ts   │              │  ❄ auth/cleanup.ts   │  ← agent misses (shared DB)
│  ◉ api/login.ts      │              │  ❄ api/login.ts      │  ← agent misses (cross-boundary)
└──────────────────────┘              └──────────────────────┘
```

**The frost overlay encodes WHY the agent will miss it:**

| Miss reason | Frost variant |
|---|---|
| Implicit temporal coupling (no import path) | Pulsing frost, slow. "This changes with the target but the agent can't follow the trail." |
| Cross-boundary dependency (agent may not look outside the module) | Frost + boundary-crossing marker. "This is in a different context." |
| Domain invariant not encoded in types/tests | Frost + rune stone. "A business rule lives here that the agent can't infer." |
| Convention member (should change together, but no force requires it) | Frost + constellation line. "This follows the same convention but nothing links them." |
| Shared infrastructure (same DB table/queue/cache) | Frost + well icon. "This touches the same infrastructure." |

### 13. The Attention Debt Halo — Per-Entity Miss Risk

Each entity gets a small **attention debt score** — a composite of "how likely is an agent to miss the necessary context for this entity?" This is shown as a **colored ring** around the entity:

| Attention debt | Ring treatment | Meaning |
|---|---|---|
| **None** | No ring | Agent can handle this autonomously. Fully connected via imports, well-tested, shallow domain. |
| **Low** | Thin violet ring | One non-obvious coupling or minor domain nuance. Agent will probably be fine with a hint. |
| **Medium** | Medium violet ring, gentle pulse | Multiple hidden couplings or moderate domain depth. Agent needs context injection. |
| **High** | Thick violet ring, visible pulse | Strong implicit coupling, deep domain, boundary-adjacent. Agent will likely produce incomplete or incorrect changes without human intervention. |
| **Critical** | Thick red-violet ring, fast pulse | Domain abyss + implicit coupling + boundary violation + no tests. "Do not let an agent touch this without a human in the loop." |

**This is the single most important visual signal in the system.** It directly answers: "Should I trust an agent here?"

### 14. The Diff Heatmap — "Here's What Your PR Actually Touches"

When reviewing a PR or planning an agent task, the map should show not just what files changed, but the **full shadow** of the change — all implicitly coupled files, all domain invariants in scope, all boundary crossings.

```
╔══════════════════════════════════════════════════════════╗
║  PR #1234: "Update session timeout logic"                ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  DIRECTLY CHANGED (bright, fully visible):               ║
║  ◉ auth/session.ts                                       ║
║  ◉ auth/session.test.ts                                  ║
║                                                          ║
║  IMPLICIT SHADOW (frost overlay, pulsing):               ║
║  ❄ auth/middleware.ts ─── co-change 87% ─── ⚠ untested  ║
║  ❄ auth/cleanup-job.ts ── shared sessions_table          ║
║  ❄ health/session-check.ts ── reads SESSION_TIMEOUT_MS   ║
║                                                          ║
║  DOMAIN INVARIANTS IN SCOPE (amber markers):             ║
║  ▣ "Session must not outlive auth token" (session.ts:47) ║
║  ⊞ "Cleanup runs after session expiry" (cleanup-job:12)  ║
║                                                          ║
║  BOUNDARY CROSSINGS:                                     ║
║  ✕ health/ is a different bounded context                ║
║    (no anti-corruption layer for session config reads)   ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

This is the **money view** — the one that makes Strata worth using. A reviewer sees their 2-file PR and immediately understands: "This actually affects 5 entities across 2 boundaries, touches a domain invariant I didn't think about, and the agent missed 3 files."

---

## Part V: Composability — How All Three Layers Interact

### The Layer Stack

These three dimensions compose as visual layers on the same terrain map:

```
Layer 3 (top):    Agent blind spots     — frost overlays, attention debt rings
Layer 2 (mid):    Domain semantics      — amber aura, rune stones, membranes
Layer 1 (bottom): Implicit coupling     — field lines, resonance rings, constellations
Layer 0 (base):   Architecture          — elevation, contour lines, cell membranes, gates
```

**Layer 0 is always visible** (at appropriate zoom) because it's structural — it defines the terrain itself.

**Layers 1-3 are activated by lens selection** or automatically shown during diff review. A reviewer doesn't need all three simultaneously in normal browsing, but during change review, all three activate to show the full hidden impact.

### Compound States — The Most Dangerous Combinations

The most alarming visual states emerge from **combinations** of these layers:

| Combination | Visual result | Meaning |
|---|---|---|
| High implicit coupling + deep domain + boundary edge | Intense violet field + amber aura + frayed contour line | "This area is deeply connected in invisible ways, encodes critical business rules, and sits at an architectural fault line." |
| Agent blind spot + no tests + domain abyss | Frost overlay + empty test badge + near-black depth | "An agent will miss this, nothing will catch the mistake, and the domain is too complex for automated verification." |
| Convention cluster + boundary violation | Constellation lines crossing a cracked membrane | "These files follow the same convention but they're in different bounded contexts — the convention may not actually apply across the boundary." |
| Temporal coupling + no import path + different owners | Violet field lines + no static edges + different ownership tints | "These co-change but nobody declared why, and different teams own each side. This is an undocumented coupling that survives only because of institutional knowledge." |

These compound states should be **flagged explicitly** in risk reports:

```
⚠ COMPOUND RISK: auth/session.ts
  • Implicit coupling with 3 files across 2 contexts
  • 2 domain invariants (session lifetime, token dependency)
  • Boundary crossing to health/ without anti-corruption layer
  • Bus factor: 1 (Alice, last active 3 months ago)
  • Test coverage of coupled files: 34%
  
  Agent attention level: HUMAN REQUIRED
```

---

## Part VI: Data Sources — Where Does This Come From?

### What Strata Has Today

| Signal | Source | Status |
|---|---|---|
| Temporal co-change | Git log analysis (`git.ts`) | ✅ Exists |
| Call graph edges | TS Compiler API (`extract.ts`) | ✅ Exists |
| Blast radius | Transitive caller walk (`blast.ts`) | ✅ Exists |
| Change ripple | Static + temporal composite (`ripple.ts`) | ✅ Exists |
| Agent risk scoring | Composite score (`risk.ts`) | ✅ Exists |
| Diff missed files | Diff analysis (`diff.ts`) | ✅ Exists |

### What Needs to Be Added

| Signal | Extraction approach | Complexity |
|---|---|---|
| **Naming similarity** | String distance on entity/file names. Simple. | Low |
| **Sibling structure** | Directory tree mirroring detection. Simple. | Low |
| **Structural clones** | AST subtree hashing + comparison. Medium. | Medium |
| **Shared config keys** | Grep for config access patterns, build key→file map. | Low-Medium |
| **Shared DB tables** | Grep for table names in queries/ORM calls. | Medium |
| **Convention clusters** | File name patterns + AST shape similarity. | Medium |
| **Assertions/guards** | AST pattern matching for throw/assert/validation. | Low |
| **Domain keywords** | NLP-lite on comments + function names + test names. | Low-Medium |
| **Ordering constraints** | Comment parsing ("before/after") + middleware chains. | Medium |
| **Architecture layers** | Config file or heuristic from directory structure. | Low (config) / Medium (heuristic) |
| **Boundary violations** | Layer config + import graph = direction check. | Low once layers defined |
| **Bounded contexts** | Config file (can't auto-detect DDD boundaries well). | Config-driven |

### The 80/20

The highest-value, lowest-effort additions:

1. **Naming similarity** — trivially detectable, immediately useful for agent steering
2. **Assertions/guards as invariant markers** — AST pattern match, low false positive rate
3. **Architecture layer config** — a `.strata.yaml` section where you declare your layers
4. **Shared config key mapping** — grep for `config.get('KEY')` patterns

These four alone would dramatically improve agent blind spot detection.

---

## Part VII: Interaction Design — How Users Navigate This

### Lens System

Following the established lens system from the unified design doc:

| Lens | What it shows | When to use |
|---|---|---|
| **"Invisible Web"** | Implicit coupling field lines + resonance rings | "What's connected that I can't see in imports?" |
| **"Sacred Ground"** | Domain aura + rune stones + invariant membranes | "Where do business rules live?" |
| **"Kingdom Map"** | Architecture elevation + bounded contexts + gates | "What's the intended structure?" |
| **"Boundary Health"** | Violations, cracks, uphill rivers, puncture density | "Where is the architecture eroding?" |
| **"Agent Blind Spots"** | Frost overlays + attention debt halos | "What will the agent miss?" |
| **"Full Shadow"** | All of the above, activated for a specific change | PR review / agent task planning |

### The Agent Planning Flow

The most important interaction:

1. **Human selects files to change** (or agent proposes a change set)
2. **Strata activates "Full Shadow"** — shows the complete hidden impact
3. **Human sees:**
   - Implicit coupling field lines extending from changed files
   - Domain rune stones in the affected area
   - Boundary crossings the change would make
   - Agent blind spots (frost overlay on likely-missed files)
4. **Human decides:**
   - Add blind-spot files to the agent's context
   - Flag invariants for the agent to respect
   - Approve, modify, or reject the change scope

This is the core loop. Everything in this document serves this interaction.

---

## Part VIII: Open Questions

1. **How to handle false positives in implicit coupling?** Temporal co-change can be noisy (files that co-change because of formatting runs, not semantic coupling). Need a confidence threshold. Possibly: require co-change + at least one structural signal (naming, sibling, shared infra) for high-confidence coupling.

2. **Should architecture boundaries be user-declared or auto-detected?** Both. Auto-detect from directory structure as default. Allow `.strata.yaml` to override with explicit layer/context declarations. Show "inferred" vs "declared" differently (dashed vs solid contour lines).

3. **How to bootstrap domain invariant detection?** Start with high-precision, low-recall: assertions, explicit throws, validation functions, comments with "must/never/always." Over time, learn from human corrections ("this IS an invariant" / "this is NOT").

4. **How to prevent visual overload when all layers are active?** The opacity principle (P2 from unified doc) is the answer. When "Full Shadow" is active for a specific change, only entities in the shadow are fully visible. Everything else dims to 20% opacity. The shadow IS the focus filter.

5. **How to represent implicit coupling strength quantitatively?** Co-change percentage is the primary metric. But naming similarity, structural mirroring, and shared infrastructure should each contribute to a composite score. Possibly: weighted average where temporal co-change counts 2×, structural signals count 1× each, and the composite normalizes to 0-100.

6. **How to visualize coupling that crosses service boundaries (microservices)?** This requires cross-repo analysis. The field lines would need to extend beyond the current repo's map, potentially showing "ghost entities" from other services at the edges. A problem for later, but the visual language should support it (field lines fading into fog at the map boundary).

---

## Appendix: Channel Allocation Summary (Updated)

Building on the unified doc's channel table, with this brainstorm's additions:

| Visual channel | Allocated to | Priority |
|---|---|---|
| **Position (x, y)** | Spatial layout (treemap / directory structure) | Foundation |
| **Size** | LOC / entity size | Tier 1 |
| **Hue (fill)** | Safety rating (green/yellow/red) | Tier 1 |
| **Hue (aura)** | Domain density (amber) | Tier 2 |
| **Hue (field lines)** | Implicit coupling (violet/purple) | Tier 2 |
| **Hue (violation)** | Boundary violation (dark red) | Tier 2 |
| **Hue (frost)** | Agent blind spot (blue-white) | Tier 2 |
| **Elevation/shadow** | Architecture layers | Tier 1 |
| **Border weight** | Boundary strength (thin=internal, thick=context boundary) | Tier 1 |
| **Border pattern** | Boundary health (solid=healthy, dashed=eroding, broken=violated) | Tier 2 |
| **Border color ring** | Attention debt (violet gradient) | Tier 2 |
| **Glyph markers** | Domain invariant type (▣ ◈ ⊞ ⊛ ⊘ ⊜) | Tier 3 |
| **Constellation lines** | Convention cluster membership | Tier 3 |
| **Animation (pulse)** | Resonance (synchronized coupling), urgency | Tier 2 |
| **Animation (flow)** | Field line direction / coupling strength | Tier 2 |
| **Opacity** | Attention focus / relevance dimming | Meta |
| **Background tint** | Bounded context identity | Tier 1 |
| **Texture (crack)** | Architectural cycle / structural decay | Tier 3 |

**Perceptual budget check:** At any given moment, a user should see at most 4-5 active channels simultaneously (per Ware's "Information Visualization" guidance on channel capacity). The lens system ensures this — each lens activates 2-3 channels specific to its question, plus the always-on Tier 1 channels (position, size, hue, elevation).

---

## Appendix: Design References

- **Bertin, *Semiology of Graphics* (1967):** Retinal variables framework. Our field lines and resonance rings exploit the motion/flicker variable, which Bertin identifies as having the highest alerting power.
- **Ware, *Information Visualization: Perception for Design* (2012):** Pre-attentive processing research. Synchronized motion (resonance rings) is one of the strongest pre-attentive features.
- **Tufte, *Envisioning Information* (1990):** "Escaping Flatland" — using layering and separation to show multiple data dimensions. Our layer stack (architecture → coupling → domain → agent) follows Tufte's principle of micro/macro readings.
- **Magnetic field visualization (physics education):** Iron filing patterns around magnets are one of the most intuitive visualizations of invisible force. We adapt this for invisible code coupling.
- **Topographic maps (cartography):** Contour lines encoding elevation are universally readable. We use them for architecture layers.
- **Fog of war (Civilization, StarCraft):** Players instantly understand "fog = unknown." We invert this: fog = "agent doesn't know this, but you should."
- **Medieval cartography ("Here be dragons"):** The visual language of marking dangerous, unknown territory. Our domain aura and rune stones are modern versions of this.
- **Cell biology (membrane permeability):** Bounded contexts as cells with semi-permeable membranes. Healthy membranes are selective; damaged membranes leak.
