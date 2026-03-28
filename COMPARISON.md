# Strata Phase 0: 10-Version Deep Comparison

> Comprehensive analysis of 10 parallel implementations of the Strata CLI code complexity analyzer.
> Each was built independently from the same plan (`unified-plan.md`) by different AI agents.
> All 10 were read line-by-line, tested, and evaluated against the plan's Phase 0 requirements.

**Date**: 2026-03-28

---

## Executive Summary

**Top pick: v10 (TDD/spec-first)** — highest correctness, best test discipline, cleanest architecture. But the ideal v1.0 cherry-picks from multiple versions.

The best version isn't any single implementation — it's:
- **v10's schema-first foundation + test discipline**
- **v5's functional core / imperative shell boundary**
- **v9's render.ts terminal output**
- **v7's graph-as-IR concept** (for Phase 1+ readiness)
- **v6's TS compiler API call resolution** (for correctness, knowing it limits language scope)
- **v4's plugin pattern** (minimal, just an interface + for-loop)

---

## Side-by-Side Scoring (1-10)

| Dimension | v1 | v2 | v3 | v4 | v5 | v6 | v7 | v8 | v9 | v10 |
|-----------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|
| **Correctness** | 5 | 4 | 3 | 7 | 6 | 7 | 6 | 7 | 6 | **8** |
| **Simplicity** | **8** | 8 | 2 | **9** | 8 | 8 | 8 | 8 | 8 | **9** |
| **Extensibility** | 4 | 6 | 6 | **8** | 6 | 4 | **8** | 6 | 6 | 7 |
| **Test Quality** | 6 | 6 | 0 | 6 | 7 | 7 | 7 | 7 | 7 | **8** |
| **SV Format** | 6 | 5 | 6 | 6 | 7 | 6 | 6 | 7 | 7 | **8** |
| **CLI UX** | 7 | 7 | 0 | 7 | 5 | 6 | 5 | 6 | **9** | 6 |
| **Perf Readiness** | 4 | 3 | 1 | 5 | 4 | 4 | 4 | 5 | 5 | 5 |
| **Overall** | 5.7 | 5.5 | 2.6 | **6.9** | 6.1 | 6.0 | 6.3 | 6.6 | **6.9** | **7.3** |

### Test Results Summary

| Version | Tests | Assertions | Time | Status |
|---------|:-----:|:----------:|:----:|:------:|
| v1 | 34 | ~80 | 437ms | ✅ All pass |
| v2 | 41 | ~90 | <500ms | ✅ All pass |
| v3 | 0 | 0 | N/A | ❌ No tests, code doesn't compile |
| v4 | 27 | 48 | 84ms | ✅ All pass |
| v5 | 47 | 233 | 1.94s | ✅ All pass |
| v6 | 27 | ~60 | 2.53s | ✅ All pass |
| v7 | 45 | 102 | ~500ms | ✅ All pass |
| v8 | 41 | 110 | 4.15s | ✅ All pass |
| v9 | 50 | 96 | 2.58s | ✅ All pass |
| v10 | 88 | 141 | ~1.2s | ✅ All pass |

---

## What Each Version Does BEST (Steal-Worthy)

### v1: Static Dependency Filtering for Temporal Coupling
The `hasStaticDependency()` function that removes obvious co-changes (files that import each other) to surface only *surprising* temporal couplings. This is the killer insight — temporal coupling WITH static dependency = expected. WITHOUT = hidden design smell. Multiple other versions adopted this idea, but v1 originated the cleanest expression.

### v2: Boolean Operator Sequence Counting
The `flattenBooleanChain` → count operator *changes* approach is the most correct implementation of SonarSource's logical operator rule. `a && b && c` = +1, `a && b || c` = +2. Most other versions get this wrong (counting each operator individually).

### v3: Unix Pipe Stage Architecture
Despite being broken/unfinished, the `import.meta.main` pattern for dual-use modules (importable function AND standalone CLI pipe stage) is architecturally elegant. Each stage can be both `import { gitChurn } from "./stages/git-churn"` AND `echo '{}' | bun src/stages/git-churn.ts`. Worth remembering for composition, even if the v3 implementation is DOA.

### v4: Plugin Architecture (Done Right for Phase 0)
The plugin system is *just* an interface (`name + analyze()`) and a for-loop. ~20 lines of "infrastructure" that earn their keep by making each metric independently testable, discoverable, and addable. Not over-engineered. The metrics merge-by-entity-ID pattern is particularly clean — multiple plugins enrich the same entities without coupling. Also: the commit-size noise filter (>20 files) for temporal coupling.

