# Strata v5

## Architecture: Functional Core, Imperative Shell

All analysis logic in `src/core/` is **pure functions** — no side effects, no I/O.
The thin shell in `src/shell/` handles file reading, git subprocess calls, and orchestration.

```
src/core/   → pure functions only (tree-sitter nodes in, data out)
src/shell/  → I/O boundary (files, git, WASM init)
src/cli.ts  → CLI entry point
```

## Commands
- `bun test` — run all tests
- `bun run src/cli.ts <repo-path>` — analyze a repo
- `bunx biome check --write src/ test/` — lint + format

## Conventions
- No obvious code comments
- Line of sight style (early returns, happy path at left margin)
- Commit small & focused
- Tests alongside features
