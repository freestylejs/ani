# Gate amendment — commit cost (P1-N001), 2026-10-28

Status: **owner-approved redefinition**. The owner's 2026-10-28 DECISION approved the
recommendations as a body, including the cost-gate recommendation reproduced below. This record
replaces the retired criterion; it does not retroactively pass any evidence.

## Retired criterion

`packages/layout/ARCHITECTURE.md` §11.5 required, and `tests/browser/cases/layout.ts` enforced:

- commit (capture + flush) ≤ **4 ms** at 1,000 participants, unscrolled and scrolled;
- the browser row `layout:COST` timed only the DOM reads and failed above **4 ms**.

The criterion is retired as a gate. It is not silently satisfied and it is not a P1, P2 or P6
gate.

## Why it cannot stand

The authority itself requires, per commit, 2N `getBoundingClientRect` reads, 2N layout-size pairs
and the computed values of §4.1/§4.3, plus the pose writes of §4.3. A hand-written loop doing only
that required work, on the same DOM, measured:

| Instrument | 300 moving | 1,000 moving |
|---|---|---|
| Ubuntu/Xeon P0/P1 instrument, Chromium | 4.8–5.2 ms | 8.0–8.8 ms |
| Ubuntu/Xeon P0/P1 instrument, WebKit | ~4 ms | 6–10 ms |

The required reads alone exceed the 4 ms budget on that instrument. The legacy row's own read figure
at 1,000 participants was 5.60 ms in Chromium (`logs/p2-h6b/chromium.log`). A gate below the measured
floor of its own required work is not a performance criterion; it is a machine-speed criterion.

## Replacement criterion

The P5 harness decides the commit gate on the **certification instrument** of §11.5 (D9):

- **commit (capture + flush) ≤ 2× the measured required-work floor**, at 1,000 participants,
  unscrolled and scrolled by 1.5 viewports.

The floor is not a theoretical estimate and not a reused production path:

1. The harness builds the same participant DOM twice: the engine fixture and the floor fixture.
2. The floor fixture performs exactly the reads of §4.1 item 1 and §4.3 step 2 (including the
   computed values §4.3 requires for active nodes) and the writes of §4.3 step 4,
   in the same order and count, with plain DOM calls and no engine state.
3. The harness audits the floor's read/write counts against the authority and fails if they differ;
   an over-counting floor is a harness failure, not a slower engine.
4. The floor and the engine commit are measured in the same process, immediately before or after
   each other, with the same warm-up (5 discarded), sample count (30) and fresh-process protocol.
5. A run's statistic is `median(engine commit) / median(floor commit)`. The gate's value is the
   median of the 5 per-run ratios; it passes only when ≤ 2 in Chromium and WebKit.

This keeps the gate about the engine's overhead over the work the authority mandates, not about the
host's absolute clock.

## Retained gates

Unchanged and still deciding:

- steady frame p95 ≤ **2 ms** at 300 nested movers;
- sustained commits: 60 Hz commits with 300 moving participants hold the steady-frame gate;
- held frame ≤ **0.1 ms** per held element;
- exact read counts: a commit reads ≤ 2N rects and 2N layout-size pairs plus the authority's computed
  values; steady frames read zero; `stats` counts every read;
- every §11.6 frame-scoring gate.

A fingerprint mismatch makes a cost result **advisory**; the frame-scoring gates still decide. The
absolute 2 ms steady-frame gate is evaluated on the certification instrument, not ported between
hosts.

## Impact

- P1's gate is "existing suites green except the retired `layout:COST` row"; P1-N001 closes by this
  amendment plus a green run of the remaining suites.
- P2 does not carry `layout:COST`.
- P5 owns the replacement commit gate and must publish the floor audit, every per-run ratio, the
  medians, `g` and the instrument fingerprint.
- The retired row's measurement code may remain only as a non-case diagnostic for the P5 harness
  author. It must not gate, and no report may cite it as the commit gate.

## Non-regression

No tolerance is loosened. The 2 ms steady-frame, sustained-commit, held-frame and exact-read rules
are unchanged. The relative gate is stricter about what it measures (the whole commit, not just
reads) and has an explicit floor audit so a slow floor cannot hide a slow engine. A future change
that raises the engine-to-floor ratio above 2 fails P5.
