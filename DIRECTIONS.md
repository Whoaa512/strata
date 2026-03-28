# Strata: Directions Forward

> Synthesized from 10 implementations, 2 independent reviews, and Bridge cross-pollination analysis.

---

## Both Reviews Agree On

1. **v10 (TDD/spec-first)** is the strongest foundation — fewest bugs, most tests (88), schema-validated .sv format
2. **The ideal version is a Frankenstein** — no single implementation is the answer
3. **Call graph resolution is the critical gap** — 9/10 versions use name-matching (broken). v6's TS compiler API is the only one that actually resolves through imports.
4. **v9's CLI rendering is steal-worthy** — zero-dep, beautiful terminal output
5. **v7's graph-as-IR** is the right long-term architecture

### Where they diverge

| Topic | Grug Review (COMPARISON.md) | Second Review |
|---|---|---|
| **Top pick** | v10 + cherry picks | v6 extraction + v7 graph + v10 schema |
| **v6 TS compiler** | "Defer — language lock-in" | "Use it — blast radius is useless with name-matching" |
| **v4 plugins** | "Steal the 20-LOC interface" | "Premature for Phase 0" |
| **Priority** | Correctness + test coverage | Call resolution accuracy |

The second reviewer is right that blast radius — the "killer query" — is garbage without real import resolution. Grug is right that v10's test discipline is the safest foundation. Both are correct.

---

## What Bridge Teaches Us

Bridge and Strata are **convergent projects** with different entry points:

| Dimension | Bridge | Strata |
|---|---|---|
| **Unit** | Project (repo) | Entity (function/module) |
| **Scope** | Your whole dev environment | Inside one codebase |
| **Scanner** | Go binary, fs + git + APIs | TS, tree-sitter + git log |
| **Viz** | Canvas2D treemap colony | 2D terrain map (planned) |
| **Spec format** | `bridge-spec.json` | `.sv` JSON |
| **Overlays** | Classification, Git, CI, Infra, Priority, Activity | Complexity, Churn, Hotspots, Coverage, Ownership, Coupling, Blast Radius |

### What to steal from Bridge

#### 1. The Overlay Architecture Pattern
Bridge's overlay system is exactly what Strata Phase 1 needs:

```typescript
type OverlayFn = (entity: Entity, doc: StrataDoc) => TileStyle;
const overlays: Record<string, OverlayFn> = { ... };
```

Same spatial layout, different data lenses. Toggle with number keys. This is proven, simple, and maps 1:1 to the unified plan's overlay table. Bridge built it, Strata should reuse the pattern.

#### 2. Canvas Rendering Infrastructure
Bridge already has battle-tested (155 web tests) Canvas2D primitives:
- **Treemap layout** (`layout/treemap.ts`) — squarified treemap, 100 LOC, group-aware
- **Camera** (`canvas/camera.ts`) — pan/zoom/lerp/focus, world↔screen coordinate transform
- **Hit testing** (`canvas/hit.ts`) — point-in-rect with camera transform
- **Color system** (`canvas/colors.ts`) — classification-based coloring with activity glow
- **Tile rendering** (`canvas/render.ts`) — rounded rect tiles, text truncation, pulse animation

Strata's Phase 1 viz needs ALL of these. The treemap is directly usable for module-level views. Camera/hit-test/colors need minor adaptation but the patterns are identical.

**Recommendation**: Extract Bridge's canvas primitives into a shared package when Strata Phase 1 starts (this is exactly Bridge's planned M5 `packages/render/`).

#### 3. Spec Schema Pattern
Bridge's `bridge-spec.schema.json` is a well-structured JSON Schema with:
- Semver versioning in the spec itself
- Nullable sections with `oneOf [type, null]` pattern
- Per-project `errors` array for graceful degradation
- `updatedAt` timestamps for staleness detection

