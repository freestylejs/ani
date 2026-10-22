# Task 06.showcase: Radius/caps/perf, E1–E5 and reduced 2D Gallery proof

## Authority
- Location: `.trace/ani_layout_cpc_v1`
- Prefix: `cpc`
- Order: `06`
- Part: `showcase`
- Depends on: `05 nested`
- Paired validation: `cpc_valid_06_showcase.md`
- Checkpoint gate: `cpc_checkpoint_06.md`
- Architecture: `packages/layout/ARCHITECTURE_CPC.md`

## 0) 본질적 관점 접근 -> 해법 -> 작성
- Essential problem: Harden radius/caps/load behavior, ship all showcase fixtures, and prove the moat with jank and bundle measurements.
- Direct contribution to final goal: This phase creates the next necessary, independently testable capability of the compiled projection core.
- Observable goal progress: Harden radius/caps/load behavior, ship all showcase fixtures, and prove the moat with jank and bundle measurements.
- Target invariant: Core V2 unchanged; no observers; no layout-owned per-frame JS; no inline FLIP; one batched measure; snap outside bounded projection.
- Simplest sufficient solution: implement only the scope below; defer all excluded capabilities.
- Necessary supporting work: oracle/tests/docs only where needed to prove this phase.
- Why now: later phases depend on this phase's contract and evidence.

## 1) 해석 모호함 x, 명료한 요구사항
- In scope: Per-corner radius opt-in; caps/load; E1–E5; reduced 2D Gallery; 3-engine e2e; jank benchmark; docs/changeset; final evidence.
- Out of scope: No full 3D/drag/loop Gallery, scroll/root observers, arc, shadow or deep counter-scale.
- Assumptions: existing v1 presence/View Transition/package contracts remain valid.
- Acceptance criteria: the paired Valid evidence passes; no Core V2 diff; no regression in existing tests.

## 2) 명확한 Task 및 목적 정의
- Current problem: the capability in scope is not yet implemented or not independently proven.
- Required outcome/production change: Add opt-in per-corner radius and cap accounting. Build E1–E5 and reduced Gallery fixtures with golden boxes. Add 200ms busy-loop jank proof and 50-node commit budget. Update docs/architecture/changeset. Run full CI, browser matrix, size and core diff.
- Supporting changes: tests, fixtures, types, docs only as required.
- Final observable goal: Harden radius/caps/load behavior, ship all showcase fixtures, and prove the moat with jank and bundle measurements.
- Side effects that must not occur: public API churn outside scope, observer/per-frame JS, inline FLIP, Core V2 edits, unrelated package changes.

## 3) Code-level Impl/Test Spec 요구사항
- Outcome implementation targets: Add opt-in per-corner radius and cap accounting. Build E1–E5 and reduced Gallery fixtures with golden boxes. Add 200ms busy-loop jank proof and 50-node commit budget. Update docs/architecture/changeset. Run full CI, browser matrix, size and core diff.
- Interfaces/contracts to preserve: v1 public layout/presence/VT APIs; root `ani-react` entry; `'use client'` subpath; package exports.
- Required tests/checks: All matrix rows selected for B′; P0–P9; 3 engines; final tribunal evidence.
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
