# H17c / iteration 10 verification

Branch `helper/h17`; merge `b7ead0f` on main `3c24925` (H18 engine A–F,
H16 scenes and assertion fix, H15 scene set). No reset, fetch or push.

## Gates and protocol

- **D10 G11:** per run `p95(engine commits) / p95(floor commits)`, 300 60 Hz
  commits with 300 movers, same-shape audited floor, 5 warm-ups + 300 samples;
  the gate is the literal median of five per-run ratios. G9 remains the
  whole-commit ratio.
- **D11 G12:** same scene/frame no-hold p95; held p95; incremental
  `(held − no-hold) / held ≤ 0.1` at 1 and 10 held on S-BULK, and the 1-held
  S-REORDER/S-SHEET shape. Both p95 values and the subtraction are reported.
  Total-frame G8 is unchanged.
- **WebKit:** G10 uses a real-clock 20-frame batch (one real rAF tick, 20
  engine frame callbacks under one `performance.now()` pair, 30 samples,
  ±g/20). G9/G11 remain BLOCK: a 20-commit interval cannot preserve the
  from-rest G9 work or the 60 Hz G11 cadence, and a p95 of 15 batch means is
  not the p95 of 300 commits. G12 is BLOCK on the 1 ms timer.
- **H18-F F4:** `offsetLeft`/`offsetTop` reads are counted in
  `stats.layoutOffsets`, included in `stats.reads`, and printed in the G13
  detail. They are no longer hidden.

## Final reports

`bench/layout/iteration-9/chromium.json` and `webkit.json`, five runs each,
`sourceRevision` `a714d9a4431681d6465d80e33035b9c41b9eadaf`.

Chromium (all 11 scenes pass; load 10.05, advisory):

- G9 1.969× unscrolled pass / 2.079× scrolled FAIL; floor audits exact.
- G10 0.975 ms pass.
- G11 2.424× FAIL (per-run 2.630/2.424/2.376/2.585/1.293); G11.floor exact.
- G12-1 −0.285, G12-10 −0.006 incremental ms/held pass.
- G13/G13-held exact.

WebKit (load 11.47, cost BLOCK due the 1 ms timer):

- S-CARD, S-SEG, S-PHOTO, S-STACK, S-ISLAND, S-ACC, S-INSERT, S-DELETE,
  S-BULK pass.
- S-REORDER and S-SHEET blocked only on G12 timer bound; G3/G7 remain
  authority BLOCK.
- G10 0.250 ms pass with the real-clock batch.
- G9/G11/G12 BLOCK, no gate value; G13/floor exact.

## Verification commands

- `pnpm vitest run packages/layout`: 29 files, 464 tests passed.
- `pnpm test:bench-layout`: 84 passed.
- `pnpm ts:typecheck`: 11/11.
- `pnpm check`: 0 errors (repo baseline warnings/infos).
- `pnpm test:coverage`: 155 files, 1,911 tests passed (with the 20 s timeout
  needed by the 20,000-chain property test on this loaded host).
- `pnpm test:browser --coverage`: 222 passed, 1 failed (`layout_spring:L_SPRING_1`,
  a pre-existing main failure at 3c24925: settle 6.5167 s vs oracle 6.3 s);
  engine functions 95.48%, above the 95% floor. L_MEAS_12/L_DRIVE_EDGES pass.

## Residual risks

1. G11 is 2.424× and G9-scrolled 2.079× in the final five-run report; the
   cost is advisory (load 10.05), and both remain open. No performance-complete
   claim.
2. WebKit G9/G11/G12 are undecidable with the 1 ms timer under the required
   protocol.
3. S-REORDER/S-SHEET G3/G7 remain authority BLOCK.
4. A quiet (<1.0 load) run was not available on this host.
5. DPR 1/3 and reduced-motion variants remain P5c BLOCKs.
