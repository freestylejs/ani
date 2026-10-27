#!/bin/bash
# P1 gate, one command per line; each writes its own log next to this script.
# Run from the repository root: bash .trace/ani_ios_production/logs/p1/run.sh
set -u
L=.trace/ani_ios_production/logs/p1
export PLAYWRIGHT_BROWSERS_PATH=/home/user/.pw-extra
run() { local name=$1; shift; { echo "\$ $*"; echo "# commit $(git rev-parse HEAD)"; "$@"; echo "# exit $?"; } > "$L/$name.log" 2>&1; }
run env bash -c 'uname -sr; grep PRETTY_NAME /etc/os-release; grep -m1 "model name" /proc/cpuinfo; nproc; grep MemTotal /proc/meminfo; node --version; npx playwright --version; ls $PLAYWRIGHT_BROWSERS_PATH'
run vitest npx vitest run
run typecheck pnpm ts:typecheck
run biome npx biome check .
run chromium-all node tests/browser/run.ts --browser chromium
for b in firefox webkit; do
  for m in layout layout_spring waapi core; do
    run "$b-$m" node tests/browser/run.ts --browser "$b" --case "$m:*"
  done
done
