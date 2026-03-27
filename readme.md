# Strata v8 — WASM-first Code Complexity Analyzer

> Phase 0: CLI tool for TS/JS repos. Finds hotspots, blast radius, and hidden coupling.

## What it does

Point strata at any TypeScript/JavaScript git repo. It outputs:

1. **Top Hotspots** — functions with high cognitive complexity that change often (complexity × churn)
2. **Blast Radius** — forward call graph per function + test coverage gap detection
3. **Temporal Coupling** — files that co-change in git history without static dependency

## Architecture: WASM-first for speed

This implementation uses **tree-sitter WASM bindings** for parsing, optimized for editor-integration speed from day 1:

- Parser pool to avoid re-initialization overhead
- All three language grammars (TS/TSX/JS) loaded in parallel at startup
- Stable node IDs (not object identity) for set operations on AST nodes
- ~25ms parse time for 17 files, ~250ms total including git analysis

## Install & Run

```bash
# Clone and install
bun install

# Analyze a repo
bun run src/cli.ts /path/to/repo

# JSON output (the .sv interchange format)
bun run src/cli.ts /path/to/repo --json

# Write report to file
bun run src/cli.ts /path/to/repo --out report.sv.json

# Options
bun run src/cli.ts /path/to/repo --months 6 --top 20
```

## The .sv Interchange Format

Output is a JSON document containing:
- **entities** — functions, files with positions
- **edges** — call relationships + temporal co-change links
- **metrics** — per-entity complexity, fan-in/out, hotspot score, risk score
- **hotspots** — top complexity × churn compounds
- **blastRadii** — forward slice, test gaps, risk scores
- **temporalCouplings** — hidden co-change pairs

## Tests

```bash
bun test
```

41 tests covering:
- Tree-sitter WASM parser (TS/TSX/JS)
- Cognitive complexity calculator (SonarSource spec)
- Git churn parsing
- Hotspot ranking
- Call graph extraction and blast radius
- Temporal coupling detection
- Full CLI integration against synthetic repos

## Project Structure

```
src/
  parser.ts       — tree-sitter WASM init, parser pool, language detection
  complexity.ts   — cognitive complexity + function extraction
  churn.ts        — git log parsing, per-file change stats
  hotspots.ts     — complexity × churn scoring
  callgraph.ts    — call edge extraction, forward slice, blast radius
  coupling.ts     — temporal coupling from commit history
  report.ts       — .sv JSON format builder
  cli.ts          — CLI entrypoint
  types.ts        — shared type definitions
  __tests__/      — unit + integration tests
```

## Key Design Decisions

| Decision | Why |
|----------|-----|
| tree-sitter WASM over native | Portable, no node-gyp, fast enough (<1ms/file parse) |
| Parser pool | Reuse parser instances, avoid WASM re-init per file |
| `Set<number>` with node.id | WASM nodes create new objects per access; WeakSet doesn't work |
| Normalized hotspot scores | Makes scores comparable across repos of different sizes |
| Forward slice via BFS | Simple, bounded depth, catches transitive impact |
| Confidence-based coupling | Filters noise from files that just happen to be in the same commit |