### v5: Functional Core / Imperative Shell
Cleanest separation of pure computation from I/O. Core functions take parsed data in, return computed values out. Shell handles files, subprocesses, WASM init. The core is 555 LOC that can be tested without any mocking. The 233 assertions prove this works. Also: the 4-factor risk score formula with capped normalization is well-thought-out.

### v6: TypeScript Compiler API for Call Resolution
The only version that gets cross-file call resolution *right*. Using `checker.getSymbolAtLocation()` → `getAliasedSymbol()` → `valueDeclaration` gives type-checked import-aware call graphs. This is 10x more accurate than every other version's name-matching approach. Also: the `walkElseChain` for cognitive complexity is the cleanest else-if handling.

### v7: Graph as Intermediate Representation
The thesis that ALL metric computation should be graph queries against a unified `CodeGraph` is architecturally the strongest idea across all 10 versions. Dual adjacency lists (outEdges + inEdges) enable cheap bidirectional traversal. Forward/backward slice as first-class operations. This model naturally extends to Phase 1+ (new entity types, edge types, queries).

### v8: Parser Pool + WASM Node Identity
Two practical gems: (1) the parser pool pattern that reuses `Parser` instances across files, avoiding per-file WASM reinit, and (2) using `node.id` (numeric) instead of object identity for `Set<number>` because WASM tree-sitter creates new JS objects on each access. Also: the dual report format (denormalized top-level arrays + normalized entity/edge/metric triple).

### v9: Zero-Dep Terminal Rendering Toolkit
`render.ts` is 213 lines of pure gold. Hand-rolled ANSI colors, heat bars (green→yellow→red), sparklines, ANSI-aware table alignment, Unicode box drawing, risk badges, spinners — all with zero external dependencies. This is the only version that produces genuinely beautiful terminal output. Extract this as a standalone module.

### v10: Schema-First TDD
The Zod schema was committed with 27 tests BEFORE any analysis code existed. This inverts the normal development order: define the contract → prove it with tests → implement to satisfy. The result: 88 tests (most of any version), the most complete .sv format, and the fewest correctness bugs. Also: labeled break/continue handling in cognitive complexity (the only version that implements this).

---

## What Each Version Does WORST (Avoid)

| Version | Worst Aspect | Impact |
|---------|-------------|--------|
| **v1** | `switch_case` complexity bug — each case gets +1+nesting instead of switch getting +1 total | Massively inflates complexity scores for any function with switch statements |
| **v2** | **Call graph callee resolution is fundamentally broken** — callees are raw names like `"foo"` but entity IDs are `"file.ts:foo:1"`. Forward slices, fan-in are all wrong. | The core selling point (blast radius) doesn't actually work. |
| **v3** | Never committed, doesn't compile, zero tests, incomplete implementation | Dead on arrival. Nothing usable. |
| **v4** | `parseFile()` duplicated across plugins; `any` types for tree-sitter nodes | Code quality / maintenance smell, though not a correctness issue |
| **v5** | Dual git log parsers (core and shell) with different format expectations | Confusing; the "pure" core parser doesn't match real git output format |
| **v6** | Architecture is a dead-end for multi-language support; TS compiler API = TS/JS only forever | Strategic risk if polyglot support ever matters |
| **v7** | Temporal coupling NOT added as graph edges despite `co_changes_with` type existing | Defeats the "everything is a graph query" thesis |
| **v8** | "WASM-first performance" framing overpromises — git subprocess is 80% of runtime, not parsing | Marketing vs reality mismatch; no actual perf architecture |
| **v9** | `testCoverage` is always `null` — makes blast radius coverage analysis hollow | Feature that appears to work but produces meaningless data |
| **v10** | Duplicated complexity walker logic (~50 lines copy-pasted between two functions) | Bug fixes will be applied to one copy but not the other |

---

## Common Bugs/Gaps Across ALL Versions

### 1. Name-Based Call Resolution (8/10 versions)
Every version except v6 resolves function calls by name string matching. `foo()` in file A matches ANY function named `foo` in the codebase. This produces false call graph edges in any repo with common function names (`format`, `parse`, `validate`, `transform`, `render`, `update`...). v6 uses the TS compiler API to resolve through imports correctly, but at the cost of language lock-in.

