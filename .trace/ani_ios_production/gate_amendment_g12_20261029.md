# Gate amendment — held-frame cost (G12), 2026-10-29

Status: **owner-approved**. The owner chose the baseline-subtracted per-held metric.

## Retired reading

The literal G12 reading was `p95(total held frame) / held count ≤ 0.1 ms`. The scene's ordinary
frame baseline is ~0.39 ms; at 1 held the total p95 is 0.37–0.56 ms and at 10 held 0.59–0.60 ms.
The marginal held cost is only ~0.02–0.03 ms/held. Dividing the fixed baseline by 1 makes the
literal gate structurally unpassable; dividing it by 10 makes it pass. The metric was measuring the
scene baseline, not held work.

## Replacement metric

For the same scene and clock shape, measure:

1. **baseline p95** with no hold, same frame cadence and DOM;
2. **held p95** with 1 held and with 10 held;
3. **incremental per-held**:
   `(p95(held frame) − p95(no-hold frame)) / held count`.

Gate: incremental per-held ≤ **0.1 ms** at both 1 and 10 held. The absolute total-frame G8 gate is
unchanged; G12 is the incremental cost of the hold, not the whole scene.

The baseline and held runs use the same page, DOM, viewport, clock shape, warm-up/discard and
sampling protocol. The report records both p95 values, the subtraction, and the held count so an
independent runner can recompute the gate.

## Why

The fixed scene baseline is not caused by holding and cannot be removed by held-read optimization.
H18 reduced the document-wide `getAnimations`/registry scans to ~0.01 ms and the marginal slope is
~0.02–0.03 ms/held; the residual 0.3 ms is the scene's normal frame work. The baseline-subtracted
metric measures the actual held-frame increment and keeps the 0.1 ms per-element budget.

## Evidence

- H16/H18: 1-held p95 0.37–0.56, 10-held 0.59–0.60, S-SHEET ordinary frame 0.39, G12-10 0.058.
- H18 microbench: `getAnimations` 0.010, subtree animations 0.004, rect 0.005, registry 0.036 ms.
- Owner ruling 2026-10-29: baseline-subtracted per-held cost.
