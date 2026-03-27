# Strata v6 — TypeScript Compiler API Variant

Code complexity analyzer for TS/JS repos. Uses the TypeScript compiler API for parsing
and type-checked call graph resolution.

## Usage

```bash
bun run src/cli.ts /path/to/repo
```

## Phase 0 Deliverables

- **Top 10 hotspots**: cognitive complexity × git churn
- **Blast radius**: forward call graph + test coverage gaps per function
- **Temporal coupling**: files that co-change without static dependency
- **`.sv` JSON interchange format**: structured output for downstream tools

## Architecture

- `src/git.ts` — git log parsing for churn and co-change data
- `src/extract.ts` — TS compiler API extraction: functions, complexity, call graph
- `src/analyze.ts` — composite analysis: hotspots, blast radius, temporal coupling
- `src/sv.ts` — .sv interchange format generation
- `src/cli.ts` — CLI entry point
