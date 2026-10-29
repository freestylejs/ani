# H17 independent-review fixes (H17-01…H17-09)

Branch `helper/h17`, fixes on top of `d234350` and the D10 work. No authority,
scene, tolerance, row or `knownFailure` was changed.

| Finding | Failing-before evidence | Fix | Regression |
|---|---|---|---|
| H17-01 (High) | `sameParticipantTree` reused a tree whose participant is inside a detached wrapper: capture/flush read 1/1 instead of 0/0. | Restored `!p.element.isConnected` in every cache-reuse validation, and the registry-order/connection check before trusting a capture-verified pass. | `packages/layout/src/__tests__/capture.test.ts` → `H17-01`: 0 capture reads, 0 flush reads, `no-change`, no stale. |
| H17-02 (High) | A quiescent top-level parent with a participant child became `null`; the anchored child lost its parent boxes and its first frame was 20 instead of 20.5 (the 0.5 px parent move). | Quiescent fast path now requires `!hasChild[i]`; only leaves skip. | `flush_view.test.ts` → `H17-02`: anchored child first frame 20.5, final rect exact. |
| H17-03 (Medium) | A non-participant ancestor gaining a shadow root/slot did not invalidate the cache; the root was not armed. | Cache validation checks every participant's flat parent and rejects a pass when any flat ancestor is (or has become) a shadow host; known roots/chain roots still disable the fast path. | `capture.test.ts` → `H17-03`: after attaching a slot host, the root gets its `scroll` listener. |
| H17-04 (Medium) | `registeredThrough` was a high-water mark. Calling `captureAdded(c)` then `captureAdded(b)` (out of order) made b skip its required B read. | Fixed capture order limit + a per-capture `added` Set; a late participant gets exactly one read regardless of call order. | `caps.test.ts` → `H17-04`: two out-of-order late mounts read 1 + 1; no stale. |
| H17-05 | G9 was advisory at load 2.48 and was labelled as such; no quiet run was possible. | Status kept advisory; no certified claim. | Report fingerprint/load. |
| H17-06 | Scene/WebKit reports predated the final source. | Report schema now records `sourceRevision` (git HEAD); final reports are regenerated at the final code commit. | `sourceRevision` in every report. |
| H17-07 | The floor was an ad-hoc standalone run. | D10 sustained floor is executed in-page for every measured run, with the same 5-sample warm-up, 300 60 Hz samples, timer `g`, exact floor audit and five fresh-process runs; the run statistic is the per-run p95 ratio and the gate is the median of five. | `G11.floor` and per-run `sustainedFloorP95`/`sustainedRatio` in `chromium-cost.json`. |
| H17-08 | The absolute G11 2 ms threshold was still used. | Implemented D10 exactly: `p95(engine commits) / p95(floor commits) <= 2`, median of five; G10 keeps the absolute non-commit p95 ≤ 2 ms. | `sustainedRatioGate`, `G11.floor`, `G10` tests/report. |
| H17-09 | Prose said capture 2,000 rects/2,000 pairs instead of capture 1,000 + flush 1,000. | README/ITERATIONS/evidence state capture 1,000 rects and 1,000 pairs, flush 1,000 and 1,000; 300 poses = 600 declarations. | Documentation. |

## WebKit coarse timer

G10 uses the §11.5 20-frame interval on the coarse timer: 30 samples, each the
mean of 20 consecutive manual-clock frame updates timed as one
`performance.now()` interval; error bound `g/20 = 0.05 ms`; nearest-rank p95
with the upper bound. It is deciding when the bound does not straddle 2 ms.
G9/G11 remain BLOCK: a 20-commit interval cannot be timed without including
frame idle, changing the from-rest G9 work, or breaking the 60 Hz G11 cadence,
and a p95 of 15 batch means is not a p95 of 300 commits. No fabricated ratio.
