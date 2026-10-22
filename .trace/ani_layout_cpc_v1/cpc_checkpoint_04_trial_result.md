# Checkpoint 04 Trial Result — Depth-1 Projection + layoutAnchor

**Task:** `cpc_task_04_projection.md`  
**Validation:** `cpc_valid_04_projection.md`  
**Verdict:** pending re-judgment after gate-amended F1–F7 repairs

**Reviewed code revision:** `39911a8`; prior `e672a17`.

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
  135 test files / 1,553 tests
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
- P9 samples 60 offsets and records 0.001px worst-case error for the E1 projection.
- Gate amendment: Phase 04 uses a fixed 48-offset projected path plus the 60-offset E1/P5 oracle and structural snap. A runtime adaptive estimator is explicitly deferred to final hardening; ARCHITECTURE_CPC and Task/Valid 04 record the amendment.
- Depth 2, duplicate-id crossfade, E2/E3/E4 and the Gallery are not in Phase 04.

## Repairs after tribunal FAIL

- F1: box keyframes now set the animated `transform-origin` when `layoutAnchor` is supplied; P8 covers anchors 0/0.5/1 with default CSS origin. React `layoutAnchor` is in the effect deps.
- F4: projection runs after box facts/demotion/cap decisions; a child is skipped when its parent is skipped, box compensation is range-checked, and depth >1 snaps.
- F7: static-ancestor snap is limited to rotate/skew matrices, not pure axis-aligned translate/scale; the unit test uses a rotation matrix.
- F2: projected box children now use 48 sampled keyframe offsets and a zero-origin projected child frame, reducing P9 to 0.001px over 60 offsets; the E1 projection is within the 0.5px target.
- F3/F5: parent/child durations/easing are composed with parent and child eased progress separately; P10 samples 60 offsets (width error 0.157px) and P7 covers projection interrupt. Unchanged-rect children are counter-scaled and stationary nested trees return no-change before cap accounting.
- F6/F7: React `motion` and `layoutAnchor` are in the effect deps; static ancestor scale/rotate/skew snap; architecture now permits the constant anchored transform-origin.

## N1/N2 repair

- N1: a moving child is no longer skipped when its participant parent is stationary; only an unmoved child is skipped. Unit coverage added.
- N2: anchored projected child translation now uses the projected scale, not the stale linear scale. P11 samples an anchored child over 60 offsets and records 0.001px.
- P9 assertion tightened to the 0.5px target. Task 04 no longer asks for an adaptive runtime estimator; the documented fixed-48/60-offset amendment is authoritative.
