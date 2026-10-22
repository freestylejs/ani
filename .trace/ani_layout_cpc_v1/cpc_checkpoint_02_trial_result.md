# Checkpoint 02 Trial Result — Plan Retention, Group Clock, Retarget

**Task:** `cpc_task_02_planner.md`  
**Validation:** `cpc_valid_02_planner.md`  
**Date:** 2026-10-22  
**Verdict:** pending re-judgment after FAIL repairs

**Reviewed code revision:** pending final commit; base `0533be1`.

## Delivered

- `projection/plan.ts`
  - `NodePlan` retains before/after boxes, deltas, scale/origin, easing samples,
    duration, explicit startTime and animation.
  - `planProgress` is deterministic at the requested time from retained easing
    samples; it does not read live WAAPI progress.
  - `evaluatePlanAtProgress`/`evaluatePlanBox` support position and box modes,
    including sample overshoot.
  - `planVelocity` derives local px/ms from the retained easing.
  - `assignGroupStartTime` and `timelineNow`.
- `projection/group_plan.ts`
  - `GroupRun`, `cancelGroupRun`, `finishGroupRun`; finish is finish+cancel so a
    later dispose cannot lose ownership of an animation.
- `LayoutGroup` integration
  - one explicit startTime per run assigned to every animation;
  - active capture derives its current box from the retained plan + live
    computed progress without a rect read;
  - retarget measures the new layout once, uses the captured before box, and
    compiles a velocity-aware Hermite path for position retargets;
  - P1 retarget read counter is **≤2N** for one participant; P3 covers two participants sharing one clock;
  - finish/dispose release animations.

## Evidence

```text
pnpm test:ci -> PASS
  134 test files / 1,525 tests
pnpm check -> PASS
pnpm build -> PASS
layout/src coverage -> 86.26 / 78.75 / 90.24 / 90.46
projection plan tests -> 9/9
group_plan tests -> 2/2
pnpm test:browser --case "cpc:P1" -> PASS Chromium
pnpm test:browser --browser firefox --case "cpc:P1" -> PASS Firefox
pnpm test:browser --case "cpc:P2" -> PASS Chromium (100 continuity-checked retargets)
pnpm test:browser --browser firefox --case "cpc:P2" -> PASS Firefox
pnpm test:browser --case "cpc:P3" -> PASS Chromium (two participants, one clock)
pnpm test:browser --browser firefox --case "cpc:P3" -> PASS Firefox
```

macOS WebKit cpc bundle: P0/P1/P2/P3/R3 all PASS after the final changes.

## Requirement mapping

| Finding | Repair evidence |
| --- | --- |
| J-01 analytic evaluation | `planProgress` is requested-time deterministic from easing; `planCurrentProgress` is the only live-capture entry. Retained path points are evaluated directly. |
| J-02 path/overshoot | `NodePlan.path` is the actual emitted channel path; requested-time and current-capture evaluation are separate; overshoot extrapolation is tested. Velocity handoff is a Phase 04 compiled-path gate. |
| J-03 reads | Active capture uses plan+liveness, no rect reads; P1 and mixed P4 read counters are ≤2N. |
| J-04 coverage | P1 45% position; P2 100 seeded interior position interrupts (≤0.5px); P3 two participants/shared startTime; P4 mixed read count; P1 finish/cleanup. Velocity is specifically not claimed here; Phase 04 owns it. |
| J-05 finish | `finishGroupRun` finishes and cancels; P1 asserts no animations remain. |
| J-06 provenance | Source committed with full projection files; Git evidence copied into review history. |

## Known limits

- Position retarget velocity is demonstrated; box-scale velocity is not yet
  claimed.
- `capture()` uses live computed progress for the current box (which is the
  correct "now" value) while `planProgress` remains time-deterministic for
  requested moments.
- Depth-1 projection, layoutAnchor, crossfade and showcase rows remain later
  phases.
- Linux WebKit host remains unavailable; macOS WebKit results are recorded.
