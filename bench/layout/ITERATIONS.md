# P5 layout bench — iterations

The engine is never fixed in this harness. Each iteration records the failing
metric, the worst frame/participant, the measured values and a root-cause
hypothesis; the next iteration is a run after a fix elsewhere (P3b, P4 or the
engine), never a gate change.

## Iteration 0 — P5a harness on base 7042545 (P3a)

- Worktree: `ani-h14`, branch `helper/h14`, base `7042545` (P0–P3a closed).
- Date: 2026-10-28/29.
- Commands:
  - `pnpm install --frozen-lockfile --offline`
  - `pnpm test:bench-layout`
  - `node bench/layout/run.ts --engine chromium --runs 5 --check --out .../iteration-0-chromium.json`
  - `node bench/layout/run.ts --engine webkit --runs 5 --check --out .../iteration-0-webkit.json`
- Instrument: MacBook Pro `Mac14,9`, Apple M2 Pro (10 cores), 32 GB,
  macOS 27.0.1 / Darwin 27.0.0, Node 24.19.0, pnpm 10.20.0, Playwright
  1.55.0, `chromium_headless_shell-1187`, `webkit-2203`.
- 1-minute load at start: **3.95** (Chromium run), **5.34** (WebKit run).
  The fingerprint is therefore **advisory for the cost gates**; the frame
  gates still decide. These are not certification runs.
- Evidence: `bench/layout/iteration-0/chromium.json`,
  `bench/layout/iteration-0/webkit.json` (full report JSON), plus
  `bench/layout/results/pages/` for the viewable scenes.

### Scene and metric table (5 measured runs, median)

| Scene | Gate | Chromium | WebKit |
|---|---|---|---|
| S-CARD | G1 oracle error | **0.00132 px** pass (worst frame 102, card-title, left) | **0.00040 px** pass (worst frame 73, sheet-content, bottom) |
| S-CARD | G2 first frame | **0.00117 px** pass (frame 68, card-title, reverse) | **0.00010 px** pass (frame 68, card, reverse) |
| S-CARD | G3 velocity | 0.000 pass (one retarget, reverse) | 0.000 pass |
| S-CARD | G4 spring fidelity | **0.00132 px** pass (frame 102, card-title, left) | **0.00030 px** pass (frame 14, sheet-image, top) |
| S-CARD | G5 settle | 0 px pass | 0 px pass |
| S-CARD | G6 restoration | 0 pass | 0 pass |
| S-CARD | G7 reports | 0 pass (`ended`, `interrupted`, `ended`) | 0 pass |
| S-CARD | G8 real frame | 0.245 ms pass (116 frames) | 0.500 ms pass (62 frames) |
| S-CARD | G13 exact reads | 0 excess pass | 0 excess pass |
| S-CARD | shape opacity/coverage/radius/font/teardown | pass | pass |
| S-CARD | **shape.inert** | **FAIL, 261 frame violations** (worst frame 0, card) | **FAIL, 261 frame violations** (worst frame 0, card) |
| S-SEG | G1 | 0.00010 px pass (frame 17, pill, right) | 0.00000 px pass (frame 23, pill, right) |
| S-SEG | G2 | 0.00000 px pass (frame 10, tap-3) | 0.00000 px pass |
| S-SEG | G3 | 0.000 pass (three moving retargets) | 0.000 pass |
| S-SEG | G4 | 0.00010 px pass | 0.00000 px pass |
| S-SEG | G5/G6/G7/G13 | pass | pass |
| S-SEG | G8 | 0.285 ms pass (56 frames) | 0.300 ms pass (31 frames) |
| S-SEG | shape pill radius | 0.00000 px pass | 0.00000 px pass |
| S-BULK | G9-unscrolled | **FAIL, 3.351×** (per-run 3.394/3.256/3.562/3.340/3.351) | **FAIL, 2.500×** (2.25/2.5/2.5/2.5/2.5) |
| S-BULK | G9-scrolled | **FAIL, 3.414×** (3.221/3.450/3.297/3.414/3.415) | **FAIL, 2.500×** (1.8/2.0/2.5/2.5/2.5) |
| S-BULK | G9 floor audit | pass (2N rects, 2N pairs, 300 poses) | pass |
| S-BULK | G10 steady p95 | 0.705 ms pass (per-run 0.69/0.74/0.71/0.75/0.69) | 1.400 ms pass (per-run **2.15/2.50**/0.85/1.40/0.90; median decides) |
| S-BULK | G11 sustained p95 | **FAIL, 8.650 ms** (per-run 8.685/8.650/8.590/8.580/8.765) | **FAIL, 16.850 ms** (16.85/16.10/14.60/17.00/18.10) |
| S-BULK | G13 exact reads | pass (2N, steady 0) | pass |
| S-BULK | G12 held | **pending P4** | **pending P4** |

S-REORDER and S-SHEET are **pending P4**; the S-BULK held shape is **pending
P4**. None is faked.

### Cost per-run detail

Chromium S-BULK (engine commit / floor commit medians; 1,000 participants,
300 poses):

| run | unscrolled ratio | scrolled ratio | engine us | floor us |
|---|---|---|---|---|
| warm-up | 3.367 | 3.335 | 9.765 / 9.822 | 2.900 / 2.945 |
| 1 | 3.394 | 3.221 | 9.867 / 9.600 | 2.907 / 2.980 |
| 2 | 3.256 | 3.450 | 9.743 / 9.642 | 2.993 / 2.795 |
| 3 | 3.562 | 3.297 | 9.787 / 9.610 | 2.748 / 2.915 |
| 4 | 3.340 | 3.414 | 9.788 / 9.868 | 2.930 / 2.890 |
| 5 | 3.351 | 3.415 | 9.860 / 9.990 | 2.943 / 2.925 |

WebKit S-BULK: engine 9–10 ms, floor 4–5 ms (1 ms timer), ratio 2.25–2.5;
`g = 1 ms`, so the 20-frame sampler reports 1.4–2.5 ms steady samples and
14.6–18.1 ms sustained samples. The 1 ms quantum is why the ratio lands on
2.5, not a coincidence.

### Failure 1 — S-CARD `shape.inert` (both engines)

- Metric: the exiting crossfade follower is not `inert` from the first
  crossfade frame (and the lead is focusable). 261 violating frames per run.
- Worst: frame 0, participant `card` on open (and the sheet on close).
- Evidence: at the open flush the card's style snapshot has
  `inert: null`; the engine's `shape.inert` violation count starts at frame 0.
  The `card-no-inert` browser control also fails the same metric, but the
  primary run fails it without the control.
- Root-cause hypothesis: the base tree is **P3a**. P3b (the crossfade-follower
  `inert`/focus rule and its byte-exact restore) is running in another worktree
  and is not in `7042545`. A grep of `packages/layout/src` finds no `inert`
  write at this base. This is a P3b dependency, not a gate or scene defect.
- Action: rerun after P3b lands; do not weaken or drop `shape.inert`.

### Failure 2 — S-BULK G9 commit ratio (both engines)

- Chromium median ratios: **3.351** unscrolled, **3.414** scrolled (gate 2).
  Engine commit ~9.74–9.87 ms; audited floor ~2.75–2.99 ms.
- WebKit: **2.500** both shapes (engine 9–10 ms, floor 4–5 ms at `g = 1 ms`).
- The floor audit passes: 2N rects, 2N layout-size pairs, 300 pose writes
  (translate + scale), no extra read; the engine audit also passes 2N/2N/300.
- Root-cause hypotheses (not fixed here):
  1. The engine reads computed styles for all 300 active nodes on every flush
     (`styles` is 300 in every measured commit). The audited floor has no
     computed-style reads because §4.1 item 1 does not require them. Batched
     or cached active-node computed values would reduce this block.
  2. The flush plans and starts 300 spring tracks from rest (finish between
     samples) and writes 600 declarations through the transactional queue.
     The floor writes the same 600 declarations but no planning.
  3. The support check and geometry composition run over the 1,000-participant
     tree even though only 300 move; the floor performs only the mandated
     reads.
  4. The cost is measured at a 1-minute load of 3.4–6.7, so the absolute values
     are inflated and the report is advisory. The ratio is less sensitive but
     still not certification evidence.
- Action: optimize the engine (not the gate), then rerun on a quiet instrument.

### Failure 3 — G11 sustained commits (both engines)

The sustained fixture commits at 60 Hz for 5 s with 300 moving participants
(300 commits; WebKit's rAF is ~30 Hz, so the commit loop is independent of the
rAF rate). The commit task's script time is charged to the next frame sample;
this is the "every frame sample in the window" reading of §11.5. Measured:

- Chromium: **8.650 ms** median p95 (per-run 8.685/8.650/8.590/8.580/8.765).
- WebKit: **16.850 ms** median p95 (16.85/16.10/14.60/17.00/18.10).

Both are far above the 2 ms steady-frame gate. Root-cause hypotheses: the same
flush cost measured by G9, applied every 16.7 ms; the engine's 300 track
plans, 300 computed-style reads, support checks and 600 pose declarations do
not fit a 2 ms frame budget at this shape. This is an engine performance
failure, not a gate change. The 1 ms WebKit timer quantises the samples but
does not explain an order-of-magnitude gap.

### WebKit G10 per-run overruns

WebKit's G10 median is **1.400 ms** and passes (p95 ≤ 2 ms), but two measured
runs report **2.150** and **2.500 ms**; Chromium is 0.705 ms. The 1 ms timer
and the §11.5 20-frame mean explain the quantisation, not the overrun. Per-run
values are printed; the aggregate uses the median as the authority specifies.
A quiet run and a finer WebKit timer remain risks for P5.

### Negative controls (both engines, `--check`)

All browser controls failed their target as required:

| Control | Target | Observed |
|---|---|---|
| card-no-image-id | G1 | fail, 176.0 px at frame 0 |
| card-no-inert | shape.inert | fail, 261 |
| card-image-offset | G1 | fail, 19.668 px at frame 0 |
| seg-rest-retarget | G1 | fail, 75.551 px at frame 6 |
| seg-jump-from-A | G2 | fail, 146.986 px at frame 5 |
| seg-leftover-pose | G6 | fail, 2 |
| floor-extra-read | G9.floor | fail, extra reads 1 |

Self-tests: 14 control tests (G1–G14 and shape) pass; oracle hand-computed
values and RK4/reference integration pass.

### Non-failures worth recording

- The S-CARD oracle/scene is otherwise exact: worst edge 0.0013 px (Chromium)
  and 0.0004 px (WebKit) across 756/630 participant-frames; reverse retarget
  G2 0.00117/0.00010 px; coverage exactly 1; radius within 0.0001 px; computed
  title font identical across the button/div pair.
- S-SEG is exact on every gate in both engines, including three moving
  retargets (G3) and the final restoration.
- S-CARD G6 restores the sheet after the reverse; the sheet `inert` restoration
  check is only meaningful once P3b writes `inert` in the first place.
- Every engine/floor floor audit and exact-read check passes: no over-count,
  no steady-frame read, 2N rects and 2N pairs, 300 poses.

### Scope / ambiguity notes for the next iteration

- S-REORDER, S-SHEET and the S-BULK held shape are P4-only; pending P4.
- The DPR 1/2/3 sweep, reduced-motion variants, S-PHOTO and the other P2
  scenes are P5b, not P5a.
- G3's deciding pair is the scene plan's analytic before/after; the engine's
  observed continuity is G1. The negative control is a plan velocity override.
- G13 counts `N_capture + N_flush` (S-CARD open: 3 + 7; close: 4 + 7), not the
  scene spec's simplified 7 + 7.
- G9 commits start from rest (finish between samples) so the floor and engine
  write the same t = 0 pose set. This is the floor-audit requirement, not a
  gate change.
- WebKit is not cross-origin isolated under Playwright; `g = 1 ms` and the
  20-frame sampler apply. Chromium is isolated.
- Firefox 1490 times out on launch on this macOS 27 instrument; it is advisory
  (D9 exception). A 60 s launch timeout records the error instead of waiting
  180 s.

No gate or tolerance was changed in this iteration.

