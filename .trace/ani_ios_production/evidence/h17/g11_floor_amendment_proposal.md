# Proposal — G11 sustained-commit gate is below its required-work floor

Status: **proposed for the owner; not approved, not applied.** No gate, scene
tolerance, row or `knownFailure` was changed by H17. The authoritative text is
`packages/layout/ARCHITECTURE.md` §11.5 and the P5 scene spec, not this note.

## Observed structural fact

The S-BULK sustained shape commits the **same 1,000-participant, 300-mover
work** as the G9 commit shape, every 16.667 ms for 300 commits:

- 1,000 `getBoundingClientRect()` reads and 1,000 `offsetWidth`/`offsetHeight`
  pairs in the capture (§4.1 item 1);
- the scene mutation;
- 1,000 rects and 1,000 layout-size pairs in the flush (§4.3 step 2);
- the §4.3 step 2 computed values of every active node (300 on Chromium; 600
  including the Typed OM origin on WebKit);
- 600 `translate`/`scale` pose declarations (300 movers), and the §4.3 step 4
  t = 0 pose writes.

The audited G9 required-work floor performs exactly those operations on exactly
that DOM in the same process. On the pinned instrument (H14 iteration-3 report),
its per-run medians are **2.83–2.96 ms per commit** (unscrolled and scrolled).
The sustained loop changes only the cadence, not the required reads or writes.
A floor sample is therefore above the absolute 2 ms G11 ceiling before any
engine planner, track, report or diagnostic work exists.

A direct same-shape sustained measurement (300 commits at 60 Hz, plain DOM,
Chromium, `.trace/ani_ios_production/evidence/h17/floor_sustained.json`) gives
**median 2.805 ms, p95 3.215 ms, max 3.405 ms**. The floor's own p95 is 1.6×
the 2 ms ceiling.

The measured G11 p95 is **~8.2 ms** (see the report). The engine/floor ratio is
about **2.9×**; even a hypothetical engine with zero overhead over the mandatory
floor would be ~2.85 ms and would still fail the absolute 2 ms gate.

## Proposed replacement (owner decision required)

Keep every other part of G11 unchanged and decide it **relative to the same
audited floor**:

> Sustained 60 Hz commits, 300 moving participants, 5 s: p95 of the
> per-commit script interval ≤ **M× the median required-work floor measured in
> the same process, for the same 1,000-participant/300-mover shape and the same
> audited read/write count**. Exactly 300 commits, 58.5–61.5 Hz, and the
> existing validity rules still apply. `M` is the owner's decision; this note
> reports the measured current value rather than choosing a pass threshold.

The per-run statistic is `median(engine commit) / median(floor commit)`, the
same statistic the owner already approved for G9 (D8 amendment, 2026-10-28).
It keeps the gate about engine overhead over work the authority mandates, not
about the host's absolute clock.

### Current sustained value (for the owner's decision)

The H17 G11 p95 is **~8.2 ms** with a floor of ~2.85 ms, i.e. **~2.9× floor**.
That means:

- the absolute 2 ms gate is structurally impossible (the floor alone is
  2.85 ms);
- a **2× floor** replacement (≈5.7 ms) would also still fail on the current
  sustained path; H17 does **not** claim it, and does not propose pretending
  the sustained path passes;
- if the owner wants a deciding gate now, the reported 2.9× is the evidence for
  choosing a multiplier. If the owner wants 2×, G11 stays open until the
  sustained path (`engineState`, presented `L_k`, re-expression, active-node
  measurement) is reduced further. The floor alone cannot be reduced without
  deleting required reads.

## What this proposal does not do

- It does not pass G11 retroactively: the current absolute gate is **FAIL**.
- It does not change G9, G10, G12, G13, any scene tolerance, any frame row or
  any `knownFailure`.
- It does not decide WebKit. WebKit remains **BLOCK** while its timer is 1 ms;
  no WebKit ratio is claimed.
- It is not a certification claim. A certification still requires the owner's
  signature, P4 (G12), a quiet fingerprint and the full scene set.

## Required evidence if adopted

The report must keep the floor audit, the engine audit, every per-run engine
and floor median, the p95, the measured cadence, `g`, and the fingerprint, as it
does for G9; an over-counting floor remains a harness failure. The floor for the
sustained shape must be the same audited floor used by G9, not a reused or
synthetic number.
