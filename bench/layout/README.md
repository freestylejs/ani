# P5 layout bench — iOS Native Grade certification instrument (P5a)

This is the certification instrument of `packages/layout/ARCHITECTURE.md` §11.5
and §11.6, not a demo. It scores every frame of an iOS interaction on a manual
clock against an independent oracle, measures the real-clock script cost and
the required-work floor, and fails a deliberately wrong frame. A harness that
cannot fail is worthless; every deciding metric has a negative control or a
documented unit-control mapping.

The gate values are copied from §11.5/§11.6 and are never tuned by a scene. A
scene is never declared to pass by construction, and an empty or partial trace
fails the completeness contract C1. The report separates the selected
invocation result (`pass`, scoped to the selected engines/scenes) from
**certification** (five measured runs, Chromium and WebKit, all required scenes,
all conclusive browser controls, every self-test file, no pending gate, no
launch error, non-advisory cost, valid cost run). `bench/layout/ITERATIONS.md` records every failure and the root-cause
hypothesis; the engine is not fixed in the harness.

## Requirements

- Node 24 (the runner is TypeScript executed with native type stripping).
- Playwright 1.55.0 with `chromium_headless_shell-1187`, `webkit-2203` and the
  advisory `firefox-1490` (D9). Firefox is not a deciding engine.
- No build step: the page is bundled from `packages/*/src` with esbuild.
- No server and no port: Playwright request interception serves
  `http://localhost/` with COOP `same-origin` and COEP `require-corp`.

## Commands

```sh
pnpm install --frozen-lockfile --offline

# full instrument: one discarded warm-up + five fresh-process measured runs,
# the P2/P3 scene set and the S-BULK cost shapes, in Chromium and WebKit
pnpm bench:layout

# what the checkpoint reviews: the same run plus all seven self-test files and
# every browser negative control
pnpm bench:layout --check

# one engine / one scene while iterating
pnpm bench:layout --engine chromium --scene s-card --runs 1
pnpm bench:layout --engine webkit --scene s-seg --runs 1
pnpm bench:layout --engine chromium --scene s-photo --runs 1
pnpm bench:layout --engine webkit --scene s-delete --runs 1
pnpm bench:layout --engine chromium --scene s-reorder --runs 1
pnpm bench:layout --engine chromium --scene s-sheet --runs 1
pnpm bench:layout --engine chromium --scene s-bulk --runs 1
pnpm bench:layout --engine chromium --scene cost --runs 1

# write elsewhere, compare a previous report
pnpm bench:layout --out bench/layout/results/iter-1.json
pnpm bench:layout --compare bench/layout/results/iter-0.json

# the pure harness tests alone (oracle, scoring, stats, sampler, aggregation,
# certification, cost validity)
pnpm test:bench-layout
```

`pnpm bench:layout` always writes the report before exiting and exits `1` on a
gate miss. `--check` additionally runs the unit self-tests and **all** browser
negative controls; it exits `1` if any conclusive control does not fail its
target gate. `--engine` is repeatable; the default is Chromium and WebKit.
`--scene` accepts `s-card`, `s-seg`, `s-photo`, `s-stack`, `s-acc`,
`s-insert`, `s-island`, `s-delete`, `s-reorder`, `s-sheet`, `s-bulk`, `cost`
and globs. `--runs` is the number of
measured runs (default 5); one warm-up process is always discarded first.
Certification requires exactly 5, both engines and all required scenes; a
`--runs 1`, single-engine or single-scene run is an invocation only. `pass` is
invocation-scoped and does not include global P4 pending scenes; `certification`
does. `test:bench-layout` is deliberately not part of `test:ci` while this
harness is P5a scaffolding: CI remains the package gate, and the harness
self-tests are a mandatory part of every `--check` run. Including them in CI is
a P5b decision.

The page is served under `http://localhost/` because that is a trustworthy
origin for COOP/COEP. Nothing listens on the port.

## Scene pages

The bundled pages are emitted on every run as self-contained files:

- `bench/layout/results/pages/s-card.html`
- `bench/layout/results/pages/s-seg.html`
- `bench/layout/results/pages/s-photo.html`
- `bench/layout/results/pages/s-stack.html`
- `bench/layout/results/pages/s-acc.html`
- `bench/layout/results/pages/s-insert.html`
- `bench/layout/results/pages/s-island.html`
- `bench/layout/results/pages/s-delete.html`
- `bench/layout/results/pages/s-reorder.html`
- `bench/layout/results/pages/s-sheet.html`
- `bench/layout/results/pages/s-bulk.html`

Open any file directly in a browser to view the real scene. `results/` is
gitignored; the files are generated from the current source on every run.

## Report schema (`ani-layout-bench/v1`)