## Iteration 1 — H14 fix round on fixed H11b base 4eb2f7e

- Worktree: `ani-h14`, branch `helper/h14`, rebased/merged onto `4eb2f7e`
  (fixed H11b transaction) from `helper/h11b`; no origin reset, no push.
- Date: 2026-10-29.
- Command: `node bench/layout/run.ts --runs 5 --engine chromium --engine webkit --check`.
- Report: `bench/layout/iteration-1/report.json`.
- Instrument load at start: **4.30**, so cost remains **advisory**; frame gates
  still decide. WebKit remains unisolated under Playwright, `g = 1 ms`.
- S-CARD `shape.inert` and G6's removed-follower check still fail until H12/P3b.
  This is recorded as an expected dependency, not a harness bug.

### Invocation vs certification

The report now has separate fields:

- `pass`: the selected invocation. It is `false` for this run.
- `certification`: `NOT CERTIFIED` with reasons:
  - cost fingerprint advisory (load 7.04);
  - pending S-REORDER, S-SHEET and S-BULK G12 (P4);
  - S-CARD fail in Chromium and WebKit (P3b inert);
  - Chromium S-BULK cost pending (G12) and measured G9/G11 fail;
  - WebKit S-BULK cost blocked/not valid (1 ms timer).
- `certification.ts` unit tests prove: runs=1, single engine, single scene and
  advisory-even-if-passing all fail certification; only the full five-run,
  two-engine, all-scene, non-advisory, non-pending report certifies.

### Fixed-base scene table (5 measured runs; medians and worst)

| Scene | Chromium | WebKit |
|---|---|---|
| S-CARD C1 completeness | pass (757 participant-frames) | pass |
| S-CARD G1 | 0.00132 px pass, frame 102 card-title left | 0.00045 px pass, frame 73 sheet-content bottom |
| S-CARD G2 | 0.00117 px pass, reverse frame 68 | 0.00011 px pass |
| S-CARD G3 | analytic 0 pass; observed FD 218.7 px/s supporting (acceleration) | same |
| S-CARD G4 | 0.00132 px pass | 0.00031 px pass |
| S-CARD G5/G7/G13 | pass | pass |
| S-CARD G6 | **FAIL 3**: removed follower card inert absent (P3b) | **FAIL 3**: same |
| S-CARD G8 | 0.190 ms pass (117 frames) | 1.000 ms pass (61 frames, quantized ±0.5) |
| S-CARD shape.inert | **FAIL 261**, frame 0 card (P3b) | **FAIL 261** (P3b) |
| S-CARD shape.focus/font/opacity/coverage/radius/teardown | pass | pass |
| S-CARD G9.probe | 2.479× non-deciding at N=7 | 1.250× non-deciding at N=7 |
| S-SEG C1/G1–G8/G13 | all pass (G1 0.00007 px; G8 0.195 ms) | all pass (G1 0.00002 px; G8 1.000 ms) |
| S-SEG shape | all pass; pill radius 0 | all pass |
| S-SEG G9.probe | 5.960× non-deciding at N=1 | n/a/NaN non-deciding (1 ms timer; no fabricated ratio) |
| S-BULK G9 unscrolled | **FAIL 3.272×** measured (3.304/3.272/3.185/3.234/3.323) | **BLOCK** 2.250× diagnostic, not deciding |
| S-BULK G9 scrolled | **FAIL 3.256×** (3.360/3.256/3.148/3.249/3.271) | **BLOCK** 2.000× diagnostic |
| S-BULK G9 floor audit | pass both shapes | pass both shapes |
| S-BULK G10 | 0.745 ms pass (A-19 150+150) | **BLOCK** 1.000 ms diagnostic |
| S-BULK G11 | **FAIL 11.705 ms** 60 Hz commit script p95 | **BLOCK** 10.000 ms diagnostic; refresh ~30 Hz; 300 commits at 59.3–60.0/s |
| S-BULK G13 | pass (2N/2N/300 computed; steady 0) | pass (2N/2N/600 computed incl. Typed OM; steady 0) |
| S-BULK G12 | pending P4 | pending P4 |

Chromium S-BULK cost is `valid: true`, `status: pending` because G12 is P4;
the measured G9/G11 are still printed as failures. WebKit cost is
`valid: false`, `status: blocked`: the 1 ms timer makes the G9/G10/G11 values
non-deciding, and no quantized ratio is presented as a measured failure.

### Required-work floor (iteration 1)

Both shapes (unscrolled 32×27, scrolled 16×54 at scrollTop 1080), same process,
5 discarded + 30 measured, reset to rest between samples:

| Count | Engine | Floor |
|---|---|---|
| capture rects / offset pairs | 2,000 / 2,000 (1,000 + 1,000) | 1,000 / 1,000 |
| flush rects / offset pairs | 1,000 / 1,000 | 1,000 / 1,000 |
| §4.3 step 2 computed reads | 300 (Chromium), 600 (WebKit incl. Typed OM) | 300 / 600 |
| t=0 poses (translate+scale) | 300 | 300 |
| extra reads | 0 | 0 |

The floor audit passes both shapes in both engines. A `floor-extra-read`
control fails the audit in both engines. Engine/floor medians: Chromium
unscrolled ~9.22–9.92 ms / ~2.895–2.985 ms; scrolled ~9.12–9.63 / ~2.86–2.90.
WebKit diagnostic only at 1 ms resolution.

### H14 fix evidence

| ID | Fix | Test/result |
|---|---|---|
| H14-01 | C1 completeness contract; blank/partial trace fails; n/a declared metrics fail; C1 included in scene pass | `scoring.test` blank/partial tests; S-CARD/S-SEG C1 pass |
| H14-02 | `pass` vs `certification`; five runs, both engines, all scenes, no pending, non-advisory, no launch error | `certification.test` four invocation cases; final report `NOT CERTIFIED` |
| H14-03 | Floor adds active §4.3 computed reads (Typed OM on WebKit), resets both fixtures, audits styles/poses/counts | floor audit pass; `floor-extra-read` fail |
| H14-04 | WebKit G9/G10/G11 `BLOCK`, not a measured failure; raw ratios diagnostic | WebKit cost `valid:false`, `status:blocked` |
| H14-05 | G11 times one pair per 60 Hz commit; refresh recorded; 300 commits; no 30 Hz frame called 60 Hz | Chromium 300 commits 59.65–59.97/s; WebKit blocked |
| H14-06 | next-frame commit attribution in `FrameSampler` | `frame_sampler.test` two-frame test |
| H14-07 | observed finite difference at retargets; analytic pair remains gate | G3 detail; trace-level jump test |
| H14-08 | priorities/full cssText recorded; mount snapshots before registration; removed participants checked | priority test; S-CARD removed-follower G6 fails at P3a |
| H14-09 | per-commit computed-style range; over-read fails; Typed OM included | G13 tests; WebKit 600 expected |
| H14-10 | non-deciding engine/floor probe at S-CARD N=7 and S-SEG N=1 | `G9.probe` in report; NaN allowed as non-deciding |
| H14-11 | per-commit/participant aged G2; 0.5 only aged | aged test |
| H14-12 | no fake 20-frame average; raw + quantization bound | `stats.test` coarse-g path |
| H14-13 | G12 pending keeps cost/scene pass false; top-level pass false while pending | cost status pending; certification reasons |
| H14-14 | card-no-inert marked inconclusive while primary fails | control output |
| H14-15 | retarget B = previous observation | oracle builder; S-CARD/S-SEG exact |
| H14-16 | data-only `window.__scene` descriptor | page descriptor |
| H14-17 | A-19 850 tiles + 150 labels; 300 movers; 32×27/16×54 | cost participant assert |
| H14-18 | stats tests | `stats.test` |
| H14-19 | shape.focus + browser focus control | control fails at P3a |
| H14-20 | teardown/pill-radius/G12/G14 controls or mapping | tests/README mapping |
| H14-21 | per-run gate aggregation; missing/NaN fail | `aggregate.test` |
| H14-22 | real twin diagnostics/final checked; removed nodes checked in manual G6 | S-SEG/S-CARD runs |
| H14-23 | README/ITERATIONS corrected | this document |
| H14-24 | engine/floor audit objects in report | JSON reports |
| H14-25 | visual deviations recorded | README |
| H14-26 | no bench lint suppression; biome scope documented | `pnpm check` |
| H14-27 | oracle 0.01 ms reference label/high-bounce/dead code | oracle tests |
| H14-28 | 5 discarded + 30 measured; raw g source recorded | cost report gSource |
| H14-29 | compare reports missing/added scenes/metrics | compare implementation |
| H14-30 | real twin content-layer timing declared | README |
| H14-31 | `--check` runs all controls (no scene filter) | `--check` output |
| H14-32 | Firefox build advisory-only | fingerprint test |

### Negative controls (both engines)

- Unit self-tests: 54 tests pass, including C1 blank/partial, stats, sampler,
  per-run aggregation, certification, aged G2, priority, style over-read,
  teardown/pill-radius, G3 observed jump.
- Browser controls: `card-no-image-id` G1 fail; `card-image-offset` G1 fail;
  `card-focus-follower` shape.focus fail; `seg-rest-retarget` G1 fail;
  `seg-jump-from-A` G2 fail; `seg-leftover-pose` G6 fail; `floor-extra-read`
  floor audit fail. `card-no-inert` is **inconclusive** at P3a (primary already
  fails); it becomes conclusive after H12.
- `--check` exits 1 on the real misses; all controls behaved as required.

### Residual risks / next

- H12/P3b must land for S-CARD G6/shape.inert to pass.
- P4 must land for S-REORDER/S-SHEET/G12; until then certification cannot be
  claimed.
- Chromium G9/G11 are genuine measured failures under the new floor and commit
  timing. They are advisory because the load was 7.04; a quiet instrument is
  needed for certification.
- WebKit G9/G10/G11 cannot decide on a 1 ms timer. A finer/batched protocol
  must be proven or the checkpoint remains BLOCK.
- WebKit G8 uses quantized raw samples; the passed values are not a claim of
  sub-millisecond precision.

## Iteration 2 — H14 fix round 2 on P3 final 46b1487

- Worktree: `ani-h14`, branch `helper/h14`.
- Base: P3 final `46b1487` (includes H12/P3b), fetched from the main tree
  `/Users/june/Documents/project/freestylejs/ani-ios-scope-correction`
  (`fix/ios-native-grade-scope`); rebased with
  `git rebase --onto FETCH_HEAD 4eb2f7e helper/h14`. No origin reset, no push.
- No production source, `tests/browser`, or `ARCHITECTURE.md` change:
  `git diff 46b1487 -- packages tests` is empty.
- Date: 2026-10-29.
- Command: `node bench/layout/run.ts --runs 5 --engine chromium --engine webkit --check`.
- Report: `bench/layout/iteration-2/report.json`.
- Instrument load at start: **2.39**, so cost remains **advisory**; frame gates
  still decide. WebKit remains unisolated under Playwright, `g = 1 ms`.
- Self-tests: **73/73 pass across 7 files** (oracle, scoring, stats,
  frame_sampler, aggregate, certification, cost_validity).
- Browser controls: 8 per engine, all conclusive and failing their target.

### Invocation vs certification

- `pass` is the selected invocation: it is true when the selected engines,
  scenes, and cost reports pass. It does not include global P4 pending scenes.
  A single-engine S-CARD/S-SEG invocation can PASS while certification is NOT
  CERTIFIED.
- `certification` also requires exactly five runs, Chromium and WebKit, all
  required scenes, all conclusive controls, the full self-test suite, no
  pending gate, a non-advisory cost fingerprint, and a valid cost run.
- The full run's invocation is FAIL because the selected S-BULK cost is
  pending G12. Certification is NOT CERTIFIED.

### Fixed-base scene table (5 measured runs; medians and worst)

