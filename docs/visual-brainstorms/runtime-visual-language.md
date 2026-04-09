# Runtime Visual Language — Design Research

> How to represent runtime behavior, data flow, and operational shape in an agentic IDE.

**Context**: Strata treats codebases as high-dimensional objects. Static structure (call graphs, complexity, churn) is mostly covered. The biggest gap — and the place agents make their most dangerous mistakes — is runtime behavior. Agents see code structure but not runtime reality.

This document proposes 9 concrete visual metaphors for the 3 most under-served dimensions: **Runtime Behavior**, **Data Flow / State Shape**, and **Operational / Production Shape**.

Each metaphor is evaluated on: **legibility** (can you grok it in 5 seconds?), **information density** (how much does it encode?), **composability** (does it layer with existing Strata views?), and **agent value** (does it help agents avoid dangerous mistakes?).

---

## 1. Request River — Request Path Visualization

**Metaphor**: A river system. The main channel is the happy path. Tributaries are middleware/interceptors. Eddies and pools are async operations. Rapids indicate error-prone zones.

### How it works

```
HTTP Entry ──────────────────────────────────────────────── Response
    │                                                          ▲
    ▼                                                          │
  ╔══════╗   ╔══════╗   ╔═══════════╗   ╔═══════╗   ╔═══════╗
  ║ Auth  ║──║ Rate ║──║  Handler   ║──║Service║──║  DB    ║
  ║ MW    ║  ║ Limit║  ║           ║  ║       ║  ║ Query ║
  ╚══════╝   ╚══════╝   ╚═══════════╝   ╚═══════╝   ╚═══════╝
      │                       │               │
      ▼                       ▼               ▼
   [error]               [event emit]    [cache write]
   (eddy)               (tributary)      (pool)
```

### Visual encoding

| Property | Visual signal |
|---|---|
| Throughput/frequency | River width |
| Layer type | Color: blue=HTTP, green=business, amber=data, red=external |
| Error-prone zones | Turbulence pattern (wavy edges) |
| Async operations | Branching tributaries that don't rejoin |
| Latency | Distance between nodes (stretched = slow) |
| Middleware | Sequential narrows the river passes through |

### Why this metaphor

Rivers have natural branching, merging, depth, speed, and volume — all map to request behavior. Unlike subway maps (which show topology but not dynamics), rivers convey **flow**. You can see where water pools (latency), where rapids form (error-prone hot paths), and where tributaries split off (async side-effects).

Subway maps are better for "what connects to what." Rivers are better for "what happens to a request as it moves through."

### Strata integration

- **Existing**: Each river segment maps to entities in the call graph. Blast radius = how far upstream the river goes.
- **New data needed**: Route→handler mapping, middleware ordering, async emit points.
- **Agent value**: Agents currently see `handler → service → repository` as flat function calls. The river shows the *journey* — including middleware they'd miss, error paths they'd ignore, and async side-effects they wouldn't know to test.

### Alternatives considered

| Alternative | Rejected because |
|---|---|
| Subway map | Shows topology, not dynamics. Can't encode throughput or latency. |
| Pipeline diagram | Too mechanical. Doesn't convey branching/async well. |
| Sankey diagram | Great for volume but poor for sequential ordering. |
| Packet trace animation | Too literal, doesn't scale to system-level view. |

---

## 2. Fluid Dynamics — Data Flow Visualization

**Metaphor**: A chemical process / refinery diagram. Data is fluid being processed through pipes, valves, vessels, and gauges.

### How it works

```
              ┌──[valve: validate]──┐
              │                     │
 JSON Input ──┤                     ├── Object ──── DB Write ──── Cache
              │                     │     │            │           │
              └──[valve: sanitize]──┘     │            │           │
                                         ▼            ▼           ▼
                                     ┌──────┐    ┌──────┐    ┌──────┐
                                     │Object│    │  Row │    │Cached│
                                     │ in   │    │  in  │    │ JSON │
                                     │memory│    │  DB  │    │      │
                                     └──────┘    └──────┘    └──────┘
                                     (vessel)    (vessel)    (vessel)
```

### Visual encoding

