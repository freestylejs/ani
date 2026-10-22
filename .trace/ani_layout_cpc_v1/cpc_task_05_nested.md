# Task 05.nested: Crossfade, depth-2 shared elements and retained layoutId

## Authority
- Location: `.trace/ani_layout_cpc_v1`
- Prefix: `cpc`
- Order: `05`
- Part: `nested`
- Depends on: `04 projection`
- Paired validation: `cpc_valid_05_nested.md`
- Checkpoint gate: `cpc_checkpoint_05.md`
- Architecture: `packages/layout/ARCHITECTURE_CPC.md`

## 0) 본질적 관점 접근 -> 해법 -> 작성
- Essential problem: Support duplicate layoutId crossfade and two-level nested shared-element projection needed by E2–E4, with deterministic lifecycle.
- Direct contribution to final goal: This phase creates the next necessary, independently testable capability of the compiled projection core.
- Observable goal progress: Support duplicate layoutId crossfade and two-level nested shared-element projection needed by E2–E4, with deterministic lifecycle.
- Target invariant: Core V2 unchanged; no observers; no layout-owned per-frame JS; no inline FLIP; one batched measure; snap outside bounded projection.
- Simplest sufficient solution: implement only the scope below; defer all excluded capabilities.
- Necessary supporting work: oracle/tests/docs only where needed to prove this phase.
- Why now: later phases depend on this phase's contract and evidence.

## 1) 해석 모호함 x, 명료한 요구사항
- In scope: Duplicate-id stack/lead policy; layoutCrossfade; depth-2 plan composition; retained layoutId rects for re-entry; E2/E3/E4 fixtures; React lifecycle.
- Out of scope: No 3D gallery, scroll/root, arc or shadow.
- Assumptions: existing v1 presence/View Transition/package contracts remain valid.
- Acceptance criteria: the paired Valid evidence passes; no Core V2 diff; no regression in existing tests.

## 2) 명확한 Task 및 목적 정의
- Current problem: the capability in scope is not yet implemented or not independently proven.
- Required outcome/production change: Implement a bounded layoutId stack, opacity crossfade keyframes, depth-2 compiler composition, and retained rect policy for same-commit/re-entry. Add StrictMode/rapid-toggle tests and browser fixture assertions for E2/E3/E4 first/final/mid samples.
- Supporting changes: tests, fixtures, types, docs only as required.
- Final observable goal: Support duplicate layoutId crossfade and two-level nested shared-element projection needed by E2–E4, with deterministic lifecycle.
- Side effects that must not occur: public API churn outside scope, observer/per-frame JS, inline FLIP, Core V2 edits, unrelated package changes.

## 3) Code-level Impl/Test Spec 요구사항
- Outcome implementation targets: Implement a bounded layoutId stack, opacity crossfade keyframes, depth-2 compiler composition, and retained rect policy for same-commit/re-entry. Add StrictMode/rapid-toggle tests and browser fixture assertions for E2/E3/E4 first/final/mid samples.
- Interfaces/contracts to preserve: v1 public layout/presence/VT APIs; root `ani-react` entry; `'use client'` subpath; package exports.
- Required tests/checks: Duplicate-id crossfade opacity sum; old node cleanup; nested 3-level fixture error check; re-entry during/after exit; caps at depth 2.
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