| Scene | Chromium | WebKit |
|---|---|---|
| S-CARD C1 completeness | pass (757 participant-frames) | pass |
| S-CARD G1 | 0.00132 px pass, frame 102 card-title left | 0.00045 px pass, frame 73 sheet-content bottom |
| S-CARD G2 | 0.00117 px pass, 18 commit layers | 0.00011 px pass |
| S-CARD G3 | analytic 0 pass; observed FD 218.7 px/s supporting (acceleration) | same |
| S-CARD G4 | 0.00132 px pass | 0.00031 px pass |
| S-CARD G5/G7 | pass (8 settled participants; all reports match) | pass |
| S-CARD G6 | **0 pass**: mount snapshots present; 0 owned mismatches; 11 author inline cssText changes recorded | **0 pass**: same |
| S-CARD G13 | **exact**: open 8/8, close 8/8, reverse 9/9; steady 0 | **exact**: open 15/15, close 15/15, reverse 16/16; steady 0 |
| S-CARD G8 | 0.410 ms pass (116 frames) | 1.000 ms pass (61 frames, quantized ±0.5) |
| S-CARD shape.inert | **0 pass** (P3b inert present) | **0 pass** |
| S-CARD shape.focus | 0 pass | 0 pass |
| S-CARD shape.font/opacity/coverage/radius/teardown | pass | pass |
| S-CARD G9.probe | 1.981× non-deciding at N=7 | 1.000× non-deciding at N=7 |
| S-SEG C1/G1–G8 | all pass (G1 0.00007 px; G8 0.315 ms) | all pass (G1 0.00002 px; G8 1.000 ms) |
| S-SEG G6/G13 | G6 0 pass; G13 exact tap-1..4 2/2, steady 0 | G6 0 pass; G13 exact tap-1..4 3/3, steady 0 |
| S-SEG shape | all pass; pill radius 0 | all pass |
| S-SEG G9.probe | 5.926× non-deciding at N=1 | BLOCK/n-a: all five runs null (1 ms timer) |
| S-BULK G9 unscrolled | **FAIL 3.252×** measured (3.683/3.069/3.247/3.332/3.252) | **BLOCK** 2.250× diagnostic, not deciding |
| S-BULK G9 scrolled | **FAIL 3.284×** (3.671/3.250/3.283/3.284/3.333) | **BLOCK** 2.000× diagnostic |
| S-BULK G9 floor audit | pass both shapes | pass both shapes |
| S-BULK G10 | 1.025 ms pass (A-19 150+150) | **BLOCK** 1.000 ms diagnostic |
| S-BULK G11 | **FAIL 12.345 ms** p95 per 60 Hz commit; cadence 59.44–60.00 Hz | **BLOCK** 10.000 ms diagnostic; 300 commits at 59.04–59.94 Hz |
| S-BULK G13 | pass: every commit 2,000 rect/pair + 300 computed + 300 poses; steady 0 | pass: 2,000 + 600 computed (incl. Typed OM) + 300 poses; steady 0 |
| S-BULK G12 | pending P4 | pending P4 |

Chromium S-BULK is `valid:true`, `status:pending` because G12 is P4; the
measured G9/G11 failures are printed as FAIL and are certification reasons.
WebKit S-BULK is `valid:false`, `status:blocked`: G9/G10/G11 are `BLOCK` and
non-deciding. No quantized ratio is presented as a measured failure.

### Certification reasons (iteration 2)

- cost fingerprint advisory (load 2.39);
- pending S-REORDER, S-SHEET, S-BULK G12 (P4);
- Chromium S-BULK pending G12 and measured
  `G9-unscrolled 3.252`, `G9-scrolled 3.284`, `G11 12.345` failures;
- WebKit S-BULK blocked and not valid (1 ms timer).

No threshold was changed.

### Required-work floor (iteration 2)

A-19 fixture: 850 tiles + 150 nested labels = 1,000 participants; first 150
tiles + their 150 labels = 300 movers. Unscrolled 32×27; scrolled 16×54 at
`scrollTop=1080`. Same process, 5 discarded + 30 measured, reset to rest
between samples.

| Count | Engine | Floor |
|---|---:|---:|
| capture rects / offset pairs | 2,000 / 2,000 | 1,000 / 1,000 |
| flush rects / offset pairs | 1,000 / 1,000 | 1,000 / 1,000 |
| §4.3 step 2 computed reads | 300 Chromium; 600 WebKit incl. Typed OM | 300 / 600 |
| t=0 poses (`translate` + `scale`) | 300 | 300 |
| extra reads | 0 | 0 |

The floor audit passes both shapes in both engines; `floor-extra-read` fails it
in both. Chromium engine/floor medians: unscrolled 8.715–10.707 / 2.840–2.910 ms;
scrolled 9.313–10.462 / 2.825–2.890 ms. WebKit values are diagnostic at 1 ms.

### Re-review fixes N1–N10

| ID | Fix | Test/evidence |
|---|---|---|
| N1 | `CertificationInput` now consumes `controlsPass` and `selfTestPass`; reasons name a control/self-test failure. `controlsPass` requires `--check`, at least one control and every conclusive control `ok`; inconclusive controls do not decide. | `certification.test` control/self-test failure tests; full `--check` run passes 16/16 browser controls and 73 self-tests. |
| N2 | Aggregation sets `nonFinite` for any non-finite run, returns `median: NaN`, `blocked:true`, `pass:false`; non-deciding findings do not contaminate scene pass. | `aggregate.test` one-finite/four-null and deciding-NaN tests; WebKit S-CARD `G9.probe` per-run `[1,null,1,1.5,null]` aggregates to `median:null, blocked:true, pass:false` and prints `BLOCK n/a`. |
| N3 | `cost_validity.ts` requires `g ≤ 0.05`, exactly 300 commits and cadence 58.5–61.5 Hz; reasons are carried into `valid`/blocked. A cadence miss invalidates the cost run; G11 also fails its own gate. | `cost_validity.test` 42 Hz, boundary (58.5/61.5), coarse timer and 299-commit tests. Chromium cadence 59.44–60.00 Hz; WebKit 59.04–59.94 Hz (timer-blocked). |
| N4 | `CertificationCost.failedMetrics` carries measured deciding failures; certification reasons name each. | `certification.test` G9/G11 reasons; final report lists Chromium G9 3.252/3.284 and G11 12.345. |
| N5 | C1 requires a mount snapshot for every required key and consumes `requiredOpacityKeys`/`requiredRadiiKeys`/`requiredFontKeys`; G6, G7, G13 declare `measured`; G6 checks the full inline cssText except scene-owned author keys and checks removed participants at their last connected frame. | `scoring.test` no-mount (C1/G6 fail, G6 measured false), unowned cssText, declared opacity/radii/font tests. |
| N6 | Scene G13 uses an exact per-engine `stylesExpected`, not a range; each commit's accepted counts are in the G13 detail. | S-CARD open 8/15, close 8/15, reverse 9/16; S-SEG 2/3 per tap; `scoring.test` extra style read fails. |
| N7 | `evaluateInvocation` defines invocation-scoped `pass`; `evaluateCertification` is the full gate including controls/self-tests/pending/advisory. | `certification.test` clean invocation PASS, selected scene/cost failure FAIL, global P4 pending leaves invocation PASS but certification NOT CERTIFIED. |
| N8 | `selfTests()` runs all seven `test:bench-layout` files and reports `files`; certification consumes `tests.pass`. | Full run: `self-tests ok: 14 controls across 7 files`; 73/73 tests. |
| N9 | Cost status is derived from `heldPending` via `costOutcome`: pending only while G12 is actually pending; post-P4 `valid && !heldPending && metricsPass` is `pass`; invalid is blocked; measured failure is fail. | `cost_validity.test` pending, post-P4 pass, post-P4 fail, invalid-blocked. |
| N10 | Non-deciding metrics print `n/a` (or `BLOCK` when non-finite), never `ok`; `G9.probe` is `deciding:false`. | Full report: Chromium `G9.probe` prints `n/a`; WebKit mixed/all-null prints `BLOCK n/a`. |

### S3 polish

- README/ITERATIONS numbers, load, probe table and certification reasons are
  from this run, not iteration 1.
- `requiredOpacityKeys`, `requiredRadiiKeys` and `requiredFontKeys` are enforced
  and unit-tested.
- G6 full cssText and removed-participant checks are enforced; scene-owned
  inline changes are declared in `authorStyleKeys` (`card`, `sheet`,
  `sheet-image`, `sheet-title`, `sheet-content`, `pill`).
- Scene G13 exact counts are recorded in every run detail.
- `selfTests` runs all seven files; 73 tests.
- `test:bench-layout` remains outside `test:ci` while P5a is scaffolding; the
  harness self-tests are mandatory in every `--check` run. This is documented
  as a P5b decision.
- Biome: `pnpm check` exits 0 with 10 warnings and 7,489 infos (repo-wide);
  no errors and no bench lint suppression. The README states the exact output.

### Negative controls

- Unit self-tests: 73/73 pass, including C1 blank/partial/no-mount, stats,
  frame sampler, per-run aggregation/NaN, certification invocation vs
  certification, cost cadence/status, aged G2, priority, style over-read,
  teardown/pill-radius and G3 observed jump.
- Browser controls (both engines, 8 each): `card-no-image-id` G1 fail;
  `card-no-inert` shape.inert fail (conclusive on P3 final); `card-image-offset`
  G1 fail; `card-focus-follower` shape.focus fail; `seg-rest-retarget` G1 fail;
  `seg-jump-from-A` G2 fail; `seg-leftover-pose` G6 fail; `floor-extra-read`
  floor audit fail.
- `--check` exits 1 on the real cost misses; every control behaved as required.

### Residual risks / next

- P4 must land for S-REORDER, S-SHEET and S-BULK G12; until then certification
  cannot be claimed. The post-P4 all-green path is unit-tested.
- WebKit G9/G10/G11 cannot decide on a 1 ms timer. A finer/batched protocol
  must be proven or the checkpoint remains BLOCK.
- Chromium G9 (3.252×/3.284×) and G11 (12.345 ms) are genuine measured failures
  under the corrected floor and commit timing; cost is advisory at load 2.39.
- WebKit G8 is quantized ±0.5 ms; its passes are not sub-millisecond claims.
- G3's actual-continuity evidence is the observed finite difference; the
  analytic pair remains the gate per A-11.
- S-PHOTO, DPR sweeps and reduced-motion variants remain P5b.

## Iteration 3 — H15 P5b: the §11.6 P2/P3 scene set (iteration 1 of P5b)

- Worktree: `ani-h15`, branch `helper/h15`, base `7ed9974` (P3 final + H14
  harness). No production source, `tests/browser` or `ARCHITECTURE.md` change.
- Date: 2026-10-29.
- Command:
  `node bench/layout/run.ts --runs 5 --engine chromium --engine webkit --check --out bench/layout/iteration-3/report.json`
- Report: `bench/layout/iteration-3/report.json`; raw log:
  `bench/layout/iteration-3/run.log`.
- Instrument: MacBook Pro `Mac14,9`, Apple M2 Pro (10 cores), 32 GB,
  macOS 27.0.1 / Darwin 27.0.0, Node 24.19.0, pnpm 10.20.0, Playwright
  1.55.0, `chromium_headless_shell-1187`, `webkit-2203`.
- 1-minute load at start: **2.80**, so the cost result is **advisory**; the
  frame gates still decide. WebKit remains unisolated under Playwright,
  `g = 1 ms`.
- Self-tests at run time: **73/73** across 7 files. Two oracle tests were added
  after this run for the from-rest timing `k = 0` rule (75/75 on re-run; see
  "Harness additions").
- Browser controls: **14 per engine, 28 total**, all conclusive and failing
  their target.
- Every scene ran S-CARD/S-SEG first, then S-PHOTO, S-STACK, S-ISLAND, S-ACC,
  S-INSERT, S-DELETE, then the S-BULK cost shapes.

### Scene and metric table (5 measured runs; median and worst)

