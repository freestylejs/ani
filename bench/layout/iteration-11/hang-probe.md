# H21 hang probe — Chromium, one measured run (timeout harness)

Command:

```
node bench/layout/run.ts --engine chromium --runs 1 \
  --out bench/layout/results/hang-probe-chromium.json
```

Artifacts: `hang-probe-chromium.json`, `hang-probe-chromium.log`.

## Provenance

The process loaded the working tree at `d24bff0` (H20 engine `45958bd` plus the
H21 timeout/progress harness). The report's `sourceRevision` field says
`b5f47cc` because the pre-existing code resolved `git rev-parse HEAD` when the
report was written, after this worktree had merged H17f. That late resolution
is a provenance bug and is fixed separately: `sourceRevision` is now captured
before the first browser launch. This probe is **not** the H17f measurement and
is not the final certification run.

This was a scene/variant isolation probe, not `--check` and not five runs: there
are no negative controls, only Chromium, and one measured run. It cannot
certify anything.

## What completed

- All 11 primary scenes pass: S-CARD, S-SEG, S-PHOTO, S-STACK, S-ISLAND,
  S-ACC, S-INSERT, S-DELETE, S-REORDER, S-SHEET, S-BULK.
- All 23 support variants pass (DPR 1/3 and reduced-motion `jump`/`maxDuration`/
  `ignore` for the H19 scenes).
- Cost: G9 unscrolled 1.876×, G9 scrolled 1.876×, G10 0.460 ms, G12 −0.120/
  −0.007 ms/held, G13/G13-held/floor audits exact. G11 is **2.461× FAIL**
  (median of one run; cost is advisory at load 8.64). No gate, tolerance,
  scene or oracle was changed.

## Hang evidence

Every stage in the log is a synchronously flushed progress line. No operation
hit a timeout: the probe completed without a failed scene or a browser kill.

The log shows the two long silent phases the old harness could not report:

- warm-up: last browser teardown at +249.0 s, run log written at +363.8 s —
  114.8 s of CPU-bound oracle scoring with no browser open;
- measured run: teardown at +607.8 s, run log at +715.2 s — 107.4 s of the
  same scoring.

A concurrently running unmodified H20 full bench was sampled at ~95–107 % CPU
while its redirected log stayed at 0 bytes for minutes; the sample stack was
inside `scoreScene` numeric spring evaluation (`springSettle` /
`springDisplacement`, `Math.exp`/`sin`/`cos`), not blocked on Playwright. The
old runner emitted no progress during negative controls or scoring, and its
queued `process.stdout.write` output could not flush while the event loop was
blocked. That is the observed "hang": a long, silent, finite scoring phase,
often after all browsers had closed. No engine infinite loop or Playwright
leak reproduced; the timeout harness now bounds every browser operation and
flushes progress before each scene, variant, scoring stage and teardown.

The final Chromium+WebKit five-run `--check` report is pending the H22 engine
fix; this file will be superseded by `iteration-11/report.json` and
`iteration-11/run.log`.
