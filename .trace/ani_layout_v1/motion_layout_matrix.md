# Motion.dev Layout Animation Showcase — Ani Acceptance Matrix

**Date:** 2026-10-22  
**Research:** Motion.dev public React layout-animation category, docs, and example pages; independent `ds v4.1 flash MAX` sub-agent.  
**Status:** proposal for gate approval; this is not an Ani implementation pass.

## Sources

- Category: <https://motion.dev/examples?category=layout-animations&platform=react>
- Docs: <https://motion.dev/docs/react-layout-animations>
- Official current category examples: Layout Anchor, Create Button, iOS App Folder,
  iOS App Store, Toast: Notifications list.
- Composed showcase: <https://motion.dev/examples/react-gallery-showcase>
- Motion+ examples do not expose full source publicly. Any row whose source is
  premium requires an executable browser capture before it can be marked PASS.

## Status vocabulary

| Status | Meaning |
|---|---|
| **PASS-able** | The declared Ani tier can express the observable behavior; an executable test must still pass. |
| **partial** | Some observables pass, but a named requirement fails; not parity. |
| **blocked** | Cannot pass without an architecture change or an explicit scope exclusion. |
| **out-of-scope** | A separate engine or product surface; not a layout-animation requirement. |

## Table 1 — Official showcase examples

| ID | Motion example / behavior | Ani realization | Objective acceptance | Status | Gap |
|---|---|---|---|---|---|
| **E1** | **Layout Anchor**: parent 150→300 px; child 70→100 px with `layoutAnchor {x:.5,y:.5}` and 0.8 s delay; crosshair grandchild. | Parent box FLIP is expressible. No `layoutAnchor`, no parent-relative child projection. | Parent and child first/final rects; child center vs parent center ≤0.5 px; child size 70±0.5 px until 0.8 s; child starts at 0.8 s ±16 ms. | **blocked** | Layout-anchor target and delayed/inherited scale correction. |
| **E2** | **Create Button**: shared wrapper/text/icon `layoutId`; trigger and menu coexist; `AnimatePresence mode="popLayout"`; shadow; spring. | `layoutId` + presence are expressible. No duplicate-id crossfade, child/text counter-scale, or shadow correction. Published public bundle has static `clipPath`; do not gate on a clip morph without executable source. | Wrapper first/final; text glyph height 11±1 px; old/new opacity sum 1±.05; shadow extent ±10%; close/reopen at 100 ms and 500 ms. | **partial** | Duplicate-id crossfade, text double-scale, shadow; premium source must be captured. |
| **E3** | **iOS App Folder**: 25→68 px shared tiles/labels; `popLayout`; spring; measured origin; non-layout items stagger from origin. | `layoutId`, popLayout, measured origin/stagger are expressible at the React layer. Ancestor transform projection and label opacity transfer are missing. | 4 tile first/final; label opacity; non-layout first center ±1 px; scale .2±.02; stagger ±16 ms; reopen at 500 ms. | **partial** | Closed-root scale contaminates handoff; label opacity; shared-node cap. |
| **E4** | **iOS App Store**: grid card and full-screen detail share nested `layoutId`s; title is `layout="position"`; AnimatePresence; overlay. | Same-snapshot `layoutId` handoff is expressible. Nested projection, position-only prop, crossfade and scroll/root are missing. | Card/image first/final; title size snaps at first frame; old/new opacity sum 1±.05; image coverage no gap >0.5 px; close/reopen. | **blocked** | Nested shared elements, crossfade, position-only semantics. |
| **E5** | **Toast: Notifications**: add/remove list; `layout`; `popLayout`; enter y14/scaleX.8/opacity0; exit y10/scaleX.9/200 ms; spring; center-bottom origin. | Core box/position FLIP + React presence/popLayout + authored origin; needs executable proof. | First frame initial transform; sibling shift ≤1 px; exit ~200 ms; bottom edge ±1 px; 5 rapid ops; reduced motion. | **PASS-able** | Only candidate canary. Layout transform must compose with enter/exit transform and authored origin. |
| **E6** | **Gallery: Showcase**: 16 items, 8 arrangements, spring stagger, presence presets, detail view, drag/loop/snap. | 3D/drag/loop is out-of-scope. A reduced 2D grid/list + detail fixture is expressible. | 2D pose first/final; presence presets; detail rect ±1 px. 3D/drag rows explicitly excluded. | **out-of-scope** | No pose solver, 3D projection, drag, loop, or snap engine. |