| Scene | Gate | Chromium | WebKit |
|---|---|---|---|
| S-CARD | C1/G1–G8/G13/shape | **pass**; G1 0.0013 px (frame 102 card-title left), G2 0.0012, G4 0.0013, G8 0.195 ms | **pass**; G1 0.0004 px (frame 73 sheet-content bottom), G2 0.0001, G4 0.0003, G8 1.000 ms quantized |
| S-SEG | C1/G1–G8/G13/shape | **pass**; G1 0.0001 px (frame 17 pill right), G3 analytic 0 on 3 retargets, G8 0.260 ms | **pass**; G1 0.0000, G8 1.000 ms |
| S-PHOTO | C1/G1–G8/G13/shape | **FAIL G1 306.2501, G2 306.2501, G4 306.2501** (frame 81 cell-37-image top; 40,635 participant-frames), **G7 4** (open `snapped [detail-image:stale] != []`) | **FAIL G1/G2/G4 306.2501** (frame 33 cell-37-image top; 26,187), **G7 5** (open status `stale != ended`) |
| S-STACK | C1/G1–G8/G13/shape | **pass**; G1 0.0003 px (frame 73 badge-1 top), G2 0.0001, G4 0.0003, presence opacity 0.0000, G8 0.250 ms | **pass**; G1 0.0002 (frame 73 card-1 bottom), G8 1.000 ms |
| S-ISLAND | C1/G1–G8/G13/shape | **FAIL G6 1** only: `card-content` last connected frame 65 leaves `translate`/`scale` (the counter-projection); G1 0.0006, G2 0.0006, G7/G13/shape pass | **FAIL G6 1** only: same; G1 0.0006, G8 1.000 ms |
| S-ACC | C1/G1–G8/G13/shape | **FAIL G1 120.0000, G4 120.0000** (frame 12 body-6 bottom; 2,752/2,079 participant-frames), **G2 55.6732** (frame 18 body-6 c3); G3/G5/G6/G7/G13/shape pass | **FAIL G1/G4 120.0001, G2 55.6732** (same body-6); G3/G5/G6/G7/G13/shape pass |
| S-INSERT | C1/G1–G8/G13/shape | **FAIL G7 2** only: `snapped [] != [new-0:culled,new-1:culled,new-2:culled]`; G1 0.0001 (frame 14 row-10 bottom), G2 0.0000, G4 0.0001, presence opacity 0.0000, G8 0.320 ms | **FAIL G7 2** only: same; G1 0.0001, G8 1.000 ms |
| S-DELETE | C1/G1–G8/G13/shape | **pass**; G1 0.0251 px (frame 19 row-5 top), G2 0.0000, G3 analytic 0 at the row 6–8 retarget, G5 0.0000, G6 0, G13 0, G8 0.275 ms | **pass**; G1 0.0095 (frame 19 row-5 top), G2 0.0000, G8 1.000 ms |

`G9.probe` is non-deciding; WebKit reports `BLOCK`/n-a because its 1 ms timer
cannot decide a ratio, and no quantized ratio is presented as a failure.

### Failure 1 — S-PHOTO nested image handoff (both engines)

- Metrics: G1 306.2501 px, G2 306.2501 px, G4 306.2501 px, all on
  `cell-37-image` (Chromium worst frame 81 top, 40,635 participant-frames;
  WebKit worst frame 33 top, 26,187). G7: Chromium 4 (`open:
  snapped [detail-image:stale]`), WebKit 5 (open status `stale`).
- The detail frame takes its handoff correctly; the nested image snaps to its
  A box (306.25 px = the F1/I1 delta). The open and back are symmetric.
- Root-cause hypothesis: the engine's late-handoff guard
  (`lateWithHandoff` in `scope.ts`) requires the new lead's participant parent
  to be measured in the same plan. The new detail image's parent (the new
  detail frame) is itself a late-registered lead and is still `unmeasured` at
  the image's lead-change evaluation, so the image's handoff is skipped even
  though the departing cell image is a live, measured node. The image then
  falls through to the §4.4 stale path. WebKit's run status is `stale`;
  Chromium's is `ended` with the same snapped stale image — a status
  precedence difference between engines for the same trace.
- Action: engine fix (nested late leads), then rerun; the scene is not
  changed to avoid the handoff. No tolerance changed.

### Failure 2 — S-ACC body-6 under the mid-flight row expansion (both engines)

- Metrics: G1/G4 120.0000 px (Chromium) / 120.0001 (WebKit), worst frame 12
  `body-6` bottom, 2,752 (G1) and 2,079 (G4) participant-frames; G2 55.6732 px
  at frame 18 (row 2 collapse, `c3`).
- At frame 12 (row 6 expands while rows 7–10 are still moving) the
  position-pinned body-6 is drawn with `h = 34.2857 = 120 x 48/168` and
  `y = row visual top + 48 x 48/168` — its layout box under the row's new
  height pose, without the §5.5 counter-projection. The rest of the 43
  participants are exact (G1 0 on the other frames; G3 analytic 0 at the
  retarget).
- Root-cause hypothesis: the body's own track was kept from c1; the parent
  row's height retarget changes the parent pose at the same flush. The
  child's A/pose re-expression appears to use the new parent pose without the
  child's inverse projection for a kept/position child (the row-6 body is the
  only participant in this state; the expanding row's own header/body and the
  sibling headers/bodies are exact). This is the scene's intended
  nested-position-under-a-size-retarget case.
- Action: engine fix; no scene/tolerance change.

### Failure 3 — S-INSERT culled report (both engines)

- Metric: G7 2 (`snapped [] != [new-0:culled,new-1:culled,new-2:culled]`).
  G1/G2/G4/G13 and `shape.presence-opacity` are exact.
- The three new rows are above the viewport at A = -857/-779/-701 and are
  presence-entered. The engine reports no `snapped` entries because a node
  that mounts with presence has no B and no running track, so the plan's
  cull branch (which is reached only after a track action) is never entered.
  A-14's strict reading expects the three `culled` entries.
- Action: engine fix (report a culled mount without a track); the scene keeps
  the spec's expected snapped set and fails until it lands.

### Failure 4 — S-ISLAND nested content removed with the exiting follower

- Metric: G6 1, `card-content` last connected frame 65:
  `translate`/`scale` (with priority) are non-empty. The card content is a
  depth-1 participant under the exiting card; the card is the crossfade
  follower. At frame 65 the parent's follower pose is still moving, so the
  counter-projection is non-identity; the card is removed at the crossfade end
  and the removal restores the declarations, but the harness checks the last
  connected frame.
- Root-cause hypothesis: a harness/scene edge, not a geometry miss. The G6
  removed-participant rule exempts the follower itself (and checks its
  `inert`) but not a descendant removed with it. G1–G5/G7/G13 and every shape
  assertion pass exactly.
- Action: keep the failure recorded; do not weaken G6. A later P5c decision
  may scope the removed-participant check to a participant removed with a
  follower (the same removal proof), but that is a gate-scope decision, not
  this scene's fix.

### Non-failures worth recording

- S-CARD and S-SEG still pass after the H14-25 visual corrections (close X,
  content fade p ≥ 0.5 / 0.15 s EASE_OUT, reused decoded card image, safe
  areas, S-SEG label geometry).
- S-STACK is exact (G1 0.0003, G2 0.0001, G4 0.0003, presence opacity
  0.0000, G13 21/33 and 12/24, G8 0.250/1.000).
- S-DELETE is exact (G1 0.0251, G2 0.0000, G3 analytic 0, G6 0, G13 0,
  raw G8 0.275/1.000). The per-run invocation lines report some G8 runs as
  FAIL under load; the 5-run aggregate passes (median and 3-of-5).
- S-INSERT is exact except the culled report; its 3 presence timing tracks
  match the 0.30 s EASE_OUT curve to 4.3e-7.
- All scenes' G8 frame costs are far below 2 ms in Chromium (0.195–0.525 ms)
  and quantized 1–2 ms in WebKit; no long frame after a commit in any scene.
- The G13 exact per-engine sets are: S-CARD 8/15, 8/15, 9/16; S-SEG 2/3 per
  tap; S-PHOTO open 2/2 Chromium and 0/0 WebKit, back 2/2 and 4/4; S-STACK
  21/33 and 12/24; S-ACC 47/82 per commit; S-INSERT 16/29; S-ISLAND 5/9 and
  6/10; S-DELETE 0/6 (layout reads; the raw React popLayout audit is 22/8
  and its 4 rects + 8 styles are excluded as presence plumbing).

### Negative controls (both engines)

- 14 controls per engine, 28 total; all conclusive and failing their target:
  `card-no-image-id` G1, `card-no-inert` shape.inert, `card-image-offset` G1,
  `card-focus-follower` shape.focus, `seg-rest-retarget` G1,
  `seg-jump-from-A` G2, `seg-leftover-pose` G6,
  `photo-no-counter-scale` G1, `acc-separator-1px` G1,
  `stack-badge-nonparticipant` G1, `island-snap-reverse` G2,
  `insert-no-presence` shape.presence-opacity, `delete-no-lift` G1,
  `floor-extra-read` G9.floor.
- Unit self-tests: 73/73 at run time (75/75 after the two added timing
  tests), including the new from-rest timing `k = 0` and moving-retarget
  velocity tests.

### Harness additions / corrections (no tolerance changed)

- `oracle.ts`: a from-rest timing track is the exact curve (`k = 0`); only a
  moving retarget carries the analytic velocity bump. This is the §1.6
  sentence, not a change to a gate.
- `SegmentPlan.authoredTranslate` (the S-DELETE swipe), `startMoving`
  (author/presence timelines), `toFromB` (presence exit relative to B),
  `presenceExit` (out of G3) and `ScenePlan.presenceOpacity` /
  `shape.presence-opacity` (declared author opacity curves) were added.
- React scenes use a DOM read audit for G13 (the public adapter has no
  `group.stats`); the audit counts rects, offset pairs, computed styles and
  Typed OM during commits/frames only. S-DELETE declares the popLayout
  `popBox` reads as non-layout and excludes them (raw 22/8, engine 18/6 per
  the layout set).
- The S-INSERT scroller sets `overflow-anchor: none` to isolate the §12
  uncompensated-shift shape; the offset is asserted unchanged at 1000.
- The S-DELETE swipe uses an authored `left` offset (not a transform) so the
  popLayout lift starts at the presented box; the lift is pinned and the row
  is detached from layout before the engine flush.

### Cost (S-BULK, §11.5) — unchanged by H15

- Chromium: `valid: true`, `status: pending` (G12 P4); measured
  **G9-unscrolled 3.232x**, **G9-scrolled 3.242x**, **G11 11.860 ms** p95;
  G10 0.700 ms pass; G13 exact; floor audit pass both shapes.
- WebKit: `valid: false`, **BLOCK** (`g = 1 ms`; G9/G10/G11 non-deciding);
  no quantized ratio presented as a measured failure.
- Cost fingerprint advisory (load 2.80). S-REORDER/S-SHEET/S-BULK G12 remain
  pending P4. No threshold changed.

### Residual risks / next

- The four failures above are engine/harness evidence; H15 does not fix the
  engine.
- DPR 1/3 sweeps and the reduced-motion variants (`'jump'`,
  `{maxDuration: 0.2}`) remain P5c; the DPR 2 primary run is this report.
- S-DELETE's per-run G8 swings under load; the 5-run aggregate decides.
- The React G13 audit is a DOM read count because the public adapter exposes
  no `group.stats`; it is exact after the documented S-DELETE exclusion.
- The S-ISLAND G6 edge needs a gate-scope decision, not a scene workaround.

## Iteration 4 — H15 fix round: trustworthy P5b evidence

- Worktree: `ani-h15`, branch `helper/h15`, base `ad060d4` (review-blocked
  P5b evidence); no reset/fetch/push.
- Date: 2026-10-29.
- Command:
  `node bench/layout/run.ts --runs 5 --engine chromium --engine webkit --check --out bench/layout/iteration-4/report.json`
- Report: `bench/layout/iteration-4/report.json`; log:
  `bench/layout/iteration-4/run.log`.
- Instrument: MacBook Pro `Mac14,9`, Apple M2 Pro (10 cores), 32 GB,
  macOS 27.0.1, Node 24.19.0, pnpm 10.20.0, Playwright 1.55.0,
  `chromium_headless_shell-1187`, `webkit-2203`.
- 1-minute load at start: **4.85**, cost **advisory**; frame gates decide.
- Self-tests: **14 controls across 7 files pass** (75/75 tests on the
  standalone `pnpm test:bench-layout`).
