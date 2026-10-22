# Checkpoint 04 Trial Result — Depth-1 Projection + layoutAnchor

**Task:** `cpc_task_04_projection.md`  
**Validation:** `cpc_valid_04_projection.md`  
**Verdict:** pending CHIEF JUSTICE

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
  135 test files / 1,549 tests
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

- A projection interrupt at 45% (`P7`) produced a child first-frame error of
  ~7.8px; it is **not claimed** here and is carried to Phase 05.
- Per-node spring/tween mismatches are not exposed; the current API shares a
  group motion. Parent/child timing sampling remains a Phase 05/06 item.
- The compiler's error guard is structural (degenerate scale, box caps,
  transformed ancestors), not a numerical 0.5px worst-case sampler yet.
- Depth 2, duplicate-id crossfade, E2/E3/E4 and the Gallery are not in Phase 04.
