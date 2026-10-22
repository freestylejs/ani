# Checkpoint 03 Trial Result — Layout modes, dependency, config, wait

**Task:** `cpc_task_03_api.md`  
**Validation:** `cpc_valid_03_api.md`  
**Verdict:** **TRIBUNAL PASS** (S0/S1/S2 = 0)

**Reviewed code revision:** `a3f46bb`; evidence commit `34d9a86`; base `45f7377`.

## Delivered

- `LayoutMode` now includes `position`, `box`, `size`,
  `preserve-aspect`; `size` compiles scale-only box motion and
  `preserve-aspect` uses a uniform scale.
- `layoutDependency` on core participants and React `useLayout`; equal
  previous/current dependency suppresses a run.
- `LayoutConfig` React provider with inherited `motion` and `reducedMotion`;
  a group’s own props override it.
- `AnimatePresence mode="wait"`: new present children are hidden until the
  existing exit settles; committed-key tracking prevents the render-phase
  reconcile from revealing them early.
- Docs updated.

## Evidence

```text
pnpm test:ci -> PASS
  134 test files / 1,541 tests
  layout core 25 tests; React layout 25 tests
pnpm check -> PASS
pnpm build / layout build / react build -> PASS
React R1/R2/R3 Chromium -> 3/3 PASS
React R1/R2/R3 Firefox -> 3/3 PASS
cpc:P1 Chromium -> PASS
core diff 6715bb1 -> 0
```

Core tests cover dependency suppression (initial/unchanged/changed), the
capture-before-set `a,a,b,b,a → 0,1,0,1` sequence, size/preserve-aspect and
box-unavailable snap. React tests cover the same dependency sequence, nested
LayoutConfig inheritance/explicit-undefined behavior, StrictMode, wait ghost
prevention and exposed custom data.

## Known limits

- `custom` is exposed to presence children via `usePresence().custom`; exit
  variants remain a future API and are not claimed.
- `preserve-aspect` currently uses a uniform box scale; aspect-changing content
  should use `position`.
- Phase 04 compiled projection/velocity owns the nested-correctness work.

## FAIL repair

- F1: `lastDependency` was removed. `capture()` records the participant dependency at that instant, before React’s layout-effect `set()`. Core and React sequences `a,a,b,b,a` now assert animate deltas `0,1,0,1`.
- F2: `custom` is exposed through `AnimatePresence` and `usePresence().custom`; authority wording was corrected; test verifies SSR/child access.
- F3: added capture-before-set dependency, preserve-aspect, nested LayoutConfig inheritance, explicit-undefined inheritance, StrictMode, wait ghost, custom and SSR tests; report corrected.
- F4: unused `hiddenKeys` was removed; wait mode filters uncommitted children and releases the silent hidden path; a→b→c regression passes without a ghost warning.
- F5: `size`/`preserve-aspect` now snap when box motion is unavailable instead of degrading to a zero-translate position animation; types docs state this. Nested/undefined LayoutConfig defaults are tested.

## Final tribunal

- Verdict: **TRIBUNAL PASS**. F1–F5 are closed at `a3f46bb`.
- Low-severity follow-ups accepted: add a warning-spy assertion to the wait ghost test; cover the other box-skip branches; broaden StrictMode coverage; update public docs for snap/custom/dependency ordering. Docs updated here; the rest are tracked for Phase 04+.
- Phase 04 owns post-mount reducedMotion config refresh and nested boundary prop precedence.