- Browser controls: **25 per engine / 50 total, all ok; 46 conclusive, 4
  inconclusive** (`photo-no-counter-scale` and `acc-separator-1px` on each
  engine, because the primary S-PHOTO/S-ACC G1 already fails; they are not
  counted as evidence).

### H15 fix ledger

| ID | Fix | Test / result |
|---|---|---|
| H15-01 | `aggregateSceneReport` adds a deciding `RUN` metric and fails the scene if **any** measured run fails (problems, real twin, teardown, G8 or a metric); the `RUN` detail names the failing metric/participant/frame and problems. | `aggregate.test` H15-01 metric-clean/problem-carrying test; S-DELETE per-run now passes; `RUN=0` for every passing scene; `RUN=5` for S-PHOTO/S-ACC; the full report is fail, not a false pass. |
| H15-02 | `REQUIRED_SCENES` includes every P5b scene plus cost; certification reasons name every non-pass required scene. | `certification.test` P5b-failure case; report `requiredScenes` lists all nine; reasons include `chromium/webkit scene s-photo fail` and `s-acc fail`. |
| H15-03 | React `record` populates `elements` before the builder check; `realTwinProblems` checks diagnostics, connected, tracks and holds; a unit test covers the teardown. | S-ACC real connected 43, S-INSERT 16, S-DELETE 7, S-PHOTO 301; `aggregate.test` H15-03 real-twin teardown test; no run carries the old `real twin has no connected participants`. |
| H15-04 | S-DELETE swipe is authored `translateX(0→−80)`; the exiting row keeps its registration, changes `layoutKey` to end the layout track, is pinned to its presented box (measured in the exiting render), the own transform is divided out by `popLayout` (J-027), and the presence translateX starts at 0. Opacity is an author `1→0` 0.2 s linear timeline. | S-DELETE G2 0.0095 px at `delete-2`; G1 0.0095; `delete-2` rects 18/18; ITERATIONS records the 0.2 s opacity (not 0.25). |
| H15-05 | G13 asserts exact `2N` rects and pairs (not `<=`), exact computed reads, zero frame reads; S-DELETE `delete-2` is 18/18 (not 16); the blanket `{rects:4, styles:8}` exclusion is removed. React `popBox`/`containsAbsolute`/`ownMap` reads are classified by call stack and recorded as `presenceRects`/`presenceStyles`; the gate uses the layout subset. | S-DELETE Chromium 18/18 rects, 4/4 and 3/3 computed; WebKit 10/8; the G13 extra-read controls fail; the report shows the excluded presence reads (2/2 per commit). |
| H15-06 | Controls are conclusive only when the primary passes the target (the contaminated photo/acc G1 controls are reported inconclusive); isolated G6, G13 and badge-scale controls were added for every new scene. | 50 controls, 46 conclusive, all conclusive fail their target; `photo-leftover-pose`, `photo-extra-read`, `acc-leftover-pose`, `acc-extra-read`, `insert-leftover-pose`, `insert-extra-read`, `stack-extra-read`, `stack-leftover-pose`, `stack-no-badge-scale`, `island-extra-read`, `delete-extra-read` all fail. |
| H15-07 | `ScenePlan.removedWith` and `removedWithFollower` exempt a descendant removed with a crossfade follower; S-ISLAND declares `card-content → card`. | `scoring.test` H15-07 descendant-exemption test; S-ISLAND G6 0 and the scene passes in both engines (was the only failure). |
| H15-08 | S-INSERT expects `snapped []` / `onSnap []`: a mounting row has no B and §9.1 requires both B and A outside the viewport. The earlier three-`culled` expectation was scene/oracle overreach, not an engine defect. | S-INSERT G7 0; the scene passes both engines; G1/G2/G4/G13 unchanged. |
| H15-09 | S-STACK disc scale is checked by `shape.badge-scale` (computed transform sampled per frame, declared 0.8→1 / 1→0.8 timeline); the control disables it. | `shape.badge-scale` 4.9e-7; `stack-no-badge-scale` fails at 0.2; S-STACK passes. |
| H15-10 | S-ISLAND's exiting card content keeps the 0.28 s spring (spec `position` departure) and is documented/tested as the H15-10 contribution; the pill content remains a position wrapper. | README scene contributions and this ledger; S-ISLAND G1–G5/G7/G13 pass; the H15-07 rule covers the removal. |
| H15-11 | S-PHOTO registers the selected cell/image (the only layoutIds) after the initial scroll, so the scroll event never meets the engine's active-scroller listeners; WebKit 2203 has no `scrollend`, so the settle proof is the scroll event plus two frames, and an unsettled scroll rejects instead of silently continuing. N15-02 makes the real `openReal()`/`backReal()` mirror the manual unregister/add path, set `data-p`/`elements` and insert the returned cell at the selected index. | S-PHOTO runs in WebKit; the manual and real diagnostics are exactly the same two H18 nested-image stale events (2/2), not three; no `handoff-scroll-active`; G13 2/4 and 4/4 exact. |
| S3 | Inline SVG icons with `currentColor` in S-ACC/S-PHOTO/S-ISLAND; S-ACC spacer arithmetic now uses a relative group top (scroller content 773); README/report G13 and popBox claims corrected; 6 biome warnings removed. | `pnpm exec biome check bench/layout` 0 errors, 0 warnings; S-ACC spacer geometry unchanged for participants; icons are non-participants. |

### Scene and metric table (5 measured runs; median and worst)

| Scene | Gate | Chromium | WebKit |
|---|---|---|---|
| S-CARD | C1/G1–G8/G13/shape | **pass**; G1 0.0013 (frame 102 card-title left), G2 0.0012, G4 0.0013, G13 8/15, 8/15, 9/16, G8 0.320 ms | **pass**; G1 0.0004 (frame 73 sheet-content bottom), G13 15/15, 16/16, G8 1.000 ms |
| S-SEG | C1/G1–G8/G13/shape | **pass**; G1 0.0001 (frame 17 pill right), G13 2/2, G8 0.280 ms | **pass**; G1 0.0000, G13 3/3, G8 1.000 ms |
| S-PHOTO | C1/G1–G8/G13/shape | **FAIL** RUN 5, G1 306.2501, G2 306.2501, G4 306.2501 (frame 81 cell-37-image top), G7 4 (open `snapped [detail-image:stale]`); G13 2/2; G8 0.255 ms | **FAIL** RUN 5, G1/G2/G4 306.2501 (frame 81 cell-37-image top), G7 4; G13 4/4; G8 1.000 ms |
| S-STACK | C1/G1–G8/G13/shape | **pass**; G1 0.0003 (frame 73 badge-1 top), G13 21/33 and 12/24, badge-scale 0, G8 0.415 ms | **pass**; G1 0.0002, G13 33/33 and 24/24, G8 1.000 ms |
| S-ISLAND | C1/G1–G8/G13/shape | **pass**; G1 0.0006 (frame 17 card-content right), G2 0.0006, G13 5/9 and 6/10, G8 0.420 ms | **pass**; G1 0.0003, G2 0.0001, G13 9/9 and 10/10, G8 1.000 ms |
| S-ACC | C1/G1–G8/G13/shape | **FAIL** RUN 5, G1 120.0000, G4 120.0000 (frame 12 body-6 bottom), G2 55.6732 (frame 18 body-6 c3); G13 47/47; G8 0.525 ms | **FAIL** RUN 5, G1/G4 120.0001, G2 55.6732; G13 82/82; G8 1.000–2.000 ms |
| S-INSERT | C1/G1–G8/G13/shape | **pass**; G1 0.0001 (frame 14 row-10 bottom), G2 0, G4 0.0001, G7 0, G13 16/16, G8 0.600 ms | **pass**; G1 0.0001 (frame 14 row-21 bottom), G13 29/29, G8 2.000 ms median (per-run 1/2/2/2/1) |
| S-DELETE | C1/G1–G8/G13/shape | **pass**; G1 0.0095 (frame 18 row-5 top), G2 0.0095, G3 0, G6 0, G7 0, G13 18/18 with 4/4 and 3/3, G8 0.465 ms | **pass**; G1 0.0095, G2 0.0095, G13 18/18 with 10/8, G8 1.000 ms |

### Four failures — final classification

- **S-PHOTO 306.25 px**: genuine engine late nested handoff defect (H18
  evidence). The detail frame hands off; the nested detail image is skipped by
  the late-handoff guard and snaps to A. Keep failing; do not fix in H15.
- **S-ACC 120/55.67 px**: genuine engine counter-projection defect (H18
  evidence). `body-6` is drawn as its layout box under the row's new height
  pose at the mid-flight row 6 expansion. Keep failing; do not fix in H15.
- **S-INSERT `snapped []`**: scene/oracle overreach, not engine. Fixed to the
  correct `[]`; S-INSERT passes.
- **S-ISLAND G6**: harness false positive. Fixed by the H15-07 descendant
  exemption; S-ISLAND passes.

### Certification and controls (iteration 4)

- `certified: false`; reasons: advisory cost, pending S-REORDER/S-SHEET/
  S-BULK G12 (P4), Chromium/WebKit S-PHOTO fail, Chromium/WebKit S-ACC fail,
  Chromium S-BULK G9 3.321/3.353 and G11 11.665, WebKit S-BULK blocked/invalid.
- `requiredScenes` now includes every P5b scene and `cost`.
- 50 controls (25 per engine), all `ok`; 46 conclusive and all fail; 4
  inconclusive are the contaminated photo/acc G1 controls. The full control
  output is in the report.
- Cost unchanged: Chromium G9 3.321/3.353×, G11 11.665 ms, G10 1.080 ms,
  floor audit pass; WebKit blocked by the 1 ms timer. Load 4.85 → advisory.

### Residual risks / next

- S-PHOTO and S-ACC are the two H18 engine defects; H15 does not edit the
  engine.
- WebKit 2203 has no `scrollend`; S-PHOTO's settle proof is the scroll event
  plus two frames with the selected layoutIds registered only after the
  scroll. The engine's active-scroller rule is not exercised on WebKit's
  missing event; the scene does not hide a scroll-active handoff (an unsettled
  scroll rejects).
- The S-PHOTO real twin used to assert exactly the two `capture-less-flush`
  stale diagnostics of the old H18 defect (`s_photo.ts:980-991`). That
  assertion was removed in the H18 rebase-prep commit: the real twin returns
  the actual diagnostics and `realTwinProblems` fails any diagnostic. On the
  pre-H18 branch the two events are still recorded and the scene fails
  honestly; on the H18 base the expected result is **zero stale diagnostics**
  and G1/G2/G4 ~0.0002 px. Rebase onto H18 before the final rerun.
- The exact G13 read sets are pinned per scene/commit from the audited
  §4.1/§4.3 set; the React presence probe reads are classified per commit, not
  subtracted by a constant. The style totals remain scene/engine constants
  because the engine's measured-node set (support/cache/Typed OM) is
  implementation-specific; the rect/pair counts are exact `2N`.
- DPR 1/3 and reduced-motion variants remain P5c; P4 remains pending.

## Iteration 5 — N15 fixes: N15-01/N15-02 and S3

- Worktree: `ani-h15`, branch `helper/h15`, base `ba20a0f`; no reset/fetch/push.
- Date: 2026-10-29.
- Command:
  `node bench/layout/run.ts --runs 5 --engine chromium --engine webkit --check --out bench/layout/iteration-5/report.json`
- Report: `bench/layout/iteration-5/report.json`; log:
  `bench/layout/iteration-5/run.log`.
- 1-minute load at start: **2.66**, cost advisory; frame gates decide.
- Self-tests: **80/80**; browser controls **50 (25 per engine), all ok,
  46 conclusive, 4 inconclusive** (the same primary-G1-failing photo/acc
  controls).
- Scene result: S-CARD, S-SEG, S-STACK, S-ISLAND, S-INSERT and S-DELETE pass
  in Chromium and WebKit; S-PHOTO and S-ACC fail on the H18 engine defects.
  Certification is NOT CERTIFIED for those two, pending P4 and the unchanged
  S-BULK cost block.

