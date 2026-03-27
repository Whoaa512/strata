# Strata v4 — Plugin-Based Architecture

Code complexity analyzer for TypeScript/JavaScript repos. Point it at a git repo, get actionable insights.

## Quick Start

```bash
bun run src/cli.ts /path/to/repo
```

## What It Does

1. **Hotspots** — Functions ranked by cognitive complexity × git churn (the files that are both complex AND change frequently)
2. **Blast Radius** — Per-function forward call graph + test coverage gaps (what breaks if you change this?)
3. **Temporal Coupling** — File pairs that co-change in git without static dependency (hidden coupling)

## Architecture: Plugin System

The core is a thin engine that discovers and runs plugins. Each metric is a plugin implementing:

```typescript
interface Plugin {
  name: string;
  analyze(context: AnalysisContext): Promise<PluginResult>;
}
```

Built-in plugins:
- `cognitive-complexity` — Tree-sitter AST walking with nesting penalties
- `churn` — Git log change frequency per file
- `blast-radius` — Forward call graph + test file detection
- `temporal-coupling` — Co-change analysis from git history

New metrics = new plugins. Drop one in, register with `engine.use(plugin)`.

## Output: .sv Interchange Format

All analysis produces a `.sv` JSON document:

```json
{
  "version": "0.1.0",
  "entities": [{ "id": "...", "kind": "function", "metrics": {...} }],
  "edges": [{ "source": "...", "target": "...", "kind": "calls" }],
  "hotspots": [{ "entityId": "...", "score": 50, "complexity": 5, "churn": 10 }]
}
```

## CLI Options

```
strata <repo-path> [options]

Options:
  --top N      Show top N hotspots (default: 10)
  --json       Output raw .sv JSON
  --out <path> Write .sv JSON to file
```

## Tests

```bash
bun test
```

## Tech

- **Bun** runtime + test runner
- **web-tree-sitter** (WASM) for AST parsing
- **git log** parsing for VCS behavioral data
- No DB, no server, no viz — pure analysis
