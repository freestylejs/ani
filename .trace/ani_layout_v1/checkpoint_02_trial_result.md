# Checkpoint 02 — Presence Engine

**Task:** `ani_layout_v1` Phase 02  
**Authority:** `ANI_LAYOUT_ARCHITECTURE_FINAL.md` / `packages/layout/ARCHITECTURE.md`  
**Reviewer:** CHIEF JUSTICE (`gpt-6.1-sol`, xhigh, Codex CLI)  
**Date:** 2026-10-21  
**Verdict:** **TRIBUNAL PASS**

## Scope delivered

- `createPresence(element, motion, options)` built on core `createStates`.
- States: `present`, `enter`, `exit`; `present` is a no-write initial timeline.
- No style writes on mount.
- Exit, re-entry continuity, watchdog (`maxExitMs`), dispose, reduced-motion release.
- Per-transition bind/unbind via `onTransition`, so one style writer owns the element.
- No React import; core remains a peer dependency.

## Evidence

Commands executed in `~/ani-v2/repo` on `feat/ani-layout`:

```text
pnpm --filter @freestylejs/ani-layout build        -> exit 0
pnpm --filter @freestylejs/ani-layout ts:typecheck -> exit 0
pnpm vitest run layout/src/__tests__/presence.test.ts -> 10/10 pass
pnpm vitest run layout/src/__tests__/ssr.test.ts -> 1/1 pass
pnpm vitest run layout/src/__tests__/presence_state.test.ts -> 10/10 pass
pnpm exec biome check packages/layout -> exit 0
git diff --stat 6715bb1 -- packages/core -> empty
git diff 6715bb1 -- packages/core | wc -l -> 0
node -e 'import("./packages/layout/dist/index.js")' -> node_import=ok
```

Node import exports:

```text
createPresence, hasDOM, isActiveViewTransition, reconcilePresence,
reducedLayoutMotion, settlePresence, supportsFlip, supportsLinearEasing,
supportsViewTransition
```

Tests cover:

- no inline style on mount
- first enter phase is `entering`, then `present`
- enter from `initial`
- exit to exit target
- re-entry from current value, exit resolves `'interrupted'`
- re-entry after an exit with **no prior enter** keeps the live exit value
- late completion from an older exit cannot settle a newer exit
- wall-clock watchdog resolves `'timeout'`
- default watchdog for a 20s finite exit is 21s; it remains `exiting` at 20,999ms and times out at 21,000ms
- idempotent dispose resolves `'disposed'`
- reduced-motion exit resolves `'exited'` without frames
- `clock.size` returns to 0
- Node import without DOM succeeds and all browser capabilities are false

## Tribunal history and repair

First judge run found two re-entry defects:

1. Exit before any enter re-entered from `initial` instead of the live exit value.
2. A late completion from an older exit could settle a newer exit.

Repairs:

- `transitioned` tracks whether any state transition has run; only the first enter uses `initial`.
- `exitGeneration` invalidates old exit `.then`/watchdog callbacks.
- Regression tests for both paths.

Second judge run found two additional S1 defects and one S2 evidence gap:

1. Default watchdog capped finite exits at 10s; a 20s exit would timeout at 10s.
2. First enter publicly reported `present` instead of `entering`.
3. Current core/SSR evidence was not recorded.

Repairs:

- Finite default watchdog is `duration * 1000 + 1000` without a 10s cap; endless exits use 10s.
- First enter sets `entering` before the run and `present` after completion.
- Added 20s watchdog regression, phase assertion, Node/no-DOM import test, and exact core-diff commands/output.

Third judge run found one remaining S1:

- A stale enter completion could clear a newer enter's `entering` phase after an `enter → exit → enter` sequence.

Repair:

- `enterGeneration` invalidates obsolete enter completion callbacks; `exit()` and `dispose()` bump it.
- Added a regression that awaits the interrupted first enter while a second enter is still running, asserts `entering`, then completes the second enter and asserts `present`.

## Design decisions

- `createStates` carries `from` and velocity across transitions; the handle does not reimplement them.
- The initial present timeline has no value, so `bind` writes nothing on mount.
- `onTransition` unbinds the previous timeline before binding the next one; this avoids competing writers.
- The watchdog is the only timer; it is cleared on every settle.
- The element is caller-owned; the handle never unmounts it.

## Gate status

- Presence lifecycle: PASS
- Re-entry/token behavior (reducer + handle): PASS
- Watchdog/leak: PASS
- Reduced motion: PASS
- SSR-safe import: PASS
- Core diff 0: PASS
- Writer conflict warnings in ordinary cycles: 0

## Residual risks

- `maxExitMs` uses wall time, not `timeScale`-adjusted animation time; documented.
- Layout engine and React adapter are later phases.
- Browser-level presence is covered again through the React/browser phase.
