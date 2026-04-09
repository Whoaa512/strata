# Visual Design Language: Code Shape & Connection Shape

> Brainstorm for Strata's agentic IDE visual layer.
> Focus: How do you make a human build intuition about code shape and connection shape in under 30 seconds?

---

## 1. The Primary Metaphor: Geological Terrain

**Why terrain wins over city blocks, circuit boards, org charts:**

A codebase is a landscape that _formed over time_. It wasn't designed top-down; it accreted, eroded, and shifted through tectonic forces (reorgs, rewrites, framework migrations). Terrain is the only metaphor that carries this temporal truth intuitively.

- **Mountains** = high-complexity, high-LOC code. You can see them from far away.
- **Plains** = flat, clean plumbing. Nothing to worry about here.
- **Canyons** = deep nesting. The walls close in; you can't see out.
- **Rivers** = major data/call flow paths. They carve the landscape over time.
- **Fault lines** = module boundaries, especially violated ones. Where tectonic plates (teams, packages, domains) meet.
- **Volcanic hotspots** = high churn × high complexity. Actively dangerous. Glowing.
- **Sedimentary layers** = git history visible in cross-section. Old code at bottom, recent at top.
- **Erosion** = areas where code was deleted/simplified over time. Smooth, weathered shapes.
- **Fog/clouds** = low-confidence areas. Generated code, unanalyzed files, things Strata can't see clearly.

**The key insight:** Terrain has _elevation_, _texture_, _color_, _weather_, AND _geology_ — five independent visual channels you can encode simultaneously without overwhelming a viewer. A city-block metaphor gives you maybe two (height + color).

### Specific encoding for Code Shape metrics:

| Metric | Visual channel | Example |
|--------|---------------|---------|
| LOC | Area/footprint | Larger functions take up more ground |
| Cyclomatic complexity | Elevation/height | Complex functions rise up as peaks |
| Cognitive complexity | Surface roughness/texture | Gnarly code has craggy, fractured surface; clean code is smooth |
| Nesting depth | Canyon depth / pit formation | Deeply nested code creates sinkholes that visually "pull down" |
| Parameter count | Number of visible paths/roads leading in | Many params = many roads converging at one point = intersection chaos |
| Churn | Heat/glow from below | High-churn areas have a volcanic warmth seeping through. Active. Dangerous. |
| Generated code | Crystalline/geometric regularity | Unnaturally perfect grid patterns. Clearly machine-made vs organic. |

---

## 2. Density and Complexity Encoding: The Texture Palette

Text is serial. Vision is parallel. A human can distinguish:
- ~7 million colors
- Dozens of textures simultaneously
- Motion vs stillness instantly (pre-attentive processing, ~200ms)

**Don't waste this bandwidth on just "red = bad."**

### The Complexity Spectrum (not a gradient — a material change):

| Complexity level | Visual treatment | Physical analogy |
|-----------------|-----------------|-----------------|
| **Trivial** (getters, constants, config) | Glass/water — transparent, you can see through it | Looking through a window |
| **Clean plumbing** (well-factored utilities) | Polished stone — smooth, solid, matte | River rocks |
| **Working code** (moderate complexity, reasonable shape) | Wood grain — organic patterns, warm, readable | Crafted furniture |
| **Gnarly** (high cyclomatic, deep nesting) | Fractured rock — jagged edges, irregular surface, cracks | Broken granite |
| **Terrifying** (500 LOC function, 8-deep nesting, 12 params) | Obsidian with veins of lava — dark, glassy-sharp, actively hot | Volcanic glass |

**Why materials, not just colors:**
Color alone is a 1D encoding (hue along a gradient). Material/texture gives you a _gestalt feeling_ before conscious processing. You know obsidian-with-lava-veins is dangerous before you read any tooltip. This is pre-attentive — it works even in peripheral vision.

### The "Shape Distortion" Signal:

Clean code should look _regular_ — smooth contours, predictable shapes. As complexity increases, shapes should _distort_:

- **Low complexity:** Smooth rectangle or rounded shape. Calming.
- **Medium complexity:** Slight asymmetry. One side bulges. Organic.
- **High complexity:** Spiky, irregular, fractal-edged. Aggressive silhouette.
- **Extreme:** The shape _vibrates_ slightly. It's unstable. It looks like it might shatter.

