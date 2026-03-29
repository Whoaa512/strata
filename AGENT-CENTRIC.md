# Strata: Agent-Centric Code Intelligence

## The Reframe

Traditional code metrics (cyclomatic complexity, cognitive complexity, nesting depth)
measure how hard code is for **humans to read**. Agents don't care about that.

Strata measures how hard code is for **agents to safely change**.

The person using Strata isn't the coder — they're the **air traffic controller**
steering agents through a codebase. They need to know:

- Where will agents struggle?
- What context do agents need before going in?
- What will a change here ripple into?

## Core Concept: Change Ripple

The primary metric is **change ripple** — when something changes here,
what else needs to change?

Sources of ripple:
- **Static**: call graph, imports, type dependencies
- **Temporal**: files that historically change together (git co-change)
- **Structural siblings**: parallel implementations that should change as a unit

Granularity is **adaptive**:
- Module level in the viz overview
- File level in agent briefings
- Function level on drill-down

## Agent Failure Modes (What We Detect)

| Failure | Detection Signal |
|---|---|
| Misses related files | High temporal coupling + low import coupling (implicit ripple) |
| Picks wrong pattern | Convention clusters — multiple patterns for same concern |
| Breaks downstream | High blast radius + low test coverage in caller chain |
| Context overload | Large transitive dependency set (token cost estimate) |
| Misses parallel impl | Structural siblings — analogous code paths that change as a unit |
| Misses key invariant | Ordering constraints, pre/post conditions not in types |

## Three Outputs

### 1. Web Explorer (agent-centric overlays)

Same circle-packing viz, but overlays become:

- **Ripple** (default) — color by change ripple radius. Big red = changes here cascade far.
- **Safety** — green/yellow/red. Green = isolated, well-tested, send any agent.
  Red = implicit coupling, low test confidence, needs careful briefing.
- **Siblings** — highlights structural sibling groups. "These 4 functions are
  parallel implementations — if you change one, you probably need all 4."
- **Context Cost** — estimated token cost for an agent to safely work here.
  Accounts for files to read, dependencies to understand, tests to verify.

### 2. CLI Briefing (`strata brief <task>`)

Run before sending an agent. Outputs a context briefing:

```
$ strata brief "add rate limiting to the auth endpoints"

STRATA BRIEFING — auth rate limiting
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Predicted change set (7 files):
  ● src/auth/middleware.ts        — primary target
  ● src/auth/session.ts           — coupled (87% co-change rate)
  ● src/api/routes/auth.ts        — direct caller
  ● src/api/routes/oauth.ts       — structural sibling of auth.ts
  ● src/config/rate-limits.ts     — config dependency
  ● test/auth/middleware.test.ts  — test coverage
  ● test/api/auth.e2e.test.ts    — integration test

⚠ Structural siblings detected:
  routes/auth.ts and routes/oauth.ts handle auth flows in parallel.
  Changes to one likely need mirroring in the other.

⚠ Implicit coupling:
  session.ts has no import relationship with middleware.ts but they
  co-change in 87% of commits. Likely shared invariant.

Prerequisites:
  - Read src/config/rate-limits.ts for existing rate limit patterns
  - Check src/auth/types.ts for RateLimitConfig interface

Convention notes:
  - Auth middleware uses the `createMiddleware()` factory pattern
  - All rate limits are configured via config/rate-limits.ts, not inline
  - Error responses follow src/errors/auth-errors.ts format

Context cost: ~8,200 tokens (7 files, avg 180 LOC)
```

The user pastes this into the agent prompt or it auto-injects.

### 3. Live Dashboard

Watch agent risk across the codebase as it evolves. Track:
- Areas where change ripple is growing (coupling creep)
- New structural siblings that aren't recognized yet
- Test coverage gaps in high-ripple areas
- Convention drift — new patterns diverging from established ones

## Key Metrics (replacing raw code metrics)