```jsonc
{
  "schema": "ani-layout-bench/v1",
  "generatedAt": "ISO-8601",
  "command": "pnpm bench:layout ...",
  "fingerprint": {
    "host": "Mac14,9",
    "os": { "productVersion": "27.0.1", "kernel": "27.0.0" },
    "cpu": "Apple M2 Pro", "cores": 10, "memoryBytes": 34359738368,
    "node": "v24.19.0", "pnpm": "10.20.0", "playwright": "1.55.0",
    "browsers": {
      "chromium": "chromium_headless_shell-1187",
      "chromiumHeadlessShell": "chromium_headless_shell-1187",
      "webkit": "webkit-2203", "firefox": "firefox-1490"
    },
    "load1": 2.39013671875
  },
  "advisory": { "cost": true, "reasons": ["1-minute load is 2.39, pinned below 1"] },
  "certification": {
    "certified": false,
    "reasons": ["cost fingerprint is advisory", "blocked chromium scene s-reorder: G12 ...", "blocked chromium scene s-sheet: G12 ...", "blocked webkit scene s-reorder: G12 ...", "blocked webkit scene s-sheet: G12 ...", "blocked webkit scene s-bulk: G8 ...", "blocked webkit S-BULK cost: timer ...", "blocked DPR 1/3 sweep: P5c BLOCK", "blocked reduced-motion variants: P5c BLOCK", "blocked G12 baseline-subtracted: D11/H17c ...", "chromium S-BULK G11 6.465 failed"],
    "requiredEngines": ["chromium", "webkit"],
    "requiredRuns": 5,
    "requiredScenes": ["s-card", "s-seg", "s-photo", "s-stack", "s-island", "s-acc", "s-insert", "s-delete", "s-reorder", "s-sheet", "s-bulk", "cost"]
  },
  "engines": [
    {
      "engine": "chromium", "advisory": true,
      "browserVersion": "140.0.7339.16", "build": "chromium_headless_shell-1187",
      "launchError": null, "notes": [],
      "scenes": [
        {
          "scene": "s-card", "status": "pass", "pending": null, "pass": true,
          "metrics": [ /* AggregateMetric: G1..G8, G13 */ ],
          "shape": [ /* AggregateMetric: opacity, coverage, radius, inert, font, teardown */ ],
          "runs": [ /* per-run metrics, shape, worst frame/participant, real-clock G8, commit reads */ ],
          "notes": []
        }
      ],
      "cost": {
        "scene": "S-BULK", "status": "fail", "pending": null,
        "pass": false, "valid": true, "blockedReasons": [],
        "runs": [ /* engineAudit/floorAudit counts, medians, ratios, held shapes, gSource */ ],
        "metrics": [ /* G9-unscrolled, G9-scrolled, G9.floor-*, G10, G11, G12-1, G12-10, G13, G13-held */ ],
        "notes": []
      }
    }
  ],
  "negativeControls": [
    { "name": "card-no-image-id", "target": "G1", "expected": "fail",
      "observed": "fail", "ok": true, "detail": "G1 = 176.0 at frame 0" }
  ],
  "selfTests": { "pass": true, "controls": ["negative control G1: ..."],
                 "files": ["oracle.test.ts", "scoring.test.ts", "stats.test.ts",
                           "frame_sampler.test.ts", "aggregate.test.ts",
                           "certification.test.ts", "cost_validity.test.ts"],
                 "detail": "..." },
  "pending": [],
  "blocked": [
    { "item": "chromium scene s-reorder", "reason": "G12 (D11/H17c unavailable)" },
    { "item": "chromium scene s-sheet", "reason": "G12 (D11/H17c unavailable)" },
    { "item": "webkit scene s-bulk", "reason": "G8 (1 ms-quantized)" },
    { "item": "G12 baseline-subtracted", "reason": "D11/H17c harness not yet available" },
    { "item": "DPR 1/3 sweep", "reason": "P5c BLOCK: not run in this iteration" },
    { "item": "reduced-motion variants", "reason": "P5c BLOCK: not run in this iteration" }
  ],
  "pass": false
}
```

An `AggregateMetric` stores `median` of the per-run statistic, `perRun`,
`passPerRun`, and the absolute `worst` with its run number, frame, participant
and edge. The printout names the worst frame/participant where the metric has
one; cost metrics name the run and audit detail.

## Gate values (verbatim)

Frame scoring, manual clock, every participant every frame (Chromium and
WebKit; Firefox advisory):

| ID | Metric | Gate |
|---|---|---|
| C1 | Trace completeness contract | required observations/commits/reports/settle frames/participants/pair data; any declared metric n/a fails |
| G1 | Oracle error: drawn rect against the independent oracle | ≤ 0.05 px every edge |
| G2 | First-frame continuity against the last presented frame | ≤ 0.05 px (≤ 0.5 px only with `capture-aged`) |
| G3 | Velocity continuity at each retarget | ≤ 1 % of the larger speed + 1 px/s; observed rect finite difference is supporting evidence (H14-07) |
| G4 | Spring fidelity against the independent spring oracle | ≤ 0.05 px |
| G5 | Settle exactness: rect vs layout box, and the pose | ≤ 0.01 px; no pose declaration left |
| G6 | Restoration of owned inline declarations | byte for byte; mount snapshots are required and the full cssText is checked for participants whose inline style the scene does not own |
| G7 | Reports: `status`, `snapped`, diagnostics | exactly as scripted; `measured:true` required |
| G8 | Real-clock frame | p95 ≤ 2 ms; no > 8 ms frame after the commit frame |
| G13 | Exact reads | commit ≤ 2N rects, 2N pairs and the exact §4.1/§4.3 computed count; steady frames zero; `measured:true` required |

