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

## T8.2 Fresh clone

`git bundle` of `layout/final` at `00fbbde`, cloned on june-wsl into an empty directory
(`~/ani-v2/lay-fresh`), then:

| Step | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| CI | `pnpm test:ci` (biome, typecheck, build incl. `next build`, vitest coverage) | exit 0 |
| Chromium | `pnpm test:browser --coverage` | 125 passed, 0 failed; engine coverage 94.67 / 85.84 / 98.03 / 97.49 |
| Firefox | `pnpm test:browser --browser firefox` | 123 passed, 2 skipped (Chromium-only CDP cases), 0 failed |
| WebKit | `pnpm test:browser --browser webkit` | 123 passed, 2 skipped, 0 failed |
| Size | `pnpm size` | all 8 scenarios PASS (everything 22,910 / 23,700 gzip) |

The same gate at `2f98f1a` (before the trial fixes) was also green (124 Chromium, coverage
94.43 / 86.19 / 97.85 / 97.38).

## V8

All green at `00fbbde`. Verdict of this review: **PASS**, subject to the tribunal.

## Residual risks

- An anchored node (`layoutAnchor`) is placed relative to its parent's drawn track box, not
  through the parent's presence layer (`cp4_engine.md`, J-032 section).
- J-029: a render that knows no document yet touches every live implicit root; J-031: text
  changes and ancestors above a participant's parent are not observed (`cp5_react.md`).
- A retained removed lead's own presence layer is taken as last measured (it is gone and
  cannot be read; `cp4_engine.md`, CP5 trial engine fixes).
- E3's enter expectation depends on the core timeline convention that an enter starts at its
  commit (`t + DT`); a change there would move E3 by about 3 px at t = 0 (`cp6_acceptance.md`).
- The whole commit at 1,000 movers is 9–13 ms; only the read time is gated (`cp4_engine.md`).
- The docs smoke test runs on a real clock; it is a product check, not a frame-level one.
