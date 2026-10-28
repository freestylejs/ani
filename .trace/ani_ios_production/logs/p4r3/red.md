# Focused P4 fix evidence (2026-10-29, after 8f5831b)

- **H13-12S (S2) — trackless static child under an ancestor pose track.** Pre-fix row:
  `trackless child carries ancestor origin vx: 0 is not within 2 of -249.9999999997726`.
  The row uses fixed `left`/`top`/width, so the parent width/height track does not move the
  child's A; it is counter-projected and has no own track. After the fix `take` reports the
  nearest animating participant ancestor's drawn origin velocity (`-250.0, -250.0` px/s in the
  row; the independent parent track oracle is the same). The child A is unchanged across the
  flush. The existing `left: 50%` row is now labelled "reflowing child" because its A moves.
- **H13-10R capture-less jump.** Pre-fix row:
  `capture-less jump settles the residual at A: 34.17388916015625 is not within 1 of 80`.
  A flush under `'jump'` with no fresh capture now settles a stale descendant residual at its
  own A (the rider still rides h); release lands it at layout.
- **H13-05 retake write fault.** Pre-fix row:
  `retake fault does not throw: expected false, received true`. The re-take's same-task restores
  and t = 0 pose write now run inside `frameBoundary`; a write fault aborts cleanly, returns a
  terminal handle, restores byte-identically, and leaves no clock/marker.
- **H13-02R pure position re-layout (S3).** The held read now distinguishes a layout position
  change from a camera shift using the element's layout offset: the new A is adopted, the held
  origin stays at H, and release lands on the new position. The row asserts the held origin and
  the early release position against an independent release oracle, then the final layout box.
  It passed before the explicit offset branch as well, so it is a coverage/evidence row rather
  than a claimed failing-before fix.
- **Quick S3.** Removed the leftover `console.log('anchor', …)`; docs now state `useLayoutDrive`
  routing, `pointercancel`/`lostpointercapture` → `cancel()`, and that dispose/abort/kill switch
  remove the scope's scroll listeners and clock subscription.