**This is the single biggest correctness problem across all implementations.**

### 2. File-Level Churn Attributed to Functions (10/10 versions)
Every version computes churn from `git log` at the file level, then assigns the same churn score to ALL functions in that file. A stable utility function in a high-churn file gets the same hotspot penalty as the function that's actually changing. True function-level churn requires `git log -L` or line-range mapping, which none implement.

### 3. Boolean Operator Sequence Counting (7/10 versions)
Only v2 and v5 correctly implement the SonarSource rule that `a && b && c` = +1 (same operator sequence) vs `a && b || c` = +2 (operator change). Most versions count each operator individually, over-scoring by ~50% on boolean-heavy code.

### 4. `switch` vs `switch_case` Complexity (5/10 versions)
SonarSource says: `switch` gets +1 structural, cases don't. Several versions invert this (cases get +1+nesting each, switch gets nothing), massively inflating scores for switch-heavy code.

### 5. No Error Handling / Graceful Degradation (10/10 versions)
No version gracefully handles: malformed source files, git failures, unreadable files, empty repos, or tree-sitter parse errors. One bad file crashes the entire analysis. Production readiness requires skip-and-warn behavior.

### 6. O(n²) Temporal Coupling Per Commit (10/10 versions)
All versions generate all file pairs per commit. A commit touching 100 files = 4,950 pairs. Large refactors, dependency updates, or formatting commits create massive noise. Only v4 filters by commit size (>20 files), which is a good heuristic that should be standard.

### 7. No Incremental Analysis (10/10 versions)
Every version re-parses the entire repo from scratch on every run. No caching, no file-change detection, no incremental computation. Fine for Phase 0 (<1000 files), but Phase 1+ requires salsa-style memoization or at minimum file-hash-based cache invalidation.

### 8. Test Coverage is File-Level Heuristic (9/10 versions)
"Is this function tested?" is determined by checking if a `.test.` or `.spec.` file exists for the source file. This means all functions in `auth.ts` are "covered" if `auth.test.ts` exists, regardless of whether specific functions are actually tested. No version integrates with actual coverage tools (Istanbul/c8).

---

## Recommended Directions

### Direction A: "v10 + Cherry Picks" (Recommended)

Start from v10's foundation, enhance with best parts of other versions.

**Base**: v10's schema-first architecture, pipeline, and test suite (88 tests)

**Cherry-pick**:
1. **v9's `render.ts`** → replace v10's plain text output with beautiful terminal rendering
2. **v2's boolean operator sequence counting** → fix the one complexity bug v10 has
3. **v4's plugin pattern** → wrap metric computations in a minimal plugin interface for extensibility
4. **v5's functional core boundary** → formalize the pure/impure split (v10 is close but not deliberate)
5. **v1's `hasStaticDependency` temporal coupling filter** → already in v10, verify it's correct
6. **v4's commit-size noise filter** → add >20 file commit filtering for temporal coupling

**Defer**: v6's TS compiler API (accuracy win but language lock-in), v7's graph model (v2 territory)

**Trade-offs**:
- ✅ Best test coverage, most correct algorithms, cleanest architecture
- ✅ Schema-validated .sv format from day 1
- ✅ Beautiful CLI output
- ⚠️ Call resolution still name-based (fix with import-path-aware resolution without full TS compiler)
- ⚠️ No language extensibility story yet

**Effort**: ~3-5 days to integrate cherry-picks, fix complexity bugs, polish CLI

### Direction B: "v7 Graph Core + v10 Tests + v6 Resolution"

Bet on the graph-as-IR architecture for Phase 1+ readiness.

**Base**: v7's `CodeGraph` as the central data structure

**Integrate**:
1. **v10's Zod schema** → validate graph → .sv output
2. **v10's test suite** → port to test against graph queries
3. **v6's TS compiler API** → for call graph accuracy (TS/JS only is fine for Phase 0)
4. **v9's render.ts** → terminal output
5. **v7's temporal coupling as graph edges** → actually implement `co_changes_with` edges (v7 defined but didn't implement them)

**Trade-offs**:
- ✅ Best architecture for Phase 1+ (visualization, cross-analysis queries, incremental updates)
- ✅ Accurate call graphs via TS compiler API
- ⚠️ More moving parts than Direction A
- ⚠️ TS compiler API = slow startup, TS/JS only
- ❌ More effort (~1-2 weeks)
- ❌ Graph adds conceptual weight that may not pay off until Phase 1

