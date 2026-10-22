# ANI Layout — Final Direction

**Decision:** **B′ — Compiled Projection Core**  
**Status:** accepted after Opus-5.5 high review; implementation has not started.  
**Scope:** `ani-layout` only. Core V2 remains unchanged.  
**Date:** 2026-10-22

## 1. Decision

Ani will build a **compiled projection core** for layout composition, not a general
Motion clone and not a reduced single-example library.

The acceptance target is Motion.dev's layout showcase **E1–E5** plus the
**reduced 2D Gallery Showcase**. Full 3D/drag/loop Gallery is out of scope.

This is a deliberate architecture amendment for `ani-layout`:

- One batched measurement pass per commit.
- A pure projection compiler converts the measured tree into WAAPI keyframe
  plans for parents and children, including bounded parent-relative
  counter-scale.
- Every node in a group shares one explicit animation `startTime`.
- Plans are retained analytically so interrupts can recompile an affected
  subtree atomically, with position and velocity continuity.
- No per-frame JS, no observers, no inline FLIP writes.
- Any node outside the error/sample/depth budget, under a rotated/skewed
  ancestor, or in an unsupported browser geometry snaps. The real DOM is always
  the final state.

The moat is not “more props than Motion.” It is **native-cost projected layout
that remains smooth while the main thread is blocked**.

## 2. Why not A, B, or C

- **A (scoped E5 + reduced 2D)** is honest but leaves the valuable product
  patterns—anchored children, morphing buttons, folders, expanding cards—to
  Motion. It does not create a durable moat.
- **B (unbounded showcase parity)** hides the cost: full nested projection,
  shadow correction, scroll/root, and every Motion prop would turn into a
  per-frame or observer-heavy engine.
- **C (literal all docs + 3D gallery)** is a different product: a 3D pose/drag
  engine plus scroll/root observers. It conflicts with Ani's core invariants.
- **B′** keeps the high-value 80% and draws a defensible boundary: compiled
  transform projection, depth ≤2, axis-aligned ancestors, bounded sampling,
  explicit snap fallback.

## 3. Included product surface

### Showcase rows

| Row | Target | Depends on |
|---|---|---|
| **E1** Layout Anchor | IN | depth-1 projection + `layoutAnchor` |
| **E2** Create Button | IN | duplicate-layoutId crossfade + child counter-scale + static ancestor |
| **E3** iOS App Folder | IN | depth-2 shared projection + measured origin/stagger |
| **E4** iOS App Store | IN | nested layoutId depth 2 + `layout="position"` |
| **E5** Toast Notifications | IN — first canary | existing FLIP/popLayout + P3/P5/P6 proof |
| **E6** Gallery Showcase | reduced 2D grid/list/detail only | shared layoutId; no 3D/drag/loop |

### API

- `layout: true | "position" | "size" | "preserve-aspect"`
- `layoutId`
- `layoutDependency`
- `layoutAnchor`
- `layoutCrossfade`
- `<LayoutConfig transition reducedMotion>`
- `AnimatePresence mode: "sync" | "popLayout" | "wait"`
- per-corner radius correction (opt-in)
- `usePresence` style / `motion.initial` / popLayout (already landed)

### Bounded projection

- Maximum depth: **2 projected ancestors**.
- Translate + scale only.
- Axis-aligned ancestors only. Rotated/skewed ancestors snap the subtree.
- Adaptive keyframe sampling, around 48 samples maximum; compiler computes
  worst-case error and snaps if it cannot meet the error budget.
- Parent/child timing mismatch (spring + tween + delay) is handled by sampling
  the composed timeline, not by per-frame correction.

## 4. Explicit exclusions

Rejected even though Motion supports them:

- Full Gallery 3D poses, drag-coupled layout, loop/snap.
- `layoutScroll` / `layoutRoot` observer-based scroll/root projection.
- Arc paths.
- Shadow distortion correction.
- Deep or “infinite” counter-scale beyond depth 2.
- SVG layout geometry and inline-display boxes.
- Rotation/skew projection.
- Pixel-perfect promises for async content reflow, text rewrap, image loading,
  or content changes during the animation.