Cost gates:

| ID | Metric | Gate |
|---|---|---|
| G9 | Commit (capture + flush) ≤ 2× required-work floor | 1,000 participants, unscrolled and scrolled 1.5 viewports; median of 5 per-run ratios ≤ 2 |
| G10 | Steady frame at 300 nested movers | p95 of 600 samples ≤ 2 ms |
| G11 | Sustained 60 Hz commits, 300 moving participants, 5 s | p95 of one `performance.now()` pair per commit ≤ 2 ms; the measured cadence must be 58.5–61.5 Hz over 300 commits or the run is invalid; the refresh rate is recorded and a 30 Hz rAF frame is never called 60 Hz |
| G12 | Held frame ≤ 0.1 ms per held element | p95 of 600 real-clock held frames / held count, at 1 and 10 held on the S-BULK DOM; S-REORDER/S-SHEET add a 1-held scene shape. WebKit's 1 ms timer makes the ratio BLOCK/non-deciding |
| G14 | Fingerprint | mismatch makes cost advisory; frame gates still decide |

`G12` is measured, not fabricated: the 1- and 10-held shapes each run 600
real-clock frames and the held read is audited (one rect per held element per
frame, zero offset/style reads). S-REORDER and S-SHEET run their own 600-frame
1-held shape on the real twin. The held-frame support read on a reorder/detent
layout-change frame is measured and reported; it is not hidden.

## Independent oracle

`bench/layout/oracle.ts` imports nothing. It re-derives:

- the normalized cubic-bezier timing curve and its initial slope (§5.2);
- the damping branches of §5.3 in closed form (`ζ < 1`, `= 1`, `> 1`) and
  their exact velocities;
- the settle rule (`|d| ≤ 0.1 px`, `|v| ≤ 1 px/s`) by finding the last exit
  between extrema and bisecting the crossing; the authority's 300 px,
  D 0.55, bounce 0 example settles at 0.918 s;
- the perceptual spring timeline, the crossfade `circOut`/`out` pair, coverage,
  radius blend and per-edge box error;
- a fourth-order Runge–Kutta integration of the same oscillator as a second,
  independent implementation.

`bench/layout/oracle.test.ts` checks hand-computed values on every damping
branch, exact `v(0)`, the 0.01 ms reference integration, the 0.918 s settle
example, coverage exactly 1 for a new pair and no opacity pop on a reversal.
The oracle also records the presented-rect finite difference at each retarget as supporting evidence; the authority's analytic pair remains the G3 gate, and G1 decides actual engine continuity. No production solver, `physics`, `solve`, `plan` or timing code is imported.

## Required-work floor and its audit

The S-BULK cost page builds the same 1,000-participant DOM twice, in the same
process: the engine fixture and the floor fixture. Both have 300 movers and the
same written properties. The floor performs:

- **capture**: one `getBoundingClientRect()` and one `offsetWidth`/
  `offsetHeight` pair per participant (§4.1 item 1);
- the same scene mutation;
- **flush**: the same 1,000 rects and 1,000 layout-size pairs (§4.3 step 2);
- **computed reads**: §4.3 step 2 computed values for every active node. On
  WebKit the engine also reads the Typed OM `transform-origin` where it snaps
  the reference box; the floor performs that read too. The exact expected count
  is 300 reads in Chromium and 600 in WebKit for the 300 active movers.
- **poses**: one `translate` + one `scale` declaration per mover (the t = 0
  pose of §4.3 step 4). Both fixtures are reset to rest between samples
  (`group.finish()` for the engine, poses removed for the floor), so they start
  from the same rest state and write the same pose set.

The audit is structural, not a claim: the page instruments
`getBoundingClientRect`, the `offsetWidth`/`offsetHeight` getters and
`CSSStyleDeclaration.setProperty` for one unmeasured floor commit. It checks
2N rects, 2N offset pairs, the exact computed-style reads and M pose declarations
before the floor may be used. It also instruments one engine commit and checks
the engine's 2N rects, 2N pairs, computed reads and M poses. The report contains the counts and the audit result.
A floor that over-counts reads is a harness failure; `floor-extra-read` is the
negative control that proves the audit catches it.

The run statistic is `median(engine commit) / median(floor commit)`; the gate is
the median of the five measured per-run ratios. Engine and floor use the same
warm-up (5 discarded), sample count (30) and protocol, in the same process.
A run is valid only when `g ≤ 0.05 ms`, exactly 300 commits completed, and the
measured cadence is inside 58.5–61.5 Hz. A 42 Hz run is invalid (unit test
`cost_validity.test.ts`); a cadence miss blocks the cost report rather than
silently passing G11.

## Measurement and aggregation

- `g` is measured over 1,000 consecutive `performance.now()` reads; when no
  non-zero delta appears, the harness observes the next tick and records
  `gSource: "tick-fallback"`. WebKit reports `g = 1 ms`.
