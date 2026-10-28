# J-001 S1 red evidence (2026-10-29, after 6c75b63)

- **Kill switch on a released landing.** Failing-before row:
  `released landing kill switch invalidates: expected "invalidated", received "released"`.
  `finishAll('disabled')` called `invalidateHold`, but it only changed `held` to `invalidated`;
  a live `released` landing kept its old public state while being cleared.
- **Abort during a released landing.** Failing-before row:
  `released abort invalidates the handle: expected "invalidated", received "released"`.
  The transactional abort had the same guard.
- **Cancelled landings.** The same shared `invalidateHold` path is used for `cancelled`; the new
  rows cover both terminal landing states. Both now assert the handle `invalidated`, `stats.holds`
  zero, byte-identical authored styles, clock/marker cleanup, and `runtime-disabled` (kill switch)
  or `internal-error` (abort). Listener removal is asserted with a wrapped
  `document.removeEventListener` count.
- **Normal completion control.** New rows assert a naturally finished `released`/`cancelled`
  landing keeps its terminal state and clears `stats.holds`; `finishHold` never calls
  `invalidateHold`, so there is no double invalidation.
- **Listener cleanup/resume.** The kill switch now disarms scroll listeners and `setMode('animate')`
  re-arms them through `RuntimeScope.resume()`. Without the resume hook, `layout_ops:FUZZ`
  reproduced `seed 173: event 8 (0.763): handoff-scroll-active drew motion`; after the hook the
  fuzz passes and a later handoff still sees an active scroll.