## Table 2 — Capability rows required by the examples

| ID | Motion capability | Ani tier | Acceptance | Status | Gap |
|---|---|---|---|---|---|
| **C1** | Box FLIP; position+size via transform | core | 100×100→200×200, 100 px travel; P0/P1/P2/P7 | **PASS-able** | Approximate scale; parent context absent. |
| **C2** | `layout="position"`; size snaps | core + React prop | First-frame size = final ±1 px; center starts old ±1 px; final P1 | **partial** | No documented public position prop. |
| **C3** | `layoutId` handoff old→new | core | First frame old rect → new rect ±1 px; old gone; final P1 | **PASS-able** | Same snapshot only. |
| **C4** | Duplicate `layoutId` crossfade | missing | Both nodes present; opacity sum 1±.05; old gone by end | **blocked** | Newest-wins hides old; no crossfade. |
| **C5** | `AnimatePresence` sync/popLayout/exit | React | Exiting absolute within one frame; siblings final at t=0 ±1 px; exit duration; reverse | **PASS-able** | Needs executable proof and non-static parent. |
| **C6** | `LayoutGroup`, `layoutDependency` | React | One sibling updates; both animate same frame; unchanged dependency no-ops | **partial** | Group ordering/id and dependency semantics unverified. |
| **C7** | `layoutAnchor` | missing | Anchor displacement ≤0.5 px through parent animation | **blocked** | No anchor target or relative projection. |
| **C8** | Parent-relative projection + direct-child counter-scale | missing | 3 nested 100→200 boxes; each level 100 px until its turn ±1 px | **blocked** | Independent transforms inherit parent scale. |
| **C9** | Border-radius/box-shadow distortion correction | partial | 20 px radius stable ±1 px; 20/10 fails; shadow extent ±10% | **partial** | Uniform radius only; no shadow. |
| **C10** | Measured origin + stagger | React | Non-layout first center ±1 px; scale .2±.02; stagger ±16 ms | **PASS-able** | Needs pre-paint measurement. |
| **C11** | Retarget/interrupt | core | At 45% retarget; jump ≤1.5 px; final P1; ≤2N reads | **partial** | Velocity continuity only if claimed; WAAPI recompile. |
| **C12** | Re-entry with retained layoutId | partial | During exit 100 ms and after exit +2 rAF; first rect ±1.5 px | **partial** | Snapshot expiry; generic unmounted stack missing. |
| **C13** | Cap/degradation at `maxAnimated`/`maxBoxes` | core | cap+1 nodes; exactly cap animate; deterministic snap for extras | **partial** | Degradation contract must be documented/tested. |
| **C14** | `MotionConfig` default transition | missing | Two descendants inherit; per-component override wins | **partial** | React context glue. |
| **C15** | Nested shared elements | missing | Three nested layoutIds; no double transform; coverage | **blocked** | Same root cause as C8. |
| **C16** | View Transition discrete fallback | VT | Open/close first/final; interruption not claimed | **partial** | Not interactive; screenshot/blocking limitations. |
| **C17** | 3D gallery poses/drag/loop/snap | out-of-scope | Not part of Ani layout gate | **out-of-scope** | Separate engine. |

## Table 3 — Motion docs features outside the five examples

