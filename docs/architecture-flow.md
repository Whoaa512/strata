# Strata architecture flow

Strata is an agent-centric code intelligence pipeline. It turns source files + git history into a `.sv` analysis document, then renders that document as a terminal brief, diff review, report, or web explorer.

```text
+--------------------------------------------------------------------------------+
|                                  CLI / entrypoints                              |
|                                                                                |
|  bun src/cli.ts brief <root> [file]       -> risk briefing                      |
|  bun src/cli.ts diff <root> [diffSpec]    -> missed files/tests review          |
|  bun src/cli.ts analyze <root>            -> .strata/analysis.sv.json           |
|  bun src/cli.ts report <root>             -> legacy terminal report + .sv       |
|  bun src/cli.ts explore <root>            -> server.ts + web/index.html         |
+----------------------------------------+---------------------------------------+
                                         |
                                         v
+--------------------------------------------------------------------------------+
|                              analyze(rootDir)                                   |
|                              src/analyze.ts                                     |
|                                                                                |
|  1. extractAll(root)                                                            |
|  2. getChurn(root)                                                              |
|  3. getTemporalCoupling(root)                                                   |
|  4. markStaticDependencies(temporal, callGraph, entities)                       |
|  5. computeHotspots(entities, churn)                                            |
|  6. computeAllBlastRadii(entityIds, callGraph)                                  |
|  7. computeChangeRipple(entities, callGraph, temporal, blast, churn, root)      |
|  8. computeAgentRisk(entities, ripple, churn)                                   |
|  9. optionally validate with StrataDocSchema when STRATA_VALIDATE is set         |
+----------------------------------------+---------------------------------------+
                                         |
                                         v
+--------------------------------------------------------------------------------+
|                             StrataDoc v0.2.0                                    |
|                             src/schema.ts                                       |
|                                                                                |
|  entities           functions/classes/methods with location + metrics           |
|  callGraph          caller -> callee entity edges                               |
|  churn              git file edit frequency + added/deleted lines               |
|  temporalCoupling   file pairs that co-change in git history                    |
|  hotspots           complexity x churn                                         |
|  blastRadius        transitive callers of each entity                           |
|  changeRipple       static deps + temporal deps + implicit coupling             |
|  agentRisk          green/yellow/red + context cost + factors                   |
|  errors             non-fatal parser/extraction errors                          |
+--------------------------------------------------------------------------------+
```

## Detailed pipeline

