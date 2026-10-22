# Checkpoint 01 Trial Result — Authority + Frame Oracle + Guards

**Task:** `cpc_task_01_baseline.md`  
**Validation:** `cpc_valid_01_baseline.md`  
**Date:** 2026-10-22  
**Verdict:** pending re-judgment after FAIL repairs

**Reviewed revision:** `137482b` (base `8654839`; phase-01 commit).

## Delivered

- `packages/layout/ARCHITECTURE_CPC.md` authoritative direction.
- `.trace/ani_layout_cpc_v1/` six-phase Task/Valid/Checkpoint plan set.
- Browser oracle helper: pause WAAPI, sample `currentTime=0` and mid-run, finish,
  read final boxes.
- Observer/rAF guards around a core FLIP transaction.
- E5-shaped notification-list canary: `LayoutGroup` + `AnimatePresence
  mode="popLayout"` + `usePresence` + `useLayout`.
- Main-thread busy-block harness (25ms baseline; 200ms P9 proof deferred).

## First FAIL repair

- J-01: oracle now samples interior at the actual 120ms half-point, records
  before/target/first/middle/final separately, verifies all box dimensions, and
  resumes the paused WAAPI animations instead of force-finishing.
- J-02: R3 now requires a managed sibling animation, samples first and interior
  boxes, resumes, then checks final geometry and exit cleanup.
- J-03: added `packages/layout/src/__tests__/cpc_oracle.test.ts` covering pause,
  box capture, resume/cancel and completion.
- J-04: cpc:P0 and R3 executed against macOS WebKit.
- J-05: reviewed revision is the current Git worktree on `v2/main`; phase diff
  and Core diff are recorded below.
- S3: count and evidence corrected.

## Evidence

Executed on `june-wsl` in `~/ani-v2/repo`:

```text
pnpm test:ci                                      PASS
  132 test files / 1,507 tests
pnpm check                                        PASS
pnpm build                                        PASS
pnpm test:browser --case "cpc:P0"                 PASS Chromium
pnpm test:browser --browser firefox --case "cpc:P0" PASS Firefox
pnpm test:browser --case "react_layout:R3"        PASS Chromium
pnpm test:browser --browser firefox --case "react_layout:R3" PASS Firefox
pnpm vitest run layout/src/__tests__/cpc_oracle.test.ts PASS (3 tests)
git diff --stat 6715bb1 -- packages/core          empty
git diff 6715bb1 -- packages/core | wc -l         0
```

WebKit: Linux host still lacks `libwayland-server.so.0` and GTK/ICU/GStreamer
libraries. The reviewed cases were executed on a macOS WebKit host:

```text
cpc:P0 -> PASS
react_layout:R3 -> PASS
```

## P0 assertions

- Paused first sample is within 1px of the before box.
- Final sibling box is within 0.6px of the target.
- Oracle finishes with `finished`.
- ResizeObserver / MutationObserver / IntersectionObserver construction = 0.
- Layout-owned rAF = 0.
- E5 popLayout exiting node is absolute; sibling moves into the gap; exit
  completes; no stale node.

## Known limits

- The oracle helper is now covered by `cpc_oracle.test.ts` (3 tests): pause,
  box capture, resume/cancel, target/middle/completion.
- The E5 fixture is a baseline shape, not yet the final Motion timing matrix.
- 200ms jank proof and bundle budget are Phase 06.

## Files

- `packages/layout/ARCHITECTURE_CPC.md`
- `.trace/ani_layout_cpc_v1/*`
- `tests/browser/cases/cpc.ts`
- `tests/browser/cases/cpc_harness.ts`
- `tests/browser/cases/react_layout.ts` (R3)
