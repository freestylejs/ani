# CP8: Final, implementer's checkpoint review

- Authority: `plan.md` CP8 (T8.1, T8.2, V8); `ARCHITECTURE.md` §11 (acceptance, coverage);
  drift K21 (coverage where tests run), K22 (default timing in `mergeMotion`; a track lives in
  the visual space of its own flush).
- Carried: the CP6/CP7 trial (`cp6_acceptance_trial_result.md`, frozen `3a97b5b`) failed on
  J-016, J-032 (S0) and J-033, J-034 (S1). Their fix proofs: `cp4_engine.md` "Fix proof report
  for the CP6 trial, engine defects (J-016, J-032)"; `cp6_acceptance.md` "CP6 trial fix proof
  (J-033, J-034)".
- Commits since the trial: `git log --oneline 3a97b5b..HEAD`.

## T8.1 Final review rubric

| Check | Method | Result |
|---|---|---|
| Unused locals/parameters | `tsc --noUnusedLocals --noUnusedParameters` on `packages/layout`, `packages/react/src/layout`, `tests/browser` | clean |
| Debris | grep `TODO`, `FIXME`, `console.log`, `debugger`, `spike` in layout, react layout, browser tests | none (`console.warn` only for the documented `'unsupported'` warning) |
| Unused exports | exported names of `packages/layout/src` cross-referenced with importers and `index.ts` | the remaining non-imported exports are types that appear in public signatures |
| No 0.1.0 trace | V6 grep (see `cp6_acceptance.md`) | none |
| Lint | `npx biome check` over the changed packages | clean |

Size of the layout code (lines, `wc -l`):

| Part | Files | Lines |
|---|---|---|
| Pure core | `geometry`, `motion`, `plan`, `solve` | 1,492 |
| DOM engine | `scope`, `dom`, `realize/*`, `presence*`, `view_transition`, `types` | 3,325 (`scope.ts` 1,946) |
| React adapter | `packages/react/src/layout` | 1,567 |

The plan estimated the pure core at about 900 lines. It is 1,492: the K1 visual-space model
(parent full maps, presence about the absolute origin), the K15/K16 rules (anchored momentum,
order-free followers, size floor, retained velocity) and K22's epoch maps are all in the core
and each has its own tests. I did not split `scope.ts`: it is one flush pipeline (read, plan,
write, layers) whose stages share the frame state, and a late split would carry risk with no
behaviour gain. Built `packages/layout/dist/index.js`: 97,358 bytes unminified, 25,068 gzip -9.

Found during CP8 and fixed:

- **K21 coverage gate** (`961f163`, `2f98f1a`). jsdom cannot run layout, so the four engine
  files (`scope.ts`, `dom.ts`, `realize/raf.ts`, `realize/waapi.ts`) were below the vitest
  floors. They are now excluded from vitest coverage and gated by Chromium V8 precise coverage
  of every browser case (`pnpm test:browser --coverage`, `tests/browser/coverage.ts`), floors
  90/80/95/92; timed cases (`COST`, `SCALE`) are not instrumented. CI's browser job runs it.
- **Tests for every option error and every `'unsupported'` cause** (`b1af208`):
  `layout:OPTIONS` (15 invalid group options, boundary values, re-add) and `layout:CAUSES`
  (8 causes each warning with its cause; 4 look-alikes still animate).
- **CP6 trial defects** J-016, J-032 (`cdd2c6a`, `732d1c4`), J-033, J-034 (`a6c2a1d`,
  `3757638`), each with a frame-level regression case in three browsers.

## CP8 trial fixes (J-032, J-035, J-036)

Trial `cp8_final_trial_result.md` (frozen `1a244e3`) failed on J-032 (S0), J-035 (S0) and
J-036 (S1); J-016, J-033 and J-034 were closed. The fixes are in `4eeed91` (engine and tests)
and `74da464` (ARCHITECTURE §3.1, §5.3 and §5.4, drift K23). The proof is in `cp4_engine.md`,
"Fix proof report for the CP8 trial".

