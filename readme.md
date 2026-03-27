# Strata v10

**Code complexity analyzer for TypeScript/JavaScript repos.**

Point it at a git repo. Get hotspots, blast radius, and temporal coupling.

## Install & Run

```bash
bun run src/cli/index.ts <repo-path>
```

## What It Does

1. **Hotspots** — Functions ranked by `cognitive_complexity × git_churn`. High score = complex code that changes often = pain.

2. **Blast Radius** — For each hotspot: what does it affect (forward call graph), how much is tested, and who else changes when it changes.

3. **Temporal Coupling** — File pairs that co-change in git without a static dependency. Reveals hidden coupling.

## Options

```
--months <n>         Git history depth (default: 12)
--top <n>            Number of hotspots (default: 10)
--min-cochanges <n>  Min co-changes for coupling (default: 2)
--json               Output raw .sv JSON to stdout
--output <path>      Write .sv document to file
```

## The .sv Format

JSON interchange format containing:
- **entities** — functions/methods with location, cognitive complexity, nesting depth, fan-in/out, churn
- **edges** — call graph edges
- **hotspots** — scored by complexity × churn
- **blastRadii** — forward slice + test coverage + risk score per hotspot
- **temporalCouplings** — co-changing file pairs with confidence scores

Schema validated with Zod. See `src/schema.ts`.

## Architecture

```
src/
  schema.ts                    # .sv format (Zod schemas + types)
  parser.ts                    # Shared tree-sitter parser
  pipeline.ts                  # Main orchestrator
  cli/index.ts                 # CLI entry point
  analysis/
    cognitive-complexity.ts    # SonarSource cognitive complexity via tree-sitter
    call-graph.ts              # Forward slice + blast radius
    hotspots.ts                # Complexity × churn scoring
  extraction/
    git.ts                     # Git log parsing, churn, temporal coupling
    calls.ts                   # Call edge + import extraction via tree-sitter
```

## Tests

```bash
bun test           # 88 tests
bun test --watch   # dev mode
```

Test coverage:
- 27 schema validation tests
- 21 cognitive complexity tests (nesting, loops, operators, ternaries, etc.)
- 12 git parsing/churn/coupling tests
- 14 call graph + blast radius tests
- 6 hotspot scoring tests
- 8 integration tests (full pipeline on a temp git repo)

## Tech

- **Bun** — runtime + test runner
- **tree-sitter** — TS/JS parsing (wasm, via web-tree-sitter)
- **Zod** — schema validation for .sv format
- **git log** — churn + temporal coupling source
