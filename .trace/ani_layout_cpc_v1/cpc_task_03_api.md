# Task 03.api: Layout modes, dependency, LayoutConfig and wait

## Authority
- Location: `.trace/ani_layout_cpc_v1`
- Prefix: `cpc`
- Order: `03`
- Part: `api`
- Depends on: `02 planner`
- Paired validation: `cpc_valid_03_api.md`
- Checkpoint gate: `cpc_checkpoint_03.md`
- Architecture: `packages/layout/ARCHITECTURE_CPC.md`

## 0) 본질적 관점 접근 -> 해법 -> 작성
- Essential problem: Expose the bounded public API needed by the showcase without adding projection math yet.
- Direct contribution to final goal: This phase creates the next necessary, independently testable capability of the compiled projection core.
- Observable goal progress: Expose the bounded public API needed by the showcase without adding projection math yet.
- Target invariant: Core V2 unchanged; no observers; no layout-owned per-frame JS; no inline FLIP; one batched measure; snap outside bounded projection.
- Simplest sufficient solution: implement only the scope below; defer all excluded capabilities.
- Necessary supporting work: oracle/tests/docs only where needed to prove this phase.
- Why now: later phases depend on this phase's contract and evidence.

## 1) 해석 모호함 x, 명료한 요구사항
- In scope: LayoutMode position/box/size/preserve-aspect; layoutDependency; LayoutConfig; AnimatePresence wait/custom; React wiring; docs/types/tests.
- Out of scope: No parent-relative compiler, anchor or crossfade.
- Assumptions: existing v1 presence/View Transition/package contracts remain valid.
- Acceptance criteria: the paired Valid evidence passes; no Core V2 diff; no regression in existing tests.

## 2) 명확한 Task 및 목적 정의
- Current problem: the capability in scope is not yet implemented or not independently proven.
- Required outcome/production change: Extend LayoutParticipantOptions and React props. Implement dependency equality gate at capture. Add minimal LayoutConfig context for transition/reducedMotion. Add wait mode sequencing and custom exit data. Keep Core V2 unchanged. Add unit/integration/SSR/StrictMode tests.
- Supporting changes: tests, fixtures, types, docs only as required.
- Final observable goal: Expose the bounded public API needed by the showcase without adding projection math yet.
- Side effects that must not occur: public API churn outside scope, observer/per-frame JS, inline FLIP, Core V2 edits, unrelated package changes.

## 3) Code-level Impl/Test Spec 요구사항
- Outcome implementation targets: Extend LayoutParticipantOptions and React props. Implement dependency equality gate at capture. Add minimal LayoutConfig context for transition/reducedMotion. Add wait mode sequencing and custom exit data. Keep Core V2 unchanged. Add unit/integration/SSR/StrictMode tests.
- Interfaces/contracts to preserve: v1 public layout/presence/VT APIs; root `ani-react` entry; `'use client'` subpath; package exports.
- Required tests/checks: Type tests, React SSR/StrictMode, dependency no-op, mode selection, wait sequencing, custom data. Browser smoke.
- Edge cases: interrupt/retarget, re-entry, empty/zero-size nodes, reduced motion, nested boundary, caps, SSR/StrictMode where applicable.
- Failure/rollback: revert this phase's files; do not weaken a gate or silently snap a claimed parity row.

## 4) 자가 검증 테이블
| Criterion | How to verify | Evidence required | Pass/Fail |
| --- | --- | --- | --- |
| Scoped implementation exists | inspect diff and source | changed files and commit | |
| Objective tests pass | run listed commands | logs/results | |
| Core V2 unchanged | `git diff 6715bb1 -- packages/core` (use current base) | empty output | |
| No forbidden layout mechanism | source + browser guards | zero observers/rAF/inline writes | |
| No regression | full test:ci + targeted browser | PASS logs | |
