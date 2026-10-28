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
