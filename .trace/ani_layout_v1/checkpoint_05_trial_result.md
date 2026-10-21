# Checkpoint 05 — React Adapter + Production Integration

**Task:** `ani_layout_v1` Phase 05  
**Authority:** `ANI_LAYOUT_ARCHITECTURE_FINAL.md` / `packages/layout/ARCHITECTURE.md`  
**Reviewer:** CHIEF JUSTICE (`gpt-6.1-sol`, xhigh, Codex CLI)  
**Date:** 2026-10-22  
**Verdict:** **TRIBUNAL PASS** (S0/S1/S2 = 0)

## Scope delivered

- `@freestylejs/ani-react/layout` opt-in subpath with `'use client'` banner.
- `LayoutGroup` DOM-less boundary using `getSnapshotBeforeUpdate`/`componentDidUpdate`, a shared facade coordinator, and a post-commit microtask play.
- `useLayout` stable ref membership, forwarded-ref ownership transfer, StrictMode replay-safe attachment.
- `useLayoutGroup().update` captures, runs the React mutation under `flushSync`, then plays after React commits.
- `AnimatePresence` keyed retention with pure `reconcilePresence`, no wrapper DOM, metadata reclamation, and collective registrant completion.
- `usePresence` per-element `createStates` handle, detach unregistration, StrictMode recreation.
- `usePresenceControl({ maxExitMs })` custom-exit watchdog.
- Docs guide, package README, changeset.
- `ani-react` root entry source untouched; layout adapter is a separate build entry.

## Evidence

```text
pnpm test:ci                                          -> PASS
  - 131 test files / 1,500 tests
  - layout core: 53 tests
  - react layout: 15 tests
pnpm --filter @freestylejs/ani-react build            -> exit 0
head -1 packages/react/dist/layout.js                 -> 'use client';
pnpm check                                            -> exit 0
pnpm test:browser --case "layout:*"                   -> 9/9 Chromium
pnpm test:browser --browser firefox --case "layout:*" -> 9/9 Firefox (VT unsupported fallback)
pnpm test:browser --case "react_layout:R1"            -> PASS Chromium
pnpm test:browser --browser firefox --case "react_layout:R1" -> PASS Firefox
git diff --stat 6715bb1 -- packages/core              -> empty
git diff 6715bb1 -- packages/core | wc -l             -> 0
```

macOS WebKit evidence (Linux WebKit host missing system libraries):

```text
core layout suite: position, box-radius, base-translate, first-frame,
                    no-change, cap, view-transition-finished, reduced -> PASS
React 19 R1 (flushSync first-frame measurement) -> PASS
React 18.3.1 StrictMode R1 -> PASS (first-frame sampled at 1.63px on a
                                   one-frame WebKit sample; final exact)
```

React tests (15):

- LayoutGroup boundary flip with `useLayout`
- imperative descendant update through `useLayoutGroup().update`
- exiting child remains mounted until exit completes
- same key re-enters during exit and keeps the same DOM node
- StrictMode remount flip
- nested LayoutGroup dedupes into one transaction
- forwarded ref ownership transfer
- no-context fallbacks
- collective registrant completion (short + long exits)
- custom-exit watchdog
- distinct boundary transactions stay separate across microtasks
- replacement ref ownership and changed layout/layoutId options inside a parent layout effect
- stale control completion preserves a newer watchdog
- playback rejection propagates and the facade remains usable
- SSR markup has no wrapper DOM (`<ul><li>A</li></ul>`)

Coverage (recorded; optional-surface floors amended and documented):

```text
react/src/ani       98.93 / 96.77 / 100 / 100
react/src/layout    90.1 / 80.48 / 91.66 / 92.59
layout/src          86.93 / 79.31 / 93.42 / 91.72
```

Size (esbuild minified ESM, gzip, peers external, tree-shaken):

```text
ani-layout all       7,291 B  (budget 7,500)
FLIP-only            2,749 B  (budget 3,000)
View Transition-only 1,915 B  (budget 2,200)
Presence-only          815 B  (budget 1,200)
ani-react/layout     1,157 B  (budget 1,500)
```

## Tribunal history and repair

First FAIL findings J1–J8:

