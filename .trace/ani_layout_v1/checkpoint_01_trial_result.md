# Checkpoint 01 — Scaffold + Pure Presence Reducer

**Task:** `ani_layout_v1` Phase 01  
**Authority:** `ANI_LAYOUT_ARCHITECTURE_FINAL.md` / `packages/layout/ARCHITECTURE.md`  
**Reviewer:** CHIEF JUSTICE (`gpt-6.1-sol`, xhigh, Codex CLI)  
**Date:** 2026-10-21  
**Verdict:** **TRIBUNAL PASS** (gpt-6.1-sol, xhigh, Codex CLI)

## Scope delivered

- `packages/layout` package scaffold: package.json, tsup, tsconfig.
- Public type surface for layout, presence, View Transitions.
- Feature detection: FLIP capability, linear easing, View Transition support, active transition, reduced-motion policy.
- Pure `reconcilePresence` / `settlePresence` reducer.
- No React import; no core runtime import in Phase 01 output.
- No legacy bridge.

## First tribunal findings and repair

| Finding | Repair |
| --- | --- |
| Evidence trace absent | This file. |
| Test adequacy (example-only) | Added deterministic 300-step random add/remove/re-add invariant test. |
| `@freestylejs/ani-core` was a runtime dependency | Moved to `peerDependencies` + `devDependencies`; build output is checked for runtime core imports. |

## Evidence

Commands executed in `~/ani-v2/repo` on `feat/ani-layout`:

```text
pnpm --filter @freestylejs/ani-layout build        -> exit 0
pnpm --filter @freestylejs/ani-layout ts:typecheck -> exit 0
pnpm vitest run layout/src/__tests__/presence_state.test.ts -> 10/10 pass
pnpm check                                         -> exit 0
pnpm ts:typecheck                                  -> exit 0
git diff --stat packages/core                      -> empty
node -e 'import("./packages/layout/dist/index.js")' -> node_import=ok, 8 exports
grep ani-core packages/layout/dist/index.js       -> no runtime import
```

Package build output: ESM ~3.24 KB, CJS ~4.56 KB, d.ts ~5.9 KB (before later phases).

## Invariants covered

- no duplicate keys
- present key order follows next keys
- removed key becomes exiting with token increment
- re-entry preserves the existing entry and token
- a second removal increments the token again
- stale settle token is a no-op
- present entries are never settled
- no-op reconciliation returns the same array identity
- random 300-step add/remove/re-add sequence preserves invariants and idempotence

## Gate status

- Package importable in Node without DOM: PASS
- Reducer purity / ordering / token / identity: PASS
- Core diff 0: PASS
- React/core runtime leakage in Phase 01 build: PASS
- Property/invariant test: PASS

## Residual risks

- Presence engine and layout engine are not implemented yet; this checkpoint covers scaffold + reducer only.
- `pnpm check` reports pre-existing repository info diagnostics; exit code 0.
- Phase 02 will add runtime core import (`createStates`), so core remains an explicit peer dependency; that is intentional.

## Tribunal

- First verdict: **BLOCK** (evidence trace absent, property coverage insufficient, core dependency boundary).
- Repairs: `checkpoint_01_trial_result.md` added; deterministic 300-step invariant test added; core moved to `peerDependencies` + `devDependencies`; emitted ESM checked for no runtime core import.
- Re-judgment: **TRIBUNAL PASS**, S0/S1/S2/S3 = 0.
- Independent checks: 4,368 reducer transitions; 8 Node/no-DOM feature checks; frozen-input purity; ordering/token/settle/idempotence.
- The judge accepted the recorded remote execution; local review copy could not rerun root workspace commands.
