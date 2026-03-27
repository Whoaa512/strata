# strata

A code complexity analyzer for TypeScript/JavaScript repos. Point it at a git repo, get actionable insights about hotspots, blast radius, and hidden coupling.

## What it does

- **🔥 Hotspots** — Functions ranked by cognitive complexity × git churn. High complexity code that changes often is where bugs live.
- **💥 Blast Radius** — Forward call graph from each function. Shows what breaks if you touch it, and how much of that is untested.
- **🔗 Temporal Coupling** — File pairs that co-change in git history without any static dependency. Hidden coupling your code doesn't show.

## Quick start

```bash
bun install
bun run strata /path/to/your/repo
```

## Usage

```
strata [options] <repo-path>

OPTIONS
  -n, --top       Number of results per section (default: 10)
  -c, --commits   Max git commits to analyze (default: 1000)
  -o, --output    Write .sv JSON to file
  -j, --json      Output raw JSON instead of pretty output
  -q, --quiet     Suppress progress output
  -h, --help      Show this help
```

## Examples

```bash
# Analyze current directory
bun run strata .

# Top 20 hotspots with more git history
bun run strata ~/code/my-project --top 20 --commits 5000

# Export machine-readable .sv format
bun run strata . --output report.sv.json

# Pipe JSON into other tools
bun run strata . --json --quiet | jq '.entities | sort_by(-.metrics.hotspot) | .[0:5]'
```

## The .sv interchange format

The tool produces a JSON document (`.sv`) containing:

- **entities** — functions with metrics: cognitive complexity, cyclomatic complexity, churn, fan-in/out, blast radius, nesting depth
- **edges** — call relationships and temporal coupling between entities
- **meta** — repo info, commit range, file/function counts

This format is designed to be consumed by other tools — visualizers, CI integrations, editor plugins.

## How it works

1. **Tree-sitter** parses TS/JS/TSX/JSX into ASTs, extracts functions with cognitive complexity scoring
2. **Git log** analysis computes per-file churn, contributor count, and temporal coupling
3. **Composite scoring** combines complexity × churn for hotspots, BFS forward slicing for blast radius
4. **Rich terminal output** with heat bars, sparklines, color-coded tables, and risk indicators

## Tests

```bash
bun test
```

## Tech

- Bun + TypeScript
- tree-sitter for parsing (TS/JS/TSX/JSX)
- git log parsing for behavioral metrics
- Zero external runtime dependencies beyond tree-sitter
