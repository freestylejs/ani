# Task 01.baseline: Authority, frame oracle and guards

## Authority
- Location: `.trace/ani_layout_cpc_v1`
- Prefix: `cpc`
- Order: `01`
- Part: `baseline`
- Depends on: `none`
- Paired validation: `cpc_valid_01_baseline.md`
- Checkpoint gate: `cpc_checkpoint_01.md`
- Architecture: `packages/layout/ARCHITECTURE_CPC.md`

## 0) 본질적 관점 접근 -> 해법 -> 작성
- Essential problem: Freeze the CPC authority and build a deterministic frame oracle, observer/rAF guards, jank harness and current E5-like baseline without changing engine semantics.
- Direct contribution to final goal: This phase creates the next necessary, independently testable capability of the compiled projection core.
- Observable goal progress: Freeze the CPC authority and build a deterministic frame oracle, observer/rAF guards, jank harness and current E5-like baseline without changing engine semantics.
- Target invariant: Core V2 unchanged; no observers; no layout-owned per-frame JS; no inline FLIP; one batched measure; snap outside bounded projection.
- Simplest sufficient solution: implement only the scope below; defer all excluded capabilities.
- Necessary supporting work: oracle/tests/docs only where needed to prove this phase.
- Why now: later phases depend on this phase's contract and evidence.

## 1) 해석 모호함 x, 명료한 요구사항
- In scope: Authority docs; test oracle helpers; observer/rAF guard helpers; baseline browser fixture; evidence capture commands.
- Out of scope: No projection compiler, no API additions, no production behavior change.
- Assumptions: existing v1 presence/View Transition/package contracts remain valid.
- Acceptance criteria: the paired Valid evidence passes; no Core V2 diff; no regression in existing tests.

## 2) 명확한 Task 및 목적 정의
- Current problem: the capability in scope is not yet implemented or not independently proven.
- Required outcome/production change: Create packages/layout/ARCHITECTURE_CPC.md. Add a shared test oracle that can pause a WAAPI run, sample currentTime offsets, read rects, and resume/cancel. Add guards that fail if Ani layout creates ResizeObserver, MutationObserver, IntersectionObserver or calls requestAnimationFrame. Add a baseline notification-like fixture using current core/React behavior. Record baseline golden boxes and first/final samples.
- Supporting changes: tests, fixtures, types, docs only as required.
- Final observable goal: Freeze the CPC authority and build a deterministic frame oracle, observer/rAF guards, jank harness and current E5-like baseline without changing engine semantics.
- Side effects that must not occur: public API churn outside scope, observer/per-frame JS, inline FLIP, Core V2 edits, unrelated package changes.

## 3) Code-level Impl/Test Spec 요구사항
- Outcome implementation targets: Create packages/layout/ARCHITECTURE_CPC.md. Add a shared test oracle that can pause a WAAPI run, sample currentTime offsets, read rects, and resume/cancel. Add guards that fail if Ani layout creates ResizeObserver, MutationObserver, IntersectionObserver or calls requestAnimationFrame. Add a baseline notification-like fixture using current core/React behavior. Record baseline golden boxes and first/final samples.
- Interfaces/contracts to preserve: v1 public layout/presence/VT APIs; root `ani-react` entry; `'use client'` subpath; package exports.
- Required tests/checks: Unit test the oracle helper with fake animations. Browser case: current layout + presence baseline at 3 engines; guards report zero. `pnpm test:ci`, `pnpm check`, targeted browser.
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
