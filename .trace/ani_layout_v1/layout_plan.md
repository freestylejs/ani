# ANI Layout — Production Execution Plan

Date: 2026-10-21  
Task: `ani_layout_v1`  
Goal: ship a production-grade `@freestylejs/ani-layout` and `@freestylejs/ani-react/layout` with declarative presence + tiered layout animation, proven by unit, integration and real-browser tests, without changing `@freestylejs/ani-core`.

## Authority and drift

- Implementation authority: `packages/layout/ARCHITECTURE.md` (final pragmatic architecture; View Transitions + WAAPI approximate FLIP + snap).
- Historical/superseded: `ANI_LAYOUT_ARCHITECTURE_DECLARATIVE.md` (position-only proposal) and `ANI_LAYOUT_ARCHITECTURE.md` (initial proposal).
- The declarative surface goal from the historical document is preserved: `<LayoutGroup>`, `useLayout`, `<AnimatePresence>`, `usePresence`.
- The engine is the final tiered model: View Transitions for discrete swaps; WAAPI FLIP for interactive layout; snap for unreliable/large changes.
- No 1.x bridge, no legacy API, no ui-kit change, no push/publish without explicit user approval.

## Hard constraints

- `packages/core` diff must be **0 bytes**.
- Layout FLIP: zero ANI JS per frame, zero inline style writes, one read pass per transaction.
- Position path: zero `getComputedStyle`.
- Box path: `getComputedStyle` only for box nodes, max 16 per change.
- No observers, no `requestAnimationFrame` in layout source; WAAPI drives FLIP.
- Presence uses core `createStates`; watchdog only timer.
- SSR/no-DOM: no module-scope DOM, no hydration changes.
- Reduced motion leaves timing policy to core; no motion for `'jump'`.
- Package size targets (v1 measured, tree-shaken, peers external): layout all ≤7.5KB gzip (7,291B); FLIP-only ≤3.0KB (2,749B); VT-only ≤2.2KB (1,915B); presence-only ≤1.2KB (815B); React layout-only ≤1.5KB (1,340B); presence-only ≤2.0KB (1,785B); React all ≤3.2KB (3,129B).
- All tests: `pnpm check`, `pnpm ts:typecheck`, `pnpm build`, `pnpm test:ci`, targeted browser e2e.

## Phase map

| Phase | Deliverable | Valid gate | Checkpoint evidence |
| --- | --- | --- | --- |
| 01 | package scaffold, types, feature detect, pure presence reducer | build, typecheck, reducer tests | `.trace/ani_layout_v1/checkpoint_01_trial_result.md` |
| 02 | `createPresence` on `createStates`, watchdog, re-entry, SSR | manual-clock lifecycle tests, leak/timeout tests | `checkpoint_02_trial_result.md` |
| 03 | `createLayoutGroup`: WAAPI position/box, caps, step-downs, capture/play/update | fake WAAPI unit tests + browser FLIP e2e | `checkpoint_03_trial_result.md` |
| 04 | View Transitions helpers: `viewTransition`, `shareElement`, `retimeViewTransition` | mocked VT unit tests + browser fallback/name e2e | `checkpoint_04_trial_result.md` |
| 05 | React adapter: `LayoutGroup`, `useLayout`, `useLayoutGroup`, `AnimatePresence`, `usePresence`, `usePresenceControl`; docs; changeset | React integration/SSR tests, full build/test/size | `checkpoint_05_trial_result.md` |

## Phase 01 — scaffold + pure presence reducer

### Task
- Create `packages/layout` with package.json, tsup, tsconfig, src/index.ts, types, feature detection.
- Implement `reconcilePresence` / `settlePresence` as pure functions with stable identity, ordering, token invalidation.
- Add unit tests for add/remove/re-add, duplicate keys, stale tokens, ordering, no-op identity.

### Valid
- `pnpm --filter @freestylejs/ani-layout build`
- `pnpm --filter @freestylejs/ani-layout ts:typecheck`
- `pnpm vitest run layout/src/__tests__/presence_state.test.ts`
- `pnpm check` and root `pnpm ts:typecheck`
- `git diff --stat packages/core` empty.

### Checkpoint
- Package importable from Node without DOM.
- Reducer is pure and property-tested.
- No core changes; no React dependency in layout root.
- Checkpoint verdict written to `.trace/ani_layout_v1/checkpoint_01_trial_result.md`.

