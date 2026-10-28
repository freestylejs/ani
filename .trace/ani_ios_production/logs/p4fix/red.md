# H13 corrective-round red evidence (2026-10-29)

These are the failures observed before each fix, on `1af06e4` where marked "rejected base" (a
temporary worktree at that commit with only the new test files copied in), or during the fix
iteration where the test was added before the code change.

- **H13-01 cancel + descendants** — rejected base, `layout_drive:L_DRIVE_FIX`:
  `cancel keeps descendants riding h: 60 is not within 0.5 of 0`.
- **H13-02 size tolerance** — iteration before the one-tolerance release check:
  `delta 0.5: released, not invalidated: expected "released", received "invalidated"`; a 1.5 px
  re-layout also invalidated instead of continuing the hold.
- **H13-03 landing + size flush** — iteration before the separate release clock/target:
  `landing size flush origin x: 63.477... is not within 0.5 of 60` and
  `landing + size flush unsubscribes: expected 0, received 1` (the release was replayed/aimed at
  the old A and the clock never stopped).
- **H13-04 StrictMode row** — iteration after adding the ref-call counter but before
  `StrictDriveCard` registered `cardRef`:
  `same-task detach/re-attach reached the ref: expected 2, received 0`.
- **H13-05 landing re-take** — rejected base, focused row:
  `[ANI_INVALID_OPTIONS] take: the element is already held or landing.`
- **H13-06 follower rejection** — rejected base, `react_layout:RL_DRIVE_FOLLOWER`:
  `drive-rejected diagnostic: expected true, received false` (the throw existed; the typed
  diagnostic did not).
- **H13-07 static hold kill switch** — rejected base, `layout_drive:L_DRIVE_4`:
  `static hold kill switch reports runtime-disabled: expected true, received false`.
- **H13-10 reduced no-fit release** — rejected base, `layout_drive:L_DRIVE_5`:
  `reduced no-fit is released: expected "released", received "invalidated"`.
- **H13-11 running CSS animation at take** — rejected base, `layout_drive:L_DRIVE_EDGES`:
  `animated take: did not throw` (the empty animated set missed it).
- **H13-23 mover cap with holds** — rejected base, focused row: the flush timed out at the 10 s
  case limit; the base did not cap the held subtree and the hold kept the clock.
- **H13-09 kept-timeline child** — the row is new; before the `posed`/follower `includesH` guard
  the child received `h` twice (the relative shift is `h`, here 40 px, outside the row's 25 px
  allowance).
- **H13-12 at-take subtraction** — the moving-parent row is new; before the corrective round it
  took at rest, so the `v − ḣ` subtraction had no frame-level evidence.
- **H13-13/14/15/16 evidence** — the new policy-change, no-catch supported-scale, release-origin
  and fault/implicit rows are new; the prior rows either stopped at the first branch or used
  try/catch.