- When `g > 0.05 ms`, the harness does **not** average already-quantized
  per-frame costs and call the result a 20-frame interval. It reports raw frame
  samples with the ±g/2 quantization bound and marks the samples `quantized`;
  the cost report is BLOCK/not deciding. The 20-frame interval can only be
  timed as one pair, which this instrument does not claim.
- A frame sample is the sum of every rAF callback in one animation frame
  (same timestamp). A commit in a task between frames marks the next frame,
  never the previous one; a commit inside a callback marks that callback's
  frame. The sampler can charge a commit's script to that next frame
  (`FrameSampler.addScript`); G8 does not invent it, and G11 times the commit
  separately.
- G11 is measured as one `performance.now()` pair around each of 300 commits
  at 60 Hz; the rAF refresh (often ~30 Hz in headless WebKit) is recorded as
  `refreshHz` and the frame samples are diagnostic only. A 30 Hz frame is never
  presented as a 60 Hz frame.
- Percentiles are nearest-rank and the five per-run values are printed with
  the median. A metric uses the **per-run findings' own gate outcomes** and
  passes when at least three of five measured runs pass (the median outcome);
  a missing or non-finite run fails the aggregate. No threshold is recomputed
  from the median (H14-21). The per-run pass/fail list is always printed.
- `g`, the fingerprint and every per-run statistic are written to the report.

## Fingerprint (G14)

The pinned instrument is D9: MacBook Pro `Mac14,9`, Apple M2 Pro, 10 cores,
32 GB, macOS 27.0.1 (Darwin 27.0.0), Node 24.19.0, pnpm 10.20.0, Playwright
1.55.0, `chromium_headless_shell-1187`, `webkit-2203`, `firefox-1490`, and a
1-minute load below 1.0 at start. The report records all of them. A mismatch
anywhere marks the cost result **advisory**; the frame gates still decide.
On this host the 1-minute load has been above 1.0 during the P5a runs, so every
cost report is advisory until a quiet run is produced. A report with an
advisory cost fingerprint cannot claim the cost gates; its top-level `pass` is
`false` when the cost scene is selected, while the frame-scoring values remain
deciding evidence. WebKit cannot be measured validly for G9/G10/G11/G12 with
its 1 ms timer: those metrics are `BLOCK`/non-deciding, the raw ratios are
diagnostic, and certification is `NOT CERTIFIED` with that exact reason. No
quantized WebKit ratio is reported as a measured failure. The authority's
20-frame mean is **not claimed** on WebKit: the harness reports raw quantized
per-frame samples with the ±g/2 bound and marks the cost/G12 result BLOCK.
DPR 1/3 and the reduced-motion variants are P5c **BLOCK** in this iteration
(the top-level `blocked` list and certification reasons name them); the DPR 2
primary run is the certification run.

## Negative controls

The self-tests in all seven files run by `test:bench-layout` feed deliberately
broken traces and assert each gate fails. The certification input consumes the
result of the whole suite, not only oracle/scoring:

| Control | Metric that must fail |
|---|---|
| 0.1 px offset | G1 (and spring fidelity G4 when the track is a spring) |
| 0.1 px first-frame jump | G2 |
| retarget starting from rest | G3 (plan velocity override; the observed jump also fails G1) |
| 0.1 px spring displacement | G4 |
| 0.02 px settle shift + leftover pose | G5 |
| leftover `border-radius`; no mount snapshot; unowned inline cssText | G6 (and C1 for the missing mount) |
| wrong status / wrong snapped set | G7 |
| 9 ms frame after a commit / high p95 | G8 |
| floor with an extra read, ratio > 2 | G9 / floor audit |
| p95 > 2 ms | G10 |
| sustained p95 > 2 ms | G11 |
| 0.11 ms per held element; an extra rect in a 10-held frame | G12 (unit); G13-held (browser `held-extra-read`) |
| extra rect / steady-frame read | G13 |
| load or build mismatch | G14 advisory (not a frame gate) |
| broken opacity, coverage, radius, inert, focus, font | shape checks |

Browser controls are run by `--check`, once per engine, through the real page:

- S-CARD: remove the image pair's shared id; remove the follower's `inert`;
  focus the follower directly; force a 0.1 px image translate.
- S-SEG: restart the second track from rest; start it from A instead of the
  presented box; leave a 0.05 px pose after settle.
- S-PHOTO: drop the detail image's layout registration (the frame's
  non-uniform pose then stretches it); G1 fails.
- S-ACC: render the 0.5 px separators at 1 px; the row flow and the separator
  edges no longer match the probe; G1 fails.
- S-STACK: leave badges 1–5 unregistered; they scale with the card's authored
  map instead of their own position tracks; G1 fails.
- S-ISLAND: snap the pill's pose to its target at the reverse 30 % commit; G2
  fails.
- S-INSERT: disable the presence enter on the three new rows; their opacity is
  1 at the commit while the declared curve starts at 0; `shape.presence-opacity`
  fails.
- S-DELETE: skip the presented-box lift/pin for the second deleted row; the
  engine keeps moving it after the lift; G1 fails.
- S-REORDER: skip the drive-hold kill switch (shape.kill-switch), cancel
  instead of release (shape.hold), supply a stale offset after a reorder (G1,
  inconclusive while the primary G1 fails), and an extra capture **inside the
  measured held frame** (G13: 34 excess vs the primary 6; conclusive by the
  isolated delta even though the primary G13 is already red).