```text
                                     +------------------+
                                     | root directory   |
                                     +---------+--------+
                                               |
                                               v
+--------------------------------------------------------------------------------+
| File discovery: findAllFiles(root)                                              |
| src/multi-extract.ts                                                            |
|                                                                                |
|  skip dirs: node_modules, dist, .git, __pycache__, vendor, .venv, venv, bazel*  |
|  skip files: hidden paths, *.min.js, *.min.css                                  |
|                                                                                |
|  if git repo:                                                                  |
|    git ls-files --cached --others --exclude-standard -- *.ts/*.tsx/*.js/...     |
|  else:                                                                         |
|    fd -t f --hidden ...                                                        |
|    fallback: find                                                              |
|                                                                                |
|  output FileMap:                                                               |
|    ts[]      .ts .tsx .js .jsx                                                 |
|    python[]  .py                                                               |
|    go[]      .go                                                               |
+--------------------------+----------------------+------------------------------+
                           |                      |
                           v                      v
+-------------------------------------------+  +---------------------------------+
| TypeScript extraction                     |  | Tree-sitter extraction          |
| src/extract.ts                            |  | src/tree-sitter-extract.ts      |
|                                           |  | src/python-extract.ts           |
| Program choice:                           |  | src/go-extract.ts               |
|  root tsconfig exists -> use it           |  |                                 |
|  nested tsconfigs -> one program each     |  | Language configs define:        |
|  no config -> light program over files    |  |  function node types            |
|                                           |  |  method node types              |
| Pass 1: extract entities                  |  |  class node types               |
|  walk AST                                 |  |  branch node types              |
|  find function-like nodes                 |  |  nesting node types             |
|  ignore anonymous functions               |  |  call node type                 |
|  name from declaration / var / property   |  |  call-name extraction           |
|  kind: function/method/getter/setter/...  |  |  parameter counting             |
|  id = file:name:startLine                 |  |                                 |
|  line range from TS source positions      |  | For each file:                  |
|  metrics = runPlugins(defaultPlugins)     |  |  read source                    |
|  map TS symbol -> entity id               |  |  parse tree                     |
|                                           |  |  record syntax errors non-fatally|
| Pass 2: extract calls                     |  |  walk tree                      |
|  walk AST with current entity             |  |  emit function/method entities  |
|  on CallExpression:                       |  |  emit class entities            |
|    resolve symbol                         |  |  analyze body for metrics/calls |
|    follow alias                           |  |                                 |
|    if callee symbol known: edge           |  | Call graph:                     |
|                                           |  |  nameToId map by entity.name    |
| Limit: only calls resolvable by TS        |  |  edge caller -> callee when     |
| type checker become edges.                |  |  call name matches an entity    |
+----------------------+--------------------+  +----------------+----------------+
                       |                                        |
                       +-------------------+--------------------+
                                           |
                                           v
+--------------------------------------------------------------------------------+
| ExtractionResult                                                               |
|                                                                                |
|  entities[]:                                                                  |
|    { id, name, kind, filePath, startLine, endLine, metrics }                    |
|                                                                                |
|  callGraph[]:                                                                 |
|    { caller: entityId, callee: entityId }                                      |
|                                                                                |
|  errors[]:                                                                    |
|    parser/config/source-file errors; analysis continues                         |
+--------------------------------------------------------------------------------+
```

## Metric collection

```text
+--------------------------------------------------------------------------------+
| TypeScript metric plugin system                                                |
| src/plugin.ts + src/metrics/*                                                  |
|                                                                                |
|  defaultPlugins: cyclomatic, cognitive, loc, nesting, params                    |
|                                                                                |
|  cyclomatic:                                                                   |
|    1 + count(if/for/while/do/conditional/case/catch/&&/||/??)                  |
|                                                                                |
|  cognitive:                                                                    |
|    branch cost + nesting cost                                                  |
|    else-if counted flatter than nested if                                      |
|    boolean chains count operator switches                                      |
|    labeled break/continue add cost                                             |
|                                                                                |
|  loc:                                                                          |
|    endLine - startLine + 1                                                     |
|                                                                                |
|  nesting:                                                                      |
|    max nesting depth across if/loop/switch/try/catch                           |
|                                                                                |
|  params:                                                                       |
|    node.parameters.length                                                      |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| Python/Go metrics through tree-sitter generic body analysis                     |
| src/tree-sitter-extract.ts                                                     |
|                                                                                |
|  cyclomatic starts at 1                                                        |
|  configured branch nodes increment cyclomatic                                  |
|  configured nesting nodes add cognitive = 1 + nesting and update maxDepth       |
|  configured bool ops increment cyclomatic + cognitive                          |
|  loc from tree-sitter start/end positions                                      |
|  params from per-language config                                               |
|                                                                                |
|  Python branches: if, elif, for, while, except                                  |
|  Python bool ops: and, or                                                       |
|  Go branches: if, for, expression_case                                         |
|  Go bool ops: &&, ||                                                           |
+--------------------------------------------------------------------------------+
```

## Git-derived signals

