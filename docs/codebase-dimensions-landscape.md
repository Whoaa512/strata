# Codebase Dimensions Landscape

> Strata framing note. A codebase is a high-dimensional object; Strata helps humans reduce it into useful projections for steering agents and understanding system shape.

## Core framing

A codebase is not just syntax. It is a higher-dimensional system spanning code shape, dependency shape, runtime behavior, data flow, tests, domain rules, ownership, operations, and evolution over time.

Historically, programmers carry a living translation layer in their heads: they reduce this high-dimensional object into concepts they can pattern-match, reason about, and safely change.

Strata's job is not to show every dimension at once. Strata's job is to choose useful projections that help humans steer agents and understand how system shape changes.

Current product bias:

- Human-first, not agent-first
- Immediate value: humans steering agents
- Also valuable for architects and reviewers
- Key question: how does the shape of the system change between changes / PRs?

## Macro-dimensions

### 1. Code shape

What is literally in the files.

Signals:

- LOC
- functions/classes/modules
- AST shape
- cyclomatic/cognitive complexity
- nesting
- params
- exports/imports
- language/framework constructs
- generated vs hand-written code

Strata today: mostly covered.

Useful, but insufficient. Human-centric code metrics only weakly predict agent risk.

### 2. Connection shape

How code points at, invokes, and depends on other code.

Signals:

- import graph
- call graph
- type dependency graph
- inheritance/interface implementations
- package/module boundaries
- cycles
- fan-in / fan-out
- dependency direction violations
- public/private API surface
- transitive dependency closure
- framework magic edges

Strata today: partially covered.

This is core to blast radius and flow view, but static structure misses lots of real coupling.

### 3. Runtime behavior

What actually happens when code runs.

Signals:

- request paths
- route → handler → service → DB/API
- async jobs / queues
- event emitters/listeners
- cron jobs
- middleware order
- startup/init paths
- dependency injection wiring
- dynamic dispatch
- feature flag branches
- retries/timeouts/fallbacks
- error paths
- hot paths / perf-critical paths

Strata today: mostly missing.

This is a major gap in existing tools. Flow view becomes much more valuable if it shows runtime paths, not just call graph edges.

### 4. Data flow / state shape

How data moves and mutates.

Signals:

- input/output types
- request/response schemas
- DB tables touched
- reads vs writes
- state mutations
- cache keys
- queue payloads
- serialization boundaries
- validation/sanitization points
- PII/secrets paths
- auth/authz context propagation
- eventual consistency paths

Strata today: mostly missing.

Very high value for agent safety. Agents often change code without understanding where a field or state mutation flows.

### 5. Change shape

How code evolves over time.

Signals:

- churn
- co-change / temporal coupling
- recent vs old activity
- ownership drift
- hotspot growth
- coupling creep
- deleted/renamed files
- long-lived risky areas
- PR-to-PR shape delta
- new dependency edges
- modules becoming more central
- risk moving green → yellow → red

Strata today: partially covered via churn and temporal coupling.

This is a strong bridge between explorer and reviewer: not just “what shape is the system?” but “how did this change reshape it?”

### 6. Confidence shape

What proves changes are safe.

Signals:

- test files linked to source files
- unit/integration/e2e coverage
- coverage by line/function/branch
- snapshot tests
- golden tests
- flaky tests
- changed code with no test delta
- tests covering ripple zone
- test runtime cost
- test ownership/staleness
- CI gates
- nearest useful test to run

Strata today: lightly covered in diff mode.

This is essential for trusted attention/risk scores: high ripple with strong test confidence is different from high ripple with no guardrails.

### 7. Implicit coupling

Relationships not visible in imports.

Signals:

- co-change without static edge
- naming similarity
- sibling files/directories
- parallel implementations
- same interface or route shape
- same config keys
- same feature flag
- shared DB table
- shared domain concept
- shared test fixture
- shared error code / metric / event name
- copy-paste / structural clone
- convention clusters

Strata today: temporal implicit coupling exists; structural siblings planned.

This is likely Strata's strongest differentiator. Agents miss non-obvious neighbors.

### 8. Domain semantics / invariants

Rules the business or system relies on.

Signals:

- “reservation can’t be cancelled after X”
- “auth token refresh must happen before permissions check”
- “rate limits are per account, not per user”
- “this enum must match mobile clients”
- “billing writes must be idempotent”
- ordering constraints
- comments/docs explaining invariants
- assertions/guards
- validation rules
- policy engines
- config-driven business rules

Strata today: missing.

This is hard to extract automatically, but extremely valuable as risk context. Start with invariant hints, not full semantic understanding:

- assertions
- throws
- validation functions
- comments with must/never/always
- domain-heavy filenames
- tests with business language
- repeated constants/enums

### 9. Architecture / boundary shape

The intended shape of the system.

Signals:

- layers
- packages
- bounded contexts
- modules
- allowed dependencies
- forbidden dependencies
- service boundaries
- public APIs
- anti-corruption layers
- shared libraries
- plugin points
- extension points
- architectural cycles
- boundary crossings per PR

Strata today: directory/module-ish only.

Useful for architects and reviewers. Good PR-shape signal: “this change crossed a boundary” or “this introduced a reverse dependency.”

### 10. Operational / production shape

How code behaves as a service.

Signals:

- service ownership
- deploy units
- configs/env vars
- feature flags
- migrations
- dashboards
- alerts
- SLOs
- logs/metrics/traces
- runbooks
- external APIs
- queues/topics
- DBs/caches
- infra resources
- secrets
- rollout risk
- backward compatibility
- mobile/client compatibility

