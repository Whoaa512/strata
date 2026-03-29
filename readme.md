# Strata

Agent-centric code intelligence. Helps engineers steer AI coding agents through codebases by showing where agents will struggle, what context they need, and what changes will ripple into.

**The person using Strata isn't the coder — they're the air traffic controller.**

## Quick Start

```bash
# Analyze & get risk map
strata brief .

# Briefing for a specific file
strata brief . src/auth/middleware.ts

# Review a diff for missed files/tests
strata diff . HEAD~1
strata diff . main
strata diff . staged

# Full analysis (writes .strata/analysis.sv.json)
strata analyze .

# Interactive web explorer
strata explore .

# Terminal report
strata report .
```

## Key Concepts

### Attention Level (green/yellow/red)
How much oversight you need when an agent works in an area.
- **Low** (green) — agents handle autonomously
- **Medium** (yellow) — review agent output
- **High** (red) — collaborate with agent, provide context

### Change Ripple
When something changes here, what else needs to change? Combines:
- Static dependencies (call graph, imports)
- Temporal coupling (git co-change history)
- Implicit couplings (files that co-change without import links)

### Context Cost
Estimated tokens an agent needs to read to safely work in an area.

### `strata diff` — Post-Agent Review
Analyzes a git diff against the codebase to find:
- Files that probably need changes too (with confidence scores)
- Tests that should have been updated
- Callers in the blast zone

## Web Explorer

Overlays: Attention, Ripple, Context Cost, Implicit Coupling, Blast Radius

Controls: WASD/arrows to pan, scroll to zoom, click to drill down, 1-5 to switch overlays, / to search, 0 to reset view.

## Tech

- Bun + TypeScript
- TS Compiler API for entity extraction + call graph resolution
- Git log for churn + temporal coupling analysis
- Zod schema for `.sv` format (v0.2.0)
