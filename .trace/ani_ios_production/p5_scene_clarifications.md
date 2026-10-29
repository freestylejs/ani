# P5 scene clarifications — release/status rows (2026-10-29)

Authority wins over this note. These corrections remove unobservable or misread scene rows exposed
by H15/H16; they do not weaken a frame or cost gate.

## S-REORDER G7 status

§7.1: a run whose track is replaced by a later flush resolves `'interrupted'`; untouched tracks keep
running. The S-REORDER script reorders **different siblings**; it does not retarget a running
sibling's track. The engine's `'ended'` at frames 28/31/35 is therefore correct. A-13's
“replaced track interrupts” remains true; S-REORDER does not exercise that branch.

Ruling: S-REORDER G7 expects `'ended'` for this script. If a future script retargets a running
sibling, expect `'interrupted'` and add that row. Do not mark the current row BLOCK.

## S-SHEET release G7

§5.10/§7.1: `release()` returns `void` and starts no public `LayoutReport`. The p5 spec's
`release-1`/`release-2` G7 `'ended'` rows are unobservable through the public API. Ruling: mark the
release G7 rows **not applicable** (not a failure). Score the release frame continuity (G2/G4),
origin, velocity and restoration; do not require a release report. Adding a release report would be
a P4 public-surface change, not a requirement of this checkpoint.

## S-SHEET release G3

G3's analytic before/after velocity pair assumes a layout track before and after a retarget. A
release starts a new track from the presented origin with the supplied gesture velocity; there is no
analytic layout track before it. Ruling: release G3 is **not applicable**; use G2 (first-frame
continuity), G4 (spring fidelity), the observed finite difference and the release-origin row. The
S-REORDER/other retarget G3 rows remain deciding.

## S-SHEET 16 ms manual step

The manual-clock scene uses a uniform 16 ms step for both holds. The p5 spec's 20 ms second hold was
a timing example, not a gate. Ruling: 16 ms is the scene contribution; detent projection
(`top + v·0.20`, nearest `{124,422,844}`) and the ≥1 s second take are implemented and scored.

## S-BULK WebKit G8/G9–G12

WebKit has a 1 ms `performance.now` tick on the D9 instrument. Raw quantized samples are not a
measured pass. G8/G9/G11/G12 must use an explicit coarse-timer interval (one `performance.now` pair
per 20 frames/commits, with the error bound) or remain BLOCK; no fabricated sub-tick ratio. Chromium
remains deciding for the corresponding cost gates.
