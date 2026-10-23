# CP5: React adapter, implementer's checkpoint review

- Authority: `plan.md` CP5 (T5.1–T5.3, V5); `ARCHITECTURE.md` §4.1–§4.2 (render capture, one flush per
  commit, hand-off), §6 (popLayout), §7.2 (React API, trigger contract, adapter mechanics); drift K13,
  K14, K17.
- Code (rewritten, `packages/react/src/layout/`):
  - `context.ts`: the scope handle `createLayoutScope`, the implicit roots `rootScope` /
    `peekRootScope`, `scopeOf` / `existingScope`, option comparison, `LayoutContext`,
    `PresenceContext`.
  - `use_layout.ts`: `useLayout`, `useLayoutGroup`.
  - `layout_group.tsx`: `LayoutGroup`.
  - `presence.tsx`: `AnimatePresence` touch/commit, popLayout containing-block measurement in
    render, initial-style lifetime.
  - `index.ts`.
- Removed (hard migration): `LayoutConfig`, `deps`, `maxAnimated`, `maxBoxes`, `onError`, the
  `play`/`LayoutSnapshot` facade (`createLayoutFacade`), and the class `LayoutBoundary`.
- Tests:
  - jsdom `__tests__/layout.test.tsx` (adapter contract, 14 tests, `createLayoutGroup` mocked to
    record calls).
  - `__tests__/presence.test.tsx` (15 tests: the presence tests kept from 0.1.0, plus the
    containing-block cases).
  - Browser module `tests/browser/cases/react_layout.ts` (RL1–RL8, E5).
- Tooling:
  - `vitest.config.ts` aliases `@freestylejs/ani-layout` to its source, as it already does for
    core (no stale-dist coupling).
  - `tests/browser/tsconfig.json` maps `@freestylejs/ani-react/layout` and sets `jsx`.
  - Root tool versions are pinned exactly (the packaging test).

## Adapter model, as implemented

- **Scope handle.** One per core scope.
  - It keeps its registrations, so a change of a scope option re-creates the core group with
    every participant.
  - `touch()` (render) → `capture()`.
  - `commit()` (layout effect) → one queued microtask per scope. That microtask runs `flush()`,
    then `capture()` if a render touched after the last layout effect (K14).
  - `update(fn)` runs a pending commit's flush first, then `capture → flushSync(fn) → flush`.
- **Implicit roots.** Keyed by `(clock, document)`.
  - Created only by a registration; renders and effects touch only an existing scope.
  - Disposed one microtask after the last participant leaves, independently per pair.
- **`LayoutGroup`.**
  - The outermost group owns the scope. It creates it lazily in render (side-effect free), and
    disposes it one microtask after its effect cleanup unless the effect re-runs (StrictMode).
  - A change of `clock`, `reducedMotion`, `threshold`, `maxNodes` or `retain` (by value)
    re-creates the scope. `onSnap` always reaches the latest prop.
  - Nested groups:
    - namespace `layoutId`s as `outer/inner/id`;
    - merge `motion` outermost first;
    - print one development warning when they set a scope option.
- **`useLayout`.**
  - Render touches the scope.
  - The layout effect compares the resolved options by value (a timing by its class and `opt`)
    and calls `set` only on a change, then queues the flush.
  - The ref callback is stable per scope and forwards `ref`.
  - A removal waits until the end of the task, so StrictMode's replay of mounted and moved
    fibers' refs keeps the registration and its B (K17).
- **`AnimatePresence`.** Render touches; the layout effect commits.
- **`usePresence`.**
  - The popLayout box is measured in the render that exits, against the containing block: the
    nearest ancestor with a non-static position, a transform/translate/scale/rotate, a filter
    or backdrop filter, a perspective, layout/paint containment, size container-type, or a
    matching `will-change`.
  - The box is rect-based and divided by the block's scale (from its exact border-box size).
  - `motion.initial` stays the style prop until the enter has finished (K17).
- **Dev trigger contract.** A `MutationObserver` per scope watches the participants' parents
  (childList) and the participants' `class`. It warns once when a mutation batch arrives with no
  capture since the last flush. Scopes with no participants are ignored.

## Tasks

