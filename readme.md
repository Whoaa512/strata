# Strata v7 — Graph-First Code Complexity Analyzer

A CLI tool that analyzes TypeScript/JavaScript repositories for complexity hotspots, blast radius, and hidden temporal coupling. **Version 7 of 10 parallel implementations.**

## Architecture: Everything is a Graph Query

v7's distinguishing approach: all analysis is built on top of `CodeGraph`, an in-memory adjacency list with typed edges. Entities (functions, classes, files) are nodes. Relationships (calls, imports, contains, co_changes_with) are typed edges. Every metric is a graph traversal.

```
Source Files → tree-sitter → CodeGraph ← git log
                                ↓
                          Graph Queries
                         ╱      │      ╲
                  Hotspots  Blast Radius  Temporal Coupling
                         ╲      │      ╱
                          .sv JSON output
```

## Usage

```bash
# Human-readable report
bun run src/cli.ts /path/to/repo

# JSON interchange format
bun run src/cli.ts /path/to/repo --json

# Write .sv file
bun run src/cli.ts /path/to/repo --output analysis.sv.json

# Custom git history window
bun run src/cli.ts /path/to/repo --months 6
```

## What It Reports

### Hotspots (complexity × churn)
Functions ranked by cognitive complexity multiplied by change frequency. High scores = code that's both hard to understand AND changes often.

### Blast Radius
For each function: how many other functions it can reach through the call graph, what percentage of those are covered by tests, and a composite risk score.

### Temporal Coupling
File pairs that frequently change together in git commits without having a static import dependency — hidden architectural coupling.

## The .sv Format

JSON interchange format containing:
- **Entities**: functions, classes, files with per-entity metrics
- **Edges**: calls, imports, contains relationships
- **Hotspots**: ranked complexity × churn scores
- **Blast Radii**: forward slice + test coverage gaps
- **Temporal Couplings**: co-change pairs with strength scores

## Development

```bash
bun install
bun test          # 45 tests
bunx tsc --noEmit # type check
```

## Project Structure

```
src/
  graph.ts       — CodeGraph: adjacency list with typed edges
  parser.ts      — tree-sitter WASM parser management
  extractor.ts   — AST → graph entities and edges
  complexity.ts  — cognitive complexity, nesting depth, param count
  git.ts         — git log parsing, churn, temporal coupling
  metrics.ts     — hotspots, blast radius, test coverage gaps
  sv-format.ts   — .sv JSON interchange format
  cli.ts         — CLI orchestrator
```
