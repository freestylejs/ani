# H17 verification record

Branch `helper/h17`, base `c7cba21` (P4 acting PASS + H14 harness). No remote
was touched. The changes are in `packages/layout/src/{scope,plan,solve,dom}.ts`.

## Commands and results

| Command | Result |
|---|---|
| `pnpm vitest run packages/layout` | 27 files, **445 tests passed** |
| `pnpm test:coverage` | 153 files, **1,892 tests passed**; coverage floors pass |
| `pnpm check` | exit 0: 10 warnings, 7,778 infos (repo baseline infos) |
| `pnpm ts:typecheck` | 11/11 tasks pass after regenerating `packages/web/.source` (`pnpm --filter @freestylejs/ani-web postinstall`; it is a generated, gitignored file and was 0 bytes from an interrupted install) |
| `pnpm test:browser --coverage` | **223 passed, 0 failed**; layout engine coverage passes (scope 92.61% statements, dom 91.5%, all 92.37%) |
| `pnpm bench:layout --runs 5 --engine chromium --engine webkit --check` | attempted twice; Chromium GPU process exited (code 15) after warm-up, so the combined invocation did not complete. Per-scene five-run invocations below are green. |

## Final per-scene reports

- `bench/layout/iteration-3/chromium-cost.json` — G9 1.963×/1.963× pass,
  G10 0.930 ms pass, G11 8.045 ms fail, G13 exact, floor audits exact.
- `bench/layout/iteration-3/chromium-s-card.json` — pass.
- `bench/layout/iteration-3/chromium-s-seg.json` — pass.
- `bench/layout/iteration-3/webkit-cost.json` — BLOCK (g = 1 ms); G13/floor
  audits exact.
- `bench/layout/iteration-3/webkit-s-card.json`, `webkit-s-seg.json` — pass.

The full two-engine invocation's Chromium failure is a browser-process loss
(`GPU process exited unexpectedly: exit_code=15`) before the first measured
run, followed by a Playwright closed-browser wait. It is recorded, not hidden.
The cost fingerprint load was 1.55 (advisory); a quiet run is still required
for certification.

## What was verified directly

- Every exact-read audit (`G9.floor-*`, engine `G13`) remains exact: capture
  2,000 rects/2,000 pairs, flush 1,000/1,000, 300 computed reads on Chromium
  (600 on WebKit including Typed OM), 300 pose declarations, zero extra reads,
  zero steady-frame reads.
- All 445 layout unit tests, including C-6b (computed values are read at
  capture and again at flush, never reused across them), the support/1.003
  scale case, identity/adoption, scroll listeners and stale reports.
- The full scene set is scored by the H14 harness; see the report.

## WebKit / coarse timer

WebKit remains **BLOCK**; see `.trace/ani_ios_production/evidence/h17/webkit_timer_block.md`.
No quantized ratio is presented as a measured failure and no 20-frame average
is called a 60 Hz measurement.

## G11

The absolute 2 ms sustained gate is below the measured required-work floor; see
`.trace/ani_ios_production/evidence/h17/g11_floor_amendment_proposal.md` and
`floor_sustained.json`. No gate was changed.
