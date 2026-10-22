# Checkpoint 03 Trial Result — Layout modes, dependency, config, wait

**Task:** `cpc_task_03_api.md`  
**Validation:** `cpc_valid_03_api.md`  
**Verdict:** pending CHIEF JUSTICE

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
  134 test files / 1,531 tests
  layout core 20 tests; React layout 20 tests
pnpm check -> PASS
pnpm build / layout build / react build -> PASS
React R1/R2/R3 Chromium -> 3/3 PASS
React R1/R2/R3 Firefox -> 3/3 PASS
cpc:P1 Chromium -> PASS
core diff 6715bb1 -> 0
```

Core tests cover dependency suppression, size mode, and prior plans. React
tests cover LayoutConfig inheritance/wiring and wait sequencing.

## Known limits

- `custom` exit data is not yet in the public shape; it is deferred until the
  exit-variant API is designed rather than exposed as a no-op.
- `preserve-aspect` currently uses a uniform box scale; aspect-changing content
  should use `position`.
- Phase 04 compiled projection/velocity owns the nested-correctness work.