| Property | Visual signal |
|---|---|
| Data volume | Pipe diameter |
| Data type/format | Fluid color (JSON=blue, Object=green, DB row=amber, cached=cyan) |
| Validation points | Valves (shown open/closed, can reject = valve closes) |
| Storage | Vessels/tanks with fill-level indicators |
| Bottlenecks | Pressure gauges (red = high backpressure) |
| Transformation | Color shift at serialization boundaries |
| Schema shape | Tooltip on pipe shows the type flowing through it |

### Why this metaphor

Chemical process diagrams solve exactly this problem in physical engineering: tracking fluid through transformations, storage, and distribution. Software data flow has the same structure — data enters as one shape, gets validated, transformed, stored in different forms, cached, and eventually served back.

The key insight: **color transitions at serialization boundaries** make the invisible visible. When JSON turns to an Object turns to a DB row, the color shift at each "portal" tells you "data changed shape here — there might be loss, validation, or bugs."

### Strata integration

- **Existing**: DataAccess schema already tracks `db-read`, `db-write`, `cache-read`, etc. RuntimePath tracks reachable entities.
- **New data needed**: Type schemas at function boundaries, serialization library calls, validation function locations.
- **Agent value**: Agents frequently change a field in a request DTO without updating the DB migration, the cache key, or the API response type. The fluid diagram shows ALL the places that field exists in different forms.

---

## 3. Broadcast & Echo — Async/Event Visualization

**Metaphor**: Radio broadcast towers and receivers. Events are electromagnetic pulses; listeners are receivers that light up when the signal reaches them. Queues are conveyor belts. Crons are metronomes.

### How it works

```
                    ┌─ [Listener A] ← ─ ─ ─ ─ ─ ─ ─ ─ ┐
                    │                                     │
 [Event Emitter] ──●──── signal wave ────────────────────●──── [Listener B]
      │             │                                     │
      │             └─ [Listener C] ← ─ ─ ─ ─ ─ ─ ─ ─ ┘
      │
      │   ╔════════════════════════╗
      └──>║  Queue: items moving → ║──────> [Consumer]
          ╚════════════════════════╝

 [Cron] ──♩──♩──♩──♩──♩── (metronome pulse) ──> [Handler]
```

### Visual encoding

| Property | Visual signal |
|---|---|
| Event emission | Concentric expanding rings from emitter point |
| Listener activation | Receiver node lights up when wave reaches it |
| Signal reach | Ring radius = how many listeners affected |
| Queue depth | Conveyor belt length with visible item count |
| Processing rate | Speed items move on conveyor |
| Cron frequency | Metronome tick spacing |
| Fire-and-forget | No return wave (asymmetric!) |
| Dead letter | Items falling off the conveyor end |

### Why this metaphor

The fundamental visual problem with async/events: **there's no return arrow**. In direct call chains, you can draw A→B→A. With events, the emitter fires and *doesn't know or care* who's listening. The broadcast metaphor captures this perfectly — a radio tower doesn't know its listeners.

The key insight: **asymmetry is the signal**. When you see a broadcast wave with no return path, you immediately understand "this is fire-and-forget" in a way that a box-and-arrow diagram can't convey.

Queues add a **time dimension** that events don't have — items sit in a buffer. The conveyor belt makes queue depth visible and processing lag tangible.

### Strata integration

- **Existing**: RuntimeEntrypoint already has `kind: "event" | "queue" | "cron"`. RuntimePath tracks what's reachable from each.
- **New data needed**: Event name→listener mapping, queue consumer registration, cron schedule parsing.
- **Agent value**: Agents routinely change an event emitter without checking listeners, or modify a queue message format without updating consumers. The broadcast visualization shows "this emit reaches THESE 7 listeners, and you changed zero of them."

---

## 4. Thermal Overlay — Hot Path Highlighting

**Metaphor**: Infrared/thermal camera view layered on code structure. Hot paths glow white/yellow, warm paths orange, cold paths deep blue/purple.

### How it works

```
┌─────────────────────────────────────────────┐
│ ■■■■■■■■■■■■  ■■■    ■■■■■■  ■■■■          │  ← file grid
│ ████████████  ███    ██████  ████          │  
│ ▓▓▓▓▓▓▓▓▓▓▓▓  ░░░    ██████  ░░░░          │  
│ ░░░░░░░░░░░░  ░░░    ▓▓▓▓▓▓  ░░░░          │  
│ ░░░░░░░░░░░░  ░░░    ░░░░░░  ░░░░          │  
└─────────────────────────────────────────────┘

████ = HOT (white/yellow, pulsing)      ← auth handler, 50k req/s
▓▓▓▓ = WARM (orange)                    ← user service, 5k req/s
░░░░ = COLD (dark blue/purple)          ← admin panel, 10 req/day
■■■■ = DORMANT (near-invisible)         ← migration scripts, never in runtime
```