Strata's `.sv` format should follow the same conventions. v10's Zod schema gets close, but should adopt:
- **Versioning**: `version` field in the .sv doc
- **Error tolerance**: per-file `errors` array (skip bad files, don't crash)
- **Staleness**: `analyzedAt` timestamp for cache validation

#### 4. Go Scanner for Performance-Critical Extraction
Bridge's Go scanner processes 108 repos + 617 monorepo children in ~4s. Strata's git log parsing and file walking would benefit from the same approach:
- `git ls-files` over filepath.Walk
- Tiered strategies (exact vs sampled vs heuristic)
- Parallel workers with cache

For Phase 0, Bun + `git log` subprocess is fine. But Phase 2+ editor integration at <500ms demands either Go or heavy Bun optimization. Bridge proves the Go path works.

#### 5. WebSocket Live Updates
Bridge's `full_sync` → incremental delta pattern over WebSocket is exactly what Strata Phase 2 (editor integration) needs:
- File save → incremental re-analysis → WS push to viz
- Reconnect sends full doc (same as Bridge's `full_sync`)
- Project-scoped invalidation (change in auth/ only re-analyzes auth/)

#### 6. Design Tokens + Inline Styles Convention
Bridge's web convention (inline styles + design tokens, no CSS files) is working well at 155 tests. Strata's web viz should use the same approach.

### What NOT to merge

- **Bridge's project-level data model** — Strata's entities are functions/modules, not repos. Different granularity, different schema.
- **Bridge's Go scanner** — rewriting Strata's analysis in Go would lose tree-sitter WASM/TS compiler API access. Keep analysis in TS.
- **Bridge's agent session management** — irrelevant to Strata.

---

## The Integration Vision: Bridge M5 = Strata

Bridge M5 was always planned as "Fractal Integration" — drill from project tile into codebase viz. **Strata IS that codebase viz.** The convergence:

```
Bridge (env-level)                 Strata (code-level)
┌─────────────────┐               ┌──────────────────┐
│ Colony Map       │──click tile──▶│ Terrain Map      │
│ Projects as tiles│               │ Modules as tiles  │
│ Overlays: CI,Git │               │ Overlays: Complex │
│ bridge-spec.json │               │ .sv JSON          │
└─────────────────┘               └──────────────────┘
         │                                  │
         └──── shared canvas primitives ────┘
              (camera, treemap, hit, colors)
```

Bridge knows which project you're looking at. Strata knows what's inside it. The drill-down is: Bridge tile → Strata terrain → Strata function detail.

---

## Three Directions

### Direction A: "v10 + v6 Resolution + Bridge Canvas" (Recommended)

Best of both reviews + Bridge infrastructure.

**Foundation**: v10's schema-first pipeline + test suite
**Critical fix**: v6's TS compiler API for call resolution (accept TS-only for Phase 0)
**Cherry-picks**: v9 renderer, v4 plugin interface, v5 pure/impure boundary
**From Bridge**: overlay pattern, canvas primitives (for Phase 1), spec conventions

**Phasing**:
1. Start from v10, swap in v6's extraction for call graph accuracy
2. Add v9's terminal renderer
3. Validate on 5 real codebases (Phase 0 complete)
4. Extract Bridge canvas primitives, build terrain viz (Phase 1)
5. Wire Bridge tile drill-down (= Bridge M5)

**Trade-offs**:
- ✅ Highest correctness (real call resolution + best tests)
- ✅ Clear path to Bridge integration
- ✅ Proven viz infrastructure from Bridge
- ⚠️ TS compiler API is slower (~2.5s vs ~200ms for tree-sitter)
- ⚠️ TS-only until Phase 2+ (fine per plan)

**Effort**: ~1 week to Phase 0, ~3 weeks to Phase 1 with Bridge canvas

### Direction B: "v7 Graph + v10 Tests + Tree-sitter with Import Resolution"

Avoid TS compiler lock-in by solving import resolution differently.

**Foundation**: v7's CodeGraph as IR
**Tests**: v10's test suite ported to graph queries
**Resolution**: Build a lightweight import resolver using tree-sitter (parse import statements, resolve relative paths, match exported names). Not as accurate as TS compiler but works for JS too.
**From Bridge**: overlay pattern, canvas primitives

**Trade-offs**:
- ✅ Language-extensible from day 1
- ✅ Graph-as-IR is best architecture for Phase 1+ queries
- ✅ Fast (tree-sitter, not TS compiler)
- ⚠️ Import resolution is ~80% accurate (misses re-exports, dynamic imports, barrel files)
- ⚠️ More upfront work (~2 weeks to Phase 0)
- ⚠️ Graph abstraction adds complexity that may not pay off until Phase 1

### Direction C: "Dual Parser — tree-sitter fast path + TS compiler deep path"

Have both. Use tree-sitter for <500ms editor feedback, TS compiler for accurate CI/batch analysis.

**Foundation**: v10's schema + v7's graph
**Fast path**: tree-sitter + heuristic import resolution (editor, file-save incremental)
**Deep path**: TS compiler API (CI, full analysis, blast radius queries)
**From Bridge**: everything from Direction A

**Trade-offs**:
- ✅ Best of both worlds — speed AND accuracy
- ✅ Natural fit for the plan's incrementality model (Stages 0-2 fast, 3-5 batch)
- ⚠️ Two parsers = two code paths to maintain
- ⚠️ Highest effort (~2 weeks to Phase 0)
- ⚠️ Risk of "fast path says X, deep path says Y" confusion

---

## My Pick: Direction A

**Why**: Blast radius is the killer feature. Name-matching makes it useless. The TS compiler API makes it real. The 2.5s startup cost is acceptable for Phase 0 (CLI) and Phase 1 (batch). When Phase 2 demands <500ms, add tree-sitter as the fast path (evolve into Direction C).

Bridge's canvas primitives are free infrastructure for Phase 1 viz. The overlay pattern is proven. The drill-down from Bridge → Strata is the natural product integration.

Start simple. Make blast radius actually work. Ship Phase 0. Validate with real teams. Build viz on Bridge's shoulders.