```text
+--------------------------------------------------------------------------------+
| Churn: getChurn(root, maxCommits=500)                                           |
| src/git.ts                                                                     |
|                                                                                |
|  git log --no-merges -n 500 --format="" --numstat                              |
|    -> per file:                                                                |
|       commits touched                                                          |
|       linesAdded                                                               |
|       linesDeleted                                                             |
|                                                                                |
|  binary files with '-' numstat are skipped                                     |
|  git errors return []                                                          |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| Temporal coupling: getTemporalCoupling(root, maxCommits=500, minCochanges=3)   |
| src/git.ts                                                                     |
|                                                                                |
|  git log --no-merges -n 500 --pretty=format:"---COMMIT---" --name-only         |
|    -> split into commits                                                       |
|    -> ignore hidden files                                                      |
|    -> ignore huge commits with >20 files                                       |
|    -> count file commit appearances                                            |
|    -> count every file pair in same commit                                     |
|                                                                                |
|  keep pairs where cochangeCount >= 3                                           |
|  confidence = pair cochanges / max(fileA commits, fileB commits)               |
|  sort by cochangeCount desc                                                    |
|                                                                                |
|  markStaticDependencies:                                                       |
|    callGraph edge -> caller file/callee file                                   |
|    if temporal pair has call edge between files: hasStaticDependency=true       |
+--------------------------------------------------------------------------------+
```

## Derived analyses

```text
+--------------------------------------------------------------------------------+
| Hotspots: computeHotspots(entities, churn)                                      |
| src/hotspot.ts                                                                 |
|                                                                                |
|  maxComplexity = max(entity.metrics.cognitive)                                 |
|  maxChurn = max(churn.commits)                                                 |
|  churnScore = file commits / maxChurn                                          |
|  complexityScore = entity cognitive / maxComplexity                            |
|  hotspot score = round(churnScore * complexityScore, 3)                        |
|  keep score > 0, sort descending                                               |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| Blast radius: computeAllBlastRadii(entityIds, callGraph)                        |
| src/blast.ts                                                                   |
|                                                                                |
|  build caller index: callee -> callers                                         |
|  for each entity with callers:                                                 |
|    directCallers = callerIndex[entity]                                         |
|    BFS/DFS upstream through caller index                                       |
|    stop at MAX_TRANSITIVE=500                                                  |
|    transitiveCallers = all upstream callers                                    |
|    radius = transitiveCallers.size                                             |
|  keep radius > 0, sort descending                                              |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| Change ripple: computeChangeRipple(...)                                        |
| src/ripple.ts                                                                  |
|                                                                                |
|  inputs: entities, callGraph, temporalCoupling, blastRadius, churn, root        |
|                                                                                |
|  package boundaries:                                                           |
|    walk upward from file until package.json below root                          |
|    cross-package affected files weighted 0.3                                   |
|                                                                                |
|  relevant entities only:                                                       |
|    entity in call graph OR entity file has temporal coupling confidence >= 0.3  |
|                                                                                |
|  static deps:                                                                  |
|    build undirected file graph from callGraph entity file pairs                 |
|    BFS from entity.filePath                                                    |
|    depth cap MAX_DEPTH=3                                                       |
|    visited cap MAX_FILE_BFS=100                                                |
|                                                                                |
|  temporal deps:                                                                |
|    file pairs with confidence >= 0.3                                           |
|                                                                                |
|  implicit couplings:                                                           |
|    temporal deps not present in static deps                                    |
|                                                                                |
|  affectedFiles = staticDeps union temporalDeps                                 |
|  blastCount = blast radius for entity                                          |
|                                                                                |
|  rippleScore = affectedFileCount                                               |
|              + implicitCount * 1.5                                             |
|              + sqrt(blastCount)                                                |
|                                                                                |
|  sort descending                                                               |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| Agent risk: computeAgentRisk(entities, changeRipple, churn)                    |
| src/risk.ts                                                                    |
|                                                                                |
|  locByFile = max entity endLine per file                                       |
|  maxRipple = max(rippleScore)                                                  |
|                                                                                |
|  contextCost:                                                                  |
|    if no ripple: entity.loc * 3.5 tokens                                       |
|    else: (entity.loc + affected file LOC estimates) * 3.5 tokens               |
|                                                                                |
|  riskFactors:                                                                  |
|    implicit couplings exist                                                    |
|    affected files > 5                                                          |
|    entity LOC > 200                                                            |
|    parameterCount > 5                                                          |
|                                                                                |
|  safetyRating:                                                                 |
|    danger += 2 if ripple/maxRipple > 0.6, +=1 if >0.3                          |
|    danger += 2 if contextCost >15000, +=1 if >8000                             |
|    danger += riskFactors.length                                                |
|    red if danger >=4, yellow if >=2, else green                                |
|                                                                                |
|  sort red -> yellow -> green, then ripple desc                                 |
+--------------------------------------------------------------------------------+
```