### Visual encoding

| Property | Visual signal |
|---|---|
| Request frequency | Thermal intensity (cold → warm → hot → white-hot) |
| Latency contribution | Pulsing speed (fast pulse = high latency contributor) |
| Cold code | Near-invisible, dark blue |
| Dead code | Completely dark, outlined only |
| Perf-critical path | Glowing trail connecting hot nodes |
| Express lanes | Wider/brighter connections between hot nodes |

### Two view modes

1. **Frequency heat**: Colors by how often code executes (throughput)
2. **Latency heat**: Colors by how much latency code contributes (p99 impact)

These often disagree: a function called once per request but taking 500ms shows cold in frequency but HOT in latency.

### Why this metaphor

Thermal cameras are universally understood. Hot = important/active/dangerous. Cold = dormant/safe. The metaphor is immediately legible without explanation.

The key insight: **two heat maps that disagree are more valuable than either alone**. The function that's "cold" in frequency but "hot" in latency is exactly the function agents will optimize incorrectly.

### Strata integration

- **Existing**: Hotspot scoring (complexity × churn) is a proxy for this. Agent risk scores encode attention level.
- **New data needed**: Production traces/profiles for actual runtime frequency and latency. Without production data, Strata can infer approximate heat from: route definition (HTTP = hotter than cron), call graph fan-in (high fan-in = probably hot), and framework conventions.
- **Agent value**: Agents treat all code as equally important. The thermal overlay tells them "this function runs 50k times per second — be very careful" vs "this runs once a month — take more risks."

---

## 5. Mutation Zones — State Change Danger Map

**Metaphor**: Hazmat containment zones. State mutations are hazardous material. The more dangerous the mutation, the more intense the containment zone.

### How it works

```
    ┌───────────────── DANGER ZONE (red) ─────────────────┐
    │                                                       │
    │    ┌──── WARNING ZONE (amber) ────┐                  │
    │    │                               │                  │
    │    │    ┌── SAFE (blue) ──┐       │                  │
    │    │    │                  │       │                  │
    │    │    │  [read users]   │       │                  │
    │    │    │  [read config]  │       │                  │
    │    │    │                  │       │                  │
    │    │    └──────────────────┘       │                  │
    │    │                               │                  │
    │    │  ⚠ [invalidate cache]        │                  │
    │    │  ⚠ [update session]          │                  │
    │    │                               │                  │
    │    └───────────────────────────────┘                  │
    │                                                       │
    │  ☢ [DELETE user account]                              │
    │  ☢ [WRITE billing record]                            │
    │  ☢ [MODIFY auth tokens]                              │
    │                                                       │
    └───────────────────────────────────────────────────────┘
```

### Visual encoding

| Property | Visual signal |
|---|---|
| Read-only | Calm blue, no zone |
| Cache write/invalidation | Amber warning zone, dashed border |
| DB write | Red danger zone, solid border |
| Auth/session mutation | Red danger zone + lock icon |
| Irreversible operations | Hazard stripes (diagonal pattern) |
| Blast radius of mutation | Zone size (bigger = more things affected) |
| Chain reactions | Animated propagation: write → cache invalidation → event |

### Danger taxonomy

| Mutation type | Danger level | Visual |
|---|---|---|
| Cache write | ⚡ Medium | Amber zone |
| Cache invalidation | ⚡ Medium | Amber zone, dashed |
| DB read-write (reversible) | 🔴 High | Red zone |
| DB write (irreversible) | ☢ Critical | Red zone, hazard stripes |
| Auth token mutation | ☢ Critical | Red zone, lock icon |
| Billing/payment write | ☢ Critical | Red zone, hazard stripes, skull |
| External API call (mutating) | 🔴 High | Red zone, external icon |

### Why this metaphor

Hazmat zones are viscerally understood: stay out unless you know what you're doing. The concentric rings communicate "closeness to danger" — code near a dangerous mutation inherits some of its risk.

The key insight: **mutations have blast radius**. A DB write doesn't just affect the write site — it invalidates caches, triggers events, and changes what subsequent reads return. The zone visualization makes this cascade visible.

