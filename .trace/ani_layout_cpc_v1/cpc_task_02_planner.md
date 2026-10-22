# Task 02.planner: Plan retention, group clock and interrupt recompile

## Authority
- Location: `.trace/ani_layout_cpc_v1`
- Prefix: `cpc`
- Order: `02`
- Part: `planner`
- Depends on: `01 baseline`
- Paired validation: `cpc_valid_02_planner.md`
- Checkpoint gate: `cpc_checkpoint_02.md`
- Architecture: `packages/layout/ARCHITECTURE_CPC.md`

## 0) 본질적 관점 접근 -> 해법 -> 작성
- Essential problem: Introduce retained analytic plans and one explicit group startTime, and prove plan-based interruption/recompile without per-frame JS or observers.
- Direct contribution to final goal: This phase creates the next necessary, independently testable capability of the compiled projection core.
- Observable goal progress: Introduce retained analytic plans and one explicit group startTime, and prove plan-based interruption/recompile without per-frame JS or observers.
- Target invariant: Core V2 unchanged; no observers; no layout-owned per-frame JS; no inline FLIP; one batched measure; snap outside bounded projection.
- Simplest sufficient solution: implement only the scope below; defer all excluded capabilities.
- Necessary supporting work: oracle/tests/docs only where needed to prove this phase.
- Why now: later phases depend on this phase's contract and evidence.

## 1) 해석 모호함 x, 명료한 요구사항
- In scope: Projection plan types; group clock; plan retention; cancel/recompile; velocity/position recovery; core LayoutGroup integration; tests.
- Out of scope: No layoutAnchor, crossfade, depth projection, LayoutConfig or showcase UI yet.
- Assumptions: existing v1 presence/View Transition/package contracts remain valid.
- Acceptance criteria: the paired Valid evidence passes; no Core V2 diff; no regression in existing tests.

## 2) 명확한 Task 및 목적 정의
- Current problem: the capability in scope is not yet implemented or not independently proven.
- Required outcome/production change: Add packages/layout/src/projection/plan.ts and group_plan.ts. Store per-node start/end, timing and generated plan; share startTime; implement analytic evaluate at current time, cancel, recompile and finish/dispose. Preserve existing public capture/play results and fallback to current snapshot behavior when no plan is available. Add interrupt tests at 45% and random offsets.
- Supporting changes: tests, fixtures, types, docs only as required.
- Final observable goal: Introduce retained analytic plans and one explicit group startTime, and prove plan-based interruption/recompile without per-frame JS or observers.
- Side effects that must not occur: public API churn outside scope, observer/per-frame JS, inline FLIP, Core V2 edits, unrelated package changes.

## 3) Code-level Impl/Test Spec 요구사항
- Outcome implementation targets: Add packages/layout/src/projection/plan.ts and group_plan.ts. Store per-node start/end, timing and generated plan; share startTime; implement analytic evaluate at current time, cancel, recompile and finish/dispose. Preserve existing public capture/play results and fallback to current snapshot behavior when no plan is available. Add interrupt tests at 45% and random offsets.
- Interfaces/contracts to preserve: v1 public layout/presence/VT APIs; root `ani-react` entry; `'use client'` subpath; package exports.
- Required tests/checks: Unit plan evaluation and cancellation; browser P3 with plan retention; no rAF/observer guards; existing layout tests.
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