### N15-01 — S-ISLAND post-removal restoration proof

- Failing before: the H15-07 exemption skipped G6 for `card-content` and only
  mapped it to the follower; there was no evidence that the engine removed the
  owned `translate`/`scale`.
- Fix: `PhotoRuntime` — no; **S-ISLAND** takes a before snapshot from the last
  connected observation (frame 65) and an after snapshot immediately after the
  engine `remove()` in `removeExitedCard()`, records them on the trace
  (`restorations`), and the S-ISLAND plan requires
  `requiredRestorations: ['card-content']`. `restorationMismatches()` checks
  the after snapshot against the mount (owned declarations + author cssText
  rule); a missing snapshot or a leftover declaration fails G6.
- Evidence: before `translate: 5.8e-05px !important; scale: 0.998141
  0.996705 !important` at frame 65; after `translate`/`scale` empty. G6 0 in
  every measured run, detail `1 post-removal restoration snapshot(s)`.
- Test: `scoring.test` N15-01 (after matches -> pass; leftover -> fail; missing
  required restoration -> fail; author cssText accepted). 80/80.

### N15-02 — S-PHOTO real-twin fidelity

- Failing before: `openReal()` did not unregister the cell/image or insert the
  placeholder; `backReal()` appended the new cell instead of inserting it at
  the selected index, did not set the image's `data-p`, and the real twin
  emitted **three** `capture-less-flush` diagnostics versus the manual's two.
- Fix: `openReal()` and `backReal()` now mirror the manual path exactly:
  unregister the selected cell/image, remove the cell, insert the placeholder;
  on back, create the cell/image with `data-p="cell-37"`/`"cell-37-image"`,
  set the `elements` entries, remove the detail registrations, and insert the
  returned cell at `ROW * 3 + COL` before `group.add`; focus and detail
  visibility match. The real twin asserts that its diagnostics are exactly the
  two H18 stale events (`capture-less-flush` open image + back image); the
  diagnostics remain in `RealTrace.diagnostics` and are reported as problems,
  not hidden.
- Evidence: real `final.connected = 301`; diagnostics exactly 2/2, same as the
  manual; no extra; G13 2/4 (Chromium) and 4/4 (WebKit) still exact. S-PHOTO
  still fails G1 306.25 / G2 306.25 / G4 306.25 / G7 4 as H18 evidence.

### S3 quick fixes

- README S-ACC movers: `33/17/33` (c1/c2/c3), not `33/17/35`.
- Removed the duplicate `delete-no-lift` guard and the dead `excludeReads`
  option.
- S-ISLAND exiting-content text-crispness assertion documented in README and
  here: the incoming pill content and the expanded card content are
  position-pinned at the authored glyph size; the exiting card content is a
  0.28 s size-tracking layer whose declared opacity fades to 0 over 0.12 s
  (`shape.presence-opacity`), with the G1 box track as the geometry assertion;
  the departing text is not presented after the fade. The position-wrapper
  attempt was rejected because the engine does not counter-project the
  position child under the follower (G1 121 px), so the documented H15-10
  contribution remains.
- S-PHOTO private-use glyphs were replaced with inline SVG/currentColor in
  iteration 4 (toolbar); S-ACC icons are inline SVG/currentColor; the S3 claim
  is corrected.
- README/report G13 and popBox numbers corrected: S-DELETE 18/18 rects;
  Chromium 4/4 and 3/3; WebKit 10/10 and 8/8; presence reads 2/2 per commit;
  no blanket exclusion.

### Scene and metric table (5 measured runs; medians and worst)

| Scene | Chromium | WebKit |
|---|---|---|
| S-CARD | **pass**; G1 0.0013, G13 8/15, 8/15, 9/16, G8 0.320 ms | **pass**; G1 0.0004, G13 15/15, 16/16, G8 1.000 ms |
| S-SEG | **pass**; G1 0.0001, G13 2/2, G8 0.280 ms | **pass**; G1 0.0000, G13 3/3, G8 1.000 ms |
| S-PHOTO | **FAIL** RUN 5, G1/G2/G4 306.2501 (frame 81 cell-37-image top), G7 4; G13 2/2; G8 0.255 ms | **FAIL** RUN 5, G1/G2/G4 306.2501, G7 4; G13 4/4; G8 1.000 ms |
| S-STACK | **pass**; G1 0.0003, G13 21/33 and 12/24, badge-scale 0, G8 0.415 ms | **pass**; G1 0.0002, G13 33/33 and 24/24, G8 1.000 ms |
| S-ISLAND | **pass**; G1 0.0006, G2 0.0006, G6 0 with 1 restoration snapshot, G13 5/9 and 6/10, G8 0.420 ms | **pass**; G1 0.0003, G2 0.0001, G6 0 with 1 snapshot, G13 9/9 and 10/10, G8 1.000 ms |
| S-ACC | **FAIL** RUN 5, G1/G4 120.0000 (frame 12 body-6 bottom), G2 55.6732 (frame 18 body-6 c3); G13 47/47; G8 0.525 ms | **FAIL** RUN 5, G1/G4 120.0001, G2 55.6732; G13 82/82; G8 1.000–2.000 ms |
| S-INSERT | **pass**; G1 0.0001, G2 0, G4 0.0001, G7 0, G13 16/16, G8 0.600 ms | **pass**; G1 0.0001, G13 29/29, G8 2.000 ms median |
| S-DELETE | **pass**; G1 0.0095, G2 0.0095, G3 0, G6 0, G7 0, G13 18/18 with 4/4 and 3/3, G8 0.465 ms | **pass**; G1 0.0095, G2 0.0095, G13 18/18 with 10/10 and 8/8, G8 1.000 ms |

### Merge verdict

**Conditionally PASS, mergeable as H15 P5b evidence.** The two N15
conditions are met: S-ISLAND G6 is backed by a before/after post-removal
restoration snapshot (and the required-restoration gate), and the S-PHOTO
real twin mirrors the manual unregister/add/registration path with exactly the
same two H18 stale diagnostics (no unexplained third). S-PHOTO and S-ACC
remain the two genuine H18 engine defects; certification remains NOT CERTIFIED
for those, pending P4 and the unchanged S-BULK cost block. No gate, tolerance,
production source or knownFailure was added.

## Iteration 6 — H16 P5c: drive scenes, held cost and the full §11.6 set

- Worktree: `ani-h16`, branch `helper/h16`, base `5e3ab8e` (P4 acting PASS +
  H14 harness + H15 P2/P3 scenes); no reset/fetch/push.
- Date: 2026-10-29.
- Command:
  `node bench/layout/run.ts --runs 5 --engine chromium --engine webkit --check --out bench/layout/iteration-6/report.json`
- Report: `bench/layout/iteration-6/report.json`; log:
  `bench/layout/iteration-6/run.log`.
- Instrument: MacBook Pro `Mac14,9`, Apple M2 Pro (10 cores), 32 GB,
  macOS 27.0.1, Node 24.19.0, pnpm 10.20.0, Playwright 1.55.0,
  `chromium_headless_shell-1187`, `webkit-2203`.
- 1-minute load at start: 2.36; cost fingerprint is **advisory** (pinned
  below 1). The frame gates still decide.
- Self-tests: **79/79 tests, 14 controls**. Browser controls: **74 (37 per
  engine), all ok; 66 conclusive, 8 inconclusive**. The inconclusive controls
  are the two contamination cases from H15 (`photo-no-counter-scale`,
  `acc-separator-1px`) and the two S-REORDER controls whose primary already
  fails G1/G13 (`reorder-no-rebase`, `reorder-extra-read`), per engine.

### What P5c adds

- **S-REORDER** (14 participants, 20 ms): take row 1 at its centre, ten 18 px
  moves, reorders at k = 2/5/9 (offsets 36/90/162), release with
  `{x: 0, y: 900}`. The reorder changes the row's A and the nested title's A;
  the held point must stay under the finger and the title must ride one `h`.
  The drive-hold kill switch (L-DRIVE-4) runs after the scored script.
- **S-SHEET** (1 participant, 16 ms): medium → large with −1200 px/s, then
  medium → dismissed with +1600 px/s; the detent is chosen by the scene's
  `projected = top + v·0.20 s` policy; the final sheet is unmounted with a
  post-removal restoration proof.
- **S-BULK** (1,000 participants, 300 movers, 16 ms): the 150-cycle shuffle on
  the manual clock, scored G1–G8/G13 at 1280×720@1.
- **G12**: the 1- and 10-held shapes on the 1,000-participant cost DOM (600
  real-clock frames each), plus a 600-frame 1-held shape on the S-REORDER and
  S-SHEET real twins. **G13-held** audits one rect per live hold per frame.
- The release is not an engine commit or report (§5.10/§7.1); the scene
  records a flush observation at the release frame but no `LayoutReport`.
  G7 therefore covers the reorder/detent commits and the spec's "release run"
  row is recorded as an API gap.

### Scene and metric table (5 measured runs; median and worst)

| Scene | Gate | Chromium | WebKit |
|---|---|---|---|
| S-REORDER | G1 oracle | **FAIL 96.0000 px** (title-1, frame 3, top) | **FAIL 96.0000 px** (title-1, frame 3) |
| S-REORDER | G2/G3 | pass 0 / 0 | pass 0 / 0 |
| S-REORDER | G4 spring | **FAIL 62.7711 px** (title-1, frame 11, top) | **FAIL 62.7711 px** |
| S-REORDER | G5/G6/G7 | pass 0 / 0 / 0 | pass 0 / 0 / 0 |
| S-REORDER | G8 | 0.585 ms pass (44 frames) | 1.000 ms pass |
| S-REORDER | G13 | **FAIL 6** (held support read; commits 28/28, 8/8) | **FAIL 6** (16/16 computed) |
| S-REORDER | G12 scene | **FAIL 0.230 ms/held** | BLOCK 1 ms (non-deciding) |
| S-REORDER | G13-held / shape.hold / kill-switch | pass 0 / 0 / 0 | pass 0 / 0 / 0 |
| S-SHEET | G1/G2/G3/G4 | pass 0.0000825 / 0 / 0 / 0.0000825 | pass 0.0000871 / 0 / 0 / 0.0000871 |
| S-SHEET | G5/G6/G7 | pass 0 / 0 (1 removal proof) / 0 | pass 0 / 0 / 0 |
| S-SHEET | G8 | 0.260 ms pass (101 frames) | 1.000 ms pass |
| S-SHEET | G13 | 0 (2/2, 1/1) | 0 (2/2, 2/2) |
| S-SHEET | G12 scene | **FAIL 0.270 ms/held** (per-run 0.105–0.365) | BLOCK 1 ms (non-deciding) |
| S-SHEET | G13-held / shape.hold | pass 0 / 0 | pass 0 / 0 |
| S-BULK | G1/G4 | pass 0.0000848 | pass 0.0000848 |
| S-BULK | G2/G3/G5/G6/G7 | pass 0 / 0 / 0 / 0 / 0 | pass 0 / 0 / 0 / 0 / 0 |
| S-BULK | G13 | pass 0 (2000/2000, 300/300) | pass 0 (2000/2000, 600/600) |
| S-BULK | G8 | 1.170 ms pass (48 frames) | 1.000 ms pass |
| S-BULK cost | G9-unscrolled / G9-scrolled | **FAIL 2.688 / 2.694** | BLOCK (raw 2.000 / 2.333) |
| S-BULK cost | G10 | pass 0.845 ms | BLOCK (raw 1.000) |
| S-BULK cost | G11 | **FAIL 8.495 ms** | BLOCK (raw 8.000) |
| S-BULK cost | G12-1 / G12-10 | **FAIL 0.360 / pass 0.057** | BLOCK (raw 1.000 / 0.100) |
| S-BULK cost | G13 / G13-held | pass 0 / 0 | pass 0 / 0 |

### Failure 1 — S-REORDER held origin shifts after a reorder (P4/H18)