- **J-032.** A kept track keeps its presence matrices and takes its CSS box from the current
  flush. In `layout:J32B` (the trial's case) the child stays at (60, w 40) and stays on the
  independent path every frame in all three browsers.
- **J-035.** An anchored node takes its parent as its own flush space draws it, both for
  placement and for the keep test. `layout:J35` and `layout:J35B` (depth 2) cover it: B is
  (120, w 40), every frame is on `R + 100 − W/2`, and a no-op flush keeps every track.
- **J-036.** Each parent map is `corr ∘ Ω_parent`, at 4 compositions per layer. On the
  trial's chain that is 4(N−1)−1 compositions, where the old code needed N(N−1)/2. The user
  approved the §5.3 statement "O(N) map arithmetic per frame, plus a constant per layer" on
  2026-10-24.

The new cases fail on the old engine with the trial's numbers: 60 → 35 px and 120 → 100 px.

## CP8 re-trial fix (J-037)

The re-trial `cp8_final_retrial_trial_result.md` (frozen `5f1ec4c`) closed J-032, J-035 and
J-036, accepted the approved §5.3 statement, and kept J-016, J-033 and J-034 closed. It found
J-037 (S0): a no-op flush after a layer change moved a continuing crossfade follower,
140, w 52 → 132, w 41.6.

Fixed in `4cfc353` and `9f319b1` (K24): a continuing follower keeps its flush's space like a
kept track, and a follower takes its lead's box through `corr_f ∘ corr_l⁻¹`. Coverage:

- `layout:J37`, `J37Control`, `J37Moving` and `J37Retarget`: every frame, opacities, release
  and cleanup, in three browsers.
- A pure test of layered follower pairs in either order, with rates.

On the `5f1ec4c` engine J37 fails with the trial's numbers. With only the conversion removed,
J37Retarget fails by 13 px. The proof is in `cp4_engine.md`, "Fix proof report for the CP8
re-trial".

## T8.2 Fresh clone

`git bundle` of `layout/final` at `9f319b1`, cloned on june-wsl into an empty directory
(`~/ani-v2/lay-fresh`), then:

| Step | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| CI | `pnpm test:ci` (biome, typecheck, build incl. `next build`, vitest coverage) | exit 0 |
| Chromium | `pnpm test:browser --coverage` | 132 passed, 0 failed; engine coverage 94.69 / 85.88 / 98.01 / 97.53 |
| Firefox | `pnpm test:browser --browser firefox` | 130 passed, 2 skipped (Chromium-only CDP cases), 0 failed |
| WebKit | `pnpm test:browser --browser webkit` | 130 passed, 2 skipped, 0 failed |
| Size | `pnpm size` | all 8 scenarios PASS (everything 22,910 / 23,700 gzip) |

Also at the `4cfc353` code (`9f319b1` changes docs only), on the mirror:
`pnpm test:waapi-trace` passed. The docs smoke test (`docs_showcase.mjs`) passed in all three browsers on the fresh build at `1a244e3`; the docs
and fixtures have not changed since.

## V8

All green at `9f319b1`. Verdict of this review: **PASS**, subject to the tribunal.

## Residual risks

- A crossfade follower that is a layered ancestor of its own lead (an exiting element that
  contains its replacement) is drawn at the lead's box without the space conversion.
- J-029: a render that knows no document yet touches every live implicit root; J-031: text
  changes and ancestors above a participant's parent are not observed (`cp5_react.md`).
- A retained removed lead's own presence layer is taken as last measured (it is gone and
  cannot be read; `cp4_engine.md`, CP5 trial engine fixes).
- E3's enter expectation depends on the core timeline convention that an enter starts at its
  commit (`t + DT`); a change there would move E3 by about 3 px at t = 0 (`cp6_acceptance.md`).
- The whole commit at 1,000 movers is 9–13 ms; only the read time is gated (`cp4_engine.md`).
- The docs smoke test runs on a real clock; it is a product check, not a frame-level one.