- S-SHEET: release to the medium detent (G5), start the first release frame at
  A (G2), extra capture in a held frame (G13), cancel instead of the second
  release (shape.hold).
- S-BULK: move one tile's target by 1 px (G1), extra capture in the commit
  (G13), leave a 0.5 px pose after settle (G6).
- Cost held shape: a 10-held frame with an extra rect read fails G13-held; the
  G12 unit control is 0.11 ms per held element.
- S-PHOTO: leftover pose on `cell-0` (G6), extra rect read (G13).
- S-ACC: leftover pose on `row-0` (G6), extra rect read in the commit (G13).
- S-INSERT: leftover pose on `row-9` (G6), extra rect read (G13).
- S-STACK: extra read (G13), leftover pose on `card-0` (G6), disabled badge
  scale (shape.badge-scale).
- S-ISLAND: extra read (G13).
- S-DELETE: extra read in the second commit (G13).
- The earlier `photo-no-counter-scale` and `acc-separator-1px` controls target
  G1, which the primary scenes already fail; they are reported **inconclusive**
  because a control cannot prove a metric the primary does not pass. The
  isolated G6/G13 controls above are conclusive.
- S-BULK: run the floor with an extra `getBoundingClientRect()`.

Each conclusive control must fail its target; a control that unexpectedly
passes makes `--check` exit `1`. On the P3-final base `card-no-inert` and
`card-focus-follower` are both conclusive and fail their targets. `shape.teardown`,
`shape.pill-radius`, C1 (no-mount trace), G12 and G14 have unit controls rather
than browser controls; the mapping is one control per deciding metric.
`G9.probe` is non-deciding evidence and has no gate control by design.

## P5b scope — the §11.6 P2/P3 scene set

- Implemented scenes: **S-CARD**, **S-SEG**, **S-PHOTO**, **S-STACK**,
  **S-ACC**, **S-INSERT**, **S-ISLAND**, **S-DELETE**, **S-REORDER**,
  **S-SHEET** and **S-BULK**; the cost scene runs the §11.5/A-19 shapes. The
  P4 drive scenes and the held shape are implemented in P5c below.
- The base is P3 final + P4 drive + H14 harness; the H15 fix round is
  iteration 4 and N15 is iteration 5. The Firefox advisory exception (D9) is
  unchanged.
- Iteration 4/5: S-CARD, S-SEG, S-STACK, S-ISLAND, S-INSERT and S-DELETE pass
  in Chromium and WebKit; S-PHOTO and S-ACC fail honestly on the two H18
  engine defects (late nested handoff; nested counter-projection). Iteration 6
  adds the P4 scenes and held cost; see the P5c section for the current
  evidence.

### Scene table (P5b)

| Scene | API | Participants | Movers | Step | Motion | Script |
|---|---|---|---|---|---|---|
| S-CARD | vanilla | 7 | 6 | 16 ms | CARD 0.55/0.05 | open, close, reverse at 40 % |
| S-PHOTO | vanilla | 301 | 2 | 16 ms | PHOTO 0.45/0 | open, back at scrollTop 1077 |
| S-SEG | vanilla | 1 | 1 | 16 ms | SEG 0.35/0.12 | four taps 80 ms apart |
| S-STACK | vanilla | 12 | 12 | 16 ms | STACK 0.55/0.08 | expand, collapse |
| S-ACC | React | 43 | 33/17/33 | 16 ms | ACC 0.50/0.06 | row 2, row 6 mid-flight, row 2 collapse |
| S-INSERT | React | 16 | 13 + 3 presence | 16 ms | INSERT 0.50/0.05 | prepend 3 at scrollTop 1000 |
| S-ISLAND | vanilla | 4 | 2 | 10 ms | ISLAND 0.50/0.10 | expand, reverse at 30 % |
| S-DELETE | React | 9 | 8 + 2 presence | 10 ms | DELETE 0.45/0.08 | delete row 2, row 5 at +100 ms |
| S-BULK | vanilla | 1,000 | 300 | 16.67 ms | BULK 0.40/0.10 | cost shapes only |

All scenes set `reducedMotion: 'ignore'`, `engine: 'raf'` (default), the
390×844@2 viewport and the SF Pro stack. The page is bundled from
`packages/*/src`; the React scenes use `@freestylejs/ani-react/layout` and the
same public engine surface.

### Visual-spec corrections (H14-25)

- **S-CARD close X**: the close is a 32 px circle with a 14×14 inline SVG X,
  two 2 px strokes in `#3C3C43` (not a `×` glyph).
- **S-CARD content fade**: the sheet content stays at 0 until the lead's
  perceptual timeline reaches 0.5, then fades to 1 over 0.15 s with
  `cubic-bezier(0,0,0.58,1)`. The manual twin evaluates the same spring
  perceptual function; the real twin uses a CSS transition with the same
  delay and curve.
- **S-CARD image decode**: the feed card is reused on close (same decoded
  image); the open sheet image is decode-awaited with the document images.
  No image is mounted into a captured layer before `decode()` resolves.
