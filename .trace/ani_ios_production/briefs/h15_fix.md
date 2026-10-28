# H15 fix round — trustworthy P5b evidence (2026-10-29)

Independent review at `ad060d4` **blocks** H15 as P5b evidence. The scene code is credible WIP; the
report currently has a false scene pass, ignores run failures, omits the new scenes from
certification, and does not enforce exact G13 reads. Fix the evidence before merging.

## S0 — must fix

1. **H15-01** `aggregateScene()` ignores per-run `report.pass`, `problems`, real-twin diagnostics and
   teardown. S-DELETE is FAIL in all six runs in `run.log` but `pass:true`; a `--scene s-delete`
   invocation exits 0. Propagate per-run failures into aggregation; fail the scene if any measured
   run fails. Add a metric-clean-but-problem-carrying run test.
2. **H15-02** `REQUIRED_SCENES` is still `s-card`, `s-seg`, `cost`; the P5b failures are absent from
   certification reasons. Add all P5b scenes to required/certification (or explicitly mark them
   non-certifying), and include every required scene's per-engine status in reasons.

## S1

3. **H15-03** React `record()` returns before `elements.set` when `builder` is null; real-twin
   `final.connected=0` in all runs. Populate elements in real mode or compute from the DOM; add a
   real-twin teardown test.
4. **H15-04** S-DELETE uses authored `left` swipe instead of `transform: translateX`; it changes
   layout outside a commit and avoids the J-027 own-transform division. Use the authored
   `translateX` inner map and verify popLayout divides it out at the presented box. Opacity 0.2 s
   (or record 0.25 in ITERATIONS, not just README).
5. **H15-05** G13 is not exact: rect/pair checks are only `<= nBefore+nAfter`, expected style counts
   are hardcoded/fitted, S-DELETE `delete-2` reads 16 rects vs 18, and a blanket `{rects:4, styles:8}`
   exclusion can hide engine reads. Derive the exact expected set from connected participants and
   §4.1/§4.3; assert exact counts; remove constant exclusions; audit what is subtracted.
6. **H15-06** 28 controls/14 per engine is numerically true, but `photo-no-counter-scale` and
   `acc-separator-1px` are contaminated by the primary G1 failure; no controls for S-INSERT cull,
   S-ISLAND G6, badge scale, per-scene G13. Count a control conclusive only when the primary passes
   the target or compare signatures; isolate mutations; add missing controls.
7. **H15-07** S-ISLAND G6 is a harness false positive: `card-content` is removed with the exiting
   follower and restored by `removeExitedCard()`, but the harness checks its last connected frame
   and only exempts the follower. Exempt descendants removed with a follower or snapshot restoration
   after removal; add a unit test. Reclassify as harness failure.
8. **H15-08** S-INSERT expected three `culled` is a scene/oracle overreach: a mounting row has no B,
   and §9.1 requires both B and A outside the viewport. Expect `[]` or amend the authority with an
   explicit no-B-mount cull rule; do not file an engine fix.

## S2 / S3

- **H15-09** S-STACK badge presence scale is applied to the inner disc but only wrapper rect/opacity
  are scored; make the participant carry the scale or add a shape check/control.
- **H15-10** S-ISLAND `card-content` is registered `layout: true` with a 0.28 s spring; spec requires
  a position wrapper. Register `layout:'position'`/pin, or document/test the contribution; fix README.
- **H15-11** S-PHOTO `setScroll` falls back to a 250 ms timeout; can hide `handoff-scroll-active`.
  Require real `scrollend` or assert no active scroll; fix real-twin capture-less-flush diagnostics.
- S3: inline SVG icons/currentColor; S-ACC spacer arithmetic; README/report G13 numbers and
  popBox claim; biome warnings/unused symbols; S-DELETE presence 0.2; S-ISLAND G6 classification.

## Four failures — reclassify

- **S-PHOTO 306.25 px**: genuine engine late nested handoff defect (keep as evidence for H18).
- **S-ACC 120/55.67 px**: genuine engine counter-projection defect (keep as evidence for H18).
- **S-INSERT `snapped []`**: scene/oracle overreach, not engine; expect `[]` or amend authority.
- **S-ISLAND G6**: harness false failure; fix H15-07, not engine.

## Gate

- `test:bench-layout` all, typecheck, biome 0 errors (remove the 6 warnings).
- Full P2/P3 scene run Chromium/WebKit; iteration 4 report must fail S-PHOTO/S-ACC honestly and
  pass S-CARD/S-SEG/S-STACK/S-DELETE (after fixes) and S-ISLAND (after harness rule), with no
  run-level problem hidden.
- Controls conclusive and isolated; exact G13; no tolerance/row weakening; no engine edits; no push.
