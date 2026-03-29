# Strata Product Spec

> Last updated: 2026-03-29
> Status: Draft — living document

---

## What Is Strata?

Strata helps engineers **see the shape of code** so they can steer AI agents safely through codebases.

Traditional metrics measure human reading difficulty. Agents don't care about that. What matters: how hard is code to **safely change**, and what will that change ripple into?

The user isn't the coder. They're the **air traffic controller** — routing agents, managing risk, catching what agents miss.

## The Two Jobs

| Job | Trigger | Core question |
|-----|---------|--------------|
| **Explore** | "I just cloned this repo" | How is this system shaped? Where does complexity live? |
| **Operate** | "I'm shipping feature X" | What should I know before sending an agent in? What did the agent miss? |

Everything in the product serves one of these two jobs. If it serves neither, kill it.

---

## Decision Tree of Unknowns

Before building further, these questions need answers. They're ordered by dependency — later decisions depend on earlier ones.

### Tier 0: Must answer now (blocks next work)

| # | Question | Why it matters | How to answer |
|---|----------|---------------|---------------|
| D1 | **Does the circle-packing view help anyone understand a real codebase?** | If the current viz is useless at real scale, iterating on overlays is wasted work | Run `strata explore` on 3 real repos (1 small, 1 medium, 1 monorepo). Screenshot. Can you answer "where does complexity live?" in 30 seconds? |
| D2 | **Does `strata brief` change agent behavior?** | The CLI brief is only valuable if it actually improves agent output | Run 5 agent tasks with and without the brief. Compare: did the agent miss fewer files? Produce fewer bugs? |
| D3 | **What's the right visual metaphor for code flow — and can we build it?** | The user wants Unreal Blueprints for code. This is a massive UX and technical bet. Need a spike before committing. | Build a static mockup of 1 function's call tree as a node-wire diagram. Show it to 3 engineers. "Does this help you understand the code faster than reading it?" |

### Tier 1: Answer before Phase 2

| # | Question | Why it matters | How to answer |
|---|----------|---------------|---------------|
| D4 | **How do structural siblings actually manifest in real codebases?** | The sibling concept is novel. Might be critical, might be noise. | Manually audit 3 repos: find cases where parallel implementations exist. How would you detect them? What signal is strongest — naming, AST shape, co-change? |
| D5 | **Is TS-compiler-only extraction acceptable, or do users need multi-language?** | Determines whether to invest in tree-sitter path. If 90% of target users are TS/JS, TS compiler is fine. | Survey target users: what languages are your repos? |
| D6 | **What's the ceiling on entity count before viz breaks?** | Real repos have 1000s of functions. Circle packing might collapse. Node-wire definitely will. | Test with 500, 1000, 5000 entity datasets. Where does each view become unusable? |

### Tier 2: Answer before Phase 3

| # | Question | Why it matters |
|---|----------|---------------|
| D7 | Can agents query Strata themselves (MCP tool), and does that change outcomes more than human-injected briefs? |
| D8 | Does temporal coupling detection work on repos with <100 commits? |
| D9 | Do users want Strata in their editor, or is browser + CLI enough? |

---

## Product Surfaces

### Surface 1: CLI

The CLI is Strata's **workhorse**. It's what agents consume and what power users reach for.

#### `strata analyze <path>`
**Exists today. Working.**
Runs full analysis pipeline, writes `.strata/analysis.sv.json`.

**Not for v1:** Incremental analysis (re-analyze only changed files). Full scan is fine while analysis is <10s.

#### `strata brief [path] [file]`
**Exists today. Working.**
Outputs risk map (codebase-level) or entity detail (file-level).

**Next improvements (in priority order):**

1. **Task-scoped brief** — `strata brief --task "add rate limiting to auth"` — uses NLP/heuristics to identify relevant files and give a focused briefing instead of whole-codebase dump. *This is the highest-value CLI improvement.* But it's also the hardest. Validate D2 first.

2. **Machine-readable output** — `strata brief --format json` — so agents can parse it programmatically instead of reading terminal formatting.

3. **Diff-aware brief** — `strata brief --diff HEAD~1` — "here's what changed, here's what the change might have missed." Post-agent review mode.

**Not for v1:** Natural language task understanding, auto-injection into agent prompts.

#### `strata explore <path>`
**Exists today. Working.**
Launches web explorer on localhost.

No CLI changes needed — improvements happen in the web surface.

---

### Surface 2: Web Explorer

The explorer is Strata's **understanding engine**. Where you go to see the shape of code.

#### Current State (v0.5)

