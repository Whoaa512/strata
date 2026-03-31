#!/usr/bin/env bash
set -euo pipefail

STRATA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$STRATA_DIR/src/cli.ts"
RUNS="${BENCH_RUNS:-3}"

if [ $# -eq 0 ]; then
  echo "usage: scripts/bench.sh <repo> [<repo> ...]"
  echo "  env: BENCH_RUNS=N (default 3)"
  exit 1
fi

for repo in "$@"; do
  repo="$(cd "$repo" && pwd)"
  name="$(basename "$repo")"
  echo ""
  echo "=== $name ($repo) ==="
  hyperfine \
    --runs "$RUNS" \
    --warmup 1 \
    --export-json "/tmp/strata-bench-${name}.json" \
    "bun $CLI analyze $repo"
done

echo ""
echo "--- summary ---"
for repo in "$@"; do
  name="$(basename "$repo")"
  json="/tmp/strata-bench-${name}.json"
  if [ -f "$json" ]; then
    mean=$(jq '.results[0].mean' "$json")
    min=$(jq '.results[0].min' "$json")
    max=$(jq '.results[0].max' "$json")
    printf "%-12s  avg %.2fs  min %.2fs  max %.2fs\n" "$name" "$mean" "$min" "$max"
  fi
done
