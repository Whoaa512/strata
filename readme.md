# Strata v2

Code complexity analyzer for TypeScript/JavaScript repos.

**Architecture**: Modular monorepo with clean layer separation.

```
packages/
  extraction/  — tree-sitter parsing, git log, raw data extraction
  analysis/    — metric computation, graph queries, composite scoring
  cli/         — user-facing CLI, .sv output
```

## Usage

```bash
bun run packages/cli/src/index.ts /path/to/repo
```

## Development

```bash
bun install
bun test              # run all tests
bun run lint          # check formatting/linting
```
