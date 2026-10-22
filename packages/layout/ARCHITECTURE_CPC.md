# Ani Layout — Compiled Projection Core (CPC) Architecture

**Status:** authoritative for the `ani-layout` v0.2 line.  
**Supersedes:** the v1 FLIP-only projection/scope sections of
`packages/layout/ARCHITECTURE.md`; v1 presence, View Transition and package
contracts remain in force unless explicitly extended here.  
**Core V2:** unchanged.

## 1. Product goal

Ani layout must deliver **compiled compositor-native layout composition**:

- It compiles a measured layout tree into WAAPI keyframe plans, including
  bounded parent-relative projection and direct-child counter-scale.
- The plan runs on the compositor; no per-frame JavaScript, no observers and no
  inline FLIP writes.
- When a plan cannot meet its error/depth/geometry/sample budget, that subtree
  snaps. The real DOM layout is always authoritative at the end.
- The public showcase target is Motion.dev layout examples **E1–E5** plus a
  reduced 2D Gallery Showcase. Full 3D/drag/loop Gallery is out of scope.

The moat is not feature-count parity with Motion. It is:

> **Layout composition stays smooth under main-thread jank because Ani compiles
> the entire group into browser-native animation plans.**

## 2. Invariants

1. Core V2 exports and source remain unchanged.
2. No layout-owned `ResizeObserver`, `MutationObserver` or `IntersectionObserver`.
3. No layout-owned per-frame `requestAnimationFrame`/JS projection loop.
4. No inline FLIP style writes. Animation state lives in `Element.animate`.
5. One measurement pass per commit; captures are batched.
6. A compiled group shares one explicit `startTime`.
7. Plans are retained analytically so interrupts can recompile an affected
   subtree without measuring animated state.
8. Snapshot expiry is next task; no frame reads.
9. Bounded error: if a plan cannot meet the error budget within the sample
   budget, snap instead of silently degrading.
10. Package tests will prove behavior in Chromium, Firefox and WebKit (Linux
    WebKit host limitations are environmental, not a waiver).

## 3. Pipeline

```
DOM commit
  └─ capture: batched boxes + participant tree + static ancestor facts
  └─ mutate
  └─ measure: batched final boxes
  └─ compile: pure projection compiler → GroupPlan
  └─ play: WAAPI keyframes with one group startTime
  └─ retain: plans for interrupt recompilation
```

### 3.1 Measurement record

Each participant stores:

- local box before/after (border box, scroll-adjusted when required);
- `offsetWidth`/`offsetHeight`/`offsetLeft`/`offsetTop`;
- computed transform-origin and base `translate`/`scale`/`rotate`/`transform`;
- layout mode (`position`, `box`, `size`, `preserve-aspect`);
- parent participant identity (nearest ancestor participant);
- static ancestor transform facts; a rotated/skewed or otherwise
  non-axis-aligned ancestor causes snap.

### 3.2 Group plan

A `GroupPlan` contains:

- `startTime` from `document.timeline.currentTime`;
- maximum duration (after spring/tween/delay normalization);
- per-node `NodePlan`:
  - start/end local boxes;
  - parent plan reference;
  - WAAPI keyframes for `translate`/`scale` (and opacity/radius where opted in);
  - duration/easing/fill/composite;
  - error estimate and `snap` flag.
- a cancellation token and generation.

The group clock is explicit. Every animation in the group gets the same
`startTime`; the compiler does not rely on `Element.animate` creation order.

### 3.3 Projection compiler

For a projected parent P and child C, the visual transform at time t is
composed from:

```
T_p(t) · S_p(t) · T_c(t) · S_c(t)
```

The compiler:

1. resolves each node's local FLIP delta;
2. samples the parent's known curve and the child's timing curve over the group
   duration;
3. computes child corrective translate/scale keyframes on both axes;
4. folds transform-origin into translate values, and emits a constant
   animated `transform-origin` only when an explicit `layoutAnchor` requires it;
5. emits sampled keyframes (`linear` between samples) for cross-engine WAAPI;
6. computes worst-case sample error; if above budget, marks the subtree snap.

Bounds:

- projected ancestor depth ≤ **2**;
- translate + scale only;
- axis-aligned ancestors only;
- maximum **48** keyframes per channel for projected children;
- Phase 04 gate amendment (2026-10-22): the current compiler uses a fixed
  48-offset sampled path and proves the E1 composed path at 60 offsets; a
  runtime adaptive estimator is deferred to the final hardening phase;
- target worst-case error ≤ **0.5 px** (or 1% of box for large boxes) on the
  E1/P5/P9 fixture, with structural snap for degenerate scales/caps/ancestors;
- static ancestor transforms are applied to the target box; rotation/skew
  causes snap;