## Phase 02 — presence engine

### Task
- `createPresence(element, motion, options)` on core `createStates`.
- `PresenceMotion { present, exit, enter?, initial? }`; no mount style write.
- exit/re-entry/token/watchdog; reduced-motion release; dispose; SSR/no-frame-source behavior.
- Unit tests with manual clock and fake DOM.

### Valid
- Re-entry preserves same element/value continuity.
- Stale exit cannot release re-entered key.
- Watchdog releases `'timeout'`; dispose clears timer; `clock.size` returns to baseline.
- `renderToString`/Node import has no DOM access.
- `pnpm vitest run layout/src/__tests__/presence.test.ts`.

### Checkpoint
- Presence no ghost nodes, no leaked timers/subscriptions.
- No core diff.
- `checkpoint_02_trial_result.md`.

## Phase 03 — layout FLIP engine

### Task
- `createLayoutGroup` with `add`, `set`, `update`, `capture`, `play`, `finish`, `dispose`.
- WAAPI `Element.animate` position mode with additive `translate`; box mode scale + radius; caps/step-downs.
- One read pass; no inline writes; snapshot expiry; `yielded`/`capped`/`reduced`/`unsupported`.
- Unit tests with fake `Element.animate`/rects; browser e2e in Chromium/Firefox/WebKit.

### Valid
- p=0/p=1 endpoints; final layout exact; no leftover animations; `getAnimations()` empty.
- Read counts: normal play N rects; capture N rects, 0 gCS; box gCS ≤16. Active retarget may use N visual precheck + N post-cancel layout reads (≤2N) to preserve no-change and continuity; no-change stops at the N-read precheck. No reads during frames.
- No-change does not create/cancel animations.
- >300 movers snap; >16 box nodes step down; unreliable measurement snaps.
- `pnpm vitest run layout/src/__tests__/layout_group.test.ts`.
- browser e2e `pnpm test:browser -- --case "layout:*"`.

### Checkpoint
- Browser-native FLIP proven; H2 (first-frame flash) verified in P0 harness.
- `checkpoint_03_trial_result.md`.

## Phase 04 — View Transitions helpers

### Task
- `viewTransition(update, options)`, `shareElement`, `retimeViewTransition`, `supportsViewTransition`.
- Update exactly once; fallback for unsupported/foreign/reduced; names saved/restored; cap 32.
- Unit tests with mocked `document.startViewTransition`; browser fallback/name e2e.

### Valid
- Unsupported/reduced/yielded/skipped/interrupted/finished/throw paths update exactly once.
- Duplicate names newest wins; all inline names restored.
- `retimeViewTransition` returns retimed count, never throws for cosmetic failure.
- `checkpoint_04_trial_result.md`.

## Phase 05 — React adapter + integration

### Task
- Add `packages/react/src/layout` and `layout` entry to react tsup; `'use client'` banner.
- `LayoutGroup` DOM-less boundary, `useLayout`, `useLayoutGroup`, `AnimatePresence`, `usePresence`, `usePresenceControl`.
- `getSnapshotBeforeUpdate` capture; `componentDidUpdate` play; microtask/expiry; SSR/RSC.
- React 18/19 StrictMode tests; DOM identity; stale baseline; no duplicate exit.
- Docs page `packages/web/content/docs/guides/layout.mdx` + meta; package README; changeset.
- Full `pnpm test:ci`, `pnpm build`, `pnpm test:browser` (layout cases), docs example tests, size checks.

### Valid
- React integration test suite passes.
- SSR markup identical with/without boundaries.
- `ani-react` root entry byte-identical; layout subpath imports.
- Full test/coverage gate and size budgets.
- `checkpoint_05_trial_result.md`.

## Execution order

1. Phase 01 → checkpoint 01.
2. Phase 02 → checkpoint 02 (parallelizable with phase 03 tests after reducer/contracts stable).
3. Phase 03 → checkpoint 03.
4. Phase 04 → checkpoint 04 (parallel with phase 03 browser harness if independent).
5. Phase 05 → checkpoint 05.
6. Final reconciliation: full build/test/typecheck/browser/size; docs; commit sequence; report.

## Commit policy

- Atomic commits by module: scaffold/presence, layout engine, VT, React adapter, docs.
- No `git add .`; stage explicit paths.
- No push/publish.