## Diff review flow

```text
+--------------------------------------------------------------------------------+
| strata diff <root> [diffSpec]                                                   |
| src/cli.ts + src/diff.ts + src/diff-render.ts                                   |
+----------------------------------------+---------------------------------------+
                                         |
                                         v
+--------------------------------------------------------------------------------+
| Build current StrataDoc with analyze(root)                                      |
+----------------------------------------+---------------------------------------+
                                         |
                                         v
+--------------------------------------------------------------------------------+
| Read changed files                                                              |
|                                                                                |
|  staged          -> git diff --cached --name-status                            |
|  A..B            -> git diff --name-status A..B                                |
|  HEAD~N          -> git diff --name-status HEAD~N                              |
|  branch/ref      -> git diff --name-status ref...HEAD                          |
|                                                                                |
|  status: added / modified / deleted / renamed                                  |
+----------------------------------------+---------------------------------------+
                                         |
                                         v
+--------------------------------------------------------------------------------+
| Read hunks with --unified=0 and parse @@ +start,count @@                        |
+----------------------------------------+---------------------------------------+
                                         |
                                         v
+--------------------------------------------------------------------------------+
| Resolve changed entities                                                        |
|                                                                                |
|  added file: all entities in changed file                                       |
|  modified file: entity range overlaps hunk range                                |
+----------------------------------------+---------------------------------------+
                                         |
                                         v
+--------------------------------------------------------------------------------+
| Find likely missed files                                                        |
|                                                                                |
|  temporal coupling signal:                                                     |
|    changed file co-changes with unmodified file                                |
|    confidence = temporal confidence                                            |
|    label says whether static dep also exists                                   |
|                                                                                |
|  call graph signal:                                                            |
|    changed entity calls / is called by unmodified entity                       |
|    base confidence 0.35 for dependency, 0.25 for caller                        |
|    dampen hubs: 1 / (1 + log2(callerCount))                                    |
|    dampen cross-package: * 0.5                                                  |
|                                                                                |
|  ripple signal:                                                                |
|    changed entity has implicit coupling to unmodified file                     |
|                                                                                |
|  boost multi-signal files:                                                     |
|    temporal + multiple sources: +0.15                                          |
|    call signal + >=3 sources: +0.10                                            |
|                                                                                |
|  keep confidence >= 0.4                                                        |
|  split test files from non-test files                                          |
|  add conventional sibling test candidates if they exist                         |
|  cap output: 15 files, 10 tests                                                |
+----------------------------------------+---------------------------------------+
                                         |
                                         v
+--------------------------------------------------------------------------------+
| Render DiffAnalysis                                                             |
|                                                                                |
|  changedFiles                                                                  |
|  changedEntities                                                               |
|  missedFiles                                                                   |
|  missedTests                                                                   |
|  affectedCallers from blastRadius transitiveCallers                             |
+--------------------------------------------------------------------------------+
```

## Output/rendering paths

