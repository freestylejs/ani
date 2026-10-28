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
