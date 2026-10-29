# H17b verification record

Branch `helper/h17`. Final code revision `6dd04d2` (H17b fixes) on `4994308`
(H17b S1/S2 base) on `1cec4d6` (D10) on `f8b7223` (H17-01…04) on `d234350`.
No remote was pushed. No authority, scene, tolerance, row or `knownFailure`
was changed.

## Final commands (at `6dd04d2`)

| Command | Result |
|---|---|
| `pnpm vitest run packages/layout` | 27 files, **457 tests passed** |
| `pnpm test:coverage` | 153 files, **1,904 tests passed**; coverage floors pass |
| `pnpm test:browser --coverage` | **223 passed, 0 failed, 0 known failures, 0 skipped**; layout coverage passes |
| `pnpm test:bench-layout` | **76 passed, 0 failed** |
| `pnpm ts:typecheck` | 11/11 tasks pass |
| `pnpm check` | exit 0: 10 warnings (repo baseline); no errors |
| Combined two-engine `--check` | not run this round; per-engine five-run scene and cost invocations below are the evidence |

## Final reports

Every report records `sourceRevision` = `6dd04d27bd99ac6a693536e4de681212108afb89`.

- `bench/layout/iteration-3/chromium-cost.json` (load 2.84, advisory):
  G9 **1.880× unscrolled / 1.898× scrolled, pass**; G10 **0.330 ms, pass**;
  G11 **2.624×, FAIL** (per-run 3.109 / 2.589 / 2.427 / 2.624 / 2.857;
  engine p95 6.5–7.2 ms / floor p95 2.2–3.0 ms); G13 exact; every floor audit
  exact. The invocation fails on G11 only.
- `bench/layout/iteration-3/chromium-s-card.json` — **pass**.
- `bench/layout/iteration-3/chromium-s-seg.json` — **pass**.
- `bench/layout/iteration-3/webkit-cost.json` (load 2.87, `valid: false`):
  G10 **0.250 ms, pass** with the real-clock 20-frame batch. G9/G11 are
  **BLOCK** (`pass:false`, `deciding:false`, no gate value); G13 and every
  floor audit exact.
- `bench/layout/iteration-3/webkit-s-card.json` — **pass**.
- `bench/layout/iteration-3/webkit-s-seg.json` — **pass**.

The H15 scenes (`s-stack`, `s-photo`, `s-island`, `s-acc`, `s-insert`,
`s-delete`) are not present in this worktree. They are **open/unrun**, not
passed; only the H14 S-CARD, S-SEG and S-BULK cost shapes ran.

## S1/S2 findings

- **S1-1** — cache reuse no longer consumes the structural flag in a pre-check.
  A reparent or `attachShadow` between capture and flush rebuilds the tree and
  arms the new root. Regression: attaching an open slot root after capture makes
  the root receive its `scroll` listener; the old code armed nothing (failing
  before).
- **S1-2** — WebKit G9/G11 are `pass:false`, `deciding:false`, `blocked:true`,
  and their gate value is omitted (`n/a`); no quantized ratio is printed as
  pass evidence. G10 batch20 remains the only deciding WebKit cost metric.
- **S2-1** — G10 now uses a real-clock 20-frame batch: one real rAF tick starts
  each batch, 20 engine frame callbacks run back-to-back under one
  `performance.now()` pair, 30 samples, ±`g/20` = ±0.05 ms. G9/G11 remain BLOCK
  because a 20-commit interval cannot preserve the from-rest G9 work or the
  60 Hz G11 cadence.
- **S2-2** — the measured-jump shortcut is disabled for active scroll, size
  change, nested parents, retained leads and shared ids. Regressions cover each
  case and assert the full path is selected; a plain top-level jump still uses
  the shortcut.
- **S2-3** — G9/G11 aggregation uses the literal median of the five per-run
  ratios, not a majority; blocked, missing and non-finite runs fail.
- **S2-4** — H15 is open/unrun; no all-scene or all-green claim.
- **S2-5** — `shadowInAncestry` is memoized per validation pass; a closed root
  that comes to contain the participant is tracked and armed. A closed root
  attached outside the participant's DOM subtree is not observable from the
  light DOM and is documented as a limitation.
- **S2-6** — G11 remains open at 2.624×; cost is advisory; no
  performance-complete claim.

## Exact-read audits

Every exact-read audit (`G9.floor-*`, `G11.floor`, engine `G13`) is exact:
capture **1,000 rects / 1,000 layout-size pairs**, flush **1,000 / 1,000**
(2,000 rects/pairs per commit across both), 300 computed reads on Chromium
(600 on WebKit including Typed OM), **300 poses = 600 pose declarations**,
zero extra reads, zero steady-frame reads.

## Residual risks

1. Chromium G11 is a measured failure at 2.624×; no certification.
2. Cost is advisory: load 2.84 (Chromium) and 2.87 (WebKit), no quiet (<1.0)
   run. H17-05 remains open.
3. WebKit G9/G11 are undecidable with the 1 ms timer under the required
   60 Hz protocol.
4. The H15 scene set is open/unrun in this worktree.
5. S-REORDER, S-SHEET and S-BULK G12 remain pending P4.
6. A closed shadow root attached externally to a non-participant ancestor is
   not detectable from the light DOM; no listener can be armed for it.