Circle-packing visualization. Files as circles nested in directory groups. Five overlay modes (Attention, Ripple, Context Cost, Implicit Coupling, Blast Radius). WASD panning, zoom, search, detail panel on click.

**What works:** Quick visual of "where are the hot spots." The overlays are genuinely useful for spotting risk.

**What doesn't work:** Circle packing shows *structure* (directory hierarchy) but not *flow* (how code connects). You can see that `auth/middleware.ts` is red, but you can't see *why* — what calls it, what it calls, how a change propagates. The user has to mentally reconstruct the graph.

#### Evolution: Three Views

The explorer evolves through three views, each serving a different zoom level. They coexist — user moves between them.

##### View 1: Terrain Map (current, improved)

**What it is:** Circle-packing / treemap of the codebase. Bird's-eye structural view.

**Purpose:** Answer "where does complexity live?" at a glance.

**Improvements over current:**
- Group by module/package, not just directory (configurable)
- Size = context cost (not LOC — bigger = more expensive for agents)
- Color = safety rating (green/yellow/red)
- Hover shows: name, safety rating, ripple score, top risk factor
- Click opens detail panel OR transitions to Flow View for that entity

**Wireframe:**
```
┌─────────────────────────────────────────────────────────┐
│ STRATA  [Attention] [Ripple] [Context] [Coupling]  [/] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌──────────────────────┐  ┌────────────────────────┐  │
│   │ src/auth/            │  │ src/api/               │  │
│   │  ┌────────┐ ┌──────┐│  │  ┌──────┐ ┌──────────┐│  │
│   │  │████████│ │░░░░░░││  │  │██████│ │▒▒▒▒▒▒▒▒▒▒││  │
│   │  │midlware│ │sessn ││  │  │routes│ │handlers  ││  │
│   │  │ 🔴     │ │ 🟡   ││  │  │ 🔴   │ │ 🟡       ││  │
│   │  └────────┘ └──────┘│  │  └──────┘ └──────────┘│  │
│   │  ┌──┐               │  │  ┌────────────┐       │  │
│   │  │░░│ types          │  │  │░░░░░░░░░░░░│ utils │  │
│   │  │🟢│               │  │  │ 🟢          │       │  │
│   │  └──┘               │  │  └────────────┘       │  │
│   └──────────────────────┘  └────────────────────────┘  │
│                                                         │
│   ┌──────────────────────────────────────────────────┐  │
│   │ src/lib/                                         │  │
│   │  ┌─────────────────┐ ┌───────┐ ┌──┐ ┌──┐ ┌──┐  │  │
│   │  │▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│ │░░░░░░░│ │░░│ │░░│ │░░│  │  │
│   │  │ database  🟡    │ │cache 🟢│ │🟢│ │🟢│ │🟢│  │  │
│   │  └─────────────────┘ └───────┘ └──┘ └──┘ └──┘  │  │
│   └──────────────────────────────────────────────────┘  │
│                                                         │
│ ● 🔴 3 high  ● 🟡 8 medium  ● 🟢 24 low              │
└─────────────────────────────────────────────────────────┘
```

##### View 2: Flow View (the big bet)

**What it is:** Node-wire diagram showing how code flows. Functions as nodes, calls as wires, data as typed ports.

**Purpose:** Answer "how does this code connect?" and "what does a change here ripple into?"

**This is the Unreal Blueprints inspiration.** But code isn't a visual programming language — it's denser, more interconnected. The key design constraint: **show the subgraph that matters, not the whole graph.**

**Entry points into flow view:**
- Click an entity in terrain map → shows its immediate neighborhood (callers, callees, siblings)
- Search for a function → shows its call chain
- `strata explore --flow auth/middleware.ts` → opens flow view centered on that file

**Node anatomy:**
```
┌─────────────────────────────┐
│ 🟡 validateToken            │  ← safety rating + name
│ auth/middleware.ts:42       │  ← location
├─────────────────────────────┤
│  ← getSession()            │  ← incoming calls (left ports)
│  ← refreshToken()          │
├─────────────────────────────┤
│  → checkPermissions()  →   │  ← outgoing calls (right ports)
│  → logAccess()         →   │
├─────────────────────────────┤
│ ctx: 2.1k tokens  ripple: 4│  ← key metrics
└─────────────────────────────┘
```

