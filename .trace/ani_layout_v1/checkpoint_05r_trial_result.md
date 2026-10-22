# Checkpoint 05R — Production Presence Addendum

**Task:** close the two open production gaps identified after Phase 05:
`usePresence` had no usable `style`, and `AnimatePresence` did not implement
`popLayout`.

**Protocol:** same execution protocol as checkpoints 01–05. Source changes are
not accepted by the implementer's own judgment. A CHIEF JUSTICE pass
(`gpt-6.1-sol`, xhigh) is required after evidence is recorded.

**Date:** 2026-10-22

## Scope

- `usePresence` returns `style: CSSProperties | undefined`.
  - First enter / SSR carries `motion.initial` through core `createStyleSheet`.
  - The initial style is removed after mount, when the core handle owns the
    values.
  - Resting state remains `undefined`; no permanent inline style is stamped.
- `AnimatePresence mode="popLayout"`:
  - Exiting nodes are taken out of flow with an absolute-position box.
  - The box is cached while present (one layout read per popLayout child update,
    opt-in only), including offset-parent-relative left/top.
  - `pointer-events: none` while exiting.
  - Re-entry removes the pop style and returns the node to normal flow.
  - Custom-exit `usePresenceControl` does not receive popLayout style by design;
    use `usePresence`.
- Docs and architecture updated; size rows re-measured.

## Evidence

```text
pnpm test:ci                                      -> PASS
  131 test files / 1,504 tests
  react layout: 19 tests
  layout core: 53 tests
pnpm check                                        -> PASS
pnpm build                                        -> PASS
pnpm --filter @freestylejs/ani-react build        -> PASS
head -1 packages/react/dist/layout.js             -> 'use client';
pnpm test:browser --case "layout:*"               -> 9/9 Chromium
pnpm test:browser --browser firefox --case "layout:*" -> 9/9 Firefox
pnpm test:browser --case "react_layout:*"         -> 2/2 Chromium
pnpm test:browser --browser firefox --case "react_layout:*" -> 2/2 Firefox
git diff --stat 6715bb1 -- packages/core          -> empty
git diff 6715bb1 -- packages/core | wc -l         -> 0
```

macOS WebKit (Linux WebKit host remains blocked by missing shared libraries):

```text
core layout suite 8/8                         -> PASS
React 19 R1 LayoutGroup                       -> PASS
React 19 R2 popLayout (box preserved/sibling moved) -> PASS
React 18.3.1 StrictMode R1                    -> PASS
```

React tests added for this addendum:

- SSR/first-enter style contains `motion.initial`; style is cleared at rest.
- `popLayout` makes the exiting node `position: absolute`,
  `pointer-events: none`, and completes removal.
- PopLayout geometry refreshes when a present child moves/resizes before exit.
- Offset-parent border and scroll offsets are applied.
- Browser R2 compares the preserved rectangle and sibling movement.
- Same-node popLayout re-entry removes absolute positioning and ignores stale completion.
- Existing 15 React regressions remain green.

Coverage after addendum:

```text
layout/src          86.93 / 79.31 / 93.42 / 91.72
react/src/layout    90.6 / 80.75 / 92 / 92.98
```

Size (esbuild minified ESM, gzip, peers external, tree-shaken):

```text
ani-layout all                7,274 B  (budget 7,500)
FLIP-only                     2,749 B  (budget 3,000)
View Transition-only          1,915 B  (budget 2,200)
Presence-only                   815 B  (budget 1,200)
ani-react/layout layout-only  1,340 B  (budget 1,500)
ani-react/layout presence-only 1,785 B (budget 2,000)
ani-react/layout all          3,129 B  (budget 3,200)
```

## Production constraints recorded

- PopLayout is opt-in and pays one box read per present popLayout child update;
  sync mode pays none.
- PopLayout uses `offsetParent`-relative coordinates and absolute positioning;
  transformed/offset-parent edge cases are documented.
- `usePresence` initial style is cleared in a passive effect; SSR initial markup
  is preserved, and core owns values after mount.
- Custom-exit controls do not get popLayout style.
- Linux WebKit and mobile engines remain unexecuted in this environment.

## Verdict

Pending CHIEF JUSTICE re-judgment.

## Second protocol pass — repairs after CHIEF JUSTICE FAIL

- **J-01:** the popLayout measurement effect no longer has a dependency array;
  it refreshes the cached box after every present popLayout render, not only on
  presence token changes. Regression moves/resizes a present row before exit and
  asserts the exit uses the new 80/40 box.
- **J-02:** coordinates now subtract `offsetParent.clientLeft/clientTop` and add
  `scrollLeft/scrollTop`; the null-parent path uses window scroll offsets.
  Regression uses a 10px border and 5/3 scroll offsets and asserts 25/11.
- **J-03:** browser R2 now compares the exiting rectangle to the before rectangle
  and verifies the sibling moves into the gap. The same-node re-entry test uses
  popLayout and checks absolute positioning is removed.
- **J-04:** the accepted-risks `popLayout` deferred row was removed; the P3 row
  now says it landed in the React adapter.
- **S3:** counts/coverage/evidence updated; React WebKit browser is recorded.

## Evidence after repairs

```text
pnpm test:ci -> PASS (131 files / 1,504 tests)
pnpm check -> PASS
pnpm --filter @freestylejs/ani-react build -> PASS
React layout unit -> 19/19
Chromium react_layout R1/R2 -> 2/2
Firefox react_layout R1/R2 -> 2/2
macOS WebKit core 8/8; React19 R1/R2; React18 StrictMode R1 -> PASS
core diff 0
```

## Final tribunal

- Verdict: **TRIBUNAL PASS**. J-01 box refresh, J-02 border/scroll coordinates, J-03 discriminating rectangle/sibling/re-entry regressions, and J-04 architecture row are closed.
- Evidence accepted: 131 files / 1,504 tests, 19 React tests, Chromium/Firefox React R1/R2, macOS WebKit core + React 19 R1/R2 + React 18.3.1 StrictMode R1, build/check, coverage 86.93/79.31 and 90.6/80.75, core diff 0, all seven sizes within amended budgets.
- Recorded constraints remain: popLayout is opt-in and pays one box read per present child update; custom-exit controls do not receive popLayout style; Linux WebKit and mobile engines remain environment-gated.