### Strata integration

- **Existing**: DataAccess schema tracks `db-write`, `cache-write`, `cache-delete`. Risk scoring already exists.
- **New data needed**: Irreversibility classification (DELETE vs UPDATE), auth-related mutation detection, cascade mapping (write → invalidation → event).
- **Agent value**: Agents routinely add a DB write without considering cache invalidation, or modify auth logic without understanding the blast radius. The mutation zone says "you're in a red zone — here's everything that gets affected."

---

## 6. Shadow Infrastructure — The Production Gap

**Metaphor**: Ghost layer. Behind every file of code, there's a shadow of production infrastructure that affects how it behaves. The shadow is invisible in normal code view but can be revealed.

### How it works

```
CODE LAYER (foreground, solid)         SHADOW LAYER (behind, translucent)
┌──────────────────────┐               ┌──────────────────────┐
│ auth.handler.ts      │╌╌╌╌╌╌╌╌╌╌╌╌╌│ 👻 ENABLE_NEW_AUTH   │ (feature flag)
│ user.service.ts      │╌╌╌╌╌╌╌╌╌╌╌╌╌│ 👻 DB_POOL_SIZE=50   │ (env var)
│ billing.handler.ts   │╌╌╌╌╌╌╌╌╌╌╌╌╌│ 👻 migrate_0042.sql  │ (migration)
│ deploy.config.yaml   │              │ 👻 rollback plan     │ (runbook)
│ cache.service.ts     │╌╌╌╌╌╌╌╌╌╌╌╌╌│ 👻 REDIS_CLUSTER=3   │ (infra)
└──────────────────────┘               └──────────────────────┘
         │                                       │
         └──────── slider: 0% ──────────────── 100% ────────┘
              pure code view         full production view
```

### Visual encoding

| Property | Visual signal |
|---|---|
| Feature flag | Toggle switch icon, ethereal connection to guarded code |
| Env var / config | Ghost text behind code, dotted connection |
| Migration | Chain link connecting code to DB state |
| Deploy dependency | Ghost arrow to other service |
| Alert/SLO | Ghost gauge/dashboard thumbnail |
| Runbook | Ghost document icon |

### Interaction: The Reveal Slider

A slider at the bottom fades between:
- **0% (Code Only)**: Just source files, normal view
- **50% (Hints)**: Faint ghost icons appear next to code that has production implications
- **100% (Full Production)**: Shadow layer fully visible, all infrastructure dependencies shown

### Why this metaphor

The "production gap" is literally invisible in code. Feature flags are checked but the flag configuration lives in LaunchDarkly. Env vars are read but their values live in K8s secrets. Migrations are files but their *state* lives in the DB. The ghost metaphor makes this "things that haunt your code" concept tangible.

The key insight: **the slider interaction**. You can progressively reveal how much "hidden production stuff" exists behind innocent-looking code. The shock of sliding from 0%→100% communicates the gap better than any documentation.

### Strata integration

- **Existing**: DataAccess already tracks `env`, `feature-flag`. RuntimeEntrypoint captures routes.
- **New data needed**: Config file→code mapping, migration dependency detection, deploy manifest parsing, infrastructure resource linking.
- **Agent value**: This is THE metaphor for agent safety. Agents see code and miss everything else. The shadow layer is literally "here's everything the agent can't see." A brief could say: "This file has 4 shadow dependencies: a feature flag, a migration, an env var, and a deploy config. Agent must account for all of them."

---

## 7. Contamination Paths — PII/Security Data Flow

**Metaphor**: Radioactive contamination tracking. Sensitive data (PII, secrets, auth tokens) leaves a glowing trail wherever it flows. Sanitization is decontamination. Leaks are breach events.

### How it works

```
                    ╔═══════════════╗
                    ║  User Input   ║  ← data enters clean (green)
                    ╚══════╤════════╝
                           │ 🟢 clean
                           ▼
                    ╔═══════════════╗
                    ║  PII Field    ║  ← email, SSN, etc. → CONTAMINATION
                    ║  (name,email) ║
                    ╚══════╤════════╝
                           │ ☢️ contaminated (glowing yellow-green)
                    ┌──────┼──────┐
                    ▼      ▼      ▼
                ┌──────┐ ┌────┐ ┌─────┐
                │Logger│ │ DB │ │ API │
                └──────┘ └────┘ └─────┘
                   │        │      │
                   ▼        ▼      ▼
                 ☢️ LEAK!  ✅ OK   ⚠️ CHECK
               (red flash) (stored) (external = risky)
```

