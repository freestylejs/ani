# H13 fix round — P4 drive correctness and evidence (2026-10-29)

Independent review of `f5dfc22..1af06e4` rejects P4 at `1af06e4`. The implementation is a credible
first cut and the green counts are real, but four S1 defects are user-visible and several S2 rows
do not prove the claim. Fix before merge.

## S1 — must fix

1. **H13-01 cancel loses descendants.** `solveNodes` sets `ride = -1` unless the hold is `held` or
   `released`; `cancelled` is treated as live by `step` but descendants lose `h` immediately.
   Include `cancelled` in the ride condition (`isLiveHold`) or normalize cancel to a zero release.
   Add take→move→cancel with a child row.
2. **H13-02 size tolerances wedge the realizer.** Flush re-plan uses `>= threshold` (default 1 px),
   held read rejects only `> 0.5 px`, landing finish uses `<= 0.01 px`. A 0.01–1 px size change
   while held freezes `sizeW/H`/`sizeTarget`, so release can never finish and the clock runs
   forever; an unflushed >0.5 px resize ends a supported hold. Use one hold-specific size
   tolerance, apply/record measurable deltas, snap below-threshold state. Add 0.4/0.5/1.5 px rows
   and assert clock unsubscription.
3. **H13-03 landing + size flush replays/hangs.** The size/options branch shares `d.elapsed`,
   `d.target`, `d.track` with the release origin; a flush while landing can reset the release to
   the release point or leave it aimed at the old A. Separate size-continuation clock/target from
   release-origin clock/target; never reset `d.elapsed`/`d.target` for the release from the size
   branch. Add landing+size-change row.
4. **H13-04 StrictMode row is vacuous.** `StrictDriveCard` never assigns `cardRef.current`; each
   browser case is a fresh page, so the manual null/reattach calls do nothing. Register the ref and
   actually detach/reattach in the same task; assert `stats.holds`, clock subscription, H. Add a
   real React adapter test.

## S2 — fix or decide

- **H13-05 landing re-take.** Define re-take semantics: settle the old landing at its current drawn
  box and start a new hold (native catch/regrab), or reject. Prefer re-take; add a row.
- **H13-06 follower rejection.** `take` rejects `'follow'`/`'held'` followers; §5.10 does not list
  this. Either remove or add an explicit precondition/diagnostic. Prefer reject during an exiting
  crossfade (inert duplicate), documented as a P4 clarification.
- **H13-07 kill-switch static hold.** A hold taken at rest (`d.kind === 'static'`) is invalidated
  silently; emit `runtime-disabled`, include it in `onSnap`/snap, explicit and implicit scopes.
- **H13-08 anchored descendants.** `planResidual` passes `null` anchor; preserve `layoutAnchor` or
  re-express in the anchor frame; add anchored-child row.
- **H13-09 double h for followers/posed.** `ride` h is added to boxes whose `boxAt` already
  includes the parent/lead map; follower/posed child gets `2h`. Add h only in residual space or
  skip/clear for followers; add follower/kept-timeline child rows.
- **H13-10 reduced-motion landing.** `'jump'` leaves stale residual tracks; policy change while
  landing only touches size; a release `createTrack` refusal invalidates instead of a reduced jump.
  Settle residuals at A under jump, re-plan release on policy change, map reduced no-fit to
  `released`+reduced (or documented outcome), emit `spring-timeout` on refusal. Add rows.
- **H13-11 running CSS animations.** `take`/`measureGeometry` pass an empty animated set, so a
  running CSS animation on owned properties is not detected. Pass `animatedOwned(doc)`/probe.
- **H13-12/13/14/15 evidence.** L-DRIVE-6 takes at rest, so at-take subtraction is untested; the
  policy-change block starts under `'ignore'` and never changes effective policy; the supported
  ancestor-scale take is try/catch; the landing re-expression checks only final A; L-DRIVE-2 never
  checks release origin. Add moving-parent take residual/velocity, real policy change, no-catch
  supported scale, first-frame landing continuity, caught-card release origin.
- **H13-16 held fault/abort + implicit kill switch.** Add injected measure/write fault while a
  hold is live: styles byte-identical, `stats.holds=0`, clock 0, marker/listener cleanup,
  `internal-error`; add implicit-scope kill switch.
- **H13-23 mover cap with holds.** Decide whether held nodes/riders are visible movers for
  `maxNodes`; prefer count + capped/invalidate behavior; add cap+hold row.

## Authority clarifications to record

- Landing re-take semantics (prefer settle current drawn box + new hold).
- Follower rejection during an exiting crossfade is explicit and diagnostic.
- `stats.holds` means every live hold (`held`/`released`/`cancelled`) or document the narrower
  meaning.
- Held nodes/riders count as visible movers for `maxNodes`.
- WAAPI + snap precedence: kill switch wins; `take` returns invalidated.
- Cross-scope nested holds: document same-scope limitation or implement a global check.
- Held-read support: use the animated-owned probe; a box-preserving rotation/zoom must be
  classified or explicitly accepted.
- Reduced no-fit release: choose `released` + reduced, not invalidation.
- Take after an unflushed layout: use the take reads or diagnose; document.
- Ancestor-carried take velocity and L-DRIVE-3 scope.

## S3

H13-17 size freeze with kept timeline; H13-18 sizeStarted; H13-19 stale geometry at take;
H13-20 landing invalidation; H13-21 WAAPI/snap precedence; H13-22 dead frame node; H13-24 docs;
H13-25 no-layout-change nonzero spring-back/maxDuration; H13-26 real-time implicit row;
H13-27 L-DRIVE-3 driven child/sticky ancestor; H13-28 drive coverage; H13-29 cross-scope;
H13-30 ignored residual refusal.

## Gate

- Every S1/S2 needs a failing-before test.
- Unit, typecheck, biome 0 errors; Chromium/WebKit full, empty knownFailures; coverage floors.
- L-DRIVE-1..6 + new rows; no tolerance/row weakening; no knownFailure.
- Re-run the P4 logs; no push. Final reply maps each H13 ID to test/result and residual risks.