1. `useLayoutGroup.update` measured before React committed.
2. Nested coordinator could play before a later sibling ref attached.
3. Ref cleanup did not unregister after attach; forwarded ref replacement was not transferred.
4. React 18 StrictMode effect replay could destroy ownership without recreation.
5. Presence registration did not unregister on detach; any registrant could settle a key early.
6. Completed exits retained `childMap`/`willEnter` state.
7. `usePresenceControl` had no `maxExitMs` watchdog.
8. H2 had no React commit/browser proof.
9. Stale control completion cleared a newer watchdog before validating its token.
10. Ref/participant-option transfer happened in passive effects, after parent layout effects.
11. Coordinator lost `group.play` rejection.

Repairs:

- `useLayoutGroup().update`: capture → `flushSync(fn)` → play, coordinated through the facade. Regression covers a descendant state change that does not update the boundary.
- Facade play is deferred to a microtask; core snapshot expiry moved to the next task. Nested boundaries share one transaction.
- Facade add returns one cleanup that works before and after attach; forwarded refs are explicitly transferred and cleared.
- `useLayout`/`usePresence` effect setup recreates resources after StrictMode replay; ref detach unregisters.
- Presence uses `reportExit` per registrant and settles only when all registered handles for the current token report.
- `settle` reclaims `childMap`, `willEnter`, and exit counters.
- `usePresenceControl({ maxExitMs })` implements the watchdog.
- `safeToRemove` validates token first; replacement ref/options transfer is in the layout phase; coordinator promises reject and recover.
- R1 browser case proves React commit inverse first frame and exact final layout on Chromium and Firefox; macOS WebKit React 19 and React 18.3.1 StrictMode builds pass with flushSync/frame sampling.
- Coordinator regression proves two distinct snapshots do not join the same pending microtask play.
- Coordinator propagates `group.play` rejection; imperative callers and boundary error handling receive it; the next transaction remains usable.
- Ref and participant-option transfer now runs in the layout phase, before the coordinated play; a regression changes both the forwarded ref and `layout`/`layoutId` and asserts the new participant options are visible to a parent layout effect before playback.
- `safeToRemove` validates its captured token before clearing the watchdog; a stale callback cannot cancel a newer exit timer.
- Presence registration uses per-registrant ids; unregister/report are identity-based, not a count.
- `settle` reclaims `childMap`, `willEnter`, `completed` and, on full exit, allows a reinserted key to enter again.

## Gate status

- React adapter / SSR / StrictMode / no wrapper: PASS
- Imperative descendant update: PASS
- Nested boundary dedupe: PASS
- Ref ownership transfer/cleanup: PASS
- Presence retention/re-entry/collective completion: PASS
- Custom exit watchdog: PASS
- `'use client'` packaging: PASS
- Full test:ci, build, check, typecheck: PASS
- Core diff 0: PASS
- Chromium/Firefox core layout + VT + React R1: PASS
- macOS WebKit core engine: PASS
- React WebKit browser: PASS on macOS WebKit (React 19 and React 18.3.1 StrictMode)
- React 18 runtime: PASS on local macOS WebKit StrictMode harness; Linux WebKit remains host-blocked
- Mobile: not run

## Residual risks

- `usePresence` returns `style: undefined`; server initial presence style is not productized in v1.
- `AnimatePresence` supports sync mode only; `popLayout` deferred.
- React WebKit proof is macOS WebKit; Linux WebKit React execution remains environment-blocked.
- React 18 first-frame sampling on WebKit used a 2px one-frame tolerance; final layout was exact.
- Coverage floors for the optional adapter are intentionally lower than the existing binding floor: layout 85/78, React layout 85/70; existing `react/src/ani` retains 92/85.
- WebKit engine proof is macOS WebKit; Linux host dependencies remain an environment issue.
- Box radius correction is uniform-pixel only.
- Root `ani-layout` gzip is 7.29KB; per-feature tree-shaken entries meet the amended budgets.

## Final tribunal

- Verdict: **TRIBUNAL PASS**. J3 ref/options timing, J7 token-bound watchdog, J9 coordinator rejection, and coordinator recovery are closed with discriminating regressions.
- Evidence accepted: 131 files / 1,500 tests, 15 React tests, Chromium/Firefox 9/9 layout, React R1 Chromium/Firefox, macOS WebKit core 8/8 + React 19 R1 + React 18.3.1 StrictMode, build/check/typecheck, core diff 0, `'use client'`, amended coverage and size budgets.
- Remaining recorded limitations: Linux WebKit host libraries, mobile engines, React 18 WebKit one-frame sampling tolerance, sync-only presence, and `style: undefined` on `usePresence`.
