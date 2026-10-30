# P5 final-evidence ruling — 2026-10-30

Status: **owner-approved**. P5 is certified on the full `f552728` combined report plus the
`ea1475c` lifecycle/browser evidence; no gate or tolerance is changed.

## Situation

- The full combined P5 report at `f552728` is **CERTIFIED**: all 11 primary scenes, all 23 support
  variants, controls 94/94, G9/G10/G11/G12/G13 green, G11 1.959×, load 4.24 (D13 controlled).
- The D13 second invocation at `f552728` (`cost-repeat-3.json`) is green: G11 2.000×, G9/G10/G12
  green, load 3.65. Two other repeats failed only G11 at load 6.11/3.33; they are retained as
  load-sensitivity evidence.
- After the report, the P3/P5 browser suite found a real lifecycle regression: a crossfade
  follower whose fade had ended was still reported as a live mover by the kill switch. `ea1475c`
  fixes `snapToDisabled()` to skip a finished follower and updates the `CAPS_STATUS` row to the
  §5.8/§9.1 cap behavior (follower stays opacity 0/inert until presence unmounts).
- At `ea1475c`: unit 1928/1928, layout 481/481, bench 130/130, typecheck 11/11, Chromium browser
  223/223, WebKit browser 221/221 + 2 Chromium-only skips. A full ea1475c rerun at load 7.53
  passed every scene and G11 1.884× but failed four Chromium reduced-motion support-variant G12
  rows by 0.005–0.03 ms. The host then rose to load 40+ from unrelated owner workloads, so a
  clean full rerun was not possible.

## Ruling

- Accept the `f552728` full report as the P5 certification report and `ea1475c` as the final code
  for the lifecycle fix, with the one-source-commit delta documented in `p5_bench.md`.
- No gate, tolerance, scene, variant, or cost ratio is changed. The delta does not touch any P5
  scene, support-variant or cost-shape motion; the browser suite at `ea1475c` proves the changed
  kill-switch row.
- The P5 tribunal must judge the delta explicitly and may reject it if it finds the evidence
  insufficient. This ruling does not make the tribunal a formality.

## Evidence

- `bench/layout/iteration-12/pre-fix/report.json` — certified full report at `f552728`.
- `bench/layout/iteration-12/pre-fix/cost-repeat-3.json` — second D13 green invocation.
- `bench/layout/iteration-12/pre-fix/cost-repeat*.json` — failed G11-only repeats, retained.
- `bench/layout/iteration-12/attempt-load7.53/report.json` — ea1475c near-pass, only variant G12.
- `tests/browser/cases/layout_ops.ts` — CAPS_STATUS/L_OPS_1 rows at `ea1475c`.
- `pnpm test`, `pnpm test:browser --browser chromium`, `pnpm test:browser --browser webkit` logs
  at `ea1475c`.