### Visual encoding

| Property | Visual signal |
|---|---|
| Clean data | Green flow |
| PII-tainted data | Glowing yellow-green with particle trail |
| Secrets | Bright red glow |
| Auth tokens | Purple glow (matches Strata accent) |
| Sanitization point | Decontamination station (glow dissipates → green) |
| Unsanitized leak | Red flash/pulse at the leak point |
| Cumulative contamination | Glow intensifies as more PII types accumulate |

### Contamination rules

1. Data that **touches** PII becomes contaminated
2. Contamination **propagates** through assignments, function returns, and serialization
3. Only explicit **sanitization/redaction** removes contamination
4. Logging contaminated data = **BREACH** (red flash)
5. Sending contaminated data to external API = **WARNING** (amber flash)
6. Storing contaminated data with encryption = **OK** (green store)

### Why this metaphor

Radioactive contamination is the perfect analog for PII: it's invisible, it spreads through contact, it requires deliberate decontamination, and leaks are catastrophic. The visual of a glowing trail following data through the system makes the invisible danger viscerally clear.

The key insight: **contamination is cumulative and sticky**. A variable that concatenates `user.name + user.email + user.ssn` gets MORE contaminated, not less. The visual should show intensifying glow, not just binary clean/dirty.

### Strata integration

- **Existing**: Could be layered on top of RuntimePath reachable entities. DataAccess tracks what's accessed.
- **New data needed**: PII field detection (type names, column names, variable names matching PII patterns), sanitization function identification, logging call detection, external API call detection.
- **Agent value**: Agents will happily add `console.log(user)` to debug a problem, not realizing `user` contains PII. The contamination path shows "this variable is radioactive — do not log, do not send externally, do not cache without encryption."

---

## 8. Portal Network — Serialization Boundaries

**Metaphor**: Portals/gateways between different "realms" where data changes form. Each serialization format is a distinct visual realm with its own texture and color temperature.

### How it works

```
┌─────────────────┐    ╔══╗    ┌─────────────────┐    ╔══╗    ┌─────────────────┐
│   JSON Realm    │    ║🌀║    │  Object Realm   │    ║🌀║    │    DB Realm     │
│   (cool blue)   │───>║  ║───>│  (warm green)   │───>║  ║───>│  (deep amber)  │
│                 │    ╚══╝    │                 │    ╚══╝    │                 │
│ { "name": "…", │  parse()   │ user.name       │  INSERT    │ name VARCHAR    │
│   "email": "…" │            │ user.email      │            │ email VARCHAR   │
│   "age": 25 }  │            │ user.age        │            │ age INTEGER     │
│                 │            │                 │            │                 │
│  + "metadata"   │            │  - metadata     │            │  + created_at  │
│    (present)    │            │    (dropped!)   │            │    (added!)    │
└─────────────────┘            └─────────────────┘            └─────────────────┘

Portal legend:
  ╔══╗
  ║🌀║ = serialization boundary (data changes shape here)
  ╚══╝
  
  Fields gained: + green
  Fields lost:   - red (potential bug!)
```

### Visual encoding

| Property | Visual signal |
|---|---|
| JSON realm | Cool blue texture, curly braces motif |
| In-memory Object realm | Warm green, clean geometric shapes |
| DB realm | Deep amber, table/row grid pattern |
| Cache realm | Electric cyan, lightning motifs |
| Queue realm | Purple, conveyor pattern |
| Portal (serialization point) | Swirling vortex icon between realms |
| Fields gained in transformation | Green + indicator |
| Fields lost in transformation | Red - indicator (⚠ potential bug) |
| Type mismatch at boundary | Portal glows red / blocked |

### Why this metaphor

Serialization is where more bugs live than anyone admits. JSON.parse can silently drop fields. DB schemas can have columns the code doesn't know about. Cache serialization can lose type information. The portal metaphor makes each boundary crossing VISIBLE and INSPECTABLE.

The key insight: **field diff at each portal**. Showing what goes IN vs what comes OUT of each serialization boundary immediately reveals data loss, unexpected additions, and type mismatches. This is information that exists nowhere in current tools.

