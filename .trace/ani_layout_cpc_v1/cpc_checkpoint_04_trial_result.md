# Checkpoint 04 Trial Result — Depth-1 Projection + layoutAnchor

**Task:** `cpc_task_04_projection.md`  
**Validation:** `cpc_valid_04_projection.md`  
**Verdict:** pending re-judgment after F1–F7 repairs

**Reviewed code revision:** pending final repair commit; prior `68f50ae`.

## Delivered

- `projection/compiler.ts`: bounded depth-1 parent translation/scale inversion,
  position-child non-scaling policy, and normalized anchor origin math.
- `layoutAnchor` public core/React option; box motion uses it instead of the
  computed origin.
- `LayoutGroup` builds participant parent links at capture, compiles child
  corrections from the parent's retained start transform, and snaps projected
  box motion when a static ancestor has a transform.
- `livePlanSample` obtains current visual velocity from paused WAAPI progress;
  `P6` checks compiled-path velocity handoff ≤10%.
- `P5`: nested parent box + child counter-scale + centered anchor; first-frame
  child position/width and final parent-relative geometry.
- `P6`: retarget velocity continuity under the compiled path.
- Unit compiler tests cover parent inversion, position-child scale policy,
  degenerate parent rejection, and anchors (0,0), (0.5,0.5), (1,1).
- Static transformed-ancestor snap unit test.

## Evidence

```text
pnpm test:ci -> PASS
  135 test files / 1,550 tests
pnpm check / layout build / react build -> PASS
cpc:P5 Chromium -> PASS
cpc:P5 Firefox -> PASS
cpc:P5 macOS WebKit -> PASS
cpc:P6 Chromium -> PASS
cpc:P6 Firefox -> PASS
cpc:P6 macOS WebKit -> PASS
cpc:P0/P1/P2/P3/P4/R3 macOS WebKit -> PASS
core diff 6715bb1 -> 0
```

## Known limits / next gate

- Projection interrupt is now `P7` PASS: a projected box child switches from a 100→160 parent to a 180px target at 100ms and preserves the first frame. It is recorded in Chromium, Firefox and macOS WebKit.
- Per-participant `motion` is now exposed; `P10` composes a parent spring with a child bezier/tween and verifies distinct 200ms/350ms animation timing.
- P9 samples 60 offsets and records 0.001px worst-case error for the E1 projection. The compiler uses 48 projected keyframe offsets and structural scale/caps; a future compiler-owned error estimator is still an explicit residual, not a hidden PASS.
- Depth 2, duplicate-id crossfade, E2/E3/E4 and the Gallery are not in Phase 04.

## Repairs after tribunal FAIL

- F1: box keyframes now set the animated `transform-origin` when `layoutAnchor` is supplied; P8 covers anchors 0/0.5/1 with default CSS origin. React `layoutAnchor` is in the effect deps.
- F4: projection runs after box facts/demotion/cap decisions; a child is skipped when its parent is skipped, box compensation is range-checked, and depth >1 snaps.
- F7: static-ancestor snap is limited to rotate/skew matrices, not pure axis-aligned translate/scale; the unit test uses a rotation matrix.
- F2: projected box children now use 48 sampled keyframe offsets and a zero-origin projected child frame, reducing P9 to 0.001px over 60 offsets; the E1 projection is within the 0.5px target.
- F3/F5: per-participant spring/tween is covered by P10; unchanged-rect children under a scaling parent are counter-scaled and covered by a core unit test and P5/P9 geometry.