This uses the biological threat-detection system. Irregular, spiky shapes trigger alertness. Smooth curves feel safe. (See: Bar & Neta, 2006, "Humans prefer curved visual objects")

---

## 3. Connection Shape: Beyond Spaghetti

### The Problem with Lines

Every graph viz tool draws lines between nodes. At 50 edges it's useful. At 500 it's spaghetti. At 5000 it's a gray blob. Codebases have thousands of connections.

**Lines don't scale. We need field-based representations.**

### Approach A: Gravitational Fields

Treat high-fan-in entities as **gravity wells**. They pull nearby code toward them visually.

- A utility function called by 200 callers doesn't show 200 lines. Instead, it sits in a visible _depression_ in the terrain, and surrounding code _leans toward it_.
- The depth of the well = fan-in count.
- Code that calls it is positioned closer (spatial proximity = dependency).
- You can _see_ which code is in the gravitational influence of `authMiddleware` vs `dbConnection` without any explicit edges.

**Fan-out** is the inverse: entities that call many things are positioned _high up_, on ridgelines, with many slopes flowing away from them. Controllers and orchestrators naturally sit on high ground.

### Approach B: Flow Fields (for call/data paths)

Instead of individual edge lines, show **vector fields** — like wind maps or ocean current visualizations.

- Each pixel/region has a flow direction showing "data/calls flow this way."
- Major call paths appear as strong currents (thick, fast-moving, high-contrast).
- Minor connections are light breezes (thin, slow, translucent).
- **Cycles** appear as _vortices_ — visible spinning/whirlpool patterns. Instantly recognizable. You see a cycle before you identify the specific files.
- **Boundary crossings** are where flow passes through a visible membrane/wall. Legal crossings are smooth (flow through a gate). Illegal crossings show _resistance_ (flow bends, distorts, or bleeds through a crack).

