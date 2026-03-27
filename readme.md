# Strata v1 — Single-file Code Complexity Analyzer

Point at a TypeScript/JavaScript git repo. Get back:

1. **Top hotspots** — functions ranked by cognitive complexity × churn
2. **Blast radius** — forward call graph + untested dependency gaps
3. **Temporal coupling** — files that co-change without static dependency

## Quick Start

```bash
bun strata.ts /path/to/your/repo
```

## Output

```
🔥 TOP HOTSPOTS (complexity × churn)
────────────────────────────────────────
   150 │ src/auth.ts::validateToken (L42)  complexity=15 churn=10

💥 BLAST RADIUS (forward deps + test gaps)
────────────────────────────────────────
  risk= 44.80 │ src/auth.ts::validateToken  deps=27 untested=12 coverage=56% depth=4

🔗 TEMPORAL COUPLING (co-change without static dep)
────────────────────────────────────────
  strength= 0.82 │ src/auth.ts ↔ src/billing.ts  (8 co-changes)
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--months <n>` | 12 | Git history lookback window |
| `--top <n>` | 10 | Results per section |
| `--min-cochanges <n>` | 3 | Minimum co-changes for temporal coupling |
| `--json` | | Output raw `.sv` JSON to stdout |
| `--output <file>` | | Write `.sv` JSON to file |

## The `.sv` Format

JSON interchange format containing:
- **Entities**: functions, files with complexity metrics
- **Edges**: calls, contains, co_changes_with (with weights)
- **Hotspots**: complexity × churn ranked list
- **Blast radii**: forward deps, test coverage gaps, risk scores
- **Temporal couplings**: co-change pairs without static dependency

## Architecture

Single file (`strata.ts`) using:
- **web-tree-sitter** (WASM) for parsing TS/JS/TSX
- **git log** for churn + temporal coupling analysis
- **BFS call graph** for blast radius computation

## Dev

```bash
bun test          # 34 tests
bun run lint      # tsc --noEmit
```
