# Task 04.projection: Depth-1 compiled projection and layoutAnchor

## Authority
- Location: `.trace/ani_layout_cpc_v1`
- Prefix: `cpc`
- Order: `04`
- Part: `projection`
- Depends on: `03 API`
- Paired validation: `cpc_valid_04_projection.md`
- Checkpoint gate: `cpc_checkpoint_04.md`
- Architecture: `packages/layout/ARCHITECTURE_CPC.md`

## 0) 본질적 관점 접근 -> 해법 -> 작성
- Essential problem: Compile parent-relative child correction for depth 1 with a hard error bound and anchor support, without per-frame JS.
- Direct contribution to final goal: This phase creates the next necessary, independently testable capability of the compiled projection core.
- Observable goal progress: Compile parent-relative child correction for depth 1 with a hard error bound and anchor support, without per-frame JS.
- Target invariant: Core V2 unchanged; no observers; no layout-owned per-frame JS; no inline FLIP; one batched measure; snap outside bounded projection.
- Simplest sufficient solution: implement only the scope below; defer all excluded capabilities.
- Necessary supporting work: oracle/tests/docs only where needed to prove this phase.
- Why now: later phases depend on this phase's contract and evidence.

## 1) 해석 모호함 x, 명료한 요구사항
- In scope: Compiler sampling; static ancestor facts; depth-1 parent-child plan composition; layoutAnchor; error-bound snap; compiled-path velocity handoff; E1 fixture.
- Out of scope: No depth 2, duplicate-id crossfade, shadow or radius changes.
- Assumptions: existing v1 presence/View Transition/package contracts remain valid.
- Acceptance criteria: the paired Valid evidence passes; no Core V2 diff; no regression in existing tests.

## 2) 명확한 Task 및 목적 정의
- Current problem: the capability in scope is not yet implemented or not independently proven.
- Required outcome/production change: Add projection/compiler.ts. Compose parent and child timelines, sample 48 projected keyframes, fold origin, apply structural snap when over caps/degenerate geometry, and prove the E1/P5 path at 60 offsets. Add anchor math. Add E1 fixture and P0/P1/P2/P3/P6 tests in Chromium/Firefox/WebKit.
- Gate amendment (2026-10-22): a runtime adaptive error estimator is deferred to the final hardening phase; Phase 04 uses fixed 48-sample projection plus the 60-offset E1/P5 error oracle and structural snap.
- Supporting changes: tests, fixtures, types, docs only as required.
- Final observable goal: Compile parent-relative child correction for depth 1 with a hard error bound and anchor support, without per-frame JS.
- Side effects that must not occur: public API churn outside scope, observer/per-frame JS, inline FLIP, Core V2 edits, unrelated package changes.

## 3) Code-level Impl/Test Spec 요구사항
- Outcome implementation targets: Add projection/compiler.ts. Compose parent and child timelines, sample adaptive keyframes, fold origin, compute worst-case error and snap when over budget. Add anchor math. Add E1 fixture and P0/P1/P2/P3/P6 tests in Chromium/Firefox/WebKit.
- Interfaces/contracts to preserve: v1 public layout/presence/VT APIs; root `ani-react` entry; `'use client'` subpath; package exports.
- Required tests/checks: P9 oracle at 60 offsets (0.001px); P8 anchors (0,0),(0.5,0.5),(1,1); static rotated/scaled ancestor snap; P10 parent spring/child tween; P7 interrupt under projection.
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