| ID | Feature | Ani status | Gate |
|---|---|---|---|
| **D1** | `layoutScroll` | blocked | Requires scroll projection; observer-free engine cannot express. |
| **D2** | `layoutRoot` | blocked | Requires page-scroll/root projection. |
| **D3** | `arc()` path | blocked (precompiled 2D keyframes possible) | Not approved; keyframe budget. |
| **D4** | Non-uniform/percentage radius | partial | Uniform pixels only. |
| **D5** | Deep child counter-scale / “infinite” | blocked | Reject “infinite” as a Motion guarantee; 3-level fixture would fail. |
| **D6** | Window-resize behavior | PASS-able | No automatic layout animation during horizontal resize; verify no stale snapshot. |
| **D7** | SVG layout | unsupported | Documented; no animation. |
| **D8** | `display:inline` | unsupported | Documented browser limitation. |
| **D9** | `scrollbar-gutter` guidance | documentation | No spurious layout shift. |
| **D10** | LayoutGroup id namespace | partial | Isolation test required. |
| **D11** | AnimatePresence `wait`/`custom`/`propagate` | partial | Not in current sync surface. |
| **D12** | Dedicated `transition.layout` | partial | No separate layout channel. |
| **D13** | `layoutCrossfade={false}` | blocked | No crossfade stack. |
| **D14** | `layout="size"` / `preserve-aspect` | blocked | Only position/box. |

## Objective pass criteria

- **P0 — first frame/no flash:** at WAAPI `currentTime=0` and first painted frame,
  edges/size differ from the pre-commit rect by **≤1.0 px**; no final-layout
  flash; screenshot diff outside start/end bounds **≤0.5%** viewport.
- **P1 — final:** at `finished + 2 rAF`, rect within **0.5 px**; transform
  identity within `1e-3`; opacity within `0.01`; radius within `0.5 px`; no
  managed animation running.
- **P2 — trajectory:** sample every frame; straight-line lateral deviation
  **≤1 px**; no frame-to-frame jump **>max(2 px, 1.5% travel)**; intentional
  snap rows are marked per row.
- **P3 — interruption:** retarget at **45% ±5%**; first post-change frame matches
  last pre-change within **1.5 px**; no snap to start/end; final P1; ≤2N reads.
- **P4 — re-entry:** during exit at 100 ms and after exit +2 rAF; first frame
  matches last visible rect within **1.5 px**; no flash; final P1.
- **P5 — popLayout:** exiting `position:absolute|fixed` within one frame;
  siblings final at t=0 within **1 px**; exiting node removed at end; parent
  non-static.
- **P6 — authored origin:** center-bottom bottom edge within **1 px** during
  scaleX; layout composes with, not overwrites, authored origin.
- **P7 — architecture:** ≤2N reads on retarget; zero layout-owned rAF callbacks;
  zero layout observers; stale snapshot in a later task must not animate.
- **P8 — reduced motion:** no transform animation beyond one frame; final P1.
- **P9 — DOM integrity:** no duplicate layoutId nodes remain; key order stable.

## Gate decision

The literal “all Motion rows pass” gate cannot be satisfied by the approved
Ani architecture. E1/E4 and C4/C7/C8/C15 require parent-relative projection,
layoutAnchor and crossfade; D1–D3 require scroll/root/arc; E6 requires a 3D
gallery engine; D5’s “infinite-deep” premise is not a Motion guarantee.

Two coherent gates:

1. **Scoped v1 gate (recommended):** E5 + reduced 2D E6 + C1/C3/C5/C6/C10/C11/
   C12/C13, plus explicit exclusions for E1/E4/E6-3D and D1–D3/D5. An
   architecture pass here is honest but is **not Motion showcase parity**.
2. **Showcase parity gate:** E1–E5 + reduced 2D E6 + C1–C16. Requires an
   architecture amendment for parent-relative projection/counter-scale,
   crossfade, layoutAnchor, MotionConfig and a retained layoutId stack. This is
   XL work and conflicts with parts of the current no-per-frame/no-observer
   contract.
3. **Literal all docs + showcase gate:** not feasible under the current
   architecture; requires a new projection engine, scroll/root observers and a
   3D gallery engine.

No row may be marked PASS from final rects alone, from a View Transition
fallback on an interactive row, or from a no-crash test. Premium Motion+
examples require an executable capture before gating.
