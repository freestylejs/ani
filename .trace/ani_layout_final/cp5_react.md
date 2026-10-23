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
- **Dev trigger contract.** A `MutationObserver` per scope watches the subtree of each
  participant's parent (nodes, `class`, `style` beyond the owned declarations). It warns once when
  such a batch arrives with no capture since the last flush (trial J-031, see the fix proof).
  Scopes with no connected participant are ignored.

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
| E5 notifications | E5 | Superseded: the fixture did not use plan.md's E5 parameters and the add frames only checked finiteness (trial J-030). See "CP5 trial fix proof", J-030. |
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

## CP5 trial fix proof

Trial: `cp5_react_trial_result.md` (frozen 8211c7c). Scope of this proof: the adapter defects
J-026, J-027, J-028, J-029, J-031, the adapter half of J-016, the React half of J-030, and a
React 18.3 defect found after `layout/final` started running the suites on React 18.3
(`react_layout_r18`). The engine halves (`packages/layout/src/**`, `layout.ts` J19–J25) are not
part of this branch. Branch `layout/react-fix`, one commit per defect; `layout/final` (6f374af,
the engine fixes and `react_layout_r18`) merged cleanly in 8dfad7b.

Numbers are Chromium / Firefox / WebKit (C/F/W). "Before" runs replace only the fixed source
file(s) with their previous version and keep the new tests. Every browser case named below asserts
every frame against an independent expectation (the oracle in `layout/src/__tests__/oracle.ts`,
Core's timing for presence poses), and any `console.warn` in a case fails it.

### J-016 (adapter half): equivalent motion restarted a track — a0a3afb

- Changed: `packages/react/src/layout/context.ts` (`sameOptions`, `sameMotion`, `sameTiming`,
  new `sameValue`).
- Rationale: options are compared by effect. An omitted field equals its §7.1 default (duration
  0.35, delay 0, `timing.easeOut()`, `layout` true, `layoutCrossfade` true, `radius` false). A
  timing compares by class and parameters (`opt`, in any key order; a timing without `opt`, such
  as `timing.linear()`, field by field). The engine's own comparison is the engine implementer's.
- Tests: jsdom `J-016: compares motion by effect…` (before: 4 `set` calls for equal options,
  after: 0; a real change still calls `set` once); browser `react_layout:J16`.
- Numbers (group duration 1 / linear, x 0 → 200, re-render at 0.2 s, two 0.02 s frames):

  | Change at 0.2 s | Before x at 0.2/0.22/0.24 s | After |
  |---|---|---|
  | `{}` → `{ delay: 0 }` | 40 / 40 / **43.968323** C, **43.966660** F, **43.968323** W | 40 / 44 / 48 ×3 |
  | spring `{m,k,c}` → `{c,k,m}` | 141.2644 / 141.2644 / **155.384705** C (155.383331 F, 155.384735 W) | 141.264 / 154.129 / **165.416** (first track 165.415927) ×3 |
  | `{}` → `{ duration: 1 }` | already equal through the group's motion | 40 / 44 / 48 ×3 |
  | `{}` → `{ duration: 0.5 }` (control) | — | retargets ×3 |

  Every later frame stays on the first track (max error 0 / 0.0105 / 0 px).

### J-026: an equal policy object re-created the scope — ef2eaa1

- Changed: `packages/react/src/layout/layout_group.tsx` (scope options compared with
  `sameValue`; the clock by identity).
- Tests: jsdom `J-026: keeps the scope for an equal policy object…`; browser `react_layout:J26`.
- Before (fresh `{ maxDuration: 0.1 }` at 0.2 s): x **40 → 200**, clock subscribers **1 → 0**, ×3.
- After: x 40 / 44 / 48 at 0.2 / 0.22 / 0.24 s and every frame on the first track (error 0 ×3),
  one subscriber; `{ maxDuration: 0.2 }` still re-creates (x 200, 0 subscribers); `onSnap` is
  still the latest prop (existing jsdom test).

### J-027: popLayout lifted the drawn box — 587d952

- Changed: `packages/react/src/layout/presence.tsx` (`popBox`, new `borderBox`, `ownMap`).
- Rationale: the lifted element keeps its own transforms, so the pop box must be the CSS box.
  The size comes from the computed border box; the offsets take the own map back out
  (`translate`, `rotate`, `scale`, `transform` about `transform-origin`, as CSS composes them),
  which covers presence's `transform` and layout's pose; the block's scale is divided out as
  before.
- Tests: jsdom `J-027` ×2 (origin 0 0 in a positioned block; centred origin in a scale-2
  block); browser `react_layout:J27` (a) exit interrupting an enter, (b) exit during a layout run.
  The existing scaled-block jsdom fixture now gives the row the CSS height its stubbed rect implies
  (10 px drawn 20 px tall at scale 2); its expected values are unchanged.
- Before: lifted to 50/94 80 × 40, drawn **(50, 108, 64, 32)** ×3; mid-layout exit lifted to
  top 6 px and left its track (off by 0.54 px at 0.248 s and growing) ×3.
- After: lifted to 50/80 100 × 50, drawn (50, 94, 80, 40) every frame until the release at
  0.208 s (error 0 ×3); mid-layout exit lifted to top 30 px, on its track through 0.68 s
  (error 0 / 0.0067 / 0 px).

### J-028: a moved fiber's replay restarted presence — fd4c30e

- Changed: `packages/react/src/layout/presence.tsx` (`usePresence`: deferred detach, same-element
  re-attach, phase guard, stale-run guard).
- Rationale: like a layout registration (K17), a detach waits until the end of the task; a
  re-attach of the same element keeps the handle, its running enter or exit, its registration
  and its holds (the handle and its presence link are never disposed). The phase effect starts
  each `token:present:willEnter` phase once per handle; a settled run of a replaced handle or of
  an earlier phase can neither clear the initial style nor report an exit.
- Tests: jsdom `J-028: keeps a running enter and exit across a StrictMode moved-fiber replay`,
  `J-028: an inline merged ref (new every render) keeps the running enter`; browser
  `react_layout:J28` (a) mid-enter reorder, (b) mid-exit reorder `[a, (b), c] → [c, a, (b)]`.
- Before: after the reorder opacity / translateY / scaleX / width **0 / 14 / 0.8 / 80**
  instead of 0.2 / 11.2 / 0.84 / 84 ×3; the exiting `b` jumped back to opacity **1** instead of
  0.8 ×3; jsdom inline merged ref: opacity 0 instead of 0.2.
- After: kept, then on the enter / exit every frame (max error 0 / 0.0067 / 0), `b` released
  once at 1.000 s, no clock subscriber after the settle, ×3.
- The docs writer's case: an inline `mergeRefs(...)` (a new callback every render, so React
  calls `ref(null)` then `ref(element)` in every commit) is fixed by the same change; the public
  API is unchanged.

