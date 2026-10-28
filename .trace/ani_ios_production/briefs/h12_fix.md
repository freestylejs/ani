# H12 fix round — inert, focus and fuzz evidence (2026-10-29)

Independent review of `7042545..7699583` found no S0 but three S1 defects and a set of evidence
defects. H12 is **blocked** until these are fixed on top of the fixed H11b transaction.

## Must fix (S1)

### H12-01 — pending `inert` set survives release

`assertInert` queues `inert=""` when the author removes it. If the same flush reverses the follower,
drops it for focus, or settles it, `releaseInert` reads the current DOM (still absent),
`inertMatches` returns true, clears ownership and skips the remove. The queued `inert=""` then lands
on the new lead or a settled node, leaving it permanently inert and losing the author's removal.

Fix: `releaseInert` must queue the saved restore unconditionally (remove when saved absent, restore
the saved value when present), letting `queueAttribute` last-wins replace the pending set. Do not
clear the ownership record until the restore is committed. Add reversal/focus-skip/settle tests
where the author removes `inert` in the same commit.

### H12-02 — abort loses a queued inert restore after a follower drop

`abort` clears `pendingAttributes` and only calls `releaseInert` for drives still in `registry`.
A drive settled earlier in the flush has `p.drive === null` and `d.inert === null`; its queued
remove is discarded, so layout's `inert` remains after a `'failed'` flush. This is the
fault-after-follower-drop case; coordinate with the H11b fix that retains transactional saved
declarations.

Fix: keep the authored inert record (and pending restore) independently of `p.drive`/`d.inert`
until it lands, or drain queued restores in `abort` while dropping only queued **sets**. Add:
reversal/focus skip followed by an injected `write` fault in the same flush; assert `inert` and
styles byte-identical.

### H12-03 — focus-skipped new lead that is a held old follower is never activated

After a fade ends, the old follower is `kind: 'held'`, opacity 0, inert. On a focus-skip reversal,
`dropCrossfade` returns because `d.fade === null`; `noMotion` under an animating participant ancestor
returns `STATIC`; `case 'static'` returns for `d.kind === 'held'`. The new lead stays at opacity 0,
inert, at the follower pose rather than A. The normal held reversal under a moving ancestor hits the
same early return.

Fix: handle `d.kind === 'held'` in `dropCrossfade` (restore opacity/pose/inert, or settle the held
node that is now a lead), and make `case 'static'` settle a held node when it is no longer exiting.
Add a test that runs the fade to completion before the reversal/focus skip, under an animating
participant ancestor.

## Must fix (S2 evidence/accessibility)

- **H12-04**: `assertInert` runs before the focus chain; a continuing follower with author-removed
  `inert` and focus inside is re-inerted and blurs. Compute focus containment first; release or
  report. Add a continuing-follower + author-removal + focus test.
- **H12-05**: nested closed shadow roots are not traversed; `roots` tracks only the immediate root.
  Track shadow-including ancestor roots and add a nested-closed-root L-A11Y-1 case. If the literal
  `document.activeElement` reading is kept, record an authority ruling.
- **H12-07/08**: the fuzz B property is vacuous (any historical capture of any node, presented box,
  one branch, no `snapped`). Per node, derive B from the current flush: own fresh capture; lead's
  capture for a follow; departing/retained capture for a handoff; allow only that or a reported
  snapped reason. Add a real stale/predicted-B negative control.
- **H12-09**: the `crossDocument` carve-out resets `writes=0` on every read. Scope the exemption to
  writes whose `element.ownerDocument !== captureDocument`; keep all other reads checked.
- **H12-10**: "one writer per property" is not checked. Count writers per element/property/batch or
  stop claiming it.
- **H12-11**: injected faults, kill switch and reduced motion are not asserted. Per event require the
  exact status, `snapped`, diagnostic and byte-identical styles/inert.
- **H12-12**: the fuzz scroll events cannot exercise `handoff-scroll-active` (card and lead are not
  in the scroller relationship). Put the exiting card inside the scroller and the new lead outside;
  assert the degradation and diagnostic.
- **H12-14**: the "MUTATION" rows are synthetic negative controls, not mutations. Label them or derive
  the mutant from a real engine run at the observation boundary. The brief's "each mutant fails its
  named row" is not met by fabricated objects.
- **H12-15**: row naming: M4 is not L-MEAS-11; M7 is not a spring release and `dt` is P4/L-DRIVE-1;
  M5 WebKit does not call `expectMutation`; M3's mutant is neither measured −100 nor predicted −50.
  Rename/retarget or defer to P4 with C3.
- **H12-17**: CAPS_STATUS never includes a crossfade follower in the over-cap/capped+fault cases.
  Add one and assert inert/opacity/pose after abort.
- **H12-18/24**: README says "held re-render" and docs claim byte-exact abort/focus behavior that
  H12-01/02/04 currently falsify. Correct the docs after the code; mark drive-hold as P4.

## S3 polish

H12-06 (focus walk mutates chain roots; pass a copy), H12-13 (intermediate cleanup/style checks),
H12-16 (WebKit no-scrollend fallback vs §3.1; record exception), H12-19 (unit closed-root host vs
inside), H12-20 (exact diagnostic count + lead at A), H12-21 (authored inert 2×4 matrix),
H12-22 (FUZZ seed/event log in error), H12-23 (unbounded shadow walk with cycle guard).

## Authority rulings to apply

- **C5** (already added): a focus-skipped follower is not made inert.
- **C6** (already added): read-after-write is per document; a same-document restore must still be
  deferred.
- **C3**: drive-hold is P4; P3 L-A11Y-1 uses a re-render during a track or a presence/crossfade
  hold, not a drive hold.
- Ambiguities 2/3 (presence-opacity vs focus, reversal pop): choose the strict §8 reading and
  document; do not weaken L-A11Y-1.
- `focus-in-follower` payload: follower element, action `none`; keep and assert exactly.

## Order of work

1. Wait for the fixed H11b transaction to land, then rebase `helper/h12` onto it.
2. Re-run the S1 reproductions first; fix H12-01/02/03.
3. Fix H12-04/05, then the fuzz/mutation evidence.
4. Re-run unit, typecheck, biome, and the browser modules in Chromium/WebKit.
5. Commit plain messages; no push.

Gate: all S1/S2 fixed; fuzz/mutation claims match what the code actually checks; no tolerance or
row weakened; no `knownFailure`; final reply maps each H12 ID to its failing-before test and result.