- parent/child mismatch (spring/tween/delay) is supported by sampling the
  composed timeline.

### 3.4 Interrupt and retarget

Plans are analytic functions of time. On an interrupt:

1. evaluate the current value/velocity from the retained plan (or a safe
   `getComputedStyle` fallback if no plan exists);
2. cancel the affected animations;
3. measure the new layout once;
4. recompile the affected subtree against the remaining parent plan and the
   current visual state;
5. set a fresh shared `startTime`.

No per-frame correction and no observer is permitted. If no reliable plan is
available, snap.

## 4. Public API

### Core `@freestylejs/ani-layout`

```ts
type LayoutMode = 'position' | 'box' | 'size' | 'preserve-aspect'

interface LayoutMotion { duration?: number; timing?: TimingFunction }
interface LayoutParticipantOptions {
  layout?: LayoutMode
  layoutId?: string
  layoutDependency?: unknown
  layoutAnchor?: { x: number; y: number } // 0..1
  layoutCrossfade?: boolean // default true for duplicate ids
}
```

`LayoutGroupOptions` adds projection/error/sample/depth caps, reduced-motion
policy and the existing per-element error hook.

`LayoutGroup` adds:

- `capture()` / `play()` unchanged at the public level;
- retained-plan internals;
- `finish()` and `dispose()` must cancel all plan animations;
- a group is single-use per snapshot and may be retargeted exactly once per
  commit boundary.

### React `@freestylejs/ani-react/layout`

- `LayoutGroup` boundary and `useLayout` options include the new participant
  fields.
- `useLayoutGroup().update` remains capture → `flushSync` → play.
- `LayoutConfig` supplies a default layout transition and reduced-motion policy
  for descendants; per-component `layout` transition overrides it.
- `AnimatePresence` modes: `sync`, `popLayout`, `wait`.
- `custom` data is exposed to presence children (`usePresence().custom`); exit variants remain a future API. This is the Phase 03 contract.

## 5. Showcase contract

| Row | Requirement |
| --- | --- |
| E1 Layout Anchor | Parent/child depth-1 projection, `layoutAnchor`, delayed child |
| E2 Create Button | duplicate-id crossfade, child/text counter-scale, static ancestor |
| E3 iOS App Folder | popLayout, measured origin/stagger, depth-2 shared projection |
| E4 iOS App Store | nested layoutId, `layout="position"`, crossfade |
| E5 Notifications | list FLIP, popLayout, authored origin, rapid retarget |
| E6 reduced 2D Gallery | grid/list pose + detail layoutId; no 3D/drag/loop |

## 6. Explicit exclusions

- Full 3D Gallery, drag-coupled layout, loop/snap.
- `layoutScroll` / `layoutRoot` observer-based projection.
- Arc paths.
- Shadow distortion correction.
- Depth >2 / “infinite” child correction.
- SVG layout geometry and `display:inline`.
- Rotation/skew projection.
- Pixel-perfect promises during async text/image/content reflow.

## 7. Acceptance gates

- **P0** first frame / no final-layout flash: edges/size ≤1.0px.
- **P1** final: finished + 2 rAF; rect ≤0.5px; transform identity; no managed
  animation remains.
- **P2** trajectory: frame jumps ≤max(2px, 1.5% travel); straight rows lateral
  ≤1px.
- **P3** interruption at 45% ±5%: first frame ≤1.5px; final P1; ≤2N reads.
- **P4** re-entry during exit (100ms) and after exit +2 rAF: ≤1.5px.
- **P5** popLayout: absolute/fixed within one frame; sibling final at t=0 ≤1px.
- **P6** authored origin: center-bottom edge ≤1px.
- **P7** zero layout-owned rAF/observers; no stale later-task snapshot.
- **P8** reduced motion: no transform animation beyond one frame; final P1.
- **P9** DOM integrity + jank: no duplicate layoutId nodes; compositor
  transform/opacity remains smooth during a 200ms main-thread block.

No final-rect-only proof, no View Transition fallback on an interactive row,
and no “no crash” test counts as PASS.

## 8. Module map

```
packages/layout/src/projection/
  plan.ts        types, plan retention, timeline evaluation
  compiler.ts    pure projection compiler, sampling and error bound
  group_plan.ts  group clock, play/cancel/retarget coordination
packages/layout/src/layout_group.ts
  measurement, participant tree, public capture/play/finish
packages/react/src/layout/
  layout_group.tsx, use_layout.ts, presence.tsx, context.ts
tests/browser/cases/cpc.ts
  E1–E5 and reduced 2D Gallery fixtures + oracle
```

## 9. Change control

The compiler and public API may evolve only with checkpoint evidence and a
measured error budget. Core V2 is not an extension point. A row that needs an
excluded capability is marked out-of-scope, not silently declared PASS.
