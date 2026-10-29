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

## D12 certification

WebKit cost/G12 rows are BLOCK/advisory and appear in
`certification.advisory`; they no longer appear as `certBlock` reasons.
Chromium G9/G11/G12 and the cost fingerprint still decide. WebKit frame,
scoring, shape, status and restoration rows remain required. Unit tests cover
the WebKit cost block, a WebKit frame failure and a non-cost WebKit scene
block.

## Final reports

`bench/layout/iteration-9/report.json`, one combined five-run report for both
engines with controls/self-tests, `sourceRevision`
`8939234d04f02157c4eb11a33de8a84f7d74217c`.

Chromium (all 11 scenes pass; combined load 5.42, advisory):

- G9 1.687× unscrolled / 1.661× scrolled pass; floor audits exact.
- G10 1.120 ms pass.
- G11 2.015× FAIL (per-run 1.977/2.054/2.015/1.979/2.299); G11.floor exact.
- G12-1 −0.030, G12-10 0.0015 incremental ms/held pass; negative
  increments are accepted as signed measurements.
- G13/G13-held exact.

WebKit (combined load 5.42, cost BLOCK due the 1 ms timer):

- S-CARD, S-SEG, S-PHOTO, S-STACK, S-ISLAND, S-ACC, S-INSERT, S-DELETE,
  S-BULK pass.
- S-REORDER and S-SHEET cost G12 are BLOCK/advisory (D12); their frame,
  scoring and status rows pass.
- G10 0.200 ms pass with the real-clock batch.
- G9/G11/G12 BLOCK, no gate value; G13/floor exact.

## Verification commands

- `pnpm vitest run packages/layout`: 29 files, 464 tests passed.
- `pnpm test:bench-layout`: 89 passed.
- `pnpm ts:typecheck`: 11/11.
- `pnpm check`: 0 errors (repo baseline warnings/infos).
- `pnpm test:coverage`: 155 files, 1,911 tests passed (with the 20 s timeout
  needed by the 20,000-chain property test on this loaded host).
- `pnpm test:browser --coverage`: 223 passed, 0 failed, 0 known failures;
  engine functions 95.48%, above the 95% floor. L_SPRING_1 now passes on
  the 10ec0e3 edge-settle oracle.

## Residual risks

1. G11 is 2.015× in the final combined five-run report; cost is advisory
   (load 5.42), and G11 remains open. No performance-complete claim.
2. WebKit G9/G11/G12 are undecidable with the 1 ms timer under the required
   protocol.
3. WebKit S-REORDER/S-SHEET G12 cost rows are BLOCK/advisory under D12;
   their frame/status rows pass.
4. A quiet (<1.0 load) run was not available on this host.
5. DPR 1/3 and reduced-motion variants remain P5c BLOCKs.
