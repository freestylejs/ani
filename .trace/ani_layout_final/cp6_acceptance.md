# CP6: acceptance and product, implementer's checkpoint review

- Authority: `plan.md` CP6 (T6.1–T6.4, V6, row parameters); `ARCHITECTURE.md` §5.5, §5.6, §7.2,
  §11; drift K18.
- Carried into this checkpoint: the CP5 trial (`cp5_react_trial_result.md`). Engine defects are
  proved in `cp4_engine.md` ("Fix proof report for the CP5 trial, engine defects"); adapter
  defects in `cp5_react.md`.

## Changes

| Area | Files |
|---|---|
| Fixtures (the controlled components the showcase renders and the tests drive) | `packages/web/src/components/layout_fixtures.tsx` |
| Acceptance rows E1–E5, Gallery, showcase honesty | `tests/browser/cases/acceptance.ts`, shared frame harness `tests/browser/cases/layout_frames.ts` |
| Regression rows and seeded fuzz | `tests/browser/cases/regressions.ts` |
| Cost at 50 / 300 / 1,000 | `tests/browser/cases/layout.ts` `SCALE` |
| React 18.3 and React Compiler builds of the real suites | `tests/browser/cases/{react_layout_r18,acceptance_r18,acceptance_rc,acceptance_r18c}.ts`, `tests/browser/bundle.ts`, `tests/browser/run.ts` |
| Engine: crossfade reversal (found by E2) | `solve.ts` (`Fade.from`), `scope.ts` (`fadeFrom`), `plan.ts` (a reversing pair fades below the threshold) |
| Showcase rebuilt on the fixtures | `packages/web/src/components/layout_showcase.tsx`, `.module.css` |
| Docs smoke test for the RAF engine | `tests/browser/docs_showcase.mjs` |
| README, guide, showcase page, changesets, React peer `^0.2.0` | `packages/layout/README.md`, `packages/react/README.md`, `packages/web/content/docs/{guides,showcase}/layout.mdx`, `.changeset/ani-layout.md`, `.changeset/react-layout-adapter.md`, `packages/react/package.json` |
| Deleted | the CP2 spike modules (`spike*.ts`), `tests/browser/diagnose_layout_showcase.mjs` |

## T6.1 Acceptance rows (frame level, manual clock)

| Row | Prescribed assertion | Chromium / Firefox / WebKit |
|---|---|---|
| E1 `AnchorFixture` | child centre on the parent centre ≤ 0.5 px every frame; 70 px until 0.8 s; size starts at 0.8 s ± a frame | parent 0.0001 / 0.0082 / 0.0002 px; centre 0.0000 / 0.0083 / 0.0000 px; size starts at 0.816 s |
| E2 `CreateFixture` | opacity sum 1 ± 0.05; glyph height ± 1 px; close/reopen at 100 and 500 ms | sums exact; glyph 0.000 px; no jump at a toggle 0.0002 / 0.0167 / 0.1435 px |
| E3 `FolderFixture` | four shared tiles first/final; items at 0.2 ± 0.02; stagger ± a frame; reopen at 500 ms | first and final 0.0000 px; stagger within 0.008 s; reopen 0.0006 / 0.0167 / 0.0000 px |
| E4 `CardFixture` | nested ids; image coverage gap ≤ 0.5 px; title size pinned; close/reopen | coverage 0.0001 / 0.0000 / 0.0001 px; title 0.0001 / 0.0000 / 0.0001 px; reopen 0.0000 / 0.0167 / 0.1481 px |
| E5 `ToastFixture` (enter y 14 / scaleX 0.8 / opacity 0; exit y 10 / scaleX 0.9 / 0.2 s; spring; origin centre-bottom) | first frame = enter transform; siblings final at t = 0 under popLayout; exit ≈ 0.2 s; bottom edge ± 1 px; five adds 80 ms apart | enter first frames exact; bottom edge 0.000 / 0.008 / 0.000 px; released at 0.208 s; siblings 0.0000 / 0.0110 / 0.0000 px |
| Gallery `GalleryFixture` | 16 tiles grid ↔ list; detail with a shared id | every frame on the oracle 0.0002 / 0.0083 / 0.0002 px; detail from tile 5 and back |
| Showcase honesty | the fixtures contain the shared and nested ids their rows name | `acceptance:Honest` |

Two defects surfaced and were fixed while writing the rows:

- **E2 reopen popped.** A menu reopened while closing reverses its crossfade: the new lead was
  the follower of the running fade, and the pair moved less than the threshold, so the plan
  dropped the fade and the opacities jumped. A reversing pair now keeps fading below the
  threshold and starts at the opacity the new lead shows (§5.6, K18). `plan.test.ts` and
  `solve.test.ts` reproduce it.
- **E4 coverage.** The fixture's `<button>` vertically centred its content, so the image
  rested 36 px below the card top: a fixture defect, not an engine one (the coverage gap is
  measured against the rest layout). The card is a column flex box now.

## T6.2 Regression rows

| Row | Assertion | Chromium / Firefox / WebKit |
|---|---|---|
| Late start (real clock, React) | commit → flush → 120 ms block → first painted frame ≤ 6 % | 0.00 % in each |
| Unrelated re-render | Gallery under re-renders from above the scope (a non-participant ancestor whose style changes) every third frame: trajectory identical | 0.0006 / 0.0167 / 0.0003 px |
| Crossfade | E4 close under the same re-renders: boxes and opacities identical, pair complementary, opacity 1 and unowned after | boxes 0.0008 / 0.0167 / 0.0002 px; opacities identical |
| Velocity under jank | retarget after frames of 16, 50, 8, 120, 33, 16, 70, 4 ms: position and size velocity ≤ 5 % | 1.449 / 0.535 / 0.247 % |
| Reduced motion | zero writes, zero subscribers, mid-run toggle | `layout:T11`, `layout:J19` |
| Showcase honesty | | `acceptance:Honest`, `docs_showcase.mjs` |
| Seeded fuzz invariants | 24 seeds × 60 steps (random trees, options, moves, removals, additions, reduced-motion toggles, inline author writes, janky frames): no read after a write in an operation, finite values, translate/scale written only `!important` or restored to the author's value, `transform` never written, byte-identical styles and no subscription at the end | 3,609 engine operations, pass in each |

## T6.3 Cost at 50 / 300 / 1,000 participants (every participant moving)

| Participants | Chromium | Firefox | WebKit |
|---|---|---|---|
| 50 | commit 1.40 ms, frame p95 0.14 ms | 3.00 ms, 0.30 ms | 2.00 ms, 0.20 ms |
| 300 | 5.80 ms, 0.52 ms | 8.00 ms, 0.90 ms | 6.00 ms, 0.60 ms |
| 1,000 | 16.40 ms, 1.69 ms | 21.00 ms, 3.60 ms | 16.00 ms, 2.00 ms |

The established gates (`layout:COST`) hold: commit reads at 1,000 participants / 300 moving
2.40 / 3.00 / 3.00 ms (≤ 4); frame p95 at 300 nested movers 0.64 / 1.10 / 0.80 ms (≤ 2).
Firefox and WebKit timers are coarse (1 ms).

## T6.4 Product

- **Showcase.** The six demos render the fixtures with their own controls; what the page shows
  is what `acceptance` checks. `docs_showcase.mjs` drives every control on the built page and
  checks that the engine draws (owned translate/scale) and lets go: pass in Chromium, Firefox
  and WebKit, no console errors (`next build`, `next start`, `BROWSER=… node tests/browser/docs_showcase.mjs`).
- **Web build.** `next build` exit 0; `tsc` for `packages/web` 0 errors once `next typegen`
  has run, which the package's own `ts:typecheck` script does (the earlier failure was `tsc`
  without the generated route types).
- **Docs examples.** Every `ts`/`tsx` block of the guide and both READMEs, extracted and
  type-checked strictly against the sources: 13 files, 0 errors (the README's two quick-start
  blocks checked as one program).
- **Changesets.** `@freestylejs/ani-layout` minor (0.2.0); `@freestylejs/ani-react` minor (the
  new `/layout` entry); peer `^0.2.0`.
- **React 18.3 and the React Compiler.** `react_layout` on React 18.3, and the acceptance rows
  on React 18.3, with the fixtures compiled by the React Compiler for React 19, and both: 30 / 30
  in Chromium. The bundle refuses a fixture file the compiler left untouched.

## V6