- **S-CARD safe areas**: the kit status bar (time, signal, battery) and the
  home indicator are drawn; the close sits inside the top safe area.
- **S-SEG label geometry**: labels are `(18 + 88.5i, 162, 88.5, 28)` inside the
  358×32 track; the pill is `(19 + 88.5i, 163, 86.5, 26)`. The stage has the
  kit status bar and the home indicator.

### Scene contributions (not gate changes)

- **S-INSERT scroller** sets `overflow-anchor: none` on the scene's scroller so
  the browser camera does not compensate before the engine's first read. The
  visible driven rows then present the §12 uncompensated 234 px shift; the
  scroll offset is asserted unchanged. The engine's §6 anchor ownership is
  untouched.
- **S-DELETE swipe** is an authored `translateX` inner map (`0 → −80 px` over
  eight frames), as the spec requires. The exiting row keeps its layout
  registration (capture + flush are 9/9) and changes `layoutKey` on exit, so
  its layout track ends at the presented box. The `popLayout` `popBox` divides
  the own `translateX` out (J-027); the scene pins the lifted element to the
  presented box measured in the exiting render, clears the authored transform,
  and starts the presence `translateX(0 → −390)` from there. Opacity is an
  author timeline `1 → 0` over 0.2 s linear (the presence exit itself only
  translates over 0.25 s).
- **S-DELETE G13** counts the layout engine's reads (capture + flush) from the
  DOM audit. Reads whose stack is React's `popBox`/`containsAbsolute`/`ownMap`
  presence probe are classified as non-layout and recorded per commit
  (`presenceRects`/`presenceStyles`) instead of being subtracted by a constant;
  the gate uses the layout subset. The exact set is 18/18 rects, 4/4 or 3/3
  computed reads (Chromium) and 10/10 and 8/8 (WebKit, including Typed OM).
- **S-STACK badge presence** is on the badge's inner count disc: the badge
  participant is a 22×22 wrapper (so the position track is exact), its
  opacity enters/exits under presence, and the red disc scales 0.8→1 about its
  centre. The spec's rect-level presence scale is therefore a visual assertion
  on the disc, not a second rect track. The stack's authored map is
  `translateY(420−90i) scale(0.96^i)` and each badge carries the inverse
  authored scale so its 22 px size is preserved in the stack.
- **S-ISLAND reverse** sets the exiting card to the pill's P0 layout so its
  nested content settles with an identity pose; the card content shrinks with
  the card on a 0.28 s critically damped spring and is removed with the card.
  This is a deliberate departure from the spec's `layout: 'position'` for the
  **exiting** card content: a position wrapper leaves a counter-projected pose
  on the subtree when it is removed with the follower, and the engine does not
  counter-project it under the follower at the needed accuracy. The pill
  content remains a position wrapper; both wrappers are counter-projected
  during the expand. **Text-crispness assertion:** the incoming pill content
  and the expanded card content are position-pinned at the authored glyph
  size; the exiting card content is a size-tracking layer whose text scales
  with the 0.28 s shrink while its declared opacity fades to 0 over 0.12 s
  (`shape.presence-opacity`). The G1 box track and the opacity timeline are the
  assertion; the departing text is never presented after the fade. The content
  fade start is quantized to the first frame whose lead perceptual progress is
  ≥ 0.5. The harness exempts a descendant removed with a crossfade follower
  (H15-07) from the last-frame owned-declaration check, and the exemption is
  backed by the post-removal before/after style snapshot (N15-01) required by
  `requiredRestorations`; the snapshot proves the engine restored the owned
  translate/scale before the element is removed.
- **S-CARD** keeps the sheet content registered in a hidden non-participant
  sheet from rest (valid B), separates lead/follower z-order, and starts the
  close one settled frame after the open report. The content layer is an author
  timeline in the manual run and a CSS transition in the real twin.
- **G3** remains analytic (A-11); the observed finite difference is supporting
  evidence and includes one frame of acceleration.
- **G13 exact counts** (capture radius + flush computed reads, per engine,
  Chromium/WebKit) are: S-CARD open 8/15, close 8/15, reverse 9/16; S-SEG 2/3
  per tap; S-PHOTO open 2/4, back 2/4; S-STACK expand 21/33, collapse 12/24;
  S-ACC 47/82 per commit; S-INSERT 16/29; S-ISLAND expand 5/9, reverse 6/10;
  S-DELETE 4/3 Chromium and 10/8 WebKit (layout reads after the audited
  `popBox` classification; the presence reads are 2/2 per commit). The
  rect/pair gate is exact `2N`, not an upper bound; the S-DELETE `delete-2`
  count is 18, not 16.
- The per-scene G9 probe is a generic engine/floor probe at the scene's N and
  is explicitly non-deciding; the named gate is S-BULK at 1,000.

### Harness additions for P5b

- `oracle.ts`: a timing track from rest has `k = 0` (the §1.6 formula); only a
  moving retarget carries the analytic velocity bump. A new unit test covers
  the from-rest curve exactly.
- `SegmentPlan.authoredTranslate` composes an authored gesture translation
  over the layout box for the pre-commit swipe frames.