At frames 3, 6 and 10 (the first move after each reorder) the held row's drawn
top is +60 px from the finger: 364 at frame 3 (expected 304), 418 at frame 6
(expected 358), 490 at frame 10 (expected 430). The next move self-corrects.
Root cause (read from the engine's §5.10 rebase): when the held read sees the
layout change, it sets `shift = drawn − last − layoutDelta`; because the
element's drawn box did not move with its layout, the layout delta is applied
as an extra camera shift. The L-DRIVE-1 browser row reorders the held element
but does not move it again afterward, so it does not cover this path.
**Engine defect; H16 does not edit the engine.**

### Failure 2 — S-REORDER nested title double-counts `h` (P4/H18)

The title is a nested position participant inside the held row. At frame 1 the
row is at 268 (exact) and the title at 296 (expected 278): the title is drawn at
`row + 10 + h` instead of `row + 10`, so the parent's pose and the title's own
inherited displacement both apply. The drift grows with the row's 60 px rebase
error and reaches the G1 worst **96 px** (title-1, frame 3) and the release
G4 **62.77 px** (title-1, frame 11). **Engine defect; not fixed here.**

### Failure 3 — S-REORDER G13 held-frame support read (P4)

The three reorder-adjacent held frames read one offset pair and one computed
style in addition to the one rect per held element. The commit reads are exact
2N/2N and the computed set is exact (4/6/8 active nodes; 0 radius capture), so
G13's 6-excess failure is the held-frame support read. The strict reading of
"held frames add exactly one rect per held element" is kept; the engine's
§4.2 support check is reported, not excused.

### Failure 4 — G12 1-held fixed frame cost (Chromium)

The cost scene's 1-held shape **fails** at 0.360 ms/held (per-run
0.110–0.460); the 10-held shape passes at 0.057 ms/held (0.0255–0.065). The
per-held slope scales correctly; the 1-held frame is dominated by the fixed
per-frame engine/harness work. S-REORDER's 600-frame 1-held scene shape is
0.230 ms/held; S-SHEET's is 0.270 ms/held (0.105–0.365 per run). The scene
shapes are deciding on Chromium; WebKit's 1 ms timer makes the ratio BLOCK.
Recorded; no gate change. This is the main P4 cost finding: the 1-held fixed
cost must come down to ≤0.1 ms.

### Status / report ambiguities

- `LayoutDriveHandle.release()` returns void and starts no `LayoutRun`: the
  engine creates a release track but no `LayoutReport`. The p5 spec's
  "release run `'ended'`" row is therefore not observable through the public
  API. The scenes record the release's `t = 0` flush observation (G2/G3/G4) and
  expect `no-change` for the detent updates; G7 does not claim a release status.
- The p5 table's S-REORDER statuses (`interrupted` at the next reorder) do not
  match §7.1/A-13 for this script. Each reorder targets a different sibling;
  the earlier sibling's track is untouched and keeps running, and the three
  runs resolve `ended` at frames 28/31/35. The plan expects `ended`; the p5
  row is the ambiguity, not a gate change.
- A reorder-adjacent held frame changes the held layout, so the engine's §4.2
  support check reads one offset pair + one computed style in addition to the
  one held rect. G13's strict reading counts 6 excess; the authority does not
  explicitly exempt the support read.

### Controls

74 browser controls (37 per engine), all ok, 66 conclusive. The new controls
are conclusive and fail their target: `reorder-kill-switch-skip` →
`shape.kill-switch` (1), `reorder-cancel-instead` → `shape.hold` (2),
`sheet-medium-detent` → G5 (298 px), `sheet-release-jump` → G2 (118 px),
`sheet-extra-read` → G13 (2), `sheet-cancel-instead` → `shape.hold` (1),
`bulk-target-offset` → G1 (1.001 px), `bulk-extra-read` → G13 (3000/2000
rects), `bulk-leftover-pose` → G6 (2), `held-extra-read` → G13-held (11
rects / 10 holds). `reorder-no-rebase` → G1 and `reorder-extra-read` → G13
are **inconclusive** because the primary S-REORDER already fails those
targets; they are reported, not counted as control evidence. The G12 unit
control is 0.11 ms/held.

### Certification and controls (iteration 6)

- `certified: false`; reasons: advisory cost, Chromium/WebKit S-PHOTO fail,
  Chromium/WebKit S-ACC fail, Chromium/WebKit S-REORDER fail, Chromium
  S-SHEET fail (G12 scene shape), Chromium S-BULK cost fail with G9
  unscrolled 2.688 / scrolled 2.694 and G11 8.495 and G12-1 0.360, WebKit
  S-BULK cost blocked/invalid (1 ms timer).
- The named G12 shapes: G12-1 0.360 fail, G12-10 0.057 pass (Chromium);
  WebKit BLOCK. G13-held 0 in both engines.
- All 11 scenes and the cost scene were selected; `pending` is empty.
- S-CARD, S-SEG, S-STACK, S-ISLAND, S-INSERT and S-DELETE pass in both
  engines; S-BULK passes the frame scene in both engines; S-SHEET passes every
  interaction/settle/restoration row and fails only the 1-held G12 scene shape
  on Chromium.

### Residual risks / next (H18 engine work, not the harness)

1. Held rebase: a `move` after a reorder applies the layout delta as an extra
   camera shift (row-1 +60 px at frames 3/6/10). L-DRIVE-1 should be extended
   to move again after the reorder; the scene is the evidence.
2. Nested held descendant: `title-1` is drawn at `row + 10 + h` instead of
   `row + 10`; the double-count is the G1 96 px / G4 62.77 px failure.
3. Held-frame support read: a reorder-adjacent held frame reads one offset
   pair + one computed style; the strict G13 reading fails with 6 excess.
4. G12 1-held fixed cost: 0.360 ms/held (cost) and 0.230–0.270 ms/held
   (scene); the 10-held slope passes. The 1-held path must reach ≤0.1 ms.
5. S-BULK G9/G11: unchanged engine commit/flush cost (~10 ms) and sustained
   ~12 ms; not a gate change.
6. The release has no public `LayoutReport`; G7 covers the detent/reorder
   commits only. The p5 spec's release row needs an authority/API decision.
7. Firefox remains advisory (D9 launch timeout). DPR 1/3 and reduced-motion
   variants remain P5c evidence outside this iteration.

## Iteration 7 — H16 fix round: measured release continuity, blocked rows and detent policy

- Worktree: `ani-h16`, branch `helper/h16`, base `7cd1e44` (H16 iteration 6);
  no reset/fetch/push.
- Date: 2026-10-29.
- Command:
  `node bench/layout/run.ts --runs 5 --engine chromium --engine webkit --check --out bench/layout/iteration-7/report.json`
- Report: `bench/layout/iteration-7/report.json`; log:
  `bench/layout/iteration-7/run.log`.
- Instrument: MacBook Pro `Mac14,9`, Apple M2 Pro (10 cores), 32 GB,
  macOS 27.0.1, Node 24.19.0, pnpm 10.20.0, Playwright 1.55.0,
  `chromium_headless_shell-1187`, `webkit-2203`.
- 1-minute load at start: **1.99**; cost fingerprint **advisory**. The frame
  gates still decide.
- Self-tests: **81/81, 14 controls**. Browser controls: **74 (37 per engine),
  all ok, 68 conclusive, 6 inconclusive** (the two contaminated photo/acc G1
  controls and `reorder-no-rebase` on each engine).

### F-ledger

| ID | Fix | Result |
|---|---|---|
| F8 | Release-frame continuity is measured: `HoldEvidence.releaseBox` against the next frame for the held node and its riders; the release G3 is BLOCK/authority because the pre-release velocity is the gesture estimate, not an analytic layout track. | S-REORDER G2 **88 px fail** (title-1, frame 11); S-SHEET G2 0.0000. G3 BLOCK in both scenes. |
| F9 | The `reorder-extra-read` control captures **inside** the measured frame, after the `before` snapshot; the browser control is conclusive by the isolated G13 delta. | G13 = 34 vs primary 6 (`isolated delta 34 > primary 6`). |
| F11 | A blocked required metric no longer passes a scene: the scene status is `blocked`, the report has a top-level `blocked` list, and certification names it. | WebKit S-SHEET **BLOCKED** (G3, G7, G12); Chromium S-SHEET fail on G12. |
| F12 | S-REORDER reorder status rows are marked BLOCK/authority (A-13 `ended` vs p5 `interrupted`); G7 does not claim exact. | G7 BLOCK, observed statuses `ended` at frames 28/31/35. |
| F13 | S-SHEET release rows are BLOCK/authority because `release()` has no public `LayoutReport`; G7 does not claim exact. | G7 BLOCK for `release-1` and `release-2`. |
| F10 | The nested title is a release **rider**: expected at the row's release track + (66, 10), with no own release velocity; G5 uses the rider target. | G5 0; the title no longer has its own 900 px/s spring. G1 title 96 and G4 row 60 remain the engine defects. |
| F14 | S-SHEET computes `projected = top + v·0.20`, nearest of {124, 422, 844}; the second take is ≥1 s after the first release. The second hold is 16 ms (uniform manual step); the 20 ms spec row is explicitly amended. | First release projects 2 → large 124; second projects 744 → dismissed 844; the scene's 1 s wait is recorded. |
| F16 | The stale G9/G11 text in the README report example is corrected. | **2.688 / 2.694** G9 and **8.495 ms** G11. |
| F15 | WebKit's 1 ms timer makes the 20-frame mean unclaimable; cost/G12 are BLOCK, not a measured pass. | WebKit cost BLOCK; top-level blocked list and certification reasons. |
| F18 | Biome is reported honestly; DPR 1/3 and reduced-motion variants are P5c BLOCK. | **810 infos, 0 errors, 0 warnings** (not "clean"); DPR/reduced in the top-level blocked list. |

**Scene contributions.** S-SHEET uses the manual clock's uniform 16 ms step
for both holds; the spec's second-hold 20 ms row is amended (source comment
and README). `allowEmptyFinal` is used only by S-SHEET (single participant
unmounted after the second release) and is backed by
`requiredRestorations: ['sheet']` plus the post-removal snapshot; no other
scene has the exemption.

### Scene and metric table (5 measured runs; median)

| Scene | Gate | Chromium | WebKit |
|---|---|---|---|
| S-REORDER | G1 oracle | **FAIL 96.0000 px** (title-1, frame 3) | **FAIL 96.0000 px** |
| S-REORDER | G2 release continuity | **FAIL 88.0000 px** (title-1, frame 11, release first frame) | **FAIL 88.0000 px** |
| S-REORDER | G3 | **BLOCK/authority** (gesture release) | **BLOCK/authority** |
| S-REORDER | G4 spring | **FAIL 60.0000 px** (row-1, frame 11) | **FAIL 60.0000 px** |
| S-REORDER | G5/G6 | pass 0 / 0 | pass 0 / 0 |
| S-REORDER | G7 | **BLOCK/authority** (A-13 ended vs p5 interrupted; no release report) | **BLOCK/authority** |
| S-REORDER | G8 | 0.440 ms pass | 1.000 ms pass |
| S-REORDER | G12 scene | **FAIL 0.295 ms/held** | BLOCK 1 ms (non-deciding) |
| S-REORDER | G13 | **FAIL 6** (held support read; commit 28/28, 8/8) | **FAIL 6** (16/16 computed) |
| S-REORDER | G13-held / shape.hold / kill-switch | pass 0 / 0 / 0 | pass 0 / 0 / 0 |
| S-SHEET | G1/G2/G4 | pass 0.0000825 / 0 / 0.0000825 | pass 0.0000871 / 0 / 0.0000871 |
| S-SHEET | G3/G7 | **BLOCK/authority** (release velocity/report) | **BLOCK/authority** |
| S-SHEET | G5/G6 | pass 0 / 0 (1 removal proof) | pass 0 / 0 |
| S-SHEET | G8 | 0.265 ms pass | 1.000 ms pass |
| S-SHEET | G12 scene | **FAIL 0.275 ms/held** (one run 0.090, four 0.210–0.315) | BLOCK 1 ms (non-deciding) |
| S-SHEET | G13 / G13-held / shape.hold | pass 0 / 0 / 0 | pass 0 / 0 / 0 |
| S-BULK | G1/G4 | pass 0.0000848 | pass 0.0000848 |
| S-BULK | G2/G3/G5/G6/G7 | pass 0 / 0 / 0 / 0 / 0 | pass 0 / 0 / 0 / 0 / 0 |
| S-BULK | G8 | 1.125 ms pass (48 frames) | 2.000 ms pass |
| S-BULK | G13 | pass 0 (2000/2000, 300/300) | pass 0 (2000/2000, 600/600) |
| S-BULK cost | G9-unscrolled / G9-scrolled | **FAIL 2.960 / 2.808** | BLOCK (raw 2.000 / 2.333) |
| S-BULK cost | G10 | pass 1.040 ms | BLOCK (raw 2.000) |
| S-BULK cost | G11 | **FAIL 8.940 ms** | BLOCK (raw 8.000) |
| S-BULK cost | G12-1 / G12-10 | **FAIL 0.390 / pass 0.058** | BLOCK (raw 1.000 / 0.100) |
| S-BULK cost | G13 / G13-held | pass 0 / 0 | pass 0 / 0 |