```text
+--------------------------------------------------------------------------------+
| analyze/report                                                                 |
|                                                                                |
|  StrataDoc -> toCompact(doc) -> writeSvFile(root/.strata/analysis.sv.json)      |
|                                                                                |
|  Compact file keeps full entities/callGraph/churn/temporal/hotspots/risk/errors|
|  but compresses:                                                               |
|    blastRadius: entityId, directCallerCount, radius                            |
|    changeRipple: entityId, rippleScore, affectedFileCount, implicit count      |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| brief                                                                          |
|                                                                                |
|  analyze(root) -> renderBrief(doc)                                             |
|  analyze(root) -> renderFileBrief(doc, file) when file argument provided        |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| report                                                                         |
|                                                                                |
|  analyze(root) -> write .sv -> renderReport(doc)                               |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| explore                                                                        |
|                                                                                |
|  cli spawns server.ts                                                          |
|  server analyzes root                                                          |
|  server writes .sv                                                             |
|  GET /api/data returns full StrataDoc JSON                                     |
|  static web/index.html renders interactive circle-packing explorer             |
|  server opens http://localhost:4747 by default                                 |
+--------------------------------------------------------------------------------+
```

## Best change points

```text
+--------------------------------------------------------------------------------+
| Want to add a language?                                                        |
|                                                                                |
|  Add a LanguageExtractor implementation.                                       |
|  For tree-sitter-like languages, add a config similar to python-extract/go.    |
|  Register it in extractors[] in src/multi-extract.ts.                          |
|  Update findAllFiles extension maps.                                           |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| Want to change function/entity parsing?                                        |
|                                                                                |
|  TS/JS: src/extract.ts                                                         |
|    getFunctionName, entityKind, extractEntities, extractCalls                  |
|                                                                                |
|  Python/Go: src/tree-sitter-extract.ts and language config files               |
|    funcTypes/methodTypes/classTypes, getEntityName, getCallName                |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| Want to change metrics?                                                        |
|                                                                                |
|  TS plugin metrics: src/metrics/* and src/metrics/index.ts                     |
|  Python/Go generic metrics: analyzeBody in src/tree-sitter-extract.ts          |
|  Schema shape: MetricsSchema in src/schema.ts                                  |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| Want to change git behavior?                                                   |
|                                                                                |
|  Churn and temporal coupling: src/git.ts                                       |
|  Static dependency marking from callGraph: markStaticDependencies              |
|  Tuning knobs: maxCommits, minCochanges, maxFilesPerCommit, confidence formula |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| Want to change risk/ripple semantics?                                          |
|                                                                                |
|  Hotspots: src/hotspot.ts                                                      |
|  Blast radius: src/blast.ts                                                    |
|  Ripple: src/ripple.ts                                                         |
|  Safety rating/context cost/risk factors: src/risk.ts                          |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| Want to change diff review suggestions?                                        |
|                                                                                |
|  Diff file/hunk parsing and missed-file logic: src/diff.ts                     |
|  Terminal output: src/diff-render.ts                                           |
|  Confidence thresholds: temporal >=0.3, output >=0.4, call graph 0.25/0.35     |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| Want to change saved format/API?                                               |
|                                                                                |
|  Schema: src/schema.ts                                                         |
|  Compacting/writing: src/analyze.ts                                            |
|  Explorer data API: src/server.ts                                              |
+--------------------------------------------------------------------------------+
```

## Important limitations to remember

```text
+--------------------------------------------------------------------------------+
| Current known limits                                                           |
|                                                                                |
|  TypeScript call graph only includes calls whose symbols resolve to known       |
|  extracted entities. Dynamic calls, reflection, many property/indirect calls may|
|  not be represented.                                                           |
|                                                                                |
|  Python/Go call graph maps by simple callee name across the whole analysis.     |
|  Same-name functions can collide. Method receiver/module resolution is limited. |
|                                                                                |
|  Temporal coupling depends on git history quality. Large commits over 20 files  |
|  are ignored. Pairs need at least 3 co-changes by default.                      |
|                                                                                |
|  Package boundaries are package.json-based, so non-JS monorepo boundaries are   |
|  approximate unless they also contain package.json.                             |
|                                                                                |
|  Context cost is a rough line-count heuristic: lines * 3.5 tokens.              |
+--------------------------------------------------------------------------------+
```
