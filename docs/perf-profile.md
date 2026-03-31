# Performance Profile — 2026-03-30

Profiled with `bun --cpu-prof-md` on the `perf/single-pass-tree-sitter` branch.

## Repos Profiled

| Repo | Wall | Entities | Call Edges |
|------|------|----------|------------|
| ergo | ~80s | 74,668 | 221,476 |
| twig4 | ~78s | 153,430 | 154,358 |

## Top Hotspots

### 1. `getStaticDeps` (ripple.ts) — 13-24% self time
BFS over entity call graph. Ergo's 221K edges make this O(expensive).
Cherry-picked cache helps but BFS itself is still hot.
**Next win:** file-level ripple grouping.

### 2. Zod validation — 8-19% self time
Single `StrataDocSchema.parse(doc)` at end of `analyze()`.
Validates our own output through full Zod runtime checking.
Bigger on ergo (more entities/edges to validate).
**Next win:** skip in production, keep for tests.

### 3. File discovery — 14% on twig4
`statSync` (7.5%), `realpathNativeSync` (3.5%), `readdirSync` (3.3%).
**Next win:** batch/async file discovery, reduce stat calls.

### 4. `endsWith` — 4-6% self time
Extension filtering in tight loops. Likely in file discovery.
**Next win:** Set-based lookups or pre-filter.

### 5. `estimateContextCost` (risk.ts) — 2-5% self time
LOC summation per entity's affected files.
**Next win:** cache by affected-file signature.

### 6. Tree-sitter wasm + node marshaling — ~7-8%
Irreducible cost of wasm parsing + JS↔wasm boundary.
Single-pass walk helps but wasm overhead is the floor.

### 7. Metric walks — ~2-3%
`cognitive.ts`, `cyclomatic.ts`, `nesting.ts` from TS extractor path.
Already optimized for tree-sitter path via single-pass merge.

## Benchmark Results (post single-pass + ripple cache)

```
repo          avg       min       max
ergo          66.41s    59.85s    74.87s
twig4         54.94s    53.32s    56.59s
pi-mono        3.04s     3.03s     3.06s
strata         1.30s     1.17s     1.47s
t3code        40.73s    39.45s    42.29s
yt-app         1.02s     1.00s     1.04s
```

## Priority Order for Next Optimizations

1. Skip Zod validation in production (biggest easy win)
2. File-level ripple grouping for dense call graphs
3. Reduce file discovery syscalls
4. Set-based extension filtering
5. Cache `estimateContextCost` by file-set signature
