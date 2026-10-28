# P4 re-review corrective red evidence (2026-10-29)

Base for the "rejected base" runs: `614df06` in a temporary worktree with only the focused
test file copied in. "Iteration red" is the failure seen in this round before the corresponding
fix, with the new row already in place.

- **H13-05R (S1) — failed re-take destroys the old landing.** Base focused row:
  `failed re-take keeps landing: expected "released", received "invalidated"`. The old landing
  was settled/invalidated before the support/reparent precondition threw. After the fix the old
  handle stays `released`, `stats.holds` is unchanged (1 for the rotation row, 2 for the
  ancestor+landing reparent row), and the drawn origin/pose is unchanged.
- **H13-05R2 — post-take box is A, not B.** Iteration red:
  `re-take writes B in the same task: 60 is not within 0.5 of 0`. The old landing restored and
  the new hold's t = 0 pose was not written in the same task.
- **H13-02R — stale A on a supported re-layout.** Base focused flush row:
  `flush 1.5 px landing width on the new A (got 80.08003234863281)`. The held size was adopted
  but the release/landing target stayed the old 80 px A; the row now samples the drawn width just
  before the landing finishes and also asserts the final layout box for 0.4/0.5/1.5/6 px.
  The no-flush take-read path already adopted the drawn size on base, so it is covered separately
  (take-read and parented take-read rows) rather than claimed as a base red.
- **H13-08R — anchored child cannot distinguish the fix.** No-anchor control:
  `anchored child stays on the drawn parent anchor: final rel 61.60, range 29.54..64.34`.
  The anchored row holds 29.54..80.00 and ends at 80.00 after a held flush that changes the
  parent's A and width. The anchor DX/DY correction and keeping an ended anchored residual on
  the drawn parent anchor are what separate the two.
- **H13-10R — stale descendant residual under jump.** Base focused row:
  `jump flush residual rel -40.45899963378906` (expected 80). A jump-policy flush now settles
  the child residual at its own A, the child keeps riding h, and a release lands it at layout.
  The release that finds no reduced-motion fit now emits the typed `reduced-no-fit` diagnostic
  in addition to the `released` + A jump.
- **H13-12R — self-referential residual allowance.** The old 200 px/s check compared the
  measured child velocity to `childV − handle.velocity`. It is replaced by an independent
  residual oracle built from the child's B→A track and `v = child − parent`; the row checks
  position against the oracle every frame (0.0000 px) and frame-to-frame velocity against the
  oracle (0.0 px/s, 20 px/s bound). Raw/once/double controls assert the residual is neither the
  raw child rate nor the double subtraction. No evidence-only label is needed.
- **H13-15R — release origin.** The caught-card release now checks its origin against an
  independent release track oracle for several frames with the supplied `v`, and asserts the
  nonzero take velocity is not added to the release origin.
- **H13-11 / H13-16 / H13-23 quick S3.** Descendant animated-owned probe row added; fault rows
  now assert the clock subscription, marker/pending and listener removal directly; the cap row
  asserts `onSnap` lists the held node and rider as `'capped'`; docs cover `useLayoutDrive`
  routing, `pointercancel`/`lostpointercapture` → `cancel()`, and the 180° support residual risk.
