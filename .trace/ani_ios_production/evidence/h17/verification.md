# H17 verification record (superseded by H17b)

> The final H17b numbers and S1/S2 verdicts are in
> `.trace/ani_ios_production/evidence/h17b/verification.md`. This file is the
> H17 record, retained as history.


Branch `helper/h17`. The code is at `1cec4d6` (D10) on `f8b7223` (H17
regressions) on `d234350`; no remote was pushed. No authority, scene,
tolerance, row or `knownFailure` was changed.

## Final commands (at `1cec4d6`)

| Command | Result |
|---|---|
| `pnpm vitest run packages/layout` | 27 files, **449 tests passed** |
| `pnpm test:coverage` | 153 files, **1,896 tests passed**; coverage floors pass |
| `pnpm check` | exit 0: 10 warnings (repo baseline); no errors |
| `pnpm ts:typecheck` | 11/11 tasks pass |
| `pnpm test:browser --coverage` | **223 passed, 0 failed, 0 known failures, 0 skipped**; layout coverage passes |
| `pnpm test:bench-layout` | **73 passed, 0 failed** |
| `pnpm bench:layout --runs 5 --engine chromium --engine webkit --check` | attempted; Chromium GPU process exited (`exit_code=15`) after warm-up, so the combined invocation did not complete. Per-scene five-run invocations below are the evidence. |

## Final reports

Every report below records `sourceRevision` = `1cec4d6b72f14f36fe7b5960ac6f5565fc481c76`.

- `bench/layout/iteration-3/chromium-cost.json` (load 2.90, advisory):
  G9 **1.692× unscrolled / 1.742× scrolled, pass**; G10 **0.935 ms, pass**;
  G11 **2.425×, FAIL** (engine p95 7.395 ms / floor p95 3.050 ms; per-run
  2.437 / 2.456 / 2.381 / 2.294 / 2.425; cadence 60.01–60.07 Hz);
  G13 exact; every floor audit exact. The invocation fails on G11 only.
- `bench/layout/iteration-3/chromium-s-card.json` — pass (load 1.70).
- `bench/layout/iteration-3/chromium-s-seg.json` — pass (load 2.58).
- `bench/layout/iteration-3/webkit-cost.json` (load 4.73, `valid: false`):
  G10 **0.300 ms, pass** with the 20-frame coarse-timer protocol;
  G9/G11 **BLOCK** (1 ms timer); G13 and every floor audit exact.
- `bench/layout/iteration-3/webkit-s-card.json` — pass (load 2.59).
- `bench/layout/iteration-3/webkit-s-seg.json` — pass (load 3.34).

## What was verified directly

- Every exact-read audit (`G9.floor-*`, `G11.floor`, engine `G13`) is exact:
  **capture 1,000 rects / 1,000 layout-size pairs**, **flush 1,000 / 1,000**
  (2,000 rects/pairs per commit across both), 300 computed reads on Chromium
  (600 on WebKit including Typed OM), **300 poses = 600 pose declarations**,
  zero extra reads, zero steady-frame reads.
- All 449 layout unit tests pass, including the H17 regressions below and the
  existing C-6b, support/1.003, identity/adoption, scroll-listener and stale
  report tests.
- The full scene set is scored by the H14 harness; S-CARD and S-SEG pass in
  both engines over five runs.

## H17 regressions

- H17-01: a participant inside a detached wrapper takes 0 capture reads and
  0 flush reads, reports `no-change`, and leaves no stale report.
- H17-02: a sub-threshold top-level parent move keeps an anchored child exact;
  its first frame is 20.5 px, not 20 px.
- H17-03: attaching a shadow root on a non-participant ancestor invalidates the
  tree cache and arms the root's scroll listener.
- H17-04: out-of-order `captureAdded` calls each read a late participant once;
  neither is skipped by a high-water mark.

## WebKit / coarse timer

G10 uses the §11.5 20-frame protocol: 30 samples, each the mean of 20
consecutive manual-clock frames timed as one `performance.now()` interval;
error bound `g/20 = 0.05 ms`; the gate is deciding when the bound does not
straddle 2 ms. It passes at 0.300 ms.

WebKit G9/G11 remain **BLOCK**. A 20-commit interval cannot be timed without
including frame idle, changing the from-rest G9 work, or breaking the 60 Hz G11
cadence; a p95 of 15 batch means is not a p95 of 300 commits. No quantized
WebKit ratio is claimed as a pass or failure.

## G11 / D10

The owner-approved D10 gate is implemented: median of 5 per-run
`p95(engine commits) / p95(floor commits) <= 2`, with the floor replica measured
in the same page for every run (5 warm-ups, 300 60 Hz samples, exact audit).
G10 keeps the absolute non-commit p95 <= 2 ms; G9 keeps the whole-commit ratio.

The sustained optimization target is **not met**: Chromium G11 is 2.425×
(7.395 ms / 3.050 ms). The gate is reported as a failure, not weakened, and no
other scene, tolerance or row changed.
