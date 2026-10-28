# P5 layout bench — iOS Native Grade certification instrument (P5a)

This is the certification instrument of `packages/layout/ARCHITECTURE.md` §11.5
and §11.6, not a demo. It scores every frame of an iOS interaction on a manual
clock against an independent oracle, measures the real-clock script cost and
the required-work floor, and fails a deliberately wrong frame. A harness that
cannot fail is worthless; every metric has a negative control.

The gate values are copied from §11.5/§11.6 and are never tuned by a scene. A
scene is never declared to pass by construction. `bench/layout/ITERATIONS.md`
records every failure and the root-cause hypothesis; the engine is not fixed in
the harness.

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
# S-CARD, S-SEG and the S-BULK cost shapes, in Chromium and WebKit
pnpm bench:layout

# what the checkpoint reviews: the same run plus the oracle/scoring self-tests
# and the browser negative controls
pnpm bench:layout --check

# one engine / one scene while iterating
pnpm bench:layout --engine chromium --scene s-card --runs 1
pnpm bench:layout --engine webkit --scene s-seg --runs 1
pnpm bench:layout --engine chromium --scene cost --runs 1

# write elsewhere, compare a previous report
pnpm bench:layout --out bench/layout/results/iter-1.json
pnpm bench:layout --compare bench/layout/results/iter-0.json

# oracle and scoring unit tests alone
pnpm test:bench-layout
```

`pnpm bench:layout` always writes the report before exiting and exits `1` on a
gate miss. `--check` additionally runs the unit self-tests and the browser
negative controls; it exits `1` if any control does not fail its target gate.
`--engine` is repeatable; the default is Chromium and WebKit. `--scene` accepts
`s-card`, `s-seg`, `cost` and globs. `--runs` is the number of measured runs
(default 5); one warm-up process is always discarded first.

The page is served under `http://localhost/` because that is a trustworthy
origin for COOP/COEP. Nothing listens on the port.

## Scene pages

The bundled pages are emitted on every run as self-contained files:

- `bench/layout/results/pages/s-card.html`
- `bench/layout/results/pages/s-seg.html`