Reference: [earth.nullschool.net](https://earth.nullschool.net) — wind visualization at global scale. Millions of data points rendered as a coherent, instantly-readable field. This is the visual bandwidth we need.

### Approach C: River Systems (for the primary metaphor)

If terrain is the base metaphor, connections are **rivers and tributaries**:

- **Main call paths** = rivers. Wide, visible from high zoom. The `request → controller → service → repository → DB` path is the Mississippi.
- **Tributaries** = supporting call chains. Thinner. Flow into the main rivers.
- **Underground streams** = implicit/temporal couplings. Dotted, translucent. _You can't see them on the surface_, but they're marked by surface features (subtle depressions, different vegetation).
- **Waterfalls** = boundary crossings. Vertical drops where flow crosses a module/package boundary. Legal crossings are elegant waterfalls. Illegal crossings are cracks in a dam.
- **Lakes** = accumulation points. Where many flows converge and pool. High fan-in. The bigger the lake, the more things depend on it.
- **Deltas** = high fan-out. Where one entity fans into many downstream consumers. Like a river delta spreading across a plain.

**Why rivers work:** Rivers have _direction_, _width_ (volume), _branching_, and _merging_ — exactly the properties of a call graph. And humans intuitively understand watersheds.

### Specific Connection Shape Encodings:

| Connection signal | Visual | Detail |
|------------------|--------|--------|
| Import graph | Terrain contiguity | Files that import each other are positioned adjacent. Import distance ≈ spatial distance. |
| Call graph | River/flow field | Direction, width proportional to call frequency (if available) or importance |
| Type dependency | Bedrock layers visible in cross-section | Types are geological strata _beneath_ the surface code. Shared types = shared bedrock. |
| Inheritance | Mountain ranges sharing a ridge | Parent class is the ridge; children are peaks along it |
| Package boundaries | Tectonic plate edges | Visible fault lines. Clear, crisp boundaries in the terrain. |
| Cycles | Whirlpools / ouroboros | Spinning visual. Impossible to miss. The more files in the cycle, the larger the vortex. |
| Fan-in | Gravity well / lake | Depression in terrain; surrounding code slopes toward it |
| Fan-out | Delta / ridge / hilltop | Elevated position with many paths flowing outward |
| Boundary violation | Crack / lava seep at fault line | Something crossing where it shouldn't. Red, hot, visible. |
| Public API surface | Shoreline / cliff edge | The boundary between "inside" (private) and "outside" (public). Well-defined coastline = clean API. Jagged coastline = leaky abstraction. |
| Transitive closure | Watershed | "If it rains here, everything in this watershed gets wet." Watershed boundary = blast radius boundary. |
| Framework magic edges | Lightning / static discharge | Visible but erratic. Not following normal river paths. Arcing across the sky between distant points. |

---

## 4. Zoom Levels: The Semantic Zoom Stack

The key insight from cartography: **different information is relevant at different scales**, and the transition between scales should feel natural, not jarring.

### Level 0: Biome View (Full System / 10,000 ft)

**What you see:**
- Broad terrain regions (forests, deserts, mountains, plains) representing top-level modules/packages.
- Color/vegetation type = domain (auth is volcanic/red, payments is mineral/blue, frontend is green/forest).
- Relative size = LOC proportional.
- Elevation profile = complexity distribution. "That mountain range in the auth module is visible from here."
- Major rivers only = the 5-10 primary call paths through the system.
- Weather systems = current activity. Where are PRs happening right now? Storms over actively-changed areas. Calm skies over stable code.
- Fog = areas with low test confidence or low analysis coverage.

**What you don't see:**
- Individual functions, files, or classes. Too small at this scale.
- Minor connections. Only trunk rivers and major faults.

**What it answers at a glance:**
- "Where is the complexity concentrated?"
- "What are the major subsystems and how big are they?"
- "Where is active development happening?"
- "Which areas are well-understood (clear skies) vs opaque (fogged)?"

### Level 1: Region View (Module / Package / 1,000 ft)

**What you see:**
- Individual files as distinct terrain features (hills, valleys, rock formations).
- File shape = code shape. The craggy spire is the 500-line utility file. The smooth plateau is the clean service layer.
- Rivers branch into visible tributaries. You can trace call paths through this module.
- **Temporal coupling** becomes visible: files that co-change glow with the same hue-pulse, like bioluminescence. Even if they're not spatially adjacent, you see them light up in sync.
- Module boundary walls become visible — you can see where the "fences" are, and where things leak through.
- Fault lines (package boundaries) show stress patterns — are they clean edges or are they crumbling?

**What you don't see:**
- Individual functions (unless they're outliers — a 400 LOC monster function is visible as a peak even at this level).
- Individual call edges (still flow-field, not spaghetti).

**What it answers:**
- "What's the internal structure of this module?"
- "Which files are the load-bearing walls?"
- "Where are the boundary violations?"
- "What co-changes with what?"

### Level 2: File View (File / Feature / 100 ft)

**What you see:**
- Individual functions/methods as distinct entities with full shape encoding.
- **Function shape is literal:** Smooth, rounded = simple. Jagged, tall, spiky = complex. Deep pit = deeply nested.
- Internal call relationships within the file: visible paths/corridors between functions.
- External connections: arrows/rivers flowing out of the "edges" of the visible terrain to labeled destinations (other files).
- The **blast radius halo**: select a function and see a translucent colored overlay showing everything it can affect. Like a weather radar showing a storm's reach.
- **Risk coloring** is now per-entity: green/yellow/red as a glow or outline. Not background — it should feel like a status indicator, not a label.
- **Params** visible as "entry doors" on the entity shape. Many doors = many params = many ways to get in = complex interface.

**What it answers:**
- "Which function in this file is the scariest?"
- "What does this function connect to?"
- "How tangled are the internal relationships?"
- "What's the blast radius of changing this?"

### Level 3: Function View (Ground Level / 1 ft)

**What you see:**
- The actual code, but _augmented_.
- **Nesting depth** visualized as physical depth — deeper nesting literally recedes (parallax effect, darker background, slightly smaller text, as if the code is further from you).
- **Branch complexity** as path-splits. At each `if/switch`, the visual shows a fork in the road. You see how many paths exist through this function.
- **Parameters** highlighted at the top like labeled pipes feeding in.
- **Return points** highlighted as exit doors. Multiple early returns are multiple doors — visible scatter.
- **Call sites** to other functions glow and have hover-targets that preview the destination.
- Side-panel or overlay: the function's risk card (from agentRisk), blast radius, change history sparkline.

**Transition animations between levels:**
- Zooming in should feel like _descending_ — you approach a mountain, it resolves into boulders, then rocks, then crystals (entities → functions → code lines).
- The terrain _opens up_ as you zoom in, like a cross-section revealing internal structure.
- Reference: Google Earth zoom. The best semantic zoom UX ever built. Satellite → city → street → building. Each level loads appropriate detail.

---

## 5. The "Ignore Safely" Signal

This is perhaps the most important visual signal. Most code is fine. The IDE needs to push boring, safe code _out of attention_ so the human's eye naturally lands on what matters.

### Treatment: Atmospheric Perspective

In landscape painting and real terrain, distant mountains fade to blue-gray and lose detail. This is **atmospheric perspective** — things further from your focus of attention become desaturated, lower-contrast, and simpler in form.

Apply this to safe, well-tested, stable code:

| Safety level | Visual treatment | Metaphor |
|-------------|-----------------|----------|
| **Safe & boring** | Desaturated, low-contrast, simplified geometry. Smooth. Matte. Almost background. | Distant hills in fog |
| **Safe but important** | Moderate saturation, clear shape, but no glow/pulse | Nearby hills, clear day |
| **Needs attention** | Full color, full texture, detailed shape | Standing right in front of it |
| **Dangerous** | Oversaturated, glowing, possibly animated | On fire |

### Additional "ignore safely" signals:

- **Shrinking**: Safe code can be represented at smaller scale than its LOC would normally warrant. Complexity-weighted sizing instead of raw LOC sizing. A 1000-line well-tested utility gets the footprint of a 200-line risky function.
- **Flattening**: Safe terrain has low elevation. Even if a function has moderate complexity, if it's well-tested and stable, its visual height is _suppressed_. Only untested/high-churn complexity creates tall peaks.
- **Translucency**: Safe modules can become partially transparent. You see through them to the interesting stuff behind/beneath.
- **Grouping/chunking**: Multiple safe files collapse into a single labeled region (like a nature preserve on a map — "Safe Zone: /utils" with no internal detail visible until you zoom in).

### The Trust Equation for Visual Weight:

```
visual_weight = complexity × (1 - test_confidence) × recency_of_change × (1 + implicit_coupling_count)
```

A complex function with 95% test coverage that hasn't been touched in 6 months should be visually _quiet_. A moderately complex function with 0% test coverage that changed yesterday should be _screaming_.

---

## 6. Animation and Motion: Temporal Bandwidth

The human visual system is exquisitely tuned to motion. A single moving object in a still scene captures attention instantly (pre-attentive processing). Use this wisely — animation is a scarce resource.

### Motion Language:

| Motion type | Meaning | When to use |
|------------|---------|-------------|
| **Pulsing glow** (slow, warm) | Churn hotspot. This area is actively changing. | Entities with high recent churn. Pulse frequency ∝ commit frequency. |
| **Ripple outward** (concentric rings) | Blast radius. "If you touch this, the ripple reaches here." | On hover/select of an entity. Ripple speed shows how quickly the effect propagates. |
| **Breathing** (slow expand/contract) | Health/heartbeat. System-level health indicator. | Module-level indicator. Healthy = slow, calm. Unhealthy = rapid, irregular. |
| **Flowing** (directional particle movement) | Data/call flow. Direction and speed of execution. | Along river/flow-field paths. Faster flow = hotter path. |
| **Trembling/vibration** | Instability. This entity has conflicting signals or is on the edge. | High complexity + high churn + low tests. Feels precarious. |
| **Spinning/vortex** | Cycle detected. | Dependency cycles. The vortex diameter ∝ cycle length. |
| **Lightning flash** (brief, bright) | Recent change. "Something just happened here." | Real-time: when a file save or git commit touches a file, flash its terrain feature. |
| **Erosion animation** (slow surface change) | Refactoring in progress. | When code is being simplified over multiple commits, the terrain slowly smooths out. Satisfying. |
| **Cracking/fracturing** | Boundary violation or coupling increase. | When a new dependency is added that crosses a boundary, a crack visually propagates along the fault line. |
| **Fog rolling in/out** | Confidence changing. | When tests are added, fog clears. When tests are deleted, fog rolls in. |

### Critical rule: **Most of the time, most things should be still.**

Animation is for exceptions. A fully animated landscape is useless — it's a screensaver. The power of motion comes from contrast with stillness. If only 3 things are moving, your eye goes to them immediately.

### Time-lapse Mode:

A distinct mode (not the default) that shows the codebase evolving over git history:

- Terrain rises and falls as functions are added/removed.
- Hotspots glow and fade as churn moves around.
- Rivers change course as call graphs restructure.
- Mountain ranges form and erode as modules are created and refactored.
- You can see the "geological history" of the codebase in 30 seconds.

This is for understanding _how we got here_, not for daily use. Like watching a climate simulation vs checking today's weather.

---

## 7. Interactive Affordances: The Question → Answer Loop

Every visual should answer a question. Every interaction should reveal a deeper question.

### Hover (instant, lightweight):

| What you hover | What appears |
|---------------|-------------|
| A terrain feature (file/function) | Name, safety rating, 1-line summary: `authMiddleware · RED · 14 implicit couplings` |
| A river/flow path | Path name: `POST /checkout → validateCart → chargePayment → updateInventory` |
| A fault line (boundary) | Boundary info: `packages/auth ↔ packages/billing · 3 violations` |
| A whirlpool (cycle) | Cycle members: `A → B → C → A · 3 files` |
| A fog bank | Missing info: `No test coverage data for /legacy/*` |

### Click (opens detail panel):

| What you click | What opens |
|---------------|-----------|
| Entity | Full risk card: metrics, blast radius, change ripple, risk factors, recent commits, callers/callees, implicit couplings. The entity's "medical chart." |
| River | Full path trace: every entity along this call chain, with complexity and risk at each hop. A "river cross-section." |
| Module/region | Module health summary: aggregate complexity, churn, boundary violations, top hotspots, coverage. The module's "census report." |
| Fault line | Boundary analysis: what crosses, how often, violations, suggested fixes. |

### Drag (spatial queries):

- **Lasso selection**: Draw a region to select multiple entities. Shows aggregate stats: total LOC, combined blast radius, shared dependencies. "What's in this area?"
- **Path drawing**: Draw a line from A to B to ask "how does data/control flow from here to there?" Strata highlights the shortest path and all significant alternate routes.
- **Boundary drawing**: Draw a line to propose a new module boundary. Strata instantly shows how many connections would cross it (feasibility of the split).

### Special interactions:

- **Right-click → "What changes if I modify this?"**: Triggers blast radius + change ripple visualization. Everything in the ripple zone highlights; everything outside dims.
- **Right-click → "What should I read first?"**: Strata computes the context cost path — the minimal set of files/functions to read to understand this entity. Highlights them in reading order, with estimated token cost.
- **Right-click → "Is this safe for an agent?"**: Shows the agent risk card and highlights all the reasons it's green/yellow/red. If red, shows what _would_ make it green (more tests, smaller blast radius, resolving implicit couplings).
- **Diff mode toggle**: Overlay the PR diff onto the terrain. Changed files glow. Missed files (from `diff.ts` analysis) appear as warning markers. The terrain itself _deforms_ to show how the PR changed the system shape.

---

## 8. Specific Visual Solutions for Hard Problems

### Problem: Temporal Coupling (invisible connections)

Files that co-change but have no import/call relationship. This is Strata's strongest signal and the hardest to visualize because the connection is _historical_, not structural.

**Solution: Sympathetic Resonance**

When you select a file, its temporally coupled files start to _resonate_ — a subtle glow/pulse at the same frequency. Like tuning forks that vibrate in sympathy. The coupling strength determines the intensity:

- 90% co-change: bright, synchronous pulse. Clearly linked.
- 50% co-change: dimmer, slightly out-of-phase. Suggestive.
- 30% co-change: barely visible. Only shows if you're looking.

Additionally, in the terrain, temporal couplings are shown as **underground aquifers** — dotted lines beneath the surface, visible in a "subsurface" overlay mode. You can toggle between surface view (structural connections only) and subsurface view (temporal/implicit connections).

### Problem: Module Boundaries That Are Violated

**Solution: Walls with Damage**

Module boundaries are rendered as walls/fences between terrain regions. The wall's condition tells the story:

- **Clean boundary**: Tall, intact wall with clear gates (public APIs) where flow passes through legitimately.
- **Leaky boundary**: Cracks in the wall. Each violation is a visible crack, with flow seeping through. More violations = more damage = wall looks like it's crumbling.
- **No boundary at all**: No wall exists. Code is freely intermixed. This is fine if they're meant to be one module; alarming if they're not.
- **Proposed boundary** (from architecture intent): Shown as a planned wall outline (dotted/ghosted), with existing connections highlighted that _would_ cross it.

### Problem: Showing Blast Radius Without Overwhelming

**Solution: Seismic Rings**

When you "detonate" an entity (click + blast radius mode), concentric rings expand outward:

- **Ring 1** (direct callers): Bright, sharp, immediate.
- **Ring 2** (callers of callers): Slightly fainter.
- **Ring N** (transitive): Increasingly faint, like earthquake intensity diminishing with distance.

The terrain _outside_ the blast radius dims. You instantly see the "damage zone" and its falloff. The ring animation takes ~1 second, giving a visceral sense of "oh, this reaches _far_."

### Problem: Context Cost Visualization

How much does an agent need to "read" to safely modify this entity?

**Solution: Illumination Radius**

Think of the entity as a campfire. The light it casts (context window) illuminates nearby terrain. The brighter the light needs to be (more context needed), the more energy (tokens) it costs.

- **Green entity**: Small campfire. Illuminates just the entity and its immediate neighbors. Low context cost. An agent can handle this easily.
- **Yellow entity**: Larger fire. Illuminates several surrounding files. Medium cost. Agent needs to read these too.
- **Red entity**: Blazing bonfire. Illuminates a vast area — dozens of files. The token count is displayed as the "fuel cost" of this fire. An agent might not have enough context window.

On hover, show the illumination with a gradient: bright at center → dark at edge. Files within the illumination are labeled with their estimated token cost.

---

## 9. The Dual-View: Terrain + Adjacency Matrix

For power users who need precision alongside intuition:

**Split screen available:**
- Left: Terrain view (intuitive, spatial, gestalt understanding)
- Right: Adjacency matrix or compact list view (precise, searchable, sortable)

When you hover over terrain, the matrix highlights the corresponding row/column. When you click a matrix cell, the terrain zooms to that connection.

The matrix uses the same color/intensity encoding as the terrain, so the visual language is consistent.

---

## 10. Design Principles Summary

1. **Pre-attentive first.** The most important signals (danger, stability, change) should register in <200ms without reading any text.

2. **Parallel channels.** Use position, size, color, texture, motion, and depth simultaneously. Each channel encodes a different dimension. Never use two channels for the same thing.

3. **Calm by default.** The baseline state of the visualization should be calm, quiet, mostly still. Only exceptions move/glow/pulse. This preserves the attentional power of animation.

4. **Semantic zoom, not geometric zoom.** Zooming in doesn't just make things bigger — it reveals _qualitatively different information_. Like going from satellite to street view.

5. **Questions, not dashboards.** Every visual state should answer a specific question. The UI's job is to let users ask the next question naturally (hover → click → drill → lasso → trace).

6. **Suppress the boring.** Safe, tested, stable code should fade toward invisible. The visualization should _actively push your attention_ toward what matters.

7. **Physical intuition over learned convention.** Use metaphors that tap into spatial/physical reasoning humans already have (gravity, water flow, terrain, fire, fog) rather than inventing new symbol systems that must be learned.

8. **Honest uncertainty.** Where Strata doesn't have data or has low confidence, show fog/blur/transparency. Never make uncertain data look certain.

---

## 11. What This Looks Like: A Walkthrough

> You open Strata on a 50k-LOC TypeScript backend.

**First second:** You see a terrain. Mostly green-gray plains and gentle hills. Your eye immediately catches two things: a glowing volcanic peak in the northeast (auth module — high complexity, high churn), and a spinning whirlpool in the southwest (a circular dependency between three service files).

**You zoom to the auth module.** The terrain resolves from a single glowing peak into a small mountain range. You see five major features (files). One is a craggy obsidian spire — `authMiddleware.ts`, 400 LOC, deeply nested, many params. Rivers converge on it from all directions (high fan-in). Two underground aquifer lines pulse — temporal couplings to files in the payments module that have no import relationship.

**You click the spire.** Seismic rings expand outward. 23 files light up. The blast radius reaches into four modules. The risk card opens: RED. "14 implicit couplings. No tests covering 3 affected callers. Context cost: 47,000 tokens."

**You right-click → "What should I read first?"** Five terrain features illuminate in numbered order: the middleware itself, the session validator it calls, the rate limiter config, and two temporal coupling targets. Total reading: ~12,000 tokens. The rest dims.

**You toggle diff mode.** Your current PR overlay appears. Two files you changed glow blue. Three files you _didn't_ change but _should have reviewed_ glow orange with warning markers. The terrain between your changes and the warnings shows the connection: an underground aquifer (temporal coupling) that your diff analysis would have caught.

**You fix the missing files, submit the PR.** The terrain smooths slightly — the blast radius contracted by 2 files because you added a test. The fog over one area clears. The volcanic glow dims a fraction.

---

## 12. Prior Art & References

| Reference | What to steal | What to avoid |
|-----------|--------------|---------------|
| **CodeCity** (Wettel & Lanza) | City-block metaphor, LOC→footprint, complexity→height | Boring textures, no connection viz, no temporal dimension |
| **earth.nullschool.net** | Flow field rendering, global-to-local zoom, real-time data on beautiful canvas | — |
| **D3 treemaps** | Space-filling for showing proportional size | Treemaps don't show connections; nested rectangles don't build intuition |
| **Gource** (git history viz) | Time-lapse evolution of a codebase | It's fun but not useful. No semantic meaning to position. |
| **Google Earth** | Semantic zoom transitions, satellite→street UX | — |
| **Hillshading** (cartographic technique) | Using simulated light/shadow to reveal terrain shape from 2D rendering | — |
| **SonarQube** | ...nothing. Red/green circles with numbers. Zero visual bandwidth. | Everything. No spatial encoding, no connection viz, no intuition-building. |
| **Observable Plot / Vega-Lite** | Expressive grammar for encoding data→visual channels | They're for charts, not spatial metaphors |
| **Minard's map of Napoleon's march** | Multi-dimensional data in a single coherent visual: geography + army size + temperature + direction + time | This is the gold standard of information density per visual element |

---

## 13. Open Questions

1. **2D or 3D?** Terrain naturally suggests 3D, but 3D navigation is hard and occlusion is a problem. Maybe 2.5D (isometric / oblique projection with parallax) gets 80% of the benefit with 20% of the interaction complexity? Or a top-down view with hillshading that creates the _impression_ of 3D without actual 3D navigation?

2. **Layout algorithm:** What positions entities spatially? Force-directed (communities cluster)? Treemap (space-filling)? Hilbert curve (preserves locality)? Fixed by directory structure? The layout must be _stable_ — it can't jump around between sessions or the human loses their mental map.

3. **Performance at scale:** 100k entities with texture, animation, and flow fields. WebGL/WebGPU required. How much can be precomputed vs real-time? Can we use SDF (signed distance field) rendering for the terrain?

4. **Color blindness:** The terrain metaphor is less dependent on color than traditional viz (texture, shape, motion, position all carry signal). But need to ensure the palette works for protanopia/deuteranopia. Maybe the primary axes are luminance + texture, with hue as secondary.

5. **Learning curve:** How much of this is instantly intuitive vs requires a 2-minute orientation? The terrain metaphor should be mostly self-explanatory (tall = complex, glowing = active, rivers = flow). But temporal coupling aquifers and blast radius seismic rings might need a brief tutorial.

6. **Integration with text editing:** This is an IDE, not just a visualizer. How does the terrain relate to the code editor? Split pane? The terrain _is_ the file browser? Click a feature and the editor opens that file? The editor is a "ground-level view" of the terrain?
