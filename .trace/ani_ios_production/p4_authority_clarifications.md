# P4 authority clarifications — 2026-10-29

These rulings resolve §5.10 ambiguities exposed by the H13 review. They do not weaken a drive row;
the Chief Justice re-judges them with P4.

## P4-C1 — landing re-take

A `take` during a released/cancelled landing settles the old landing at its **current drawn box**
(restoring its styles and invalidating its old handle) and starts a new hold from that box. It does
not throw. This is the native catch/regrab behavior and preserves the finger's continuity. The old
handle becomes `invalidated`; the new handle is `held`.

## P4-C2 — follower rejection

`take` rejects an exiting crossfade follower / invisible `'held'` follower with
`ANI_INVALID_OPTIONS` and a typed dev diagnostic. The internal follower hold is not a drive hold;
the element is being removed and is inert. This precondition is added to the P4 surface, not the
P3 safety surface.

## P4-C3 — `stats.holds`

`stats.holds` counts every **live** drive hold: `held`, `released` and `cancelled` until the hold
finishes or is invalidated. A terminal handle does not count. This matches `isLiveHold`, not only
`state === 'held'`.

## P4-C4 — mover cap

A held node and its riding descendants are **visible movers** for `maxNodes`. A flush that would
exceed the cap invalidates the holds, snaps the scope and reports `'capped'`; the held read stops.
This is consistent with "visible movers per flush" and prevents an unbounded held subtree from
bypassing the cap.

## P4-C5 — WAAPI + kill switch

The kill switch wins over the WAAPI precondition. `take` under `layoutRuntime.mode === 'snap'`
returns an `invalidated` handle with `runtime-disabled`, even on a WAAPI group. The WAAPI-specific
throw applies only in `'animate'` mode.

## P4-C6 — cross-scope nested holds

The ancestor/descendant hold exclusion is **scope-local**. A participant registered in another
scope is outside this scope's hold graph; a cross-scope nested hold is not prevented. This is a
documented limitation of the one-scope-owned hold model, not a silent pass.

## P4-C7 — held-read support

The held read uses the scope's animated-owned probe, not an empty set: a running CSS animation or
transition on `translate`/`scale` in the held subtree invalidates the hold with
`unsupported-geometry`. A box-preserving 180° rotation/zoom that the support check cannot classify
is documented as a residual risk; if it changes the measurement interval, the hold invalidates.

## P4-C8 — reduced no-fit release

When a release's reduced-motion search finds no fitting candidate, the handle becomes `released`
and the node lands at A with status `'reduced'` (a jump), not `invalidated`. A spring settle refusal
emits `spring-timeout` and snaps; it is not a reduced jump.

## P4-C9 — take before a flush

A `take` before an unflushed layout uses the take reads (current rect/computed values) for the held
geometry; it must not use the stale last-flush `p.geometry`. If the current geometry cannot be
supported, `take` throws `ANI_INVALID_OPTIONS` (or invalidates under snap) rather than jumping.

## P4-C10 — ancestor-carried take velocity

The handle's `velocity` is the **drawn origin velocity** at take, including the motion contributed
by an animating participant ancestor. A child that is static relative to a moving ancestor still
has the ancestor's drawn velocity; a caught card must not lose that motion. L-DRIVE-3 must cover a
driven child under a live ancestor scale, not only a static/counter-projected child.

## P4-C11 — L-DRIVE-3 sticky scope

L-DRIVE-3 covers both the held element under a sticky ancestor and the held element itself sticky;
the held origin H is the invariant in both. Add the sticky-ancestor row.