Open either file directly in a browser to view the real scene. `results/` is
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
    "load1": 5.99658203125
  },
  "advisory": { "cost": true, "reasons": ["1-minute load is 6.00, pinned below 1"] },
  "engines": [
    {
      "engine": "chromium", "advisory": true,
      "browserVersion": "140.0.7339.16", "build": "chromium_headless_shell-1187",
      "launchError": null, "notes": [],
      "scenes": [
        {
          "scene": "s-card", "status": "fail", "pending": null, "pass": false,
          "metrics": [ /* AggregateMetric: G1..G8, G13 */ ],
          "shape": [ /* AggregateMetric: opacity, coverage, radius, inert, font, teardown */ ],
          "runs": [ /* per-run metrics, shape, worst frame/participant, real-clock G8, commit reads */ ],
          "notes": []
        }
      ],
      "cost": {
        "scene": "S-BULK", "status": "fail", "pending": "P4 (held shape G12)",
        "pass": false,
        "metrics": [ /* G9-unscrolled, G9-scrolled, G9.floor-*, G10, G11, G13 */ ],
        "runs": [ /* ratio, engine/floor medians, steady/sustained p95, g */ ],
        "notes": []
      }
    }
  ],
  "negativeControls": [
    { "name": "card-no-image-id", "target": "G1", "expected": "fail",
      "observed": "fail", "ok": true, "detail": "G1 = 176.0 at frame 0" }
  ],
  "selfTests": { "pass": true, "controls": ["negative control G1: ..."], "detail": "..." },
  "pending": [
    { "scene": "S-REORDER", "reason": "P4 (take/move/release drive seam not in the base tree)" },
    { "scene": "S-SHEET", "reason": "P4 (drive seam not in the base tree)" },
    { "scene": "S-BULK", "reason": "held shape G12 pending P4 ..." }
  ],
  "pass": false
}
```

An `AggregateMetric` stores `median` of the per-run statistic, `perRun`,
`passPerRun`, and the absolute `worst` with its run number, frame, participant
and edge. The printout names the same worst frame/participant for every metric.

## Gate values (verbatim)

Frame scoring, manual clock, every participant every frame (Chromium and
WebKit; Firefox advisory):

| ID | Metric | Gate |
|---|---|---|
| G1 | Oracle error: drawn rect against the independent oracle | ≤ 0.05 px every edge |
| G2 | First-frame continuity against the last presented frame | ≤ 0.05 px (≤ 0.5 px only with `capture-aged`) |
| G3 | Velocity continuity at each retarget | ≤ 1 % of the larger speed + 1 px/s |
| G4 | Spring fidelity against the independent spring oracle | ≤ 0.05 px |
| G5 | Settle exactness: rect vs layout box, and the pose | ≤ 0.01 px; no pose declaration left |
| G6 | Restoration of owned inline declarations | byte for byte |
| G7 | Reports: `status`, `snapped`, diagnostics | exactly as scripted |
| G8 | Real-clock frame | p95 ≤ 2 ms; no > 8 ms frame after the commit frame |
| G13 | Exact reads | commit ≤ 2N rects and 2N pairs; steady frames zero |

Cost gates:

| ID | Metric | Gate |
|---|---|---|
| G9 | Commit (capture + flush) ≤ 2× required-work floor | 1,000 participants, unscrolled and scrolled 1.5 viewports; median of 5 per-run ratios ≤ 2 |
| G10 | Steady frame at 300 nested movers | p95 of 600 samples ≤ 2 ms |
| G11 | Sustained 60 Hz commits, 300 moving participants, 5 s | p95 of every frame sample in the window ≤ 2 ms |
| G12 | Held frame ≤ 0.1 ms per held element | **pending: P4** (the drive seam is not in this base tree) |
| G14 | Fingerprint | mismatch makes cost advisory; frame gates still decide |

`G12` is not fabricated. The report marks the S-BULK held shape as pending P4;
S-REORDER and S-SHEET are pending P4 for the same reason.

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
No production solver, `physics`, `solve`, `plan` or timing code is imported.

## Required-work floor and its audit

The S-BULK cost page builds the same 1,000-participant DOM twice, in the same
process: the engine fixture and the floor fixture. Both have 300 movers and the
same written properties. The floor performs:

- **capture**: one `getBoundingClientRect()` and one `offsetWidth`/
  `offsetHeight` pair per participant (§4.1 item 1);
- the same scene mutation;
- **flush**: the same 1,000 rects and 1,000 layout-size pairs (§4.3 step 2);
- **poses**: one `translate` + one `scale` declaration per mover (the t = 0
  pose of §4.3 step 4). Every measured commit starts from rest
  (`group.finish()` between samples), so the engine and floor write exactly the
  same pose set.

The audit is structural, not a claim: the page instruments
`getBoundingClientRect`, the `offsetWidth`/`offsetHeight` getters and
`CSSStyleDeclaration.setProperty` for one unmeasured floor commit. It checks
2N rects, 2N offset pairs and M pose declarations before the floor may be used.
It also instruments one engine commit and checks the engine's 2N rects, 2N
pairs and M poses. The report contains the counts and the audit result.
A floor that over-counts reads is a harness failure; `floor-extra-read` is the
negative control that proves the audit catches it.

The run statistic is `median(engine commit) / median(floor commit)`; the gate is
the median of the five measured per-run ratios. Engine and floor use the same
warm-up (5 discarded), sample count (30) and protocol, in the same process.

## Measurement and aggregation

- `g` is measured over 1,000 consecutive `performance.now()` reads. WebKit's
  clock ticks at 1 ms and the reads can finish inside one tick; the harness
  observes the next tick and records `g = 1 ms` instead of an optimistic zero.
  If `g > 0.05 ms`, a frame sample is the mean of 20 consecutive frames timed
  as one interval (§11.5).
- A frame sample is the sum of every rAF callback in one animation frame
  (same timestamp). A commit in a task between frames marks the next frame and
  its measured commit script time is charged to that frame sample; a commit
  inside a callback marks that callback's frame. The sustained gate therefore
  measures the whole main-thread frame cost, including the 60 Hz commits, not
  only the rAF callbacks.
- Percentiles are nearest-rank. A gate's value is the median of the five
  per-run statistics; the per-run values and pass/fail are always printed.
  G5 and G8 additionally require every run to pass the pose/long-frame part,
  because a median must not hide a leftover pose or a single long frame.
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
deciding evidence.

## Negative controls

The self-tests in `oracle.test.ts`/`scoring.test.ts` feed deliberately broken
traces and assert each gate fails:

| Control | Metric that must fail |
|---|---|
| 0.1 px offset | G1 (and spring fidelity G4 when the track is a spring) |
| 0.1 px first-frame jump | G2 |
| retarget starting from rest | G3 (plan velocity override; the observed jump also fails G1) |
| 0.1 px spring displacement | G4 |
| 0.02 px settle shift + leftover pose | G5 |
| leftover `border-radius` | G6 |
| wrong status / wrong snapped set | G7 |
| 9 ms frame after a commit / high p95 | G8 |
| floor with an extra read, ratio > 2 | G9 / floor audit |
| p95 > 2 ms | G10 |
| sustained p95 > 2 ms | G11 |
| 0.11 ms per held element | G12 (metric function; the browser shape is pending P4) |
| extra rect / steady-frame read | G13 |
| load or build mismatch | G14 advisory (not a frame gate) |
| broken opacity, coverage, radius, inert, font | shape checks |

Browser controls are run by `--check`, once per engine, through the real page:

- S-CARD: remove the image pair's shared id; remove the follower's `inert`;
  force a 0.1 px image translate.
- S-SEG: restart the second track from rest; start it from A instead of the
  presented box; leave a 0.05 px pose after settle.
- S-BULK: run the floor with an extra `getBoundingClientRect()`.

Each control must fail its target; a control that unexpectedly passes makes
`--check` exit `1`.

## P5a scope and known limitations

- Implemented calibration scenes: **S-CARD** (7 participants, nested shared
  ids, radius 20 → 0, open/close/reverse at 224 ms) and **S-SEG** (one pill,
  four taps 80 ms apart, moving retargets).
- `S-BULK` runs the §11.5 cost shapes only; its manual-clock frame scoring is
  not part of P5a. The held shape G12 and the S-REORDER/S-SHEET scenes are
  **pending P4**.
- The base tree is P3a. P3b's crossfade-follower `inert` is not present, so
  S-CARD's `shape.inert` fails in both engines (261 frame violations). This is
  recorded honestly in the iteration log; the `card-no-inert` control also
  fails it. The metric is not removed or weakened.
- Playwright's WebKit does not expose `crossOriginIsolated` on this build even
  with the COOP/COEP headers present; `g` is 1 ms and the 20-frame sampler
  applies. Chromium is cross-origin isolated. This is recorded as an engine
  note in the report and is a cost-evidence risk, not a frame-gate waiver.
- Firefox 1490 times out on launch on this macOS 27 instrument; it is advisory
  (D9 exception) and the report records the launch error.
- The DPR 1/2/3 sweep, the reduced-motion variants, S-PHOTO and the other P2
  scenes are P5b work. P5a does not claim them.
- G3's deciding pair is the analytic new-track velocity at the retarget against
  the previous track's analytic velocity (A-11). The engine's actual continuity
  is established by G1 at the retarget frame and the next frame; the observed
  finite difference is supporting evidence. The scene plan supplies the
  retarget; a plan-level velocity override is the negative control.
- G13 counts the exact required reads of a commit as `N_capture + N_flush`
  rects and pairs (for S-CARD the open commit captures 3 and flushes 7). The
  scene-spec table's simplified "7 + 7" assumes both sides are mounted; the
  authority's §4.1/§4.3 behaviour is used instead.
- The cost G9 commits are from rest (finish between samples) so the floor and
  engine write the same t=0 pose set. This is the strict reading of the floor
  audit's "same written properties"; it is a scene contribution, not a gate
  change.

## Files

| Path | Purpose |
|---|---|
| `run.ts` | CLI, engines, request interception, runs, aggregation, report |
| `fingerprint.ts` | §11.5 fingerprint and advisory rule |
| `oracle.ts`, `oracle.test.ts` | independent closed-form/RK4 oracle and unit tests |
| `stats.ts` | nearest-rank percentiles, median, `g`, 20-frame sampling |
| `scoring.ts`, `scoring.test.ts` | per-frame gates, worst frame/participant, shape, negative controls |
| `gates.ts` | cost gates and floor audit |
| `scene_plans.ts` | scripted geometry/motion data for the oracle |
| `bundle.ts` | esbuild page bundle and viewable HTML |
| `page/` | page-side recorder, S-CARD, S-SEG, S-BULK cost shapes |
| `ITERATIONS.md` | iteration 0 evidence and root-cause hypotheses |
| `iteration-0/` | the two full iteration-0 report JSONs (Chromium, WebKit) |
