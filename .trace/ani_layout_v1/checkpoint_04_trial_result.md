# Checkpoint 04 — View Transition Helpers

**Task:** `ani_layout_v1` Phase 04  
**Authority:** `ANI_LAYOUT_ARCHITECTURE_FINAL.md` / `packages/layout/ARCHITECTURE.md`  
**Reviewer:** CHIEF JUSTICE (`gpt-6.1-sol`, xhigh, Codex CLI)  
**Date:** 2026-10-22  
**Verdict:** **TRIBUNAL PASS** (S0/S1/S2 = 0)

## Scope delivered

- `viewTransition(update, options)`: same-document View Transition orchestration.
- `shareElement(element, id)`: shared-element candidate registry.
- `retimeViewTransition(motion, names?)`: exact-name retiming of `::view-transition-*`.
- `supportsViewTransition()`.
- `update` runs exactly once across unsupported/reduced/yielded/finished/skipped/interrupted/throw paths.
- Foreign transition yields without starting another; own transition is skipped/replaced and reports `'interrupted'`.
- Shared names are deduplicated, collision-safe, capped at 32, priority-preserving, and restored on all exits.
- `throw undefined` is tracked separately from “no error” and propagates.
- Native `updateCallbackDone` rejection is consumed to avoid unhandled rejection.
- `types` are applied when supported.
- CSS `view-transition-name` property APIs are used for cross-engine support.

## Evidence

```text
pnpm --filter @freestylejs/ani-layout build        -> exit 0
pnpm --filter @freestylejs/ani-layout ts:typecheck -> exit 0
pnpm vitest run layout/src/__tests__/view_transition.test.ts -> 19/19 pass
pnpm vitest run layout/src/__tests__               -> 53/53 pass
pnpm check                                         -> exit 0
git diff --stat 6715bb1 -- packages/core            -> empty
git diff 6715bb1 -- packages/core | wc -l           -> 0
pnpm test:browser --case layout:L9                 -> PASS (Chromium, finished)
pnpm test:browser --browser firefox --case layout:L9 -> PASS (Firefox, unsupported fallback)
```

WebKit engine proof (macOS WebKit; Linux host lacks WebKit shared libraries):

```text
position, box-radius, base-translate, first-frame, no-change, cap,
view-transition-finished, reduced -> PASS
```

Unit coverage:

- update exactly once on finished
- unsupported/reduced fallback
- foreign transition yields
- skip before ready returns `skipped`
- replacement returns `interrupted`
- shared name present during transition and restored
- duplicate share ids and `!important` priority preserved
- collision-safe names for sanitized-alike ids
- 32-name cap
- 50-cycle shared-name churn without residue
- throw `undefined` propagates
- normal update error propagates and restores
- exact retime filtering (`ani-hero` does not match `ani-heroine`)

## Tribunal history and repair

First FAIL findings:

1. foreign-transition ownership could treat stale `current` as own.
2. skips/replacements reported `finished`; `interrupted` unreachable.
3. duplicate names, sanitization collisions, `!important` lost.
4. `throw undefined` plus native `updateCallbackDone` unhandled.
5. missing 32-name cap and >100ms warning.
6. retime substring filter overmatched.
7. coverage insufficient.

Repairs:

- Native active transition compared to `current`; stale foreign state yields and restores.
- `lifecycle.interrupted` and `skippedByReady` track lifecycle outcomes.
- Deduplicated share ids; hash-suffixed names; saved value+priority; 32-name cap; 100ms warning.
- `failed` boolean, `updateCallbackDone.catch`, `finally` cleanup.
- Exact `(${name})` retime matching.
- Added 12 focused regressions, including foreign selector ownership, skip callback count, long-name collision, one-element/multi-id restoration, zero-timestamp 100ms warning, varying 50-cycle churn, and late async handoff after restoration.

## Gate status

- Supported path: PASS (Chromium, macOS WebKit)
- Fallback: PASS (Firefox unsupported; unsupported/reduced/foreign/throw unit paths)
- update exactly once: PASS
- Lifecycle outcomes: PASS
- Name uniqueness/restoration/cap/churn: PASS
- Retime exact match: PASS
- Core diff 0: PASS
- Build/typecheck/lint: PASS
- Linux WebKit: host-blocked; macOS WebKit covers engine behavior
- Cross-document/MPA: deferred
- Mobile: not yet run

## Residual risks

- `viewTransition` is same-document only in this phase.
- ANI replacement accepts a visual jump to the old end state, per architecture.
- `retimeViewTransition` is cosmetic; absent API returns 0.
- Firefox current build lacks same-document VT; fallback is verified.
- Linux WebKit host dependencies remain an environment issue.

## Final tribunal

- Verdict: **TRIBUNAL PASS**. J1–J6 closed; late-handoff regression is discriminating.
- Recorded evidence: 53/53 unit, Chromium L9 finished, Firefox L9 unsupported fallback, macOS WebKit finished, build/typecheck/lint, core diff 0.
