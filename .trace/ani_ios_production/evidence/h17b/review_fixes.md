# H17b independent-review fixes (S1-1…S2-6)

Branch `helper/h17`, final code `6dd04d2`, on `4994308`. No authority, scene,
tolerance, row or `knownFailure` was changed.

| Finding | Failing-before evidence | Fix / result |
|---|---|---|
| **S1-1** (S1) | `reuseVerified` called `!structureChanged()` and consumed the structural record; `sameParticipantTree` then returned true without verifying nearest participants. Attaching a slot root between capture and flush armed no listener (regression failed with `[]` before the fix). | Removed the pre-check and the `verified` shortcut; every reuse calls `sameParticipantTree` once, which validates registry order, connectedness, flat parents, shadow ancestry, and then the full nearest-participant pass when structure changed. Regressions for attach-shadow and reparent; attach-shadow fails on the old code. |
| **S1-2** (S1) | WebKit G9/G11 were `pass:true`, `deciding:true` with quantized medians 1.333/1.5; the text printed `BLOCK ... 1.333`. | Blocked findings are `pass:false`, `deciding:false`, `blocked:true`, gate value omitted (`n/a`); per-run text says BLOCK and does not print quantized ratios. Aggregate fails any blocked run. G10 batch is the only deciding WebKit performance cost metric. |
| **S2-1** (S2) | WebKit G10 used `createManualClock` + 20 back-to-back synthetic frames. | G10 now starts each 20-frame batch from a real `requestAnimationFrame` tick, runs 20 real-clock engine frame callbacks under one `performance.now()` pair, 30 samples, ±g/20 = ±0.05 ms. Final G10 = 0.250 ms, deciding. G9/G11 remain BLOCK with exact evidence; no fabricated ratio. |
| **S2-2** (S2) | The measured-jump shortcut had no target regressions for scroll, size change, nested parents, retained tracks or shared ids. | Shortcut now requires no active scroll, no retained lead, no shared id, a top-level node, no support fallback, an unchanged size, unit pose scale, and a ≥threshold x/y jump. Regressions assert the full path for scroll, size change, nested parent and retained lead; a plain top-level jump still uses the shortcut. |
| **S2-3** (S2) | Aggregate passed a metric by a majority of per-run booleans; a blocked/non-finite run could be outvoted. | Ratio gates set `aggregate:'median'` and `aggregateLimit:2`; the literal median of the five per-run values decides. Blocked, missing and non-finite runs fail; blocked medians are `NaN` and are not printed as ratios. Other metrics keep their per-run median outcome. |
| **S2-4** (S2) | Reports claimed H14/H15 coverage while only S-CARD/S-SEG and cost were run. | H15 scenes (`s-stack`, `s-photo`, `s-island`, `s-acc`, `s-insert`, `s-delete`) are marked **open/unrun**; only H14 S-CARD, S-SEG and S-BULK cost ran. No all-scene or all-green claim. |
| **S2-5** (S2) | `shadowInAncestry` walked the full chain for every participant; closed-root attach coverage was absent. | The ancestry check memoizes each node's answer per validation pass and is disabled when a known root/host exists. A closed root that comes to contain the participant is tracked and armed (regression). An externally attached closed root outside the participant's DOM subtree is not observable from the light DOM; documented as a limitation. |
| **S2-6** (S2) | G11 was at risk of a performance-complete claim. | G11 remains **open** at 2.624×; cost is advisory at load 2.84 (Chromium) / 2.87 (WebKit). No performance-complete claim. |

## Final verdicts

- **G9:** Chromium 1.880× unscrolled / 1.898× scrolled — pass; floor audits exact.
- **G10:** Chromium 0.330 ms; WebKit 0.250 ms with the real-clock batch — pass.
- **G11:** Chromium 2.624× — **FAIL/open**; floor audited exactly.
- **WebKit G9/G11:** **BLOCK**; no ratio printed as pass evidence.
- **G13 / floor:** exact, zero extra and zero steady-frame reads.
- **H15:** open/unrun in this worktree.