### Controls and certification

- 74 browser controls, 37 per engine, all ok; **68 conclusive, 6
  inconclusive** (photo/acc G1 ×2 and `reorder-no-rebase` ×2). The
  `reorder-extra-read` control is now conclusive by the isolated G13 delta
  (34 vs the primary 6); `held-extra-read` fails G13-held (11/10).
- `certified: false`; the report's top-level `blocked` list names
  `webkit scene s-sheet` (G3/G7/G12), `webkit S-BULK cost` (1 ms timer), the
  DPR 1/3 sweep and the reduced-motion variants. Certification reasons also
  include S-PHOTO/S-ACC/S-REORDER/S-SHEET failures, Chromium S-BULK cost
  failures (G9 2.960/2.808, G11 8.940, G12-1 0.390) and the WebKit cost
  BLOCK. `pending` is empty.
- S-SHEET is **BLOCKED** on WebKit, not pass; Chromium S-SHEET fails G12 and
  is BLOCK on G3/G7. The scene's measured interaction rows (G1/G2/G4/G5/G6/
  G8/G13) pass; the detent policy and 1 s second take are implemented.

### Residual risks

1. S-REORDER engine defects: held rebase (+60 px after a reorder) and nested
   title double-`h` (G1 96 px); release first-frame jump (G2 88 px); release
   spring (G4 60 px); held support read (G13 6). H18, not this harness.
2. G12 1-held fixed cost; the 10-held shape passes.
3. S-PHOTO/S-ACC H18 defects unchanged.
4. WebKit 1 ms timer: G9–G12 BLOCK; no 20-frame mean claimed.
5. S-BULK G9/G11 remain above the gate.
6. DPR/reduced variants and Firefox remain BLOCK/advisory.

## Iteration 8 — H16 S2 verification fixes

- Worktree: `ani-h16`, branch `helper/h16`, base `e4a6867` (H16 iteration 7);
  no reset/fetch/push.
- Date: 2026-10-29.
- Command:
  `node bench/layout/run.ts --runs 5 --engine chromium --engine webkit --check --out bench/layout/iteration-8/report.json`
- Report: `bench/layout/iteration-8/report.json`; log:
  `bench/layout/iteration-8/run.log`.
- Instrument: MacBook Pro `Mac14,9`, Apple M2 Pro (10 cores), 32 GB,
  macOS 27.0.1, Node 24.19.0, pnpm 10.20.0, Playwright 1.55.0,
  `chromium_headless_shell-1187`, `webkit-2203`.
- 1-minute load at start: **2.62**; cost fingerprint **advisory**.
- Self-tests: **81/81, 14 controls**. Browser controls: **74 (37 per engine),
  all ok, 68 conclusive, 6 inconclusive** (photo/acc G1 ×2 and
  `reorder-no-rebase` ×2).

### S2 fixes

| ID | Fix | Failing before | Result |
|---|---|---|---|
| F8 | `releaseContinuity` uses each rider's rest size (title 270×22), not the held row's 358×52. | G2 88.0000 px (width-edge artifact) | **G2 60.0000 px** (row-1 top, frame 11); title top 49.06 px. Failure kept. |
| G8 | S-BULK WebKit G8 is BLOCK when `g > 0.05`: its p95 is raw 1 ms-quantized frames and the §11.5 20-frame mean is not claimed. | 2.000 ms pass | **BLOCK**; WebKit S-BULK scene blocked, top-level blocked + cert reason. |
| S3 | Certification reasons list every deciding, non-blocked failed metric; RUN detail labels blocked G3/G7 as `BLOCK` rather than NaN/0. | RUN detail `G3 NaN; G7 0`, cert reason only scene status | `BLOCK G3; BLOCK G7; G1 96; G2 60; G4 60; G13 6; G12 ...`; cert reasons enumerate G1/G2/G4/G13/G12 and S-SHEET G12. |
| S3 | Removed the stale iteration-6 Failure 5 (3.3–3.5× / 12 ms) text. | stale | removed; iteration 7/8 values remain. |
| S3 | S-SHEET second hold uses the uniform 16 ms step; the p5 20 ms row is an explicit scene contribution in source/README/ITERATIONS. | implicit | documented. |
| S3 | `allowEmptyFinal` scope documented: only S-SHEET, backed by `requiredRestorations: ['sheet']` and the post-removal snapshot. | implicit | documented and source-commented. |

### Scene and metric table (5 measured runs; median)

| Scene | Gate | Chromium | WebKit |
|---|---|---|---|
| S-REORDER | G1 oracle | **FAIL 96.0000 px** (title-1, frame 3) | **FAIL 96.0000 px** |
| S-REORDER | G2 release continuity | **FAIL 60.0000 px** (row-1 top, frame 11); title top 49.06 px | **FAIL 60.0000 px** |
| S-REORDER | G3 | **BLOCK/authority** (gesture release) | **BLOCK/authority** |
| S-REORDER | G4 spring | **FAIL 60.0000 px** (row-1, frame 11) | **FAIL 60.0000 px** |
| S-REORDER | G5/G6 | pass 0 / 0 | pass 0 / 0 |
| S-REORDER | G7 | **BLOCK/authority** (A-13 ended vs p5 interrupted; no release report) | **BLOCK/authority** |
| S-REORDER | G8 | 0.695 ms pass | 2.000 ms pass |
| S-REORDER | G12 scene | **FAIL 0.330 ms/held** | BLOCK 1 ms (non-deciding) |
| S-REORDER | G13 | **FAIL 6** (held support read; commit 28/28, 8/8) | **FAIL 6** (16/16 computed) |
| S-REORDER | G13-held / shape.hold / kill-switch | pass 0 / 0 / 0 | pass 0 / 0 / 0 |
| S-SHEET | G1/G2/G4 | pass 0.0000825 / 0 / 0.0000825 | pass 0.0000871 / 0 / 0.0000871 |
| S-SHEET | G3/G7 | **BLOCK/authority** | **BLOCK/authority** |
| S-SHEET | G5/G6 | pass 0 / 0 (1 removal proof) | pass 0 / 0 |
| S-SHEET | G8 | 0.305 ms pass | 1.000 ms pass |
| S-SHEET | G12 scene | **FAIL 0.310 ms/held** | BLOCK 1 ms (non-deciding) |
| S-SHEET | G13 / G13-held / shape.hold | pass 0 / 0 / 0 | pass 0 / 0 / 0 |
| S-BULK | G1/G4 | pass 0.0000848 | pass 0.0000848 |
| S-BULK | G2/G3/G5/G6/G7 | pass 0 / 0 / 0 / 0 / 0 | pass 0 / 0 / 0 / 0 / 0 |
| S-BULK | G8 | 1.490 ms pass (48 frames) | **BLOCK** (1 ms-quantized; 20-frame mean not claimed) |
| S-BULK | G13 | pass 0 (2000/2000, 300/300) | pass 0 (2000/2000, 600/600) |
| S-BULK cost | G9-unscrolled / G9-scrolled | **FAIL 2.951 / 2.817** | BLOCK (raw 1.750 / 1.714) |
| S-BULK cost | G10 | pass 1.365 ms | BLOCK (raw 3.000) |
| S-BULK cost | G11 | **FAIL 8.090 ms** | BLOCK (raw 8.000) |
| S-BULK cost | G12-1 / G12-10 | **FAIL 0.415 / pass 0.061** | BLOCK (raw 1.000 / 0.100) |
| S-BULK cost | G13 / G13-held | pass 0 / 0 | pass 0 / 0 |

### Controls and certification

- 74 browser controls, 37 per engine, all ok; **68 conclusive, 6
  inconclusive** (photo/acc G1 ×2 and `reorder-no-rebase` ×2). The
  `reorder-extra-read` isolated delta is 34 vs the primary 6; the held-read
  control is 11/10.
- `certified: false`; top-level `blocked` names `webkit scene s-sheet`
  (G3/G7/G12), `webkit scene s-bulk` (G8), `webkit S-BULK cost` (1 ms timer),
  the DPR 1/3 sweep and the reduced-motion variants. Certification reasons
  list every failed metric, e.g. Chromium S-REORDER `G1 96, G2 60, G4 60,
  G13 6, G12 0.330`, Chromium S-SHEET `G12 0.310`, and the RUN detail labels
  the blocked G3/G7 (and G12 on WebKit) as `BLOCK`, not NaN/0.
- S-BULK is **BLOCKED** on WebKit (G8), not a measured pass; Chromium S-BULK
  passes the frame scene. S-SHEET is fail on Chromium (G12) and blocked on
  WebKit. S-REORDER fails G1/G2/G4/G13/G12 and blocks G3/G7.

## Iteration 10 — H17 D10/D11 on the H18/H16 base

- Branch `helper/h17`, merge `b7ead0f` on main `3c24925` (H18 engine A–F,
  H16 scenes/assertion fix, H15 scene set). No gate, tolerance, row or
  `knownFailure` was weakened.
- D10 is implemented as a literal median of five per-run
  `p95(engine commits) / p95(floor commits)` ratios. The floor is the same
  1,000-participant/300-mover replica with 5 warm-ups + 300 60 Hz samples and
  the exact read audit. D11 G12 is the baseline-subtracted incremental:
  `(p95(held) − p95(no-hold)) / held` at 1 and 10 held on S-BULK, and the
  1-held S-REORDER/S-SHEET shape.
- Chromium full report (`iteration-9/chromium.json`, source `a714d9a`, load
  10.05, five runs): all 11 scenes pass; G9 1.969× unscrolled pass / 2.079×
  scrolled FAIL; G10 0.975 ms pass; G13/G13-held exact; G12-1 −0.285 and
  G12-10 −0.006 incremental ms/held pass; **G11 2.424× FAIL** (per-run
  2.630/2.424/2.376/2.585/1.293, floor audit exact). G11 remains open; the cost is advisory.
- WebKit full report (`iteration-9/webkit.json`, source `a714d9a`, load 11.47):
  S-CARD/S-SEG/S-PHOTO/S-STACK/S-ISLAND/S-ACC/S-INSERT/S-DELETE/S-BULK pass;
  S-REORDER/S-SHEET blocked only on the G12 1 ms timer bound (G3/G7 remain
  authority BLOCK); G10 0.250 ms pass with the real-clock 20-frame batch;
  G9/G11/G12 BLOCK with no gate value; G13/floor exact.
- H18-F F4: `offsetLeft`/`offsetTop` held reads are counted in
  `stats.layoutOffsets` and included in `stats.reads`; G13 print describes
  the count. No hidden layout read.
- H17b/H18 behavior fixes and the full H15/H16 scene set are preserved. The
  H18 engine A–F fixes make S-PHOTO/S-ACC/S-REORDER frame gates pass on
  Chromium; S-SHEET/S-REORDER G3/G7 remain authority BLOCK.

Residual: G11 is 2.424× and G9-scrolled 2.079× (advisory load, open); no
performance-complete claim.
WebKit G9/G11/G12 cannot be decided with the 1 ms timer; no quantized ratio is
presented as a pass or failure.
