# iOS-grade layout — architecture proposal (B completion and the B–C seam)

**Status:** PROPOSAL, 2026-10-26. Awaits the user's decisions in §8. Nothing here is
implemented. When approved, it amends `packages/layout/ARCHITECTURE.md` (the authority) and
opens a checkpoint plan in this folder.

**Scope.** Goal B ("optional layout core, targeting iOS native grade layout transitions") is
partially achieved. This document designs what remains for B and the one interface B must
open for C (gestures):

1. Layout inside scroll containers and fixed roots (Motion's `layoutScroll` / `layoutRoot`).
2. A physical, velocity-native spring for layout tracks.
3. The external-drive seam: an outside driver (C's drag) takes an element from layout and
   hands it back with a release velocity.

The gesture package itself (C), motion tokens (D) and `GATE_AMENDMENT.md` are out of scope.

---

## 1. What "iOS native grade" means, measurably

Each property is something the oracle can check frame by frame. The right column is Ani today
(`a4191c6..0c0e11c`).

| # | Property | Source | Ani today |
|---|---|---|---|
| P1 | The first frame after a change shows exactly what the user saw | Ani §3.3-1; Apple: motion starts from the presented value | Holds without scroll. **Fails** when a scroll the user did not see lands between capture and flush (§2.2) |
| P2 | Velocity is continuous on retarget, shared-element handoff and gesture release | WWDC23 *Animate with springs*: "a spring animation uses the velocity it had when it was retargeted as the initial velocity towards its new destination" | Retarget and handoff: exact (`c′(0) = v`). Gesture release: no API |
| P3 | Motion follows a damped spring set by perceptual duration and bounce | WWDC23: `stiffness = (2π/duration)²`, `mass = 1`; bounce in [−1, 1]; SwiftUI's default animation is a spring with response 0.55 and damping fraction 1.0 (iOS 17+) | Stateless curves plus a momentum term; core `timing.spring` is time-rescaled to its settling time and ignores velocity |
| P4 | Interruptible at any frame | Apple fluid-interface guidance | Holds |
| P5 | Works inside scrolling lists, panels and fixed sheets | UIKit scroll views are everywhere | Snaps `'stale'` on any inner scroll between capture and flush; fixed roots are untreated |
| P6 | A released drag settles into its layout slot with the finger's speed | WWDC23: "a natural feeling where our animation picks up right where the gesture ends" | No seam; Motion also hands no velocity to layout (§2.3) |
| P7 | Frame-rate independent (60/120 Hz) | ProMotion | Holds: tracks are analytic in time |
| P8 | Reduced motion respected | Accessibility | Holds |

B is complete when P1–P8 hold, each with frame-level evidence in three engines.

## 2. Findings

### 2.1 Motion 14.6 (source read from the `motion-dom` 14.6.0 package)

- `layoutScroll` marks a scroll container. `updateScroll('snapshot')` reads its
  `scrollLeft/Top` before the change and `updateScroll('measure')` after it.
  `removeElementScroll` adds each marked ancestor's offset to the measured box. Both boxes
  become scroll-free, so a scroll between them is not motion: **content continuity**.
- A marked container whose computed `position` is `fixed` is a *scroll root*
  (`checkIsScrollRoot`). Boxes under it skip the page scroll.
- `layoutRoot` makes its own node jump (`type: false`, `delay: 0`) so that its subtree
  animates relative to it.
- Both props are opt-in. An unmarked container still mis-measures.
- During a drag, `projection.isAnimationBlocked = true`. On release the drag runs its own
  `inertia` animation on `x`/`y` (`timeConstant: 750`), separate from the layout animation.
  The release velocity never reaches the layout animation.

### 2.2 Browser scroll semantics, and why content continuity breaks P1

- **Scroll anchoring** applies its correction when the suppression window ends: at the end of
  the event-loop iteration, or before the next operation whose result depends on scroll
  position, such as `getBoundingClientRect()` (CSS Scroll Anchoring 1). For Ani, that is the
  flush's first rect read. The user never sees the pre-correction offset. Chromium and Gecko
  ship anchoring, and WebKit has shipped it recently (reported for Safari 27; to verify in
  spike S-B2).
- **Scroll events** are dispatched in the update-the-rendering step, before
  `requestAnimationFrame` callbacks (WebKit r252205, matching Chrome and Firefox). A scroll
  that fired its event was painted; a scroll made by script in the commit task has not fired
  yet when the flush runs.

**Worked example.** A chat panel. A message above the viewport is deleted and scroll
anchoring keeps the visible messages still. A visible message rests at content y = 500 with
scrollTop = 300, so on screen y = 200. After the commit its content y is 400 and anchoring
sets scrollTop = 200: on screen it is still 200, and the user expects nothing to move.

- With **content continuity** (Motion), the track runs 500 → 400 in content space. Its first
  frame draws at 500 − 200 = 300: a 100 px jump down, then a slide back up.
- With **visual continuity** (proposed), the track runs 200 → 200 on screen: no motion.

Ani's page boxes give the same content continuity for the *page* scroller (the page box is
`rect + page scroll`). The example therefore suggests an existing P1 defect at document level
whenever anchoring corrects page scroll. Spike S-B2 must reproduce it before any fix is
claimed.

### 2.3 The momentum term against a physical spring

Same initial velocity `v`, same duration `D`; Ani's track is ease-out plus
`k·τ(1 − τ)²` (§5.1), and the reference is a critically damped spring with `ω = 2π/D`. Computed
in `cmp.py` (scratch):

| Case | Ani momentum term | Spring, bounce 0 | Spring, bounce 0.2 |
|---|---|---|---|
| At target, v = 1500 px/s, D = 0.5 s: peak excursion | 111.1 px | 43.9 px | 50.6 px |
| At target, v = 3000 px/s, D = 0.5 s | 222.2 px | 87.8 px | 101.2 px |
| 200 px short, moving toward the target at 3000 px/s: overshoot | 83.1 px | 0.1 px | — |

The ratio of peak excursions is exactly `(4/27)·2π·e ≈ 2.53` for every `v` and `D`. The
momentum term is exact at `τ = 0` (`c′(0) = v`), but it over-carries momentum afterwards. This
is invisible for retargets between nearby targets and obvious for a flick release (P6). The
term is the right device for timing *curves*; it is not a substitute for physics (§12 already
says so).

## 3. Design A — frames and the scroll ledger (replaces `'stale'`)

### 3.1 Principle

> **Seen scroll is camera; unseen scroll is part of the change.**
>
> A scroll the user watched (its scroll event fired before the flush) moved the content, and
> tracks follow the content. A scroll the user never saw (script in the commit task, the
> browser's own anchoring correction) is part of the same transaction. Each participant starts
> from where the user last saw it, which is P1.

This is the UIKit transaction model. Cells and `contentOffset` changed in one animation block
move together on screen. Applied at commit level, Ani gets it without animating the scroller
itself.

### 3.2 Definitions

| Term | Definition |
|---|---|
| **Scroll chain** `C(n)` | The ancestors of `n` up to its frame root whose scroll offsets can move it (`dom.scrollOffsets` already walks them, one read per ancestor). |
| **Frame root** `R(n)` | `document` when page scroll moves `n`; `viewport` when `n` or an ancestor is fixed to the viewport. |
| **Frame box** | `rect + (R = document ? pageScroll : 0)`. This is today's page box generalised: identical for document-rooted nodes, and the viewport rect for fixed ones. |
| **Content gain** `J_c` | The linear part of the full map of the nearest participant above scroller `c` (identity if none). A scroll of `Δ` in `c` moves its content on screen by `−J_c·Δ`. Non-participant ancestors may only translate (§6), so `J_c` is exact and known to the engine. |
| **Ledger** | Per scope, the offsets of every chain container at three instants: at the plan of each running track (`S_plan`, stored with the track), at the capture (`S_seen`), and at the flush (`S_fl`). |

### 3.3 Rules

1. **Capture** reads the rects as today, plus offsets for the chains of *all* participants,
   driven ones included. `scrollOffsets(elements)` already includes driven elements; only the
   use of the result changes.
2. **Seen refresh.** While a capture is open, one passive capture-phase `scroll` listener per
   document refreshes the capture when a chain container (or the page) fires `scroll`. It
   re-reads the offsets and the rects of the undriven participants under that container.
   - The listener is armed at capture and disarmed at flush.
   - A synchronous commit (capture and flush in one task) can see no scroll event in
     between, so it never pays this cost.
   - The cost falls only in a time-sliced render that the user scrolls between chunks.
3. **B at flush**, converted into the flush's frame space through the view:
   - Undriven node: `B = rect_seen_view + root(n)`, where `root = pageScroll_fl` for
     document-rooted nodes and 0 for viewport-rooted ones.
   - Driven node: `B = V(t) − Σ_{c∈C(n)} J_c·(S_seen(c) − S_plan(c)) + (root_fl − root_seen)`,
     with `root` the page scroll for a document-rooted node and 0 for a viewport-rooted one.
     The first term is the seen inner scroll since the plan; the second is the unseen page
     scroll.
     Its velocity is carried unchanged. The scroll adds a constant offset, not a rate, and a
     scroll *in progress* is camera, as in UIKit.
4. **A at flush** is the frame box at `S_fl`, as today.
5. **Keep test** (§5.5). A running track is kept only when no unseen delta touched its chain
   (`S_fl = S_seen` on `C(n)` and `root_fl = root_seen`) and its target is unchanged in the
   plan space:
   `A_new = A_old − Σ J_c·(S_fl − S_plan)` within `threshold`. Otherwise it is retargeted from
   its seen drawn box and carries its velocity. A kept track keeps its `S_plan`. The browser
   applies later scrolls to its layout position, so a kept track needs no per-frame read and
   no rewrite.
6. **Frames** are unchanged: zero reads, and the browser moves content under the track. A
   pose is relative to the layout position, which scrolls with its content (`P(X)` in §5.3 is
   invariant under a common translation of `X` and `V`).
7. **Cross-frame handoff.** A shared `layoutId` from a scrolled list to a fixed overlay goes
   through view space: the follower's seen drawn view box plus the lead's root offset.
8. **Fixed-root detection** happens in the flush read phase, before any write, by walking the
   `offsetParent` chain from each active node.
   - CSSOM View: `offsetParent` is null for a fixed element "and no ancestor establishes a
     fixed position containing block".
   - The chain ending at a fixed element (not `body` or `html`) means `R = viewport`. A
     transformed or contained ancestor that captures fixed descendants yields a non-null
     chain, which is correct.
   - The walk is cached per element per flush, and its cost is the depth of the
     positioned-ancestor chain.
   - The participant's own `position: fixed` is free from the computed style that active
     nodes already read. Spike S-B1 must prove the walk in three engines before it ships.
9. **Sticky.** A participant whose chain scrolled during its run while it, or an ancestor
   below the scroller, is `position: sticky` snaps with `'stale'` at the next flush. The
   sticky offset is not linear in the scroll. This is the only remaining use of `'stale'`.

### 3.4 Public API

**None added.** Every container is a chain member automatically, and fixed roots are
detected. Motion needs `layoutScroll` / `layoutRoot` on every container. Ani needs neither,
and an unmarked container can no longer mis-measure.

A `scroll: 'content'` escape hatch (Motion's semantics, for apps that want participants to
jump with an instant scroll) is **not** proposed. It is a one-line addition later if a real
case needs it. Smooth scrolling (`behavior: 'smooth'`) already gives the gliding look.

### 3.5 Cost-gate amendment

The flush read set stays `2N` rects plus one computed style per active node. It gains the
cached `offsetParent` walk of active nodes (rule 8). Capture is unchanged.

The invariant "steady frames read zero" is restated as: "animation frames read zero; a
`scroll` event during an open capture re-reads the capture under the scrolled container".
Commit reads at 1,000 participants ≤ 4 ms and steady frame p95 ≤ 2 ms are unchanged.

### 3.6 Clipping (accepted, with a later option)

A shared element that flies from a fixed overlay back into a clipped scroller is clipped by
the scroller while it is outside the scroller's box. The asymmetric crossfade (§5.6) hides
most of this: the unclipped follower stays opaque until `p = 0.5`.

A *clip-aware crossfade* is a candidate follow-up, not part of this proposal. It would hold
`out(p)` until the lead's drawn box is inside its clip rect, read once per flush from the
chain. UIKit avoids the problem with a transition container. The web equivalent is a View
Transition (`shareElement`), which stays available.

## 4. Design B — the physical spring

### 4.1 Model

A new motion kind, closed form per channel. With displacement `x₀ = B − A`, incoming velocity
`v₀`, perceptual duration `D`, bounce `b ∈ (−1, 1)`, `ω = 2π/D` and `ζ = 1 − b`:

```
ζ = 1:  x(t) = A + (x₀ + (v₀ + ω·x₀)·t)·e^(−ωt)
ζ < 1:  x(t) = A + e^(−ζωt)·(x₀·cos ω_d t + ((v₀ + ζω·x₀)/ω_d)·sin ω_d t),   ω_d = ω·√(1 − ζ²)
ζ > 1:  the overdamped closed form (two real exponents)
```

- **Stateless:** evaluable at any `t`. It is exact for seek and sampling, and the WAAPI
  `linear()` sampling works for `v₀ = 0`. It satisfies §5.1's requirement without the
  momentum term.
- **Exact velocity:** `x′(0) = v₀` on every channel (origin point x/y, size w/h, anchor
  offset). Retargeting from the current `(x, v)` with the same parameters equals
  superposition of the old and new responses, the additive model of UIKit and SwiftUI.
- **Settle:** the track ends at the first `t` where the analytic envelope bound puts every
  channel within ε = 0.1 visual px and its speed under 1 px/s. Ending then is the identity
  pose with an invisible jump below ε. The run's report resolves at settle.
- **Perceptual timeline** `p(t)`: the velocity-free step response `1 − x_step(t)/x₀` of the
  lead's spring, clamped to [0, 1]. It drives crossfade opacity (§5.6), the radius blend
  (§5.7) and presence's release hold, so those finish at the perceptual end, as SwiftUI's
  completion criteria do, not at settle.
- **Unchanged rules:** the size floor and the delay rule (only nodes at rest wait).
  Reduced-motion `{ maxDuration }` shortens `D` until the settle bound fits.

### 4.2 API

```ts
interface LayoutMotion {
  readonly duration?: number          // seconds (curves)
  readonly delay?: number
  readonly timing?: TimingFunction    // stateless curve; velocity via the momentum term
  readonly spring?: { readonly duration: number; readonly bounce?: number }  // physical
}
```

`spring` and `timing`/`duration` are mutually exclusive (`ANI_INVALID_OPTIONS`). Curves keep
today's exact behaviour. The default is decision D1.

### 4.3 Placement

The closed forms (spring, plus the exponential decay C needs for momentum projection,
`v·r/(1 − r)` with UIKit's `decelerationRate` 0.998 per ms) are needed by both layout and the
gesture package. C must not depend on layout, so they belong in **core** as a new pure
module, `physics`: `spring({ duration, bounce }).at(t, x₀, v₀) → { x, v }`, `settleTime`,
`decay`.

This is additive to core's public API, but it lifts the layout project's "core frozen"
constraint (decision D2). Keeping it inside layout and duplicating it in C is the fallback.

## 5. Design C — the external-drive seam (B–C)

### 5.1 Semantics

```ts
// core: types only, so the gesture package depends on core, not on layout
interface Velocity2D { readonly x: number; readonly y: number }          // px/s, visual
interface DriveHandle {
  readonly velocity: Velocity2D               // drawn velocity when taken (0 at rest)
  release(velocity: Velocity2D): void         // give the element back
}
interface ExternalDrive {
  take(element: HTMLElement, options?: { onShift?(dx: number, dy: number): void }): DriveHandle
}
// layout: LayoutGroup implements ExternalDrive
```

- **`take`.** A running track ends at its drawn box, and its velocity is returned so a drag
  can catch a moving card (Apple: grab at any instant). Layout restores and stops owning the
  element's `translate`/`scale`. The driver writes `translate` like an author would.
  - Participant children stay in layout. A held parent is a translating non-participant
    ancestor for them, which §6 already allows.
- **While held.** At each flush whose `A` moved the held element's layout slot by `(dx, dy)`
  in view space (a reorder under the finger), layout calls `onShift(dx, dy)` in its write
  phase, after every read. The driver subtracts the shift from its offset so the element
  stays under the pointer. This fixes the showcase's user-land defect (the row lagged the
  pointer) at the seam rather than in every app.
- **`release(v)`.** The next flush starts the element's track from its drawn box (driver
  translate included, read by capture) with incoming velocity `v`, then the driver clears its
  translate in the same change.
  - The track is a *moving* node (§4.3): no delay, and its time continues.
  - With the spring (§4) the landing is physically correct. With a curve the momentum term
    carries `v`.
  - Releasing without a layout change springs back to the slot, so a snap-back needs no
    animation code in C.

### 5.2 React

`useLayoutDrive()` returns the scope's `ExternalDrive`. C's React hook accepts it as an
option. The glue is one line in the app or in C's adapter.

### 5.3 Why not Motion's model

Motion blocks projection during the drag and animates `x`/`y` with its own inertia afterwards.
The layout animation and the momentum animation are two systems. In Ani, one track carries
the release velocity into the layout slot. This is P6 by construction, and it keeps one owner
per property (§6).

## 6. Module changes

| Module | Change |
|---|---|
| `dom.ts` | Chain offsets (driven included), `offsetParent` root walk, seen-refresh reads |
| `scope.ts` | Ledger, seen-scroll listener during open captures, keep-test rebasing, `take`/`release`/`onShift` |
| `plan.ts` | Unseen-delta and moved tests per §3.3-5; release velocity seeds |
| `solve.ts` | Spring channel kind; perceptual timeline `p(t)` |
| `motion.ts` | `spring` validation and exclusivity; settle bound |
| core `physics` (D2) | Closed-form spring and decay, pure |
| core types | `Velocity2D`, `DriveHandle`, `ExternalDrive` |
| `react/layout` | `useLayoutDrive` |

The pure modules stay DOM- and clock-free. Only `dom.ts` reads.

## 7. Verification plan

### 7.1 Spikes (hard gates before production code, as in CP2)

| Spike | Must show (Chromium, Firefox, WebKit) |
|---|---|
| S-B1 fixed roots | The `offsetParent` walk classifies `R` correctly for: fixed, fixed in a transformed ancestor, `contain: layout`/`paint`, `filter`, `will-change: transform`, top layer, `display: contents` parents |
| S-B2 anchoring | Reproduce §2.2 on the current engine: a page-level and an inner-scroller anchoring correction, measured on the first frame, with the jump size. Confirm the correction is applied before the flush's first rect read, and that layout's `translate`/`scale` writes do not suppress or alter anchoring |
| S-B3 seen scroll | A React 18/19 transition, time-sliced, scrolled between chunks: the scroll event fires before the commit, and the refreshed capture equals the painted frame within 0.5 px |
| S-B4 scroll during a run | A user scroll mid-run, inner and page, nested under a scaling parent: drawn boxes equal `V − J·Δ` every frame; the next flush's B equals the painted box |

### 7.2 Oracle and acceptance rows

The oracle gains an independent closed-form spring and the ledger arithmetic, sharing no code
with the solver. Every row passes in three engines, every frame:

| Row | Assertion |
|---|---|
| L-SCROLL-1 chat delete under anchoring (page and panel) | No visible message moves more than 0.5 px at any frame |
| L-SCROLL-2 kanban card moved, column auto-scrolls in the layout effect | Card and column members start at their seen boxes (P1) and land on A |
| L-SCROLL-3 accordion plus instant `scrollIntoView` | Participants start at their seen boxes; non-participants follow the scroll; settle exact |
| L-SCROLL-4 user scroll mid-run, then a commit | Tracks follow the content; the next flush continues velocity, with no jump |
| L-SCROLL-5 list item 40 to fixed detail and back (E4 in a scroller) | Shared handoff across frame roots; coverage 1 every frame |
| L-ROOT-1 fixed sheet with nested participants while the page scrolls | No motion from page scroll; inner layout animates |
| L-SPRING-1 spring channels | `c(0) = B`, `c′(0) = v`, settle within ε, against the oracle for b ∈ {−0.3, 0, 0.2, 0.4}, at 60 and 120 Hz frame steps |
| L-DRIVE-1 take, shift, release | Pointer-relative offset constant under reorder shifts (≤ 0.5 px); release `c′(0) = v` exactly; snap-back with no layout change |
| L-DRIVE-2 catch a moving card | `take` returns the analytic velocity; no jump at take |

Every existing row and cost gate stays green. Sensitivity is mandatory: each new row fails on
the current engine for the defect it targets.

### 7.3 Checkpoints (same loop as before: Task Agent → Valid Agent → orchestrator)

| CP | Content | Gate |
|---|---|---|
| B1 | Spikes S-B1 to S-B4 | All stop conditions; a failed spike applies its fallback (rule 8 falls back to a computed-`position` walk) and re-runs |
| B2 | Ledger and frames (§3), L-SCROLL/L-ROOT rows | Rows ×3 engines; cost gates |
| B3 | Core `physics` plus spring tracks (§4), L-SPRING | Property tests 1e-9 against the oracle; rows ×3 |
| B4 | External drive (§5), L-DRIVE | Rows ×3; React adapter tests |
| B5 | ARCHITECTURE amendment, docs, showcase rows (chat, kanban, sheet), final gate | Full gate, fresh clone |

## 8. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | Default `motion` | `spring: { duration: 0.55, bounce: 0 }`, SwiftUI's documented default since iOS 17. It changes the unreleased 0.2.0 default and the fixtures that rely on it; curves stay available. |
| D2 | Physics in core (additive public API) vs inside layout | Core: C needs the same closed forms without importing layout. |
| D3 | Unseen scroll = part of the change (visual continuity) vs Motion's content continuity | Visual continuity (§3.1): it is the only rule consistent with P1 and §3.3-1. |
| D4 | Clip-aware crossfade | Defer (§3.6). |

## 9. Risks

- **iOS Safari elastic overscroll** is visual only and is not reflected in `scrollTop`. A
  capture taken mid-rubber-band records the clamped offset, so it is off by the overscroll
  until it relaxes. Accepted; covered by S-B4 on WebKit as far as headless allows.
- **The seen-refresh listener** is the one event-driven read. It only exists while a capture
  is open across tasks.
- **`offsetParent` edge cases** (top layer, shadow trees) depend on S-B1. The fallback is a
  cached computed-`position` walk.
- **Spring runs** last until settle (about 1.7 × D for a 300 px move, bounce 0, ε = 0.1 px), longer than a
  curve's D. Completion that the user perceives (crossfade, presence release) uses `p(t)`.

## 10. Sources

- Apple, WWDC23 *Animate with springs* (duration/bounce mapping, retargeting velocity,
  perceptual vs settling duration): https://developer.apple.com/videos/play/wwdc2023/10158/
- Apple, SwiftUI `Animation.default` (spring, response 0.55, damping fraction 1.0, iOS 17+):
  https://developer.apple.com/documentation/swiftui/animation/default
- Apple, `UISpringTimingParameters` (initial velocity):
  https://developer.apple.com/documentation/uikit/uispringtimingparameters
- WWDC notes, *Explore SwiftUI animation* (merge and velocity of springs):
  https://wwdcnotes.com/notes/wwdc23/10156
- Motion docs, layout animations (`layoutScroll`): https://framer.com/docs/layout-animations/
- `motion-dom` 14.6.0 source, `projection/node/create-projection-node.mjs`,
  `HTMLProjectionNode.mjs`; `framer-motion` `VisualElementDragControls.mjs` (read locally from
  the npm packages)
- CSS Scroll Anchoring Module Level 1 (suppression window, timing):
  https://www.w3.org/TR/css-scroll-anchoring-1/
- CSSOM View, `offsetParent`: https://drafts.csswg.org/cssom-view/
- WebKit r252205 (scroll events in the rendering update, before rAF):
  https://trac.webkit.org/r252205
- caniuse `css-overflow-anchor`: https://caniuse.com/css-overflow-anchor
- Nathan Gitter, *fluid-interfaces* (WWDC18 *Designing Fluid Interfaces* reimplementation):
  https://github.com/nathangitter/fluid-interfaces