- `SegmentPlan.startMoving` starts an author/presence timeline at the commit
  (its first frame advances by `dt`, unlike a from-rest layout track).
- `SegmentPlan.toFromB` declares a presence exit target relative to the
  presented box; `presenceExit` keeps it out of G3.
- `ScenePlan.presenceOpacity` and `shape.presence-opacity` check the declared
  author/presence opacity curves with the exact coefficients.
- React scenes use a DOM read audit because the public React adapter exposes
  no `group.stats`; the audit counts `getBoundingClientRect`,
  `offsetWidth`/`offsetHeight`, `getComputedStyle` and `computedStyleMap`
  during the commit/frame only. Reads made by React's `popBox` presence probe
  are classified by call stack and reported separately; they never enter the
  layout read gate.
- `aggregateSceneReport` fails a scene when **any** measured run fails,
  including a run whose individual metrics pass but whose problems, real-twin
  diagnostics or teardown do not; the `RUN` metric names the failing metric,
  participant/frame and problem. Certification requires every P5b scene.
- The real twin's `record` populates the participant map in both modes; its
  final connected count and `realTwinProblems` (diagnostics, tracks, holds,
  connected) are part of the per-run pass.
- S-PHOTO registers the selected cell/image (the only layoutIds in the grid)
  **after** the initial scroll, so the scroll event never meets the engine's
  active-scroller listeners. WebKit 2203 has no `scrollend`; the scene uses the
  scroll event plus two animation frames as the settle proof and rejects a
  scroll that does not settle, instead of silently continuing. The real twin
  reports the same engine stale path as the manual run (H15-11); the extra
  capture-less count is the H18 nested-image defect.

### Known limitations / evidence

- **S-PHOTO** is fixed on the H18 base: the nested detail image now takes its
  late handoff and projects exactly. G1/G2/G4 are ~0.0002 px, G7 0 and the
  manual/real twins emit **zero stale diagnostics**. N15-02 makes
  `openReal()`/`backReal()` mirror the manual unregister/add path. The real
  twin **does not pin the old two-event sequence**: it returns whatever the
  engine emitted, and `realTwinProblems` fails any diagnostic. The old 306.25
  px / two-stale result is iteration history (pre-H18).
- **S-ACC** is fixed on the H18 base: `body-6` counter-projects exactly at the
  mid-flight row expansion. G1/G4 ~0.0002 px and G2 ~0.0001 px; the old 120 /
  55.67 px result is iteration history (pre-H18).
- **S-INSERT** is exact after the reclassification: a mounting row has no B,
  and §9.1 requires both B and A outside the viewport, so `snapped []` is the
  correct expectation (H15-08). The earlier three-`culled` expectation was a
  scene/oracle overreach, not an engine defect. S-INSERT passes.
- **S-ISLAND** passes after the H15-07 harness rule: a descendant removed with
  a crossfade follower is exempt from the last-frame owned-declaration check
  (the follower's removal and inert proof cover it). The earlier G6 failure was
  a harness false positive, not an engine or geometry defect.
- DPR 1/3 and the reduced-motion variants are **P5c BLOCK**: they are not run
  in this iteration and are listed in the report's top-level `blocked` list
  and the certification reasons. The DPR 2 primary run is the certification
  run.
- Firefox 1490 is advisory and times out on launch on this macOS 27
  instrument (D9 exception).

## P5c scope — drive scenes, held cost and the full §11.6 set

- Implemented scenes: **S-CARD**, **S-SEG**, **S-PHOTO**, **S-STACK**,
  **S-ACC**, **S-INSERT**, **S-ISLAND**, **S-DELETE**, **S-REORDER**,
  **S-SHEET** and **S-BULK** (the frame-scored 1,000-participant shuffle; the
  §11.5 cost shapes remain the `cost` scene). No scene is pending.
- **G12** is measured: the cost scene's 1- and 10-held shapes (600 real-clock
  frames each) and the S-REORDER/S-SHEET 1-held scene shape. Every held frame
  reads exactly one rect per held element (G13-held).
- The drive-hold kill switch (L-DRIVE-4, §7.2) runs on S-REORDER after the
  scored script: the handle is `invalidated` synchronously, `holds` and the
  clock subscription are zero, the authored styles are restored byte for byte,
  and `runtime-disabled` + a `disabled` snap are reported. `shape.kill-switch`
  is the row; skipping the switch fails it.
- S-BULK is scored on the manual clock at 1280×720@1: 850 tiles + 150 nested
  labels = 1,000 participants, 300 movers, one shuffle; G1–G8/G13 and the
  settle/restoration rows pass in Chromium and WebKit. The cost scene owns
  G9–G13 at 1,000 participants.

### P5c scene table

| Scene | API | Participants | Movers | Step | Motion | Script |
|---|---|---|---|---|---|---|
| S-REORDER | vanilla + drive | 14 | 14 (held pair + displaced pairs) | 20 ms | REORDER 0.45/0.10 | take, 10 moves, reorder at k=2/5/9, release 900 px/s; kill switch |
| S-SHEET | vanilla + drive | 1 | 1 | 16 ms | SHEET 0.45/0.08 | medium→large (−1200), medium→dismissed (+1600) |
| S-BULK | vanilla | 1,000 | 300 | 16 ms | BULK 0.40/0.10 | 150-tile cyclic shuffle |

