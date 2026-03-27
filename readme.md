# Strata v5

Code complexity analyzer for TypeScript/JavaScript repos.

**Approach: Functional core, imperative shell.** All analysis logic lives in pure functions (no side effects). A thin imperative shell handles I/O (reading files, git commands, writing output).

## Quick Start

```bash
# Analyze current directory
bun run src/cli.ts .

# Analyze a specific repo, top 5 hotspots
bun run src/cli.ts /path/to/repo -n 5

# Output .sv JSON file
bun run src/cli.ts . -o analysis.sv

# Raw JSON to stdout
bun run src/cli.ts . --json
```

## What It Does

Points at a TS/JS git repo and outputs:

1. **Top hotspots** — functions ranked by cognitive complexity × git churn
2. **Blast radius** — per-hotspot forward call graph + test coverage gaps
3. **Temporal coupling** — file pairs that co-change without static dependency

## Architecture

```
src/
├── core/           # Pure functions (zero side effects, maximum testability)
│   ├── types.ts    # .sv interchange format + shared types
│   ├── complexity.ts   # Cognitive complexity via tree-sitter AST walking
│   ├── git-analysis.ts # Git log parsing → churn + temporal coupling
│   └── scoring.ts      # Hotspot scoring, call graph, blast radius
│
├── shell/          # Thin imperative shell (I/O only)
│   ├── parser.ts   # tree-sitter WASM init + file parsing
│   ├── git.ts      # Git subprocess calls
│   └── analyze.ts  # Orchestrates core functions with real I/O
│
└── cli.ts          # CLI entry point + output formatting
```

## The `.sv` Format

JSON interchange format containing:
- **Entities**: functions, files with metric vectors
- **Edges**: calls, contains, co_changes_with
- **Hotspots**: complexity × churn composite scores
- **Blast radii**: forward slice, test coverage, risk score
- **Temporal coupling**: co-changing file pairs with confidence

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `-n, --top` | 10 | Number of hotspots to display |
| `-m, --months` | 12 | Months of git history to analyze |
| `--min-co-changes` | 3 | Min co-changes for temporal coupling |
| `--min-confidence` | 0.3 | Min confidence for temporal coupling |
| `-o, --output` | - | Write .sv JSON to file |
| `--json` | - | Raw JSON output to stdout |

## Tests

```bash
bun test
```

47 tests across 4 files:
- `complexity.test.ts` — cognitive complexity, nesting, function extraction
- `git-analysis.test.ts` — git log parsing, churn, temporal coupling
- `scoring.test.ts` — hotspots, call graph, blast radius
- `integration.test.ts` — end-to-end on fixture repo, .sv format validation