These are not silently downgraded. Rows that require them are marked
`out-of-scope` in the acceptance matrix.

## 5. Correctness model

1. **Commit:** one batched read of all participants and static ancestor
   transforms.
2. **Compile:** a pure function emits per-node WAAPI keyframes for translate,
   scale, opacity and radius where applicable.
3. **Play:** one group `startTime`; parent and child keys run on the compositor.
4. **Interrupt:** evaluate stored plans to recover current position and
   velocity; cancel and recompile the affected subtree with a new shared
   `startTime`.
5. **Failure:** if error/depth/sample/geometry bounds fail, snap that subtree.
   No stale inline transform is left behind; final layout is authoritative.

The bytes and frame model stay in the WAAPI tier. Radius paint is explicitly
counted against `maxBoxes`; shadow correction is not attempted.

## 6. Acceptance gates

All rows must pass before a layout architecture pass is declared.

- **P0 first frame/no flash:** pre-commit box vs first frame edges/size ≤1.0px;
  no final-layout flash.
- **P1 final:** finished + 2 rAF; rect ≤0.5px; transform identity; no animation
  remaining.
- **P2 trajectory:** frame jumps ≤max(2px, 1.5% travel); straight rows lateral
  deviation ≤1px.
- **P3 interruption:** 45% ±5%; first post-change frame ≤1.5px; final P1;
  ≤2N reads.
- **P4 re-entry:** during exit at 100ms and after exit +2 rAF; first frame
  ≤1.5px.
- **P5 popLayout:** exiting node absolute/fixed in one frame; siblings final at
  t=0 ≤1px.
- **P6 authored origin:** center-bottom edge ≤1px during scaleX.
- **P7 architecture:** zero layout-owned rAF callbacks and zero observers;
  no stale later-task snapshot.
- **P8 reduced motion:** transform animation ≤1 frame; final P1.
- **P9 DOM integrity + jank:** no duplicate layoutId nodes; with a 200ms
  main-thread block, transform/opacity frame pacing shows no dropped frames.

If the projection compiler cannot prove P3/P6 within the sample budget, the
affected row snaps; if the product row demands pixel parity, that row fails
rather than being silently downgraded.

## 7. Execution order

| Phase | Deliverable | Gate |
|---|---|---|
| P0 | Frame oracle + observer/rAF guards + jank harness | Deterministic Chromium/Firefox/WebKit; E5 baseline |
| P1 | Plan retention, shared startTime, analytic interrupt recompile | 100 interrupts: jump ≤0.5px, velocity discontinuity ≤10% |
| P2 | layout modes, layoutDependency, LayoutConfig, wait mode | Unit/SSR/StrictMode |
| P3 | Depth-1 projection compiler + error-bound snap | P0–P3 oracle; E1/E2 baseline |
| P4 | layoutAnchor | Anchor invariance ≤0.5px |
| P5 | Crossfade + layoutCrossfade | E2 duplicate-id opacity/box proof |
| P6 | Depth-2 nested shared elements | E3/E4; rotated ancestor snap |
| P7 | per-corner radius (opt-in) | Radius ≤1px; cap accounting |
| P8 | caps/load/retarget hardening | 200 nodes; 50-node commit ≤4ms |
| P9 | E1–E5 + reduced 2D Gallery; bundle/jank publication | all rows in three engines |

## 8. Moat statement

The public claim is:

> **Ani compiles nested layout composition into browser-native WAAPI plans, so
> cards, folders, morphing buttons and notification stacks keep compositor
> motion under main-thread jank. It deliberately snaps outside its bounded
> projection envelope instead of guessing.**

That is narrower than Motion, stronger than a final-rect FLIP, and testable
without observers or per-frame JavaScript.

## 9. Non-goals and protocol

- Core V2 is not modified.
- No push/publish without explicit approval.
- Every phase needs the same evidence → CHIEF JUSTICE → PASS → commit protocol.
- A final architecture pass is not granted until the selected matrix rows and
  P0–P9 gates pass.
