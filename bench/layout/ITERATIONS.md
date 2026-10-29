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

## Iteration 3 — H17 S-BULK commit and sustained cost (P5 performance)

- Worktree: `ani-h17`, branch `helper/h17`, base `c7cba21` (P4 acting
  PASS + H14 harness). No remote and no push.
- Date: 2026-10-29.
- Command: `pnpm bench:layout --runs 5 --engine chromium --engine webkit --check`
  was attempted twice; both invocations lost the Chromium GPU process
  (`exit_code=15`) after the warm-up, before run 1, and Playwright then spun in
  a closed-browser wait. The same code was run per scene on both engines:
  - `pnpm bench:layout --engine chromium --scene s-card --runs 5`
  - `pnpm bench:layout --engine chromium --scene s-seg --runs 5`
  - `pnpm bench:layout --engine chromium --scene cost --runs 5 --check`
  - the same three for `--engine webkit`
  - reports in `bench/layout/iteration-3/`.
- Fingerprint: MacBook Pro `Mac14,9`, Apple M2 Pro, 10 cores, 32 GB,
  macOS 27.0.1 / Darwin 27.0.0, Node 24.19.0, pnpm 10.20.0, Playwright
  1.55.0, `chromium_headless_shell-1187`, `webkit-2203`. 1-minute load at the
  final cost run: **2.48** (earlier H17 runs 1.48–3.92). Cost is **advisory**;
  the ratios are measured but not a certification claim until a quiet run.
- No scene expectation, row, tolerance or `knownFailure` changed.

### Before/after (Chromium S-BULK, 5 measured runs, median)

| Metric | Iteration 2 | Iteration 3 | Gate |
|---|---:|---:|---|
| G9 unscrolled | **3.252× FAIL** | **1.904× pass** (per-run 1.930/1.885/1.916/1.904/1.880) | ≤ 2 |
| G9 scrolled | **3.284× FAIL** | **1.949× pass** (1.949/1.919/2.008/1.924/2.013) | ≤ 2 |
| engine commit unscrolled | 8.72–10.71 ms | 5.53–5.69 ms | — |
| engine commit scrolled | 9.31–10.46 ms | 5.59–5.85 ms | — |
| floor commit | 2.84–2.92 ms | 2.81–3.00 ms | audited |
| G10 steady p95 | 1.025 ms | 0.950 ms | ≤ 2 |
| G11 sustained p95 | **12.345 ms FAIL** | **8.190 ms FAIL** (8.110/8.250/7.870/9.410/8.190) | ≤ 2 |
| G13 exact reads | pass | pass, zero steady reads | exact |

The audited floor is unchanged: 2,000 rects/2,000 layout-size pairs in
capture, 1,000/1,000 in flush, 300 computed reads (Chromium; 600 WebKit with
Typed OM), 300 pose declarations, no extra read. G11 completed 300 commits at
59.98–60.04 Hz with `g = 0.005 ms`; G13 reports zero steady-frame reads.

### Root causes and behavior-preserving fixes

1. **Every spring track recomputed its settle time.** `createTrack` built a
   fresh `Spring` and bisected `settleTime` for all four channels of 300
   tracks on every commit (`lastExit` was the largest single sampled block,
   ~1.2 ms). `solve.ts` now reuses pure `Spring` instances by
   `(duration, bounce)` and pure settle results by `(spring, x0, v0)`, with
   bounded maps; a zero/zero channel returns 0 without a lookup.
2. **Planning built 1,000 full `PlanNode`s and ran the decision for 700 static
   tiles.** A top-level participant with no drive anywhere in its subtree, no
   shared id, no hold, a valid B and an unchanged box cannot animate, snap or
   report. Its array slot is now `null` (still index-aligned); `plan` emits
   `none`. With no `layoutId` in the scope the lead/handoff pass is skipped.
3. **The participant tree was rebuilt at capture and flush.** A pass is now
   reused only after verifying the registry order/connection, shadow
   membership, flat parents and distinct nearest participant ancestors; a
   `MutationObserver` (document childList plus `slot`/`name` attributes)
   invalidates it on structural changes. This is a structure cache, not a
   read cache: no DOM read is skipped; a reparent invalidates it.
4. **The flush ran the presentation/keep/reexpress/solve machinery with no
   frame.** From-rest commits now skip those paths; hold, focus, lead and
   inactive-drive scans are guarded by the scope's live state. `frameIndex`,
   tree depth/parent/flat and `trusted` ancestry are carried on the participant
   instead of rebuilt maps.
5. **Support passes re-read computed values even when the check would read
   none.** A capture pass with zero computed reads is reused only while every
   input (participant order, parents, rect/layout size, pose scale) is
   identical; at flush it is reused only while every active node's computed
   `q` this flush read is 1. Any verification, exact-size read, non-1 `q` or
   size change runs the check again. C-6b and the 1.003-scale test stay exact.
6. **600 write records, per-drive arrays and per-track maps were allocated per
   commit.** Applied `Write` records are pooled; a drive with no extra owned
   property uses the shared pose list; integer pose channels bypass
   `toFixed(6)`; identity parent maps, identity ancestry and the common
   single-parent/identity geometry take a direct path; `update()` no longer
   arms a frame marker for a capture it consumes synchronously.
7. **Smaller walks.** `flatTree` returns a shared empty slot map when the
   scope knows no shadow root; `trackRoot` skips the root-chain allocation
   outside shadow roots; capture loops were merged; dead frame maps were
   removed.

### G11 — absolute gate is below the required-work floor

The sustained shape commits the same 1,000-participant work every 16.667 ms.
The audited floor median is **2.81–3.00 ms per commit**, so the absolute 2 ms
G11 gate is below the floor before any planner work. A direct same-shape
300-commit floor run (plain DOM, Chromium) measured **median 2.805 ms, p95
3.215 ms, max 3.405 ms** (`evidence/h17/floor_sustained.json`). The current
engine p95 is 8.190 ms on the final run (8.045–9.035 ms across H17 runs), ≈2.8–3.1× floor. A 2× floor replacement would also
still fail; H17 therefore reports the structural fact and proposes a
floor-relative owner decision without applying it
(`.trace/ani_ios_production/evidence/h17/g11_floor_amendment_proposal.md`).

### WebKit

WebKit remains **BLOCK**. `g = 1.0000 ms` in all five runs; the report is
`valid: false`, `status: blocked`, G9/G10/G11 are non-deciding. Diagnostic raw
values (1.200×/1.200×, 2.000 ms, 8.000 ms) are not presented as results. The
floor audits and G13 are exact. A 20-commit batch mean would be ±0.05 ms per
commit but cannot decide the p95 of 300 commits, so it was not claimed
(`evidence/h17/webkit_timer_block.md`).

### Scenes

S-CARD and S-SEG pass all gates in both engines over five runs (reports in
`iteration-3/`). S-REORDER, S-SHEET and S-BULK G12 remain P4 and are reported
pending, never passed. Cost remains advisory on the current load, so this is
not a certification claim.

No gate or tolerance was changed in this iteration.
