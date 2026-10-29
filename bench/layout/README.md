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
# S-CARD, S-SEG and the S-BULK cost shapes, in Chromium and WebKit
pnpm bench:layout

# what the checkpoint reviews: the same run plus all seven self-test files and
# every browser negative control
pnpm bench:layout --check

# one engine / one scene while iterating
pnpm bench:layout --engine chromium --scene s-card --runs 1
pnpm bench:layout --engine webkit --scene s-seg --runs 1
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
`--scene` accepts `s-card`, `s-seg`, `cost` and globs. `--runs` is the number of
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
    "load1": 2.39013671875
  },
  "advisory": { "cost": true, "reasons": ["1-minute load is 2.39, pinned below 1"] },
  "certification": {
    "certified": false,
    "reasons": ["cost fingerprint is advisory", "pending S-REORDER: P4", "pending S-BULK: P4", "chromium S-BULK G9-unscrolled 3.252 failed", "chromium S-BULK G11 12.345 failed", "webkit S-BULK cost blocked"],
    "requiredEngines": ["chromium", "webkit"],
    "requiredRuns": 5,
    "requiredScenes": ["s-card", "s-seg", "cost"]
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
        "scene": "S-BULK", "status": "pending", "pending": "P4 (held shape G12; take/move/release not in the base tree)",
        "pass": false, "valid": true, "blockedReasons": [],
        "runs": [ /* engineAudit/floorAudit counts, medians, ratios, gSource */ ],
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
  "selfTests": { "pass": true, "controls": ["negative control G1: ..."],
                 "files": ["oracle.test.ts", "scoring.test.ts", "stats.test.ts",
                           "frame_sampler.test.ts", "aggregate.test.ts",
                           "certification.test.ts", "cost_validity.test.ts"],
                 "detail": "..." },
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
| G12 | Held frame ≤ 0.1 ms per held element | **pending: P4** (the drive seam is not in this base tree); while pending, pass is false |
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
deciding evidence. WebKit cannot be measured validly for G9/G10/G11 with its
1 ms timer: those metrics are `BLOCK`/non-deciding, the raw ratios are
diagnostic, and certification is `NOT CERTIFIED` with that exact reason. No
quantized WebKit ratio is reported as a measured failure.

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
| 0.11 ms per held element | G12 (metric function; the browser shape is pending P4) |
| extra rect / steady-frame read | G13 |
| load or build mismatch | G14 advisory (not a frame gate) |
| broken opacity, coverage, radius, inert, focus, font | shape checks |

Browser controls are run by `--check`, once per engine, through the real page:

- S-CARD: remove the image pair's shared id; remove the follower's `inert`;
  focus the follower directly; force a 0.1 px image translate.
- S-SEG: restart the second track from rest; start it from A instead of the
  presented box; leave a 0.05 px pose after settle.
- S-BULK: run the floor with an extra `getBoundingClientRect()`.

Each conclusive control must fail its target; a control that unexpectedly
passes makes `--check` exit `1`. On the P3-final base `card-no-inert` and
`card-focus-follower` are both conclusive and fail their targets. `shape.teardown`,
`shape.pill-radius`, C1 (no-mount trace), G12 and G14 have unit controls rather
than browser controls; the mapping is one control per deciding metric.
`G9.probe` is non-deciding evidence and has no gate control by design.

## P5a scope, certification result and known limitations

- Implemented calibration scenes: **S-CARD** and **S-SEG**; **S-BULK** runs the
  §11.5/A-19 cost shapes only (850 tiles + 150 labels = 1,000 participants,
  300 movers; 1,000-participant cost, 300 nested movers for G10 and 60 Hz
  commits for G11).
- `S-REORDER`, `S-SHEET` and the S-BULK held shape G12 are **pending P4**.
  They are reported as pending; `pass` is invocation-scoped and `certification`
  is `NOT CERTIFIED`. While the selected cost scene is pending, the invocation
  also fails (H14-13).
- The base is P3 final `46b1487` (H12/P3b included). S-CARD's `shape.inert` and
  removed-follower G6 check now **pass** in both engines, and `card-no-inert`
  is conclusive.
- **Certification on the iteration-2 report is NOT CERTIFIED / BLOCK.** Reasons:
  the advisory cost fingerprint; pending S-REORDER/S-SHEET/S-BULK G12; measured
  Chromium G9 unscrolled 3.252×, G9 scrolled 3.284× and G11 12.345 ms failures;
  WebKit S-BULK is blocked because its 1 ms timer makes G9/G10/G11
  non-deciding. No threshold was changed.
- **Iteration 3 (H17) moves the Chromium commit gate to pass and leaves G11
  structural.** Five-run medians are G9 1.904× unscrolled and 1.949× scrolled
  (floor 2.81–3.00 ms; exact audits; zero steady reads), G10 0.950 ms, G13
  exact. G11 is 8.190 ms; the audited floor itself is 2.81–3.00 ms per commit
  and a direct 300-commit floor run measured p95 3.215 ms, so the absolute
  2 ms sustained ceiling is below the required work. A floor-relative owner
  amendment is proposed in
  `.trace/ani_ios_production/evidence/h17/g11_floor_amendment_proposal.md`; it
  is not applied and G11 is not claimed as a pass. The Chromium cost values are
  advisory on this host (load 2.48), so certification still requires a quiet
  run. See `ITERATIONS.md` iteration 3.
- Chromium G9 is measured with the audited floor including §4.3 computed reads;
  Chromium G11 is measured per 60 Hz commit, and its five measured cadences are
  59.44–60.00 Hz. The cost values are advisory on this host because the
  1-minute load is 2.39.
- Once P4 lands and `heldPending` is false, a valid all-green cost run takes the
  `'pass'` path (`cost_validity.test.ts`); a measured failure takes `'fail'`.
  A cadence or timer invalid run stays `'blocked'`.
- Firefox 1490 times out on launch on this macOS 27 instrument; it is advisory
  and its build is never part of a Chromium/WebKit fingerprint decision.
- DPR 1/2/3, reduced-motion variants, S-PHOTO and the other P2 scenes are P5b.
- S-CARD visual contributions/deviation: the sheet content is registered in a
  hidden non-participant sheet from rest so the open capture has a valid B and
  the engine does not emit an avoidable `stale`; the sheet surface/image/title
  join at open and hand off from the card pair. The close starts one settled
  frame after the open report. The lead/follower z-order is explicit rather
  than DOM-order-only. The real twin uses CSS opacity transitions for the
  author content layer while the manual run advances its JS timeline; the
  layout tracks and scored geometry use the same script times. These are scene
  contributions, not gate changes.
- G3's deciding pair is analytic (A-11); the observed finite difference is
  supporting evidence and can be large for a correct spring because it includes
  one frame of acceleration. G1 decides actual continuity.
- G13 uses an exact per-engine accepted count: radius capture + active flush,
  plus the Typed OM origin on WebKit. S-CARD is open 8/15, close 8/15,
  reverse 9/16 (Chromium/WebKit); S-SEG is 2/3 at each tap. This is the
  §4.1/§4.3 set, not an unlimited style budget.
- The per-scene G9 probe at N=7 and N=1 is a generic engine/floor probe and is
  explicitly non-deciding; the named gate is S-BULK at 1,000.

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
| `page/` | page-side recorder, S-CARD, S-SEG, S-BULK cost shapes |
| `ITERATIONS.md` | iteration 0/1/2 evidence and root-cause hypotheses |
| `iteration-0/` | historical iteration-0 reports (old base) |
| `iteration-1/` | fixed-H11b iteration-1 reports |
| `iteration-2/` | P3-final iteration-2 reports (current) |
