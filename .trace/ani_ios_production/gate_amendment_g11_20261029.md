# Gate amendment — sustained commits (G11), 2026-10-29

Status: **owner-approved**. The owner chose the recommended ruling: decide sustained commits at
**≤ 2× the audited required-work floor** on the same 60 Hz shape, keeping the absolute steady-frame
gate for non-commit frames.

## Retired criterion

`packages/layout/ARCHITECTURE.md` §11.5 previously required the sustained 60 Hz commit shape to
hold the absolute steady-frame gate (2 ms p95). The audited required-work floor for the same shape
is **2.81–3.00 ms/commit**, with a direct 300-commit floor replica p95 of **3.215 ms**. An absolute
2 ms gate is below the floor and cannot pass on the D9 instrument.

## Replacement criterion

- **Sustained commits:** 300 commits at 60 Hz with 300 moving participants (the S-BULK shape) are
  measured together with a floor replica of exactly the required work, at the same cadence and DOM.
- Per run: `ratio = p95(engine commit cost) / p95(floor commit cost)`.
- The gate value is the median of 5 fresh-process per-run ratios; it passes only when ≤ **2** in
  Chromium. WebKit cost remains deciding and must use the §11.5 coarse-timer 20-frame interval
  (when `g > 0.05 ms`), not a fabricated sub-tick ratio.
- The floor audit is the same as G9: 2N rects/offsets + §4.3 step 2 computed reads + 300 poses,
  zero extra/steady reads.
- The absolute steady-frame p95 ≤ 2 ms remains for **non-commit frames**. G10 is unchanged.
- G9 (whole commit at 1,000 participants) remains ≤ 2× its audited floor.

## Why

An absolute budget below the measured floor of the authority's own required work is a host-speed
criterion, not an engine criterion. The relative gate keeps the exact work audit and prevents a
slow floor from hiding a slow engine. It does not pass the current 8.19 ms result: H17's ratio is
≈2.55× (8.19 / 3.215), so another optimization round is required to reach ≤2×.

## Evidence

- H17: G9 now 1.904/1.949× (pass, advisory load 2.48); G11 8.19 ms p95, floor p95 3.215 ms,
  ratio ≈2.55×; WebKit BLOCK on the 1 ms timer.
- Owner ruling 2026-10-29: **≤2× audited floor**.
- Floor ledger: `evidence/h17/floor_sustained.json`; H14 README/iteration reports.

## Non-regression

No tolerance is loosened silently. The floor is audited at the same shape; exact read counts,
frame-scoring gates, G10, G12 and G13 remain. A future engine that exceeds 2× the floor fails.
