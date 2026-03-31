# Strata — Agent Guidelines

## What This Is
Agent-centric code intelligence tool. Analyzes codebases to help humans steer AI agents — shows where agents will struggle, what context they need, what changes ripple into.

## Architecture
```
src/
  schema.ts      — Zod schemas for .sv format (v0.2.0)
  extract.ts     — TS Compiler API entity + call graph extraction
  git.ts         — git churn + temporal coupling analysis
  hotspot.ts     — complexity × churn scoring
  blast.ts       — transitive caller walk for blast radius
  ripple.ts      — change ripple (static + temporal + implicit)
  risk.ts        — agent risk scoring (attention level, context cost)
  diff.ts        — diff analysis (missed files, missed tests, affected callers)
  diff-render.ts — terminal renderer for diff analysis
  brief.ts       — terminal renderer for risk briefings
  render.ts      — terminal renderer for legacy report
  analyze.ts     — orchestrates full analysis pipeline
  cli.ts         — CLI entry point
  server.ts      — web explorer server
  plugin.ts      — metric plugin interface
  metrics/       — metric calculators (cyclomatic, cognitive, loc, nesting, params)
web/
  index.html     — interactive circle-packing explorer
test/
  *.test.ts      — 78 tests covering all modules
```

## Running
```bash
bun test                        # run all tests
bun src/cli.ts brief .          # risk briefing
bun src/cli.ts diff . HEAD~1    # diff review
bun src/cli.ts explore .        # web explorer
```

## Key Design Decisions
- **Agent-centric, not human-centric**: Traditional code metrics (cyclomatic, cognitive) are inputs to composite scores, not shown directly. Users see attention level, ripple, context cost.
- **Temporal coupling is the strongest signal**: Files that co-change without import links are the #1 thing agents miss.
- **Confidence scoring in diff**: Call-graph-only connections get lower confidence (25-35%) than temporal coupling (co-change rate). Multi-signal files get boosted.
- **Output caps**: Max 15 missed files, 10 tests, 10 caller file groups in diff output.

## Worktrees
All git worktrees go in `./.worktrees/` (gitignored). Never create worktrees outside this directory.
```bash
git worktree add .worktrees/<name> <branch>
```

## Schema (v0.2.0)
The `.sv` format includes: entities, callGraph, churn, temporalCoupling, hotspots, blastRadius, changeRipple, agentRisk, errors.