**Wires:**
- Solid line = static dependency (import/call)
- Dashed line = temporal coupling (co-change without import)
- Line thickness = coupling strength (call frequency or co-change confidence)
- Color follows safety rating of the *target* (red wire = you're calling something dangerous)

**Subgraph scoping (critical for scale):**
- Default: show 1 hop (direct callers + callees) from selected entity
- User can expand: click a node to add its connections
- User can collapse: right-click to hide a node
- Depth slider: 1-hop, 2-hop, 3-hop (with warning at 3: "this will be dense")
- Filter by: same file, same directory, same module, entire codebase

**Layout:**
- Left-to-right flow (callers → entity → callees)
- Dagre or ELK layout algorithm for automatic positioning
- User can drag nodes to rearrange
- Temporal coupling wires rendered as arcs above/below the main flow to avoid crossing

**Wireframe:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ STRATA  [Terrain] [Flow]  depth:[1▾]  filter:[module▾]    [/]       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                     ┌──────────────┐                                 │
│  ┌──────────┐      │              │      ┌───────────────┐          │
│  │ getUser  │─────▶│ validateToken│─────▶│checkPermission│          │
│  │ 🟢       │      │ 🟡           │─┐    │ 🟡            │          │
│  └──────────┘      │              │ │    └───────────────┘          │
│                     └──────────────┘ │                               │
│  ┌──────────┐          │            │    ┌───────────────┐          │
│  │ refresh  │──────────┘            └───▶│ logAccess     │          │
│  │ Token 🟢 │                            │ 🟢            │          │
│  └──────────┘                            └───────────────┘          │
│                                                                      │
│  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌                      │
│  ⚠ implicit coupling: session.ts (87% co-change, no import link)    │
│  ┌──────────┐                                                        │
│  │ session  │╌╌╌╌╌╌╌╌╌▶ (validateToken)                             │
│  │ Manager  │  dashed = temporal only                                │
│  │ 🟡       │                                                        │
│  └──────────┘                                                        │
│                                                                      │
│ Ripple zone: 4 files │ Context cost: ~8.2k tokens                   │
└──────────────────────────────────────────────────────────────────────┘
```

**Open design questions for Flow View:**
- How to represent file-level vs function-level? (Toggle? Auto based on zoom?)
- How to show structural siblings in flow view? (Badge? Grouped container?)
- Does the user need to see data types on wires, or is call direction enough for v1?
- What layout engine works in browser without heavy deps? (dagre is 40KB, ELK is 200KB)

##### View 3: Timeline View (Phase 3+)

**What it is:** Git-time view showing how complexity and coupling evolve.

**Purpose:** Answer "where is complexity growing?" and "is our architecture getting better or worse?"

**Not for v1. Not for v2. Park it.** The data exists (git churn), but the viz is a separate product-level effort. Mention it in the README as a direction, don't build it.

---

### Surface 3: Agent Briefing Injection (Phase 2)

**What it is:** Strata generates context that gets injected into agent prompts automatically.

**Two modes:**
1. **Manual** — user runs `strata brief --task "..." --format md` and pastes into prompt
2. **Auto** — MCP tool that agents can call: `strata.getContext({ files: ["auth/middleware.ts"] })`

**Why wait:** Need to validate D2 first — does the brief actually change outcomes? If it doesn't, auto-injection is useless automation of a useless thing.

### Surface 4: Editor Integration (Phase 3)

**What it is:** Gutter decorations, inline warnings, CodeLens showing ripple risk.

**Why wait:** Editor integrations are expensive to build and maintain (VS Code API, Neovim plugin, JetBrains...). The ROI is unclear until we know Strata's core value proposition resonates. Browser + CLI covers the use cases for now.

---

## User Journeys

### Journey 1: "I just cloned this repo"

**Trigger:** Engineer joins a team or starts working with an unfamiliar codebase.

**Current solution:** Read the README. Browse directories. Ask a colleague. Spend 2-3 days building a mental model.

**With Strata:**
```
$ cd new-repo && strata explore .

# Browser opens. Terrain map loads.
# In 30 seconds, engineer sees:
# - 3 red zones (auth, payments, data pipeline)
# - Most of the codebase is green (simple, isolated)
# - Two implicit coupling clusters they wouldn't have guessed

# They click on the red "payments" zone.
# Flow view shows: 4 functions with high blast radius,
# all calling a shared `processTransaction` that touches 12 files.

# They now know: "payments is the dragon. Don't send an agent
# in there without reading processTransaction first."
# Total time: 5 minutes vs 2 days.
```

**Acceptance criteria:**
- [ ] Time to first insight < 60 seconds after `strata explore` opens
- [ ] User can identify the 3 riskiest areas without reading any code
- [ ] User can drill from overview to specific function flow in 2 clicks

### Journey 2: "I'm about to add feature X"

**Trigger:** Engineer has a task, wants to brief an agent before sending it in.

**Current solution:** Mentally trace the code, guess at impact, hope for the best.

**With Strata:**
```
$ strata brief . --task "add rate limiting to auth endpoints"

# Output shows:
# - 7 predicted files in the change set
# - 2 structural siblings (auth.ts + oauth.ts) that need parallel changes
# - 1 implicit coupling (session.ts) the agent would likely miss
# - Convention: rate limits go in config/rate-limits.ts, not inline
# - Context cost: ~8.2k tokens

# Engineer pastes this briefing into the agent prompt.
# Agent produces a PR that touches all 7 files.
# Without the brief, agent would have missed oauth.ts and session.ts.
```

**Acceptance criteria:**
- [ ] Brief identifies ≥80% of files that actually need changing (measured against real PRs)
- [ ] Brief catches implicit couplings that agents miss without it
- [ ] Output is copy-pasteable into an agent prompt

**Note:** The `--task` flag requires NLP to map a description to code entities. This is a hard problem. **MVP alternative:** `strata brief . auth/middleware.ts` — brief centered on a specific file, user does the mapping. Ship this first.

### Journey 3: "Agent just made changes, did it miss anything?"

**Trigger:** Agent produces a diff. Human reviews before merging.

**Current solution:** Manual code review. Hope you know the codebase well enough to spot gaps.

**With Strata:**
```
$ strata brief . --diff HEAD~1

# Output shows:
# - Files changed: auth/middleware.ts, api/routes/auth.ts
# - ⚠ MISSED: api/routes/oauth.ts (structural sibling, 94% co-change)
# - ⚠ MISSED: test/auth/middleware.test.ts (no test updates for changed function)
# - ⚠ CHECK: session.ts (implicit coupling, 87% co-change rate)
```

**Acceptance criteria:**
- [ ] Given a diff, identifies files that historically co-change but weren't included
- [ ] Flags missing test updates for changed functions
- [ ] Zero false positives on the "MISSED" list (high precision > high recall)

**This is probably the highest-value journey.** It's concrete, testable, and directly prevents agent mistakes. But it requires `--diff` mode, which doesn't exist yet.

### Journey 4: "Where is complexity growing?"

**Trigger:** Tech lead / architect wants to monitor codebase health over time.

**Current solution:** Occasional "let's refactor this" conversations. No data.

**Not for v1.** Requires storing historical analysis results and diffing them. The infrastructure cost is high and the user base is narrow (team leads, not individual devs). Park it.

---

## Prioritization

### Tier 1: Must ship (blocks core value)

| # | What | Why | Effort |
|---|------|-----|--------|
| P1 | **Validate current viz on real repos** (D1) | If it's useless at scale, all viz work is wasted | 1 day |
| P2 | **Validate brief improves agent outcomes** (D2) | If briefs don't help, the CLI surface is theater | 2-3 days |
| P3 | **`strata brief --diff`** (Journey 3) | Highest-value, most concrete user journey. Catches what agents miss. | 3-5 days |
| P4 | **`strata brief --format json`** | Unblocks machine consumption of briefs | 1 day |

### Tier 2: Should ship (meaningful improvement)

| # | What | Why | Effort |
|---|------|-----|--------|
| P5 | **Flow view spike** (D3) | The node-wire view is the product vision. Need to prove feasibility. | 1 week spike |
| P6 | **Structural sibling detection** | Novel detection that no other tool does. Differentiator. | 1-2 weeks |
| P7 | **Terrain map improvements** | Size=context cost, better grouping, transitions to flow view | 1 week |
| P8 | **MCP tool for agent self-serve** | Agents query Strata directly instead of human injecting context | 1 week |

### Tier 3: Could ship (nice to have)

| # | What | Why | Effort |
|---|------|-----|--------|
| P9 | Task-scoped brief (`--task "..."`) | NLP mapping is hard, manual file targeting works for now | 2+ weeks |
| P10 | Convention extraction | Useful but detection is fuzzy. High risk of noise. | 2+ weeks |
| P11 | Timeline view | Cool but different product. Serves architects, not operators. | 3+ weeks |

### Kill List

| What | Why kill it |
|------|-----------|
| Multi-language support (Phase 1) | TS/JS covers the target user. Don't build tree-sitter infra until someone asks. |
| Editor integration | Expensive to build and maintain. Browser + CLI is enough. Revisit after 50 users. |
| Auto-injection into agent prompts | Build MCP tool instead. Let agents pull, don't push. |
| Dashboard / monitoring view | Different user (team lead), different product. Don't dilute. |
| Historical trend tracking | Requires persistence layer, adds infrastructure burden for a minority use case. |

---

## Risks and Open Questions

### Technical Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Flow view layout at scale** — dagre/ELK might produce spaghetti with >50 nodes | High | Spike with real data (P5). If layout fails, fall back to force-directed with aggressive filtering. |
| **TS compiler API speed** — currently ~2-5s for analysis. Acceptable for CLI, but blocks live/watch mode | Medium | Fine for Phase 0-1. Add tree-sitter fast path only when watch mode is needed. |
| **Temporal coupling needs git history** — repos with <50 commits produce garbage data | Medium | Add confidence floor. Warn user when history is insufficient. Degrade gracefully. |
| **Structural sibling detection accuracy** — naming heuristics will produce false positives | Medium | Start with high-confidence signals only (same interface impl). Add fuzzy signals later. |

### UX Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Information overload** — too many overlays, too many metrics, user doesn't know where to look | High | Default to ONE view (safety rating). Other overlays are opt-in. Progressive disclosure. |
| **Flow view ≠ Unreal Blueprints** — code graphs are denser and less tree-like than game logic | High | Aggressive subgraph scoping. Never show the whole graph. Always center on a selected entity. |
| **Brief output too long** — agents have context limits, humans skim | Medium | Brief should be <500 lines. Compress aggressively. Offer `--compact` mode. |
| **"So what?" problem** — viz shows complexity but doesn't tell you what to do about it | Medium | Every red zone should have an actionable note: "read X before changing this" or "change Y too" |

### Product Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Building for imagined users** — the agent-steering workflow is emerging, not established | High | Validate with 5 real users doing real agent work. If brief doesn't change outcomes (D2), pivot. |
| **Scope creep toward "code quality dashboard"** — that market is saturated (SonarQube, CodeClimate) | High | Stay ruthlessly agent-centric. If a feature doesn't help steer agents, cut it. |
| **Viz becomes the product** — easy to spend months on pretty graphics that don't change behavior | High | Measure: does the viz help users make better decisions faster? If not, improve the CLI brief instead. |

---

## The Minimum Viable Next Step

**Don't build the flow view yet.**

The highest-value, lowest-risk next step is:

### `strata brief --diff HEAD~1`

This directly serves Journey 3 ("did the agent miss anything?"), which is:
- **Concrete:** Input is a git diff. Output is a list of probably-missed files.
- **Testable:** Compare against real PRs — did Strata catch what humans caught in review?
- **Immediately useful:** Works today, in the CLI, no viz needed.
- **Validates the core thesis:** If Strata can reliably catch what agents miss, everything else follows. If it can't, the viz is just a toy.

**Scope:**
1. Parse `git diff` to get changed files/entities
2. For each changed entity, look up temporal couplings and structural deps
3. Identify files in the ripple zone that weren't in the diff
4. Output: "These files probably need changes too" with confidence scores

**Not in scope for this step:** NLP task parsing, structural siblings, convention detection, any viz changes.

**After this ships and validates, then** spike the flow view (P5).

---

## Success Metrics

How we know Strata is working:

| Metric | Target | How to measure |
|--------|--------|---------------|
| **Missed-file catch rate** | Brief identifies ≥1 missed file in 50% of agent PRs | Run brief --diff on 20 real PRs, compare against human review |
| **Time to first insight** | <60s from `strata explore` to "I know where the dragons are" | Stopwatch test with 3 engineers on unfamiliar repos |
| **Brief adoption** | User pastes brief into agent prompt ≥80% of the time | Self-reported (it's a single user for now) |
| **Agent outcome improvement** | Agent PRs with brief have fewer review comments than without | A/B on 10 real tasks |

---

## Appendix: Schema Evolution

Current `.sv` schema (v0.2.0) supports: entities, callGraph, churn, temporalCoupling, hotspots, blastRadius, changeRipple, agentRisk.

**Planned additions (only when needed):**

```
v0.3.0 (with --diff mode):
  + diffContext: { changedFiles, changedEntities, missedFiles[] }

v0.4.0 (with sibling detection):
  + siblingGroups: [{ id, reason, entityIds[], confidence }]
  + agentRisk gains: siblingGroupIds[]

v0.5.0 (with flow view):
  + No schema changes — flow view reads existing callGraph + temporalCoupling
```

Don't add schema fields speculatively. Add them when a surface needs them.