S-SHEET uses 16 ms frames for both holds (the spec's second hold is written as
20 ms; that timing is a scene contribution, and the source comment records the
amendment). The second take is at least 1 s after the first release, and the
detent is the scene's `projected = top + v·0.20 s` nearest of {124, 422, 844};
the release vectors and geometry are unchanged.

`ScenePlan.allowEmptyFinal` is deliberately narrow: **only S-SHEET** sets it,
because its single participant is unmounted after the second release. The
removal is proven by `requiredRestorations: ['sheet']` and the post-removal
restoration snapshot; no other scene may use the exemption, and C1 still
requires a connected final participant everywhere else. S-REORDER and S-BULK
keep their participants connected.
The S-REORDER title is a nested position participant; the held row and its
title are the direct-manipulation pair. The row's inline `top` and the DOM
order change inside each reorder commit; the title's local box is fixed.

**Tooling honesty.** Biome reports **810 infos, 0 errors, 0 warnings** on
`bench/layout` (the infos are the repository's baseline `noMagicNumbers` /
naming diagnostics). This is not a clean biome report and is not claimed as
one; `tsc` and `test:bench-layout` are clean.

### P5c evidence and clarifications (iteration 9, H18 base)

The 2026-10-29 clarifications resolve the release/status rows:

- **S-REORDER G7 is pass**, not BLOCK: each reorder targets a different
  sibling; untouched tracks keep running and the statuses are `ended` at
  frames 28/31/35. The release row is **N/A** (no public `LayoutReport`).
  A future retarget of a running sibling must expect `interrupted` (A-13).
- **S-SHEET release G7 and G3 are N/A**: `release()` starts no public
  `LayoutReport`, and there is no analytic layout track before a release.
  G2/G4/origin/observed FD/restoration decide. The 16 ms second hold is the
  documented scene contribution; the detent policy and ≥1 s second take are
  scored.
- **S-REORDER measured rows pass on H18**: G1/G2/G4 ~0.00002 px, G5/G6/G7/
  G13 pass, G13-held 0, kill-switch/hold pass. The old held rebase, nested
  title, release and support-read defects are fixed by H18.
- **S-SHEET measured rows pass on H18**: G1 ~0.00008, G2 0, G4 ~0.00008,
  G5/G6/G7/G13 pass, G13-held 0. G3/G7 are N/A.
- **G12 remains BLOCK on both scenes and the cost shapes**: the D11
  baseline-subtracted G12 harness is not in H17c yet. Raw 1/10-held values are
  evidence only. This is a documented blocker, not a pass.
- **S-BULK frame scoring passes on Chromium**; WebKit is **BLOCKED on G8**
  (1 ms-quantized; §11.5 20-frame mean not claimed). Chromium cost now passes
  G9 (1.838 / 1.922×) and G10 (1.120 ms), but still fails G11 (6.465 ms) and
  blocks G12.
- **S-PHOTO and S-ACC pass on H18**: G1/G2/G4 ~0.0002 px and zero stale
  diagnostics (S-PHOTO); the old known limitations are historical.

The old iteration-6/7/8 failure values remain in `ITERATIONS.md` as history;
they are not the current H18-base result.

## Files

| Path | Purpose |
|---|---|
| `run.ts` | CLI, engines, request interception, runs, aggregation, report |
| `fingerprint.ts` | §11.5 fingerprint and advisory rule |
| `oracle.ts`, `oracle.test.ts` | independent closed-form/RK4 oracle and unit tests |
| `stats.ts` | nearest-rank percentiles, median, `g`, quantization handling |
| `aggregate.ts` | per-run gate aggregation; missing/non-finite runs fail |
| `certification.ts` | invocation vs certification rules |
| `cost_validity.ts` | timer/cadence validity and the post-P4 cost status |
| `scoring.ts`, `scoring.test.ts` | per-frame gates, worst frame/participant, shape, negative controls |
| `gates.ts` | cost gates and floor audit |
| `scene_plans.ts` | scripted geometry/motion data for the oracle |
| `bundle.ts` | esbuild page bundle and viewable HTML |
| `page/` | page-side recorder and the P2/P3/P4 scene pages; `page/scenes/` holds S-CARD, S-SEG, S-PHOTO, S-STACK, S-ACC, S-INSERT, S-ISLAND, S-DELETE, S-REORDER, S-SHEET, S-BULK and the kit |
| `ITERATIONS.md` | iteration 0/1/2/3 evidence and root-cause hypotheses |
| `iteration-0/` | historical iteration-0 reports (old base) |
| `iteration-1/` | fixed-H11b iteration-1 reports |
| `iteration-2/` | P3-final iteration-2 reports |
| `iteration-3/` | H15 P5b iteration-1 report |
| `iteration-4/` | H15 fix-round report |
| `iteration-5/` | N15 fix report |
| `iteration-6/` | H16 P5c full §11.6 set, drive scenes and G12 (current) |