| Task | Evidence |
|---|---|
| T5.1 `useLayout`, `LayoutGroup`, implicit roots, `useLayoutGroup`, `AnimatePresence` toucher, dev `MutationObserver` | jsdom: one flush per commit with captures seeing the old DOM; StrictMode keeps one scope; disposal on unmount; nesting (namespace `page/card/hero`, merged motion, warning); re-creation by value and latest `onSnap`; `set` only on a value change; `layoutDependency` passes through; a root per document, disposed independently; roots per clock; `update` captures before `flushSync` and flushes once; K14 hand-off order; the warning fires once; ref forwarding; a scope move when a group appears. Browser: RL1–RL8. |
| T5.2 Presence: popLayout containing block, opacity ownership, release hold | jsdom: positioned block (border + scroll → 25 / 11 px); non-positioned transformed block (scale 2 → 15 / 5 px, 20 × 10); no block (page coordinates); measured in the exiting render. Opacity ownership and the release hold are package-internal (`presence_link.ts`, CP4 T5 / J17). E5 composes presence and layout on one element. |
| T5.3 Tests | See below. |

| T5.3 browser requirement | Case | Chromium / Firefox / WebKit |
|---|---|---|
| List reorder, every frame on the oracle, byte-identical restore | RL1 | 0.0000 / 0.0080 / 0.0000 px |
| StrictMode (double render, effect replay, moved fibers' ref replay) | RL2 | two reorders, 0.0000 / 0.0080 / 0.0000 px |
| Transition (6 interrupting transitions over time-sliced renders) | RL3 | picture unmoved over 112 / 112 / 122 checks; 6 nodes animated and settled |
| Deferred value | RL4 | unmoved over 120 / 98 / 113 checks; 6 nodes animated and settled |
| Suspense (fallback, reveal, a suspending transition) | RL5 | unmoved over 118 / 113 / 120 checks; 6 nodes animated and settled |
| Memoized subtree: the warning; `useLayoutGroup().update` | RL6 | jumped with exactly one warning (and still one after a second change); `update(fn)` on the oracle 0.0000 / 0.0080 / 0.0000 px |
| Unrelated re-render: identical trajectory | RL7 | a re-render every 3rd frame; differs by 0.0001 / 0.0167 (Firefox's 1/60 px unit) / 0.0000 px |
| E5 notifications | E5 | 5 adds 80 ms apart: each enter's first frame equals the enter transform (scaleX 0.9, translateY −20, opacity 0) and the existing toasts do not jump. The middle toast exits under popLayout: it pops in place; the siblings' layout boxes are final at t = 0 and they are on the oracle every frame (≤ 0.0122 px); the bottom edge and the centre stay within 1 px under scaleX; released at 0.208 s. |
| Implicit root on the real clock | RL8 | mid-run between the endpoints at 120 ms; settled and restored |

"Picture unmoved" (RL3–RL5) is the strongest form of the capture contract. With the manual
clock stopped, no element may move by more than 0.5 px, checked after every task and every real
frame, whatever React commits. A commit only changes where things go, never what is on screen.
A mount appears where it lays out, and content hidden by Suspense lays out anew. Each case then
requires that something was left to animate and that everything settles with no owned style.

## V5

- Three browsers: `react_layout:*` 9 / 9 and `layout:*` 24 / 24 in each of Chromium, Firefox and
  WebKit. `test:browser --browser chromium` (every module): 80 / 80.
- `pnpm vitest run`: 1,577 / 1,577.
- `tsc`: `@freestylejs/ani-react` (sources and tests) and `tests/browser` are clean.
- No 0.1.0 symbol in package sources or tests:
  `git grep -nE "LayoutConfig|\bdeps\b|maxBoxes|maxAnimated|LayoutSnapshot|'preserve-aspect'|LayoutParticipantOptions|LayoutResult\b|createLayoutFacade" -- packages/layout packages/react tests/browser`
  finds nothing outside the spike modules (deleted in T6.5).
- Two hits remain, and neither is a 0.1.0 use:
  - `.play(` matches only core's timeline API (`freact_hooks.test.ts`).
  - `{ layout: 'box' }` remains in `motion.test.ts` only as a rejection case: it proves that the
    0.1.0 value now throws `ANI_INVALID_OPTIONS`.

## Residual risks

- A removal is deferred to the end of its task. If two commits run in one task and the second
  removes a node, the first commit's flush, still queued, sees that node disconnected (it is
  cancelled, §9), not removed.
- Render-time reads (capture, popLayout) can force a layout during render when the DOM is dirty
  (§12).
- The dev warning can only judge the mutation batches it sees. A capture taken for a commit that
  mutated nothing covers the next unrelated mutation once.
- The peer range `@freestylejs/ani-layout ^0.1.0` in `@freestylejs/ani-react` follows the release
  version chosen in T6.4.

## Verdict

PASS (implementer review): T5.1–T5.3 and V5 are met in three browsers. CP5 goes to the Chief
Justice together with the re-judgment of the CP4 trial's J-016–J-025 (fix proof in
`cp4_engine.md`).
