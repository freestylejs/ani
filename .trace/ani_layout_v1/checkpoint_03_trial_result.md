# Checkpoint 03 — WAAPI Layout FLIP Engine

**Task:** `ani_layout_v1` Phase 03  
**Authority:** `ANI_LAYOUT_ARCHITECTURE_FINAL.md` / `packages/layout/ARCHITECTURE.md`  
**Reviewer:** CHIEF JUSTICE (`gpt-6.1-sol`, xhigh, Codex CLI)  
**Date:** 2026-10-22  
**Verdict:** **TRIBUNAL PASS** (S0/S1/S2 = 0; one S3 doc inconsistency fixed)

## Scope delivered

- `createLayoutGroup` with `add`, `set`, `update`, `capture`, `play`, `finish`, `active`, `dispose`.
- WAAPI `Element.animate` position FLIP with additive `translate`.
- `box` mode with scale + origin compensation + **11-sampled, axis-separated border-radius correction**; base scale/rotate/translate/transform falls back to position.
- Reliable-context guard: `rect/offset` ratio deviation >2% snaps.
- Viewport culling: both boxes outside viewport (+10%) are skipped.
- `maxAnimated`/`maxBoxes` caps; `maxBoxes` bounds computed-style reads including rejected boxes.
- Snapshot owner/single-use/microtask expiry; stale/foreign snapshots return `'stale'`.
- Active retarget cancels the old animation before measuring the new layout, using the pre-mutation snapshot as `before` (no jump).
- Active no-change is detected against the snapshot before cancellation; active run, animation, and promise are preserved.
- Active `layoutId` replacement: leader arbitration is applied in the no-change precheck, so a new replacement animates from the old snapshot even while an old run is active.
- `layoutId` newest-wins arbitration; older mounted participants snap.
- No inline style writes; animations use `fill: 'none'`.
- No per-frame ANI JS; WAAPI drives the compositor.

## Read budget amendment

Normal play remains N rects. Active retarget uses N visual precheck + N post-cancel layout reads (≤2N) to preserve both no-change detection and position continuity. No-change stops after the precheck. No reads occur during frames. This is an explicit amendment to the earlier single-N wording; the authority documents are updated.

## Evidence

Commands executed in `~/ani-v2/repo` on `feat/ani-layout`:

```text
pnpm --filter @freestylejs/ani-layout build        -> exit 0
pnpm --filter @freestylejs/ani-layout ts:typecheck -> exit 0
pnpm vitest run layout/src/__tests__               -> 34/34 pass
pnpm check                                         -> exit 0
git diff --stat 6715bb1 -- packages/core            -> empty
git diff 6715bb1 -- packages/core | wc -l           -> 0
pnpm test:browser --case "layout:*"                -> 8/8 pass (Chromium)
pnpm test:browser --browser firefox --case "layout:*" -> 8/8 pass (Firefox)
```

WebKit engine proof (macOS WebKit, because Linux host lacks Playwright WebKit shared libraries):

```text
position, box-radius, base-translate, first-frame, no-change, cap, reduced -> PASS
```

Browser cases:

- `L1` position FLIP: final box exact, no residual animation
- `L2` box FLIP: scale settles to exact layout, no residual animation
- `L3` no-change: no animation created
- `L4` reduced motion: snap, no animation
- `L5` cap: whole change snapped, no partial list animation
- `L6` additive translate with a percentage base: base preserved at start and end
- `L7` first frame starts at the before box (0.6px), final matches layout
- `L8` box radius correction starts scaled and returns to 8px

Unit regressions cover active no-change cancellation/promise preservation, active layoutId replacement, retarget from the captured visual box, transformed-context ratio guard, maxBoxes computed-style read cap, duplicate layoutId newest-wins, and 11-sample axis-separated radius syntax.

## Gate status

- H1 additive translate with CSS base: PASS in Chromium, Firefox, and WebKit
- H2 first-frame inverse / no final-layout flash: PASS in Chromium, Firefox, and WebKit
- No inline writes: PASS
- No-change/cap/step-down/layoutId/retarget/radius: PASS
- Read budget: normal N; active retarget ≤2N, documented
- Core diff 0: PASS
- Build/typecheck/lint: PASS
- Linux WebKit host: BLOCKED by missing system libraries; macOS WebKit covers the engine behavior

## Residual risks

- WebKit proof is from macOS WebKit, not the Linux WebKit binary; Linux host dependencies remain an environment issue.
- Mobile engines not yet run.
- Radius correction only for uniform px radii; non-uniform/percent radii are not corrected.
- Box with base `scale`/`rotate`/`translate`/`transform` falls back to position.
- Browser animation timing is wall-clock/WAAPI, not ANI clock; approved high-performance tier.

## Final tribunal

- Verdict: **TRIBUNAL PASS**.
- J1–J7 closed; active no-change, active layoutId replacement, retarget continuity, guards/caps, 11-sample radius, amended read budget, and three-engine evidence accepted.
- One accepted S3 documentation inconsistency was fixed after the ruling: the architecture's retarget paragraph now describes the implemented cancel-then-read strategy.
- Recorded evidence: 34/34 unit, Chromium 8/8, Firefox 8/8, macOS WebKit 8/8, build/typecheck/lint, core diff 0.