Strata today: missing.

Important for services, maybe not first. Agents often miss config, flag, metric, migration, or rollout implications.

### 11. Human / org shape

Who understands and changes the code.

Signals:

- code owners
- recent authors
- reviewers
- bus factor
- team ownership
- stale ownership
- PR review latency
- files with many one-off contributors
- high-risk area with no active owner
- expert-needed zones

Strata today: missing.

Useful for trusted risk scores, but likely later unless targeting org-scale review.

### 12. Process / workflow shape

How changes move through the system.

Signals:

- PR size
- review comments
- CI failure patterns
- revert history
- incident-linked commits
- migration process
- generated code workflow
- release cadence
- deploy gates
- monorepo package ownership
- stale branches

Strata today: missing.

More engineering-intelligence than code-intelligence. Useful for architecture health, less likely as first wedge.

### 13. External dependency shape

What the code relies on outside itself.

Signals:

- npm/pip/go dependencies
- vulnerable dependencies
- deprecated dependencies
- internal libraries
- APIs consumed
- SDK versions
- peer dependency constraints
- generated clients
- schema versions
- transitive dependency risk

Strata today: missing.

Moderate value. Can explain risk not visible in code shape.

### 14. Performance / scale shape

Where cost, latency, and throughput risk live.

Signals:

- hot paths
- O(n²)-ish loops
- DB query count
- cache use
- batching
- N+1 patterns
- large payloads
- synchronous blocking
- bundle size
- memory allocation
- perf test coverage
- production traces/profiles

Strata today: missing.

Important, but high-trust results likely require runtime/profiling data. Static-only heuristics may be noisy.

### 15. Security / privacy shape

Where mistakes are dangerous.

Signals:

- auth/authz
- input validation
- secrets
- PII
- sensitive logging
- crypto
- SSRF/deserialization risks
- permission checks
- tenant isolation
- audit logs
- compliance-sensitive paths

Strata today: missing.

Strong risk-score multiplier. Even with low ripple, safety rating may be red because the domain is sensitive.

### 16. Generated / toolchain shape

What code is produced or mediated by tools.

Signals:

- generated files
- codegen sources
- schemas
- protobuf/openapi/graphql
- build system rules
- macros
- transpilation
- bundler aliases
- formatter/linter configs

Strata today: lightly handled through skip dirs.

Agents often edit generated output instead of sources. This matters for safe-change instructions.

### 17. Documentation / knowledge shape

Where explanations live.

Signals:

- README/docs/runbooks
- ADRs
- comments
- design docs
- diagrams
- API docs
- stale docs
- docs linked to files
- tests as documentation
- high-risk areas with no docs

Strata today: missing.

Good context-cost input. A brief could say: read this doc first.

## Current Strata coverage

Strata is strongest in:

- code shape
- partial connection shape
- partial change shape
- partial implicit coupling

Current covered signals:

- syntax/entities/metrics
- call graph/import-ish structure
- git churn
- temporal coupling
- hotspots
- blast radius
- change ripple
- context cost
- attention/risk
- diff missed-files/tests

Major gaps:

- runtime behavior
- data/model flow
- test confidence
- domain invariants
- architecture boundary intent
- deploy/infra/operability
- ownership/org/process
- cross-service/system boundaries
- PR-to-PR shape delta

## Most promising focus areas

Based on the product framing, prioritize dimensions that support:

- a visual map that clicks within 30 seconds
- risk/attention scores teams trust
- human steering of agents
- human architecture/review workflows
- understanding how system shape changes between PRs

High-signal candidates:

1. Implicit coupling
2. Runtime/data flow
3. Test confidence
4. Domain invariants
5. PR/system shape delta

## Suggested wedge: 30-second PR shape delta

Not “better explorer” in generic form.

Aim at:

> What did this change do to the system shape, and should I trust an agent here?

Example output:

```txt
This PR changed 4 files, but affects 11.

Shape changes:
- Added new runtime path: routes/auth.ts → middleware.ts → rate-limit.ts
- Increased ripple in src/auth from 6 → 10 affected files
- Introduced implicit sibling risk: oauth route not updated
- Touched high-invariant area: token/session validation
- Test confidence weak: no tests covering 3 affected callers

Attention: RED
Why: implicit coupling + weak tests + auth domain + expanded runtime path
```

Why this wedge:

- Human-first
- Helps reviewers and architects
- Builds toward a visual map
- Builds toward trusted risk scores
- Forces Strata to model dimensions that matter
- More concrete than “explore repo”
- More valuable than a static map alone

## Possible priority order

1. **PR shape delta**
   - Compare before/after `.sv`
   - Show changed risk/ripple/boundaries
   - Highlight how the system shape shifted

2. **Test confidence for ripple zone**
   - “Changed X; tests that should guard affected area are Y; missing Z”
   - Makes risk score more trustable

3. **Runtime/data-flow-ish edges**
   - Start with routes, handlers, queues, DB calls, config/flags
   - Avoid full program analysis at first

4. **Structural siblings / implicit coupling**
   - Naming + directory + temporal first
   - AST similarity later

5. **Domain invariant hints**
   - Assertions, guards, validation, comments, policy/auth/session/billing files
   - Do not pretend to fully understand the business domain

6. **Visual map as projection of those scores**
   - Map should answer: “where did shape change and why?”
   - Not just “where are circles red?”

## Product framing

Strata is not a code visualizer.

Strata is:

> A dimensionality-reduction tool for humans supervising code agents.

The best first projection may be:

> What changed, what does it affect, what hidden dimensions make it risky, and what should a human or agent inspect next?
