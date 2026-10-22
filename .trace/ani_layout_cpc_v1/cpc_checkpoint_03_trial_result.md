# Checkpoint 03 Trial Result — Layout modes, dependency, config, wait

**Task:** `cpc_task_03_api.md`  
**Validation:** `cpc_valid_03_api.md`  
**Verdict:** pending re-judgment after FAIL repairs

**Reviewed code revision:** `31fabca`; base `be5f1b2`.

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
  134 test files / 1,537 tests
  layout core 23 tests; React layout 23 tests
pnpm check -> PASS
pnpm build / layout build / react build -> PASS
React R1/R2/R3 Chromium -> 3/3 PASS
React R1/R2/R3 Firefox -> 3/3 PASS
cpc:P1 Chromium -> PASS
core diff 6715bb1 -> 0
```

Core tests cover dependency suppression (initial/unchanged/changed), size and
preserve-aspect modes. React tests cover LayoutConfig duration inheritance,
dependency changes, wait sequencing, ghost prevention and exposed custom data.

## Known limits

- `custom` is exposed to presence children via `usePresence().custom`; exit
  variants remain a future API and are not claimed.
- `preserve-aspect` currently uses a uniform box scale; aspect-changing content
  should use `position`.
- Phase 04 compiled projection/velocity owns the nested-correctness work.

## FAIL repair

- F1: `layoutDependency` added to the `useLayout` `set` effect dependencies; initial dependency is committed at add/initial set. Core tests cover initial, unchanged and changed dependency. React test covers changed dependency and config duration.
- F2: `custom` is exposed through `AnimatePresence` and `usePresence().custom`; authority wording was corrected; test verifies SSR/child access.
- F3: added preserve-aspect, changed dependency, LayoutConfig inheritance, wait ghost, custom and SSR tests; report corrected.
- F4: wait mode filters uncommitted children and releases hidden entries silently; a→b→c regression passes.
- F5: LayoutConfig no longer spreads children or lets an explicit undefined override a parent; JSDoc placement fixed.