### J-029: AnimatePresence touched the global document's root — d4564b2

- Changed: `packages/react/src/layout/context.ts` (live roots per clock, `existingScopes`),
  `presence.tsx` (`register(document)`, AnimatePresence touches and commits the roots of the
  documents its children registered from), `use_layout.ts` (a first render, whose element is
  unknown, touches every live implicit root instead of the global document's only).
- Rationale: a render that knows its documents touches exactly their implicit roots; one that
  knows none yet touches every live implicit root of the default clock (one extra read per
  other document; missing one loses the change). Roots are still created by registration and
  disposed per `(clock, document)`.
- Tests: jsdom `J-029` (settle commit: the iframe-like document's root gets
  `['capture', 'flush']` with the row still present, the main root nothing; a participant's
  first render in that document captures before its add; independent disposal); browser
  `react_layout:J29` (main document and iframe, default clock paused, presence driven alone).
- Before: iframe sibling **y 50 → 0**, translate empty, ×3 (main control y 50, `0px 50px`).
- After: both y 50 with `0px 50px` at t = 0; both settle at y 0 with no owned style; after the
  iframe root unmounts the main root still animates (`0px -50px`), ×3.

### J-031: the trigger warning missed parent class/style — f497d3c

- Changed: `packages/react/src/layout/context.ts` (`movesLayout`, `authoredStyle`, observer).
- Rationale: each participant's parent is observed with its subtree: nodes added or removed,
  `class`, and `style` only beyond the declarations layout, presence and Core write while
  animating (`translate`, `scale`, `transform`, `opacity`, corner radii), so their frames never
  warn. A batch after which no participant is connected (the scope unmounting mid-run) is
  ignored; without that a frame write and the unmount shared a batch and warned (found by
  `react_layout:J16`).
- Tests: jsdom `J-031: warns once for a memoized parent class or style change…` (owned writes,
  `update(fn)` and a captured commit: 0 warnings; the memoized change: 1; a second: still 1);
  browser `react_layout:RL6` extended (class and style, memoized and rendered, with the layout run
  and a presence enter animating every frame).
- Before: memoized class change moved b **(0, 50) → (40, 0)** with **0** warnings ×3.
- After: memoized class / style: the same jump with exactly 1 warning (still 1 after a second
  change); rendered class / style: b drawn at (0, 50) at t = 0, animated, 0 warnings; ×3.

### J-030 (React half): E5 — 54abcfd

- Changed: `tests/browser/cases/react_layout.ts` (E5 rewritten).
- Fixture (plan.md E5): enter y 14 / scaleX 0.8 / opacity 0; exit y 10 / scaleX 0.9 / 0.2 s; a
  spring (`m 1, k 170, c 26`) for the enter (0.4 s), the exit and layout (0.4 s); origin
  centre-bottom; `layout: 'position'`; popLayout; five adds 80 ms apart.
- Expectation per frame and toast: presence's pose from Core's spring per property, the drawn box
  from that pose about the centre-bottom origin, and for a toast with a layout track the oracle's
  track (interrupted tracks with the oracle's own velocity) moved by `V(t) − q0`, `q0` being the
  inner box it was planned against; transform, opacity and drawn box are all checked. The exit
  checks the popped box through the exit pose, its opacity, the bottom edge (scaleX never moves
  it), the release at ≈ 0.2 s, the siblings' layout boxes final at t = 0 and their tracks.
- Result: **known failure, engine defect E-1 below.** Frames 0–24 (all five adds, every enter
  first frame, 6 interrupted tracks with their velocity) and the whole exit phase are on the expectation ×3; from
  frame 25 on, 118 / 119 / 118 checks are off. `knownFailures.E5` names the cause; the runner
  reports "known failure now passes" once the engine is fixed.

### E-1 (engine, not fixed here): a flush that leaves a track running re-freezes the presence layer

- Where: `packages/layout/src/scope.ts` (flush of active nodes; §3.1, §4.2, §5.5).
- Observation in E5: at frame 25 the first toast's enter ends and `usePresence` re-renders it
  (its initial style is dropped), which flushes the scope. t2 (track planned at frame 20,
  presence scaleX 0.98407 then, 0.99501 now; centre moved 0.75 px, under the threshold) keeps its
  track but is drawn **w 295.22 instead of 298.50** (engine writes `scale: 0.989013 1`); t1 gets
  `scale: 0.995006 1` (298.50 instead of 300); t3/t4 (centre moved ≥ 1 px) get new tracks and are
  off by **11.6 / 5.6 px** one frame later. Before the flush every toast was within 0.0001 px.
- Vanilla repro (no React; ×3 identical): one 300 × 48 node, `layout: 'position'`, 1 s linear,
  moved 56 px down; its inline `transform: scaleX(s)` (origin centre-bottom) advances 0.90 → 1.00
  by 0.01 before each of the first 10 frames; at 0.08 s `group.capture(); group.flush()` with no
  DOM change:
  - scaleX only: the no-op flush moves the box from **(x 15.5, w 285) to (x 23, w 270)** at the
    same instant; the trajectory differs from the run without that flush by up to **15.79 px**.
  - scaleX and translateY: continuous at the flush, but the track is replaced; the trajectory
    differs by up to **4.70 px**.
- Expected (§3.3 invariants 1, 4, 5; §11 "unrelated re-render: identical trajectory"): a flush
  that changes no layout box changes nothing on screen and replaces no track; an animating
  presence transform stays a visual layer over the track planned against it.

### React 18.3: a render before the pending flush refreshed the commit's capture — b2f993a

- Found after merging `layout/final` (bd41cc0 runs `react_layout` on React 18.3 as
  `react_layout_r18`): `RL3` failed ×3 and `RL4` in WebKit: `b moved by 38.00 px while time stood
  still: {"x":4,"y":82,…} → {"x":4,"y":44,…}`.
- Root cause (traced touch / commit / flush): a transition renders time-sliced, so its touches
  capture in an earlier task; React 18 commits it in a later task and starts the next render in
  that same task, before the commit's flush microtask. That render's touch came from a later task
  than the capture, so `capture()` refreshed it with the DOM React had just mutated; the flush
  then saw B = A and the commit jumped. React 19 committed in the touching task, so its touch
  reused the capture.
- Changed: `packages/react/src/layout/context.ts` (`touch()` does not capture while the commit's
  flush is queued; it marks the scope touched, so the flush consumes the commit's own capture and
  its K14 hand-off capture gives the new render its before-boxes).
- Tests: jsdom K14 test now asserts `['flush', 'capture']` for a touch in the commit's task (it
  used to assert the refresh, `['capture', 'flush', 'capture']`) and adds the time-sliced order
  (touch; later task: commit, touch → `['capture', 'flush', 'capture']`); browser
  `react_layout_r18:RL3/RL4` (picture unmoved, 113–121 checks, 6 nodes animated and settled).
- Before: RL3 FAIL ×3, RL4 FAIL in WebKit. After: both pass ×3 (repeated 3 × Chromium, 2 × WebKit).
- Documentation: §7.2 "Adapter mechanics" says a render calls `capture()` on its scope; the
  exception (not while that scope's flush is queued; the hand-off captures instead) belongs there.

### Commands (after b2f993a, mirror `~/ani-v2/lay-react`)

| Command | Result |
|---|---|
| `pnpm vitest run react/src/layout` | 2 files, 37 passed |
| `pnpm vitest run` | 136 files, 1,598 passed (needs `@freestylejs/ani-react` built for the docs examples) |
| `cd packages/react && npx tsc --noEmit --skipLibCheck` | exit 0 |
| `npx tsc -p tests/browser --noEmit` | exit 0 |
| `npx biome check packages/react tests/browser` | exit 0, 4 warnings (all pre-existing), 868 infos |
| `react_layout:*` C / F / W | 13 passed, 1 known (E5) each |
| `react_layout_r18:*` C / F / W | 13 passed, 1 known (E5) each |
| `acceptance_r18:*`, `acceptance_r18c:*` C / F / W | 7 passed each |
| `layout:*` Chromium | 25 passed |
| `test:browser --browser chromium` (every module) | 117 passed, 2 known (E5, E5 on React 18.3) |

### Residual risks

- E5 stays a known failure until E-1 is fixed in the engine.
- J-029: a render that knows no document yet touches every live implicit root (one read per
  extra document). `useLayoutGroup()` without a group still targets the global document's root.
- J-031: text changes (`characterData`) and ancestors above a participant's parent are not
  observed; a parent that also holds unrelated content (e.g. `body`) can warn once for an
  unrelated change; Core animating a non-owned inline property (e.g. a colour) of a node in that
  subtree with no capture warns once.
- J-027: own `rotate` about a 3D axis and 3D `transform` parts are taken as 2D (layout snaps
  those as `'unsupported'` anyway).
- J-028: if a `usePresence` element is replaced by a different element, the new handle does not
  start the current phase (as before this fix).