### Change Ripple Score
How many files/functions will likely need to change if this area changes.
Combines: call graph fanout + temporal co-change + structural siblings.

### Context Cost
Estimated tokens an agent needs to read to safely work here.
= sum of LOC for transitive dependencies + related tests + sibling implementations.

### Safety Rating (green/yellow/red)
Composite of:
- Change ripple (high = more dangerous)
- Test coverage in the ripple zone (low = more dangerous)
- Coupling opacity (implicit > explicit = more dangerous)
- Sibling coverage (parallel impls without shared abstraction = dangerous)

### Sibling Groups
Sets of functions/files that are structurally analogous:
- Same interface implementations
- Parallel route handlers
- Feature flags with per-variant logic
- Platform-specific implementations (ios/android/web)

Detection: AST similarity + naming patterns + temporal co-change.

## Detection: Structural Siblings

This is the novel piece. Most tools detect coupling through imports or co-change.
Structural siblings are **parallel implementations that should change as a unit**
but may have no direct dependency.

Detection heuristics:
1. **Same interface/type** — multiple implementations of the same interface
2. **Naming patterns** — `handleAuthRoute`, `handleOAuthRoute`, `handleSAMLRoute`
3. **AST similarity** — functions with similar structure in sibling directories
4. **Temporal co-change** — files that change together but aren't import-connected
5. **Directory siblings** — `handlers/rest/auth.ts` and `handlers/graphql/auth.ts`

When an agent is briefed to change one sibling, Strata warns about the others.

## Architecture

```
Analysis Pipeline (existing, extended):
  TS Compiler API → entities, call graph, types
  Git log → churn, temporal coupling
  + NEW: sibling detection (AST similarity + naming + co-change)
  + NEW: context cost estimation (transitive deps → token count)
  + NEW: safety scoring (composite metric)
  + NEW: convention extraction (pattern clustering)

Outputs:
  .sv file (extended schema) → web explorer, CLI briefing, dashboard
```

## Schema Extensions

New fields on the .sv document:

```typescript
SiblingGroup {
  id: string
  reason: "interface" | "naming" | "ast-similarity" | "temporal" | "directory"
  entityIds: string[]
  confidence: number       // 0-1
}

AgentRisk {
  entityId: string
  rippleScore: number      // how far changes cascade
  contextCost: number      // estimated tokens to work safely
  safetyRating: "green" | "yellow" | "red"
  siblingGroupIds: string[]
  implicitCouplings: string[]
}

Convention {
  id: string
  pattern: string          // "middleware uses createMiddleware() factory"
  exampleEntityIds: string[]
  scope: string            // directory or module this applies to
}
```

## Phasing

### Phase 0.5 ✅ DONE
- ✅ Change ripple from call graph + temporal coupling
- ✅ Attention rating (composite score: green/yellow/red)
- ✅ Web explorer with agent-centric overlays (attention, ripple, context cost, implicit coupling, blast radius)
- ✅ `strata brief` CLI (codebase risk map + per-file drill-down)
- ✅ `strata diff` CLI (post-agent review: missed files, missed tests, affected callers, confidence scores)
- ✅ WASD panning, LOD noise reduction in explorer
- ✅ Validated on pi-mono (real monorepo, real commits)

### Phase 0.7 (now → monorepo quality)
- Hub function dampening (functions called by >N callers get lower confidence in diff)
- Package-scoped analysis (ripple scoped within packages first, cross-package as secondary signal)
- `--format json` for machine consumption of briefs/diffs

### Phase 1 (structural siblings + accuracy)
- Interface vs implementation diffing (AST diff to distinguish signature changes from body changes)
- Sibling detection via naming + directory + temporal co-change
- Convention extraction (pattern clustering)
- Richer briefing output

### Phase 2 (flow view + integration)
- Flow view spike (Unreal Blueprints-style node-wire diagram)
- MCP tool so agents can query Strata themselves
- Watch mode — re-analyze on file change