### Strata integration

- **Existing**: DataAccess tracks the access kinds. RuntimePath shows the path through entities.
- **New data needed**: Type information at function boundaries, serialization library call detection (JSON.parse, JSON.stringify, ORM model definitions, cache serializer calls), schema extraction from DB migration files.
- **Agent value**: Agents add fields to DTOs without updating the DB migration. They change DB column types without updating the cache serializer. The portal view shows "you changed the Object realm but didn't update the portal to DB realm — the new field will be silently dropped."

---

## 9. Reality Overlay — Static vs Runtime Gap

**Metaphor**: Augmented Reality overlay. Static code is the "physical world." Runtime behavior is the "AR layer" that shows what actually happens when the code runs.

### How it works

```
STATIC VIEW (what code says)          RUNTIME VIEW (what actually happens)
┌──────────────────────────┐          ┌──────────────────────────┐
│                          │          │                          │
│  if (featureFlag) {      │          │  if (featureFlag) {      │
│    ┌─ newAuthFlow() ─┐   │          │    ╔═ newAuthFlow() ═╗   │ ← ACTIVE (flag=true)
│    └─────────────────┘   │          │    ╚═════════════════╝   │
│  } else {                │          │  } else {                │
│    ┌─ oldAuthFlow() ─┐   │          │    ░░ oldAuthFlow() ░░   │ ← GHOSTED (never runs)
│    └─────────────────┘   │          │    ░░░░░░░░░░░░░░░░░░░   │
│  }                       │          │  }                       │
│                          │          │                          │
│  interface AuthService   │          │  interface AuthService   │
│    ┌─ ???             │   │          │    ╔═ OAuthServiceImpl ═╗│ ← DI resolved
│    └─────────────────┘   │          │    ╚════════════════════╝│
│                          │          │                          │
│  handler.process(req)    │          │  handler.process(req)    │
│    ┌─ ??? (dynamic)  │   │          │    ╔═ 80% TextHandler ═╗ │ ← dispatch distribution
│    └─────────────────┘   │          │    ║  15% ImageHandler  ║ │
│                          │          │    ║   5% VideoHandler  ║ │
│                          │          │    ╚════════════════════╝ │
└──────────────────────────┘          └──────────────────────────┘
```

### Visual encoding

| Property | Visual signal |
|---|---|
| Active code path (flag=on) | Solid bright border, full opacity |
| Dead code path (flag=off) | Ghosted/faded, translucent |
| DI resolution | Dotted line → solid line to actual implementation |
| Dynamic dispatch | Multiple targets with percentage bars |
| Reflective/metaprogramming calls | Wavy/uncertain lines |
| Never-called code | Completely faded, almost invisible |
| Interface → implementation | Ghost interface fading into solid implementation |

### The Toggle

The most important interaction: a smooth morph between "Code Says" and "Runtime Does."

- **Code Says**: All branches shown equally. Interfaces show no implementation. Dynamic dispatch shows ???.
- **Runtime Does**: Active branches bright, dead branches ghosted. Interfaces resolved to implementations. Dynamic dispatch shows actual distribution.

### Why this metaphor

AR is the perfect frame because the physical world (code) doesn't change — you just see more information layered on top. The code is still there; the runtime layer adds truth.

The key insight: **the morph animation itself is the information**. When you toggle from static→runtime and watch half your code ghost away (feature flagged off), you viscerally understand the gap between "what I see in my editor" and "what's actually running in production."

### Strata integration

- **Existing**: RuntimeEntrypoint, RuntimePath, and DataAccess provide the runtime layer data.
- **New data needed**: Feature flag state (from flag service), DI container configuration, dynamic dispatch statistics (from traces/profiles), dead code detection.
- **Agent value**: This is the ultimate agent safety tool. Agents read ALL the code and treat it equally. The reality overlay says "60% of what you're reading doesn't actually run in production. Here's the 40% that matters." This prevents agents from optimizing dead code, testing inactive paths, or breaking things that are feature-flagged off.

---

## Composition: How These Layer Together

These 9 metaphors aren't 9 separate tools. They're **layers** that compose:

```
Layer stack (bottom to top):

  9. Reality Overlay      ─── "is this code even running?"
  8. Portal Network       ─── "where does data change shape?"
  7. Contamination Paths  ─── "where is sensitive data?"
  6. Shadow Infrastructure ── "what invisible infra affects this?"
  5. Mutation Zones       ─── "where are dangerous state changes?"
  4. Thermal Overlay      ─── "what's hot vs cold?"
  3. Broadcast & Echo     ─── "what async/events are happening?"
  2. Fluid Dynamics       ─── "how does data flow and transform?"
  1. Request River        ─── "what's the request path?"

  0. (Existing Strata)   ─── "code shape, complexity, churn, blast radius"
```

### Suggested default combinations

| User goal | Layers shown |
|---|---|
| "Understanding a request" | 1 (River) + 4 (Thermal) + 5 (Mutation) |
| "Reviewing a data change" | 2 (Fluid) + 7 (Contamination) + 8 (Portals) |
| "Assessing agent risk" | 6 (Shadow) + 9 (Reality) + 5 (Mutation) |
| "Debugging async issue" | 3 (Broadcast) + 1 (River) + 4 (Thermal) |
| "Security review" | 7 (Contamination) + 5 (Mutation) + 6 (Shadow) |
| "Performance investigation" | 4 (Thermal) + 1 (River) + 2 (Fluid) |

### The 3-Layer Rule

Never show more than 3 layers simultaneously. Visual overload destroys comprehension. Default: show 1 layer. Let users toggle up to 3. Auto-suggest combinations based on the task context.

---

## Implementation Priority for Strata

Based on what Strata already has in its schema and what provides the most agent value:

### Phase 1: Immediately buildable (schema exists)
1. **Thermal Overlay** — Hotspot data + agent risk already computed. Just need the visual layer.
2. **Mutation Zones** — DataAccess schema already classifies reads/writes/caches. Layer danger zones on the explorer.

### Phase 2: Needs extraction work (schema started)
3. **Request River** — RuntimeEntrypoint + RuntimePath schemas exist but extraction is partial. Complete route→handler→service chain extraction.
4. **Broadcast & Echo** — RuntimeEntrypoint has `event`/`queue`/`cron` kinds. Need listener/consumer mapping.

### Phase 3: Needs new analysis
5. **Reality Overlay** — Needs feature flag detection, DI resolution, dead code analysis.
6. **Shadow Infrastructure** — Needs config→code mapping, migration tracking, deploy manifest parsing.
7. **Portal Network** — Needs type-level analysis at serialization boundaries.
8. **Fluid Dynamics** — Needs end-to-end type flow tracking.
9. **Contamination Paths** — Needs PII field detection and taint analysis.

---

## Open Questions

1. **Production data**: Several visualizations (thermal, reality overlay) are dramatically more valuable with production trace data. Should Strata integrate with OpenTelemetry / production profiling, or stay pure static analysis?

2. **Granularity**: Do these visualizations work at file level, function level, or service level? Probably all three, with progressive drill-down. But which level is the default?

3. **Real-time vs snapshot**: Should the thermal overlay show current production state (live dashboard) or historical analysis (snapshot)? Live is more compelling but massively more complex.

4. **Agent instructions**: Beyond visualizing for humans, should these layers generate textual instructions for agents? E.g., "WARNING: You are modifying code in a red mutation zone. The following caches will be invalidated: [...]"

5. **Cross-service**: All 9 metaphors work within a single codebase. But modern systems span services. Does the river metaphor extend across service boundaries? (Yes, but it requires distributed tracing integration.)

---

## Summary: The Visual Language Principles

1. **Physics metaphors over computer science metaphors**: Rivers, heat, contamination, portals are more immediately legible than "call graphs," "DAGs," or "state machines."

2. **Motion encodes time**: Flow = data moving. Pulses = events. Breathing = activity level. Stillness = dormancy. Animation isn't decoration — it's data.

3. **Color encodes danger and domain**: Not random palettes. Red = danger/mutation. Amber = caution. Blue = safe/read. Green = clean. Purple = security/auth. Consistent across all layers.

4. **Absence is information**: Ghosted/faded elements (Reality Overlay) communicate "this doesn't run" as powerfully as bright elements communicate "this is hot."

5. **Progressive disclosure over information dump**: Start with one layer. Let users add layers. Auto-suggest based on context. Never show everything at once.

6. **The gap is the story**: Every visualization is about showing a gap — between code and runtime, between what's visible and what's hidden, between what's safe and what's dangerous. The visualizations make gaps tangible.