- No 0.1.0 symbol anywhere in the repository outside `.trace` history:
  `git grep -nE "LayoutConfig|\bdeps\b|maxBoxes|maxAnimated|LayoutSnapshot|preserve-aspect|LayoutParticipantOptions|LayoutResult\b|createLayoutFacade|supportsFlip|LayoutBoundary|layout: 'box'|ARCHITECTURE_CPC|ani_layout_cpc|ani_layout_v1" -- ':!.trace'`
  finds nothing (the remaining `'box'` hits are DOM ids in other bindings' tests).
- No `spike*` browser module remains.
- Every row green in three browsers (above). Full suites after the merge of the adapter fixes
  and E-1: `pnpm vitest run` 136 files, 1,598 / 1,598; `test:browser` Chromium 122 / 122,
  Firefox 120 passed + 2 skipped, WebKit 120 passed + 2 skipped (`core:C1`/`C2` read CDP and are
  declared `chromiumOnly`; they failed there before with "CDP session is only available in
  Chromium"). `react_layout:RL9` was added after that run and passes ×3 on React 19 and 18.3.

## Residual risks

- The docs smoke test runs on a real clock and waits for settle with a deadline; it is a
  product check, not a frame-level one.
- The Gallery and the card stage scroll horizontally on narrow screens (fixed geometry).

## Found during CP6 and fixed

| Finding | Root cause | Fix and evidence |
|---|---|---|
| React 18.3: `react_layout_r18:RL3` ×3 and `RL4` in WebKit, "b moved by 38 px while time stood still" (found by the new React 18.3 build of the real suite) | A time-sliced transition captured in an earlier task; React 18 commits it later and starts the next render in the commit's task, before the flush microtask; that render's touch refreshed the open capture with the mutated DOM (B = A) | `context.ts`: no capture while the scope's flush is queued; the K14 hand-off capture serves the new render (K20a). jsdom K14 cases; RL3/RL4 pass ×3 on 18.3 and 19 (`cp5_react.md`) |
| E-1: a flush that changes no layout box re-froze an animating presence transform under a running track (found by the prescribed E5) | Keep/retarget judged on A through the current presence; a kept track's frame geometry was replaced | `plan.ts` (`planned`), `scope.ts` (A under the frozen matrices; kept tracks keep their geometry) (K20b). `layout:PRESENCE_LAYER` 15.79 px before, 0.0000 after (scaleX and scaleX + translateY); `react_layout:E5` passes every frame |
| `core:C1`/`C2` in Firefox/WebKit | CDP is Chromium-only | `chromiumOnly` in the case module; the runner reports SKIP |

## Verdict

PASS (implementer review). The CP5 adapter fixes (`layout/react-fix`, proof in `cp5_react.md`)
are merged; the CP5 trial's carried defects go to the CP6 trial for re-judgment.

## CP6 trial fix proof (J-033, J-034)

Branch `layout/accept-fix` from `43f045a`. Commits `a6c2a1d` (J-033) and `3757638` (J-034).
No engine source (`packages/layout/src`) changed. Runs on the Linux mirror, Playwright 1.55.0.

### Changed files

| File | Change | Defect |
|---|---|---|
| `packages/web/src/components/layout_fixtures.tsx` | GridCard's `<button>` sets `font`, `letterSpacing`, `wordSpacing`, `textTransform` to `inherit` (the UA button styles reset them; CardDetail's `<div>` inherits them) | J-033 |
| same | `E3.enterDuration = 0.35`; FolderItem's enter uses it (same value as before) | J-034 |
| `tests/browser/cases/layout_frames.ts` | `framesUntilDone(mc, limit, check, done, label)`: runs `frames()` and throws `"<label> did not settle within <limit> frames"` when `done()` is still false; `frames()` itself unchanged for other callers | J-034 |
| `tests/browser/cases/acceptance.ts` | E4 text-style and width assertions; E3 rewritten; Gallery detail frame checks; all 13 settle-predicate loops in the suite use `framesUntilDone` | J-033, J-034 |

### Assertions added

**E4 (J-033).** Unchanged: surface/image first frame on the card's boxes, title first frame
x/y within 0.5 px (position mode), coverage and title-size-pinned ≤ 0.5 px every frame.
Added:

- `fontOf(title)` (computed `fontFamily | fontSize | fontWeight | fontStyle | fontStretch |
  lineHeight | letterSpacing | wordSpacing | textTransform`) is equal in the grid card (read
  before opening) and the detail (`expectEqual`, "title text styles, detail vs grid").
- After the opening settles, the detail title's width and height equal the grid title's within
  0.5 px ("title width/height, detail vs grid").

**E3 (J-034).** Origin `O` is the centre of the closed folder, measured before opening. For
item k with layout box `B_k` (from `folderTile`), the expected drawn box at scale s is
`O + s·(B_k − O)` (x, y) and `s·B_k` (w, h). The expected scale is computed in the test from
the fixture's spring step alone: `s = 0.2` until `k·0.04 s`, then
`SPRING.step(local, {from: 0.2, to: 1, duration: E3.enterDuration})` (1 once it reports its
end). Presence timelines start at the commit, so the harness frame at elapsed t (layout
dt = 0 on the first frame) is `t + DT` on them; measured scale at the first frame 0.2454 =
the spring at exactly 16 ms (e = 0.0566). For both the open and the reopen-at-500-ms runs:

- exactly `E3.others` (5) items are mounted, in order;
- first frame: each item's scale (drawn w / 68) is 0.2 ± 0.02 and its box is
  `O + 0.2·(B_k − O)` within 0.5 px;
- every frame: every item is connected and drawn on its expected path within 0.5 px;
- every start (first frame whose scale exceeds 0.2 by > 1e-3) is found and finite, and lies in
  `(k·0.04, k·0.04 + DT]`; successive starts differ by 0.04 s ± DT;
- the run settles (`framesUntilDone`, 90 frames) and each item ends on `B_k` within 0.01 px;
- during the open run the four shared tiles are on the oracle track (folder box → panel box,
  `DURATION`, `SPRING`) every frame, in addition to the first/final checks.

**Gallery (J-034).** Opening: track from tile 5's measured drawn box before the commit to the
detail's measured layout box after it (`offsetLeft/Top/Width/Height` in the stage, offset
parent asserted); return: from the detail's settled drawn box to the returning tile's measured
layout box. Both checked every frame with `expectedBox` within 0.5 px, both must settle; first
and final checks retained.