### Direction C: "v4 Plugins + v10 Tests (Minimal Viable)"

Fastest path to a shippable tool.

**Base**: v4's plugin engine (simplest code, highest simplicity score)

**Integrate**:
1. **v10's Zod schema** → add schema validation to plugin output
2. **v10's complexity tests** → port the 21 cognitive complexity tests
3. **v9's render.ts** → pretty output
4. **Fix the call resolution** → add a simple `functionsByFile` index that resolves within same-module imports

**Trade-offs**:
- ✅ Fastest to ship (2-3 days)
- ✅ Plugin architecture means new metrics = new files, zero changes to core
- ⚠️ Less test coverage than Direction A
- ⚠️ No schema-first discipline
- ❌ Call resolution still imprecise without TS compiler API

---

## Top Pick: Direction A ("v10 + Cherry Picks")

### Why

1. **Schema-first is the right foundation.** The .sv format is the "lingua franca" from the plan — it needs to be rock-solid. v10 is the only version where the schema was designed, tested, and validated before implementation. Every other version treats the format as an afterthought.

2. **88 tests > everything else.** The test suite IS the spec. When you cherry-pick v9's renderer or v4's plugin pattern, v10's tests tell you immediately if you broke something. No other version has this safety net.

3. **Correctness matters most for Phase 0.** The plan says: "Run on 5 real codebases with real teams. Ask: Did this tell you something you didn't already know?" If cognitive complexity scores are wrong or blast radius shows false connections, teams won't trust the tool. v10 has the fewest known bugs.

4. **The cherry-picks are all additive.** v9's renderer, v4's plugins, v2's boolean counting — these are all drop-in enhancements that don't require architectural changes to v10. The pipeline pattern in v10 accommodates them naturally.

5. **Simplicity is preserved.** v10 is 1,150 LOC of source. Adding render.ts is +213. Adding a plugin interface is +20. You're still under 1,500 LOC total. This is grug-approved territory.

### What to Fix Immediately

1. **Deduplicate the complexity walker** (v10's only real code smell)
2. **Add boolean operator sequence counting** from v2's `flattenBooleanChain`
3. **Add commit-size filtering** for temporal coupling (>20 files = skip)
4. **Add error handling** — skip unparseable files with a warning, don't crash
5. **Wire up import extraction** that already exists in v10's `calls.ts` but isn't used

### What to Defer

1. TS compiler API call resolution (Phase 1 — accuracy improvement)
2. Graph-as-IR (Phase 1 — when visualization demands it)
3. Plugin architecture (Phase 1 — when third-party metrics matter)
4. Incremental analysis (Phase 2 — when editor integration demands speed)
5. Multi-language support (Phase 2+ — tree-sitter grammar per language)

---

## Appendix: Architecture Comparison at a Glance

| Version | Architecture | LOC (src) | Key Bet | Parser |
|---------|-------------|:---------:|---------|--------|
| v1 | Single file | ~900 | Simplicity | web-tree-sitter |
| v2 | Monorepo (3 packages) | ~1,100 | Modularity | web-tree-sitter |
| v3 | Unix pipe stages | ~457 | Composition | tree-sitter (native) |
| v4 | Plugin engine | ~900 | Extensibility | web-tree-sitter |
| v5 | Functional core/shell | ~980 | Testability | web-tree-sitter |
| v6 | Linear pipeline | ~1,144 | Call accuracy | TS compiler API |
| v7 | Graph-first | ~1,223 | Query power | web-tree-sitter |
| v8 | Modular pipeline | ~1,083 | Portability | web-tree-sitter |
| v9 | Analyzer + renderer | ~1,300 | UX quality | web-tree-sitter |
| v10 | Schema → pipeline | ~1,150 | Correctness | web-tree-sitter |

### Cognitive Complexity Faithfulness to SonarSource Spec

| Feature | Spec | v1 | v2 | v4 | v5 | v6 | v7 | v8 | v9 | v10 |
|---------|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|
| if/for/while +1+nesting | Required | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| else +1 flat | Required | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| else-if no double count | Required | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| switch +1 (not cases) | Required | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Boolean sequence grouping | Required | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Nested fn adds nesting | Required | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Labeled break/continue | Nice-to-have | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Recursion detection | Nice-to-have | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

(v3 excluded — no working implementation)

---

*Generated by deep analysis of all 10 worktrees — every source file read, every test suite run, every CLI tested.*