### Results (all four builds: `acceptance`, `acceptance_r18`, `acceptance_rc`, `acceptance_r18c`)

`pnpm -s test:browser --browser <b> --case 'acceptance*:E3Folder' --case 'acceptance*:E4Card' --case 'acceptance*:Gallery*'`:

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| Cases | 12 / 12 | 12 / 12 | 12 / 12 |
| E3 tiles on oracle (max) | 0.0000 px | 0.0083 px | 0.0000 px |
| E3 items on enter path (max) | 0.0000 px | 0.0082 px | 0.0000 px |
| E3 starts, open and reopen (s) | .016/.048/.096/.128/.176 | same | same |
| E3 stagger error (max) | 0.008 s | 0.008 s | 0.008 s |
| E4 title width grid / detail | 58.000 / 58.000 px | 58.500 / 58.500 px | 58.516 / 58.516 px |
| Gallery grid↔list (max) | 0.0002 px | 0.0083 px | 0.0002 px |
| Gallery detail open/return (max) | 0.0001 px | 0.0080 px | 0.0001 px |

`pnpm -s test:browser --browser <b> --case 'acceptance*:*'`: Chromium 28 / 28, Firefox 28 / 28,
WebKit 28 / 28 (7 rows × 4 builds). `npx tsc -p tests/browser --noEmit`: exit 0.
`npx biome check tests/browser packages/web/src/components`: exit 0 (4 pre-existing warnings,
none in the changed files; `--diagnostic-level=warn` on the three changed files is clean).

### Controls (not committed)

- **J-034 sensitivity control** — only FolderItem's enter changed to `to: { scale: 0.2 }`,
  `duration: 1000`; Chromium, `acceptance*:E3Folder`: **0 passed, 4 failed**, each
  `open: item 0 enter t=0: drawn {"x":35.2,"y":51.2,"w":13.6,"h":13.6} differs from
  {"x":34.111,"y":53.741,"w":16.686,"h":16.686} by 3.086 px`. Reverted.
- **J-033 control** — button `inherit` lines removed; `acceptance:E4Card` in Chromium FAILs:
  `title text styles, detail vs grid: expected "Arial | 15px | 700 | … ", received
  "\"Times New Roman\" | 15px | 700 | …"`. Firefox and WebKit on the mirror resolve the same
  font for both (58.5 / 58.516 px), which is why the judge's environment saw the Firefox failure
  and ours did not; the computed-style assertion catches the drift wherever the UA button font
  differs. Reverted.

### Residual risks

- The E3 enter expectation uses the timeline convention that an enter starts at its commit
  (`t + DT` on the harness clock). If core changed presence timelines to a dt = 0 first frame,
  E3 would fail by about 3 px at t = 0 and the offset would have to be revisited deliberately.
- The E3 enter path evaluates the fixture spring's own `step`; it is independent of the presence
  runtime and the layout solver, not of the timing function definition (as the oracle).
- The Gallery after-boxes use integer `offset*` metrics; the fixture geometry is integral, so this
  is exact here but would round a fractional layout.
