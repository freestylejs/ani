# iOS-grade layout — final architecture (B completion and the B–C seam)

**Status:** FINAL PROPOSAL, 2026-10-27. It supersedes the 2026-10-26 draft (`b16f238`) and
awaits the user's decisions in §9. Nothing here is implemented. On approval, it amends
`packages/layout/ARCHITECTURE.md` (the authority) and opens the checkpoint plan of §8.

**Scope.** Goal B ("optional layout core, targeting iOS native grade layout transitions") is
partially achieved. This document designs what remains for B and the one interface B must
open for C (gestures):

1. Layout inside scroll containers and fixed roots (Motion's `layoutScroll` / `layoutRoot`).
2. A physical, velocity-native spring for layout tracks.
3. The external-drive seam: an outside driver (C's drag) holds an element and hands it back
   with a release velocity.

The gesture package itself (C), motion tokens (D) and `GATE_AMENDMENT.md` are out of scope.

## 0. Changes from the draft

Found in the final review against ARCHITECTURE §3–§12; each one fixes the draft or makes it exact.

| # | Draft | Final | Why |
|---|---|---|---|
| 1 | Bounce mapping `ζ = 1 − b` for every `b` | `ζ = 1 − b` for `b ≥ 0`, `ζ = 1/(1 + b)` for `b < 0` (§4.1) | Apple's mapping; the draft gave the wrong damping ratio for every negative bounce |
| 2 | Perceptual timeline = the lead's own step response, clamped | Critically damped step response with the track's `D`, normalised to 1 at `t = D` (§4.1) | With bounce > 0 the step response oscillates around 1, so opacity would flicker. With bounce 0 it never reaches 1, so a crossfade would end only at settle |
| 3 | `J_c` "the linear part of the full map" | `J_c(t)` for drawn boxes and `J_c^rest` for rest boxes; the participant at or above the scroller (§3.2) | A scroller under an animating parent has a gain that changes per frame. A rest box uses the map with poses divided out (§3.1 of the authority) |
| 4 | Fixed roots classified at every flush | Classified only for active nodes whose chain or page offset changed since their plan; memoised on the shared `offsetParent` tree (§3.3-8) | An unscrolled commit pays nothing; the §11 read gate holds as written |
| 5 | Sticky: own or ancestor sticky, detection unstated | Read from the same walk: sticky elements are positioned, so they are on it (§3.3-9) | The draft could not see a non-participant sticky wrapper |
| 6 | The chain walks up to the scrolling element | The chain stops at a fixed root (§3.2) | Scrollers above a fixed element do not move it |
| 7 | Seam: `take` + `onShift`; the driver writes `translate` | `take` → `move(offset)` / `release(v)`; layout keeps writing `translate`/`scale` (§5) | One owner per property (§6 of the authority). The reorder lag is fixed by construction, with no callback, and the size channels keep animating while the element is held |
| 8 | `spring` and `timing`/`duration` "mutually exclusive" | Exclusive inside one object; across merge layers, a later layer's kind replaces the earlier kind (§4.2) | Both packages merge `motion` field by field (`layout/src/motion.ts` `mergeMotion`, `react/src/layout/context.ts` `mergeMotion`). A group spring under a participant `duration` would otherwise throw |
| 9 | WAAPI and reduced motion unstated for the spring | Stated (§4.3, §4.4) | The authority's §9 and §10 need both |
| 10 | — | A fixed element inside a participant is a stated limit with a warning (§3.3-10) | Any non-`none` `translate`/`scale` makes the participant that element's containing block. This is pre-existing and shared with Motion |
| 11 | D3 trade-off not shown | The cost of visual continuity is shown (§3.1) | A decision needs both sides |

---

## 1. What "iOS native grade" means, measurably

Each property is something the oracle can check frame by frame. The right column describes
Ani as of `a4191c6..0c0e11c`.

| # | Property | Source | Ani today |
|---|---|---|---|
| P1 | The first frame after a change shows exactly what the user saw | Ani §3.3-1; Apple: motion starts from the presented value | Holds without scroll. **Fails** when a scroll the user did not see lands between capture and flush (§2.2) |
| P2 | Velocity is continuous on retarget, shared-element handoff and gesture release | WWDC23 *Animate with springs*: a retargeted spring "uses the velocity it had when it was retargeted as the initial velocity towards its new destination" | Retarget and handoff are exact (`c′(0) = v`). Gesture release has no API |
| P3 | Motion follows a damped spring set by perceptual duration and bounce | WWDC23: `stiffness = (2π/duration)²`, `mass = 1`, bounce in [−1, 1]; SwiftUI's default animation is a spring with response 0.55 and damping fraction 1.0 (iOS 17+) | Stateless curves plus a momentum term. Core `timing.spring` is time-rescaled to its settling time and ignores velocity |
| P4 | Interruptible at any frame | Apple fluid-interface guidance | Holds |
| P5 | Works inside scrolling lists, panels and fixed sheets | UIKit scroll views are everywhere | Snaps `'stale'` on any inner scroll between capture and flush. A scroll during a run is not in the next flush's B. Fixed roots are untreated |
| P6 | A released drag settles into its layout slot with the finger's speed | WWDC23: the animation "picks up right where the gesture ends" | No seam. Motion also hands no velocity to layout (§2.1) |
| P7 | Frame-rate independent (60/120 Hz) | ProMotion | Holds: tracks are analytic in time |
| P8 | Reduced motion respected | Accessibility | Holds |

B is complete when P1–P8 hold, each with frame-level evidence in three engines.

## 2. Findings

### 2.1 Motion 14.6 (source read from the `motion-dom` 14.6.0 package)

- **`layoutScroll`** marks a scroll container. `updateScroll('snapshot')` reads its
  `scrollLeft/Top` before the change and `updateScroll('measure')` after it.
  `removeElementScroll` adds each marked ancestor's offset to the measured box. Both boxes
  become scroll-free, so a scroll between them is not motion: **content continuity**.
- **Scroll roots.** A marked container whose computed `position` is `fixed` is a *scroll root*
  (`checkIsScrollRoot`). Boxes under it skip the page scroll.
- **`layoutRoot`** makes its own node jump (`type: false`, `delay: 0`), so its subtree
  animates relative to it.
- **Opt-in.** Both props are opt-in, so an unmarked container still mis-measures.
- **Drag.** During a drag, `projection.isAnimationBlocked = true`. On release the drag runs
  its own `inertia` animation on `x`/`y` (`timeConstant: 750`), separate from the layout
  animation. The release velocity never reaches the layout animation.

### 2.2 Browser scroll semantics, and why content continuity breaks P1

- **Scroll anchoring** applies its correction when the suppression window ends: at the end of
  the event-loop iteration, or before the next operation whose result depends on scroll
  position, such as `getBoundingClientRect()` (CSS Scroll Anchoring 1). For Ani, that is the
  flush's first rect read, so the user never sees the pre-correction offset. Chromium and
  Gecko ship anchoring. WebKit support was reported recently; spike S-B2 verifies it.
- **Scroll events** are dispatched in the update-the-rendering step, before
  `requestAnimationFrame` callbacks (WebKit r252205, matching Chrome and Firefox). A scroll
  whose event fired has been painted (or is painted in that same frame). A scroll made by
  script in the commit task has not fired its event when the flush runs.

**Worked example.** A chat panel. A message above the viewport is deleted, and scroll
anchoring keeps the visible messages still.

- **Before:** a visible message rests at content y = 500 with scrollTop = 300, so it is on
  screen at y = 200.
- **After the commit:** its content y is 400 and anchoring sets scrollTop = 200. It is still
  on screen at 200, and the user expects nothing to move.

The two continuity rules then give:

- **Content continuity** (Motion): the track runs 500 → 400 in content space. Its first frame
  draws at 500 − 200 = 300: a 100 px jump down, then a slide back up.
- **Visual continuity** (proposed): the track runs 200 → 200 on screen, so there is no motion.

**Existing defect.** Ani's page boxes (`rect + page scroll`) give the same content continuity
for the *page* scroller. The example therefore points to an existing P1 defect at document
level whenever anchoring corrects page scroll. Spike S-B2 must reproduce it before any fix is
claimed.

### 2.3 The momentum term against a physical spring

The comparison uses the same initial velocity `v` and the same duration `D`:

- **Ani today:** ease-out plus `k·τ(1 − τ)²` (§5.1 of the authority).
- **Reference:** a critically damped spring with `ω = 2π/D`.

The numbers below were computed in a scratch script.

| Case | Ani momentum term | Spring, bounce 0 | Spring, bounce 0.2 |
|---|---|---|---|
| At target, v = 1500 px/s, D = 0.5 s: peak excursion | 111.1 px | 43.9 px | 50.6 px |
| At target, v = 3000 px/s, D = 0.5 s | 222.2 px | 87.8 px | 101.2 px |
| 200 px short, moving toward the target at 3000 px/s: overshoot | 83.1 px | 0.1 px | — |

The ratio of peak excursions is exactly `(4/27)·2π·e ≈ 2.530` for every `v` and `D`.

- **Where it is exact:** at `τ = 0` (`c′(0) = v`).
- **Where it fails:** afterwards it carries too much momentum. This is invisible for retargets
  between nearby targets and obvious for a flick release (P6).
- **Conclusion:** the term is the right device for timing *curves*, but it is no substitute
  for physics (§12 of the authority already says so).

## 3. Design A — frames and the scroll ledger (replaces `'stale'`)

### 3.1 Principle

> **Seen scroll is camera; unseen scroll is part of the change.**
>
> A scroll the user watched (its scroll event fired before the flush) moved the content, and
> tracks follow the content. A scroll the user never saw (script in the commit task, the
> browser's own anchoring correction) is part of the same transaction. Each participant starts
> from where the user last saw it, which is P1.

This is the UIKit transaction model: cells and `contentOffset` changed in one animation block
move together on screen. Applied at commit level, Ani gets it without animating the scroller
itself.

**The cost of the rule (decision D3).** After an instant, unseen scroll, participants glide
from their seen boxes, while non-participant content jumps by the scroll delta. An accordion
followed by an instant `scrollIntoView` is the example. Every layout change already behaves
this way: only participants animate.

| Case | Visual continuity (proposed) | Content continuity (Motion) |
|---|---|---|
| Delete above the viewport, with anchoring | Nothing moves (correct) | Visible participants jump by the correction, then slide back |
| Instant `scrollIntoView` in the commit | Participants glide through the scroll; other content jumps | Everything jumps by the scroll; participants then animate their own change |
| P1 (first frame = seen) | Always | Only when no unseen scroll happened |

An app that wants the scroll itself to glide uses `behavior: 'smooth'`. That scroll is then
seen, so it counts as camera.

### 3.2 Definitions

| Term | Definition |
|---|---|
| **Frame root** `R(n)` | `viewport` when `n` or an ancestor is fixed to the viewport (no ancestor captures it as a fixed containing block); otherwise `document`. |
| **Root offset** `root(n)` | The page scroll when `R(n) = document`, 0 when `R(n) = viewport`. |
| **Frame box** | `rect + root(n)`: today's page box, generalised. It is identical for document-rooted nodes and is the viewport rect for fixed ones. |
| **Scroll chain** `C(n)` | The inner scroll containers above `n` and below its frame root: the page scroller is excluded (it is `root`), and so is every scroller above a fixed root. `dom.scrollOffsets` already walks them; it gains the stop at a fixed root. |
| **Content gain** | For a scroller `c`, let `π_c` be `c` itself if it participates, otherwise its nearest participant ancestor. `J_c(t)` is the linear part of `π_c`'s full map `M` at time `t`, and `J_c^rest` the linear part of its map with poses divided out (`Ω`, §5.3 of the authority). Both are identity without such a participant. A scroll of `Δ` in `c` moves its content on screen by `−J_c(t)·Δ`. Non-participant ancestors may only translate (§6 of the authority), so both gains are exact and known to the engine. |
| **Ledger** | The offsets of every chain container at three instants: at the plan of each running track (`S_plan`, plus `root_plan`, stored with the track), at the capture (`S_seen`, `root_seen`, refreshed by rule 2) and at the flush (`S_fl`, `root_fl`). Each container is read once per instant, however many nodes share it. |

### 3.3 Rules

1. **Capture** reads the rects as today, plus the offsets of the chains of *all*
   participants, driven ones included. `scrollOffsets(elements)` already includes driven
   elements; only the use of the result changes. Offsets are `scrollLeft/Top` reads, with no
   rect.
2. **Seen refresh.** While a capture is open, one passive capture-phase `scroll` listener per
   document refreshes the capture when a chain container (or the page) fires `scroll`. The
   refresh re-reads that container's offsets and the rects of the undriven participants under
   it.
   - The listener is armed at capture and disarmed at the flush (or `dispose`).
   - A synchronous commit (capture and flush in one task) can see no scroll event in between,
     so it never pays this cost.
   - The cost falls only in a capture held across tasks (a time-sliced render) that the user
     scrolls between chunks.
   - React commits and flushes in one task, so a refresh never reads a half-committed DOM.
3. **B at flush** is computed in the flush's frame space, through the view. `R_t` is the frame
   root a track was planned in and `R_f` the frame root at this flush (rule 8).
   - **Undriven node:** `B = rect_seen + root_fl(n)`.
   - **Driven node:** its seen view box is
     `view_seen = V(t_fl) − Σ_{c∈C(n)} J_c(t_fl)·(S_seen(c) − S_plan(c)) − root_seen(R_t)`,
     and `B = view_seen + root_fl(R_f)`.
     - The middle term is the seen inner scroll since the plan. Only the total `Δ` matters,
       because the layout offset is static and the gain is applied at the flush instant.
     - The last pair turns the unseen page-scroll difference into the visual continuity of
       §3.1. With `R_t = R_f = document` it reduces to `+ (root_fl − root_seen)`.
     - The velocity is carried unchanged. A scroll adds a constant offset, not a rate, and a
       scroll *in progress* is camera, as in UIKit.
4. **A at flush** is the frame box at `S_fl`, as today.
5. **Keep test** (§5.5 of the authority). A running track is kept only when:
   - no unseen delta touched it (`S_fl = S_seen` on `C(n)`, `root_fl = root_seen` and
     `R_f = R_t`);
   - its target is unchanged in the plan's space, within `threshold`:
     `A_new = A_old − Σ_{c∈C(n)} J_c^rest·(S_fl(c) − S_plan(c))`.

   Otherwise it is retargeted from its seen drawn box (rule 3) and carries its velocity. A
   kept track keeps its `S_plan`. The browser applies later scrolls to its layout position,
   so a kept track needs no per-frame read and no rewrite.
6. **Frames are unchanged:** zero reads, and the browser moves content under the track. A pose
   is a translate and scale about an origin attached to the element's box. A scroll of `Δ`
   shifts the box and the origin together, so the drawn box shifts by `−Δ` in the local frame
   and by `−J_c(t)·Δ` on screen, every frame. Spike S-B4 checks this in three engines.
7. **Cross-frame handoff.** A shared `layoutId` handed from a scrolled list to a fixed overlay
   goes through view space: the follower's seen view box (rule 3) plus the lead's root offset.
   Crossfade spaces (§5.6 of the authority) are unchanged otherwise.
8. **Fixed-root classification** happens in the flush read phase, before any write. It is
   done only for active nodes whose ledger shows a change since their plan or the capture
   (any `S` or `root` difference). Otherwise no classification is needed, because a constant
   root offset cancels in every formula above.
   - **Method.** It walks the `offsetParent` chain, memoised per element per flush, so
     siblings share work and the cost is the number of distinct positioned ancestors.
   - **Spec basis.** CSSOM View: `offsetParent` is null for a fixed element "and no ancestor
     establishes a fixed position containing block". An element (not `body` or `html`, with a
     box) whose `offsetParent` is null is a viewport-fixed root. A transformed or contained
     ancestor that captures its fixed descendants yields a non-null chain, which is correct.
   - **Stored frame root.** Each track stores `R_t`, the frame root classified at its plan or,
     if none was needed then, at the first later flush that needs it.
   - **Gate.** S-B1 must prove the walk in three engines. Its fallback is a cached
     computed-`position` walk.
9. **Sticky.** The same walk visits every sticky ancestor, since a sticky element is
   positioned and so lies on the chain. For a node that rule 8 classifies, the walk reads one
   computed `position` per distinct positioned element. A node whose chain or root scrolled
   during its run, with a sticky element at or above it below the scroller, snaps `'stale'`.
   A sticky offset is not linear in the scroll. This is the only remaining use of `'stale'`,
   and the `SnapReason`/status unions keep it.
10. **A fixed element inside a participant.** Any non-`none` `translate`/`scale` makes the
    participant the fixed containing block of its fixed descendants (CSS Transforms 2). While
    a participant is posed, a viewport-fixed descendant is therefore re-contained and moves
    with it. This is pre-existing and shared with Motion (`transform`), and no engine can avoid
    it while writing transforms.
    - A development warning fires once per scope when a participant whose computed `position`
      is `fixed` (read with the other computed values of active nodes) has a moving
      participant ancestor.
    - The fix is a portal.

### 3.4 Public API

**None added.** Every container is a chain member automatically, and fixed roots are
detected.

- **Against Motion.** Motion needs `layoutScroll` / `layoutRoot` on every container. Ani needs
  neither, and an unmarked container can no longer mis-measure.
- **No escape hatch now.** A `scroll: 'content'` option (Motion's semantics) is **not**
  proposed. It is a small addition later if a real case needs it (D3).

### 3.5 Cost-gate amendment

- **Unscrolled commit:** the flush read set is unchanged, `2N` rects plus one computed style
  per active node.
- **Scrolled commit:** a commit whose ledger shows a change adds the memoised walk of rule 8,
  plus rule 9's `position` reads for the nodes it classifies.
- **Capture:** it gains offset reads for the chains of driven participants, one per distinct
  container.

The invariant "steady frames read zero" is restated: "animation frames read zero; a `scroll`
event during an open capture re-reads the capture under the scrolled container; a held drive
reads its chain's offsets in `scroll` events (§5.1)". Commit reads at 1,000 participants
≤ 4 ms and steady frame p95 ≤ 2 ms are unchanged and re-measured, both unscrolled and
scrolled.

### 3.6 Clipping (accepted, with a later option)

A shared element that flies from a fixed overlay back into a clipped scroller is clipped by
the scroller while it is outside the scroller's box. The asymmetric crossfade (§5.6 of the
authority) hides most of this, because the unclipped follower stays opaque until `p = 0.5`.

A *clip-aware crossfade* is a candidate follow-up, not part of this proposal (D4). It would
hold `out(p)` until the lead's drawn box is inside its clip rect, read once per flush from the
chain. UIKit avoids the problem with a transition container. The web equivalent is a View
Transition (`shareElement`), which stays available.

## 4. Design B — the physical spring

### 4.1 Model

A new motion kind, in closed form per channel (the origin point x/y, the size w/h, and the
anchor offset). It uses:

- displacement `x₀ = B − A` and incoming velocity `v₀`;
- perceptual duration `D` and natural frequency `ω₀ = 2π/D`;
- bounce `b ∈ (−1, 1)` and damping ratio `ζ = 1 − b` for `b ≥ 0`, `ζ = 1/(1 + b)` for `b < 0`.

```
ζ = 1:  x(t) = A + (x₀ + (v₀ + ω₀x₀)·t)·e^(−ω₀t)
ζ < 1:  x(t) = A + e^(−ζω₀t)·(x₀·cos ω_d t + ((v₀ + ζω₀x₀)/ω_d)·sin ω_d t),  ω_d = ω₀√(1 − ζ²)
ζ > 1:  x(t) = A + c₁e^(r₁t) + c₂e^(r₂t),  r₁,₂ = −ω₀(ζ ∓ √(ζ² − 1)),
        c₁ = (v₀ − r₂x₀)/(r₁ − r₂),  c₂ = x₀ − c₁
```

- **Stateless:** it can be evaluated at any `t`, so seek and sampling are exact. This meets
  §5.1's statelessness requirement without the momentum term.
- **Exact velocity:** `x′(0) = v₀` on every channel. Retargeting from the drawn `(x, v)` with
  the same parameters equals the superposition of the old and new responses, which is the
  additive model of UIKit and SwiftUI.
- **Settle:** `T_s` is the first time after which the closed-form envelope bounds hold for
  every channel: position within ε = 0.1 visual px of A and speed under 1 px/s. Each bound is
  monotone after its maximum, and that maximum is in closed form, so `T_s` is found by
  bisection once, at plan, in pure code.
  - Ending at `T_s` is the identity pose with an invisible jump below ε.
  - The run's report resolves at settle.
  - Example: a 300 px move at D = 0.55, bounce 0 settles at 0.914 s (1.66 D).
- **Perceptual timeline:**
  `p(t) = min(1, s(t)/s(D))` with `s(t) = 1 − (1 + ω₀t)·e^(−ω₀t)` and `s(D) ≈ 0.98640`,
  with `t` measured from the lead track's start (after its delay).
  - It is monotone, exactly 1 at `t = D`, and independent of bounce.
  - It replaces `p = clamp(e(τ), 0, 1)` for spring leads in the crossfade opacities (§5.6 of
    the authority), the radius blend (§5.7 of the authority) and presence's release hold. All
    three therefore end at the perceptual duration, as in SwiftUI, and do not wait for settle.
  - Curve leads keep `p = clamp(e(τ), 0, 1)`.
- **Unchanged rules:** the size floor, and the delay rule (only nodes at rest wait).

### 4.2 API

```ts
interface LayoutMotion {
  readonly duration?: number          // seconds (curves)
  readonly delay?: number
  readonly timing?: TimingFunction    // stateless curve; velocity via the momentum term
  readonly spring?: { readonly duration: number; readonly bounce?: number }  // physical; bounce default 0
}
```

- **Exclusivity.** In one object, `spring` together with `timing` or `duration` throws
  `ANI_INVALID_OPTIONS`. So does `spring.duration ≤ 0` or a bounce outside (−1, 1).
- **Merging.** Across merge layers (group, nested group, participant), a layer that names
  `spring` replaces the curve fields of earlier layers. A layer that names `timing` or
  `duration` replaces an earlier `spring`. `delay` merges independently.
- **Comparison.** Specs are compared by value in the keep test (§5.5 of the authority), like a
  timing's parameters.
- **Unchanged.** Curves keep today's exact behaviour.
- **Default:** decision D1.

### 4.3 WAAPI engine

The WAAPI engine starts every track at rest (§10 of the authority), so a spring track there
has `v₀ = 0`. It is realized like a curve:

- the animation lasts `T_s`;
- its easing is the normalised step response `1 − x(t)/x₀`, sampled into `linear()` with the
  same 0.05 px stop rule;
- `linear()` outputs may exceed 1, which carries the overshoot of a bouncy spring.

Gate W1 (RAF vs WAAPI ≤ 0.5 px per frame) extends to spring tracks at `v₀ = 0`.

### 4.4 Reduced motion

`{ maxDuration }` scales a spring's `D` and its delay by one factor, found by bisection in
`motion.ts`, until `delay + T_s ≤ maxDuration`. `'jump'` and `'ignore'` are unchanged.

### 4.5 Placement

Both layout and the gesture package need the closed forms:

- the spring;
- the exponential decay C needs for momentum projection, `v·r/(1 − r)` with UIKit's
  `decelerationRate` 0.998 per ms.

C must not depend on layout, so they belong in **core**, as a new pure module `physics`:
`spring({ duration, bounce }).at(t, x₀, v₀) → { x, v }`, `settleTime`, `perceptual(t)` and
`decay`. It is distinct from `timing.spring`, which stays a timing curve.

This is additive to core's public API, but it lifts the layout project's "core frozen"
constraint (decision D2). The fallback is to keep it inside layout and duplicate it in C.

## 5. Design C — the external-drive seam (B–C)

### 5.1 Semantics

```ts
// core: types only, so the gesture package depends on core, not on layout
interface Vec2 { readonly x: number; readonly y: number }
interface DriveHandle {
  readonly velocity: Vec2           // drawn velocity of the origin point at take (px/s, view; 0 at rest)
  readonly active: boolean          // false after release, removal, exit or dispose
  move(offset: Vec2): void          // drawn origin point = take point + offset (view px)
  release(velocity?: Vec2): void    // give the element back with this incoming velocity (default 0)
}
interface ExternalDrive {
  take(element: HTMLElement): DriveHandle
}
// layout: the LayoutGroup implements ExternalDrive ('raf' engine)
```

- **`take`.** It is valid on a registered participant of this group, under `'raf'`. Taking an
  unregistered or already-held element, or taking under `'waapi'`, throws
  `ANI_INVALID_OPTIONS`.
  - At take, the node's origin-point channels freeze at their drawn value. Their analytic
    velocity is returned, so a drag can catch a moving card (Apple: grab at any instant)
    without a jump.
  - The size channels keep their track: a card can finish shrinking under the finger.
- **While held.** Layout stays the only writer of `translate`/`scale` (§6 of the authority).
  Each frame it draws the origin point at `take point + offset` in view space, solved through
  the parents' maps like any drawn box. This costs no read and needs no driver-written style.
  - **Reorder.** A flush that moves the held node's slot (a reorder under the finger) changes
    only its A; the drawn box stays at the pointer. The showcase's lagging row cannot occur,
    and no callback is needed.
  - **Scroll.** A seen scroll of the held node's chain or root would carry it with the
    content. One passive `scroll` listener reads that chain's offsets (no rect) and adds the
    shift to the held point, so the element stays under the pointer. This is a read in an
    event, not in a frame.
  - **Children.** Participant children stay in layout and are solved under the held map, as
    under any animating parent.
- **`release(v)`.** The next frame starts the node's origin-point track from its drawn box
  toward its current A, with incoming velocity `v`. It continues the time of the last painted
  frame, as a moving node does (§4.3 of the authority). The track uses the node's effective
  motion:
  - with the spring (§4), the landing is physically correct;
  - with a curve, the momentum term carries `v` (§2.3 applies);
  - releasing without a layout change springs back to the slot, so a snap-back needs no
    animation code in C.
- **End of a hold.** Removal, a presence exit, `finish`, `dispose`, or a reduced-motion
  `'jump'` ends the hold: the handle becomes inactive, and the node follows the rule of that
  event.

### 5.2 React

`useLayoutDrive()` returns the scope's `ExternalDrive`. C's React hook accepts it as an
option, so the glue is one line in the app or in C's adapter.

### 5.3 Why not Motion's model

Motion blocks projection during the drag and afterwards animates `x`/`y` with its own inertia.
The layout animation and the momentum animation are two systems. In Ani, layout owns the
element throughout and one track carries the release velocity into the layout slot. This
gives P6 by construction and keeps one owner per property.

## 6. Module changes

| Module | Change |
|---|---|
| `dom.ts` | Chain offsets (driven included) with the fixed-root stop; the memoised `offsetParent` walk and its `position` reads |
| `scope.ts` | Ledger; the seen-refresh listener during open captures; keep-test rebasing; `take`/`move`/`release` and the held-scroll listener |
| `plan.ts` | Unseen-delta and moved tests per §3.3-5; cross-frame handoff; release seeds |
| `solve.ts` | Spring channel kind; perceptual timeline; held origin channels |
| `motion.ts` | `spring` validation, exclusivity and kind-level merge; settle and reduced-motion bisection |
| `realize/waapi.ts` | Spring step response sampled to `linear()` |
| core `physics` (D2) | Closed-form spring, settle bound, perceptual timeline, decay; pure |
| core types | `Vec2`, `DriveHandle`, `ExternalDrive` |
| `react/layout` | `useLayoutDrive`; `mergeMotion` kind-level rule |

The pure modules stay DOM- and clock-free, and only `dom.ts` reads.

## 7. Verification plan

### 7.1 Spikes (hard gates before production code, as in CP2)

| Spike | Must show (Chromium, Firefox, WebKit) |
|---|---|
| S-B1 fixed roots | The `offsetParent` walk classifies `R` correctly for: fixed; fixed in a transformed ancestor; `contain: layout`/`paint`; `filter`; `will-change: transform`; top layer; `display: contents` parents; sticky wrappers. Also: a posed participant re-contains a fixed descendant (confirms §3.3-10) |
| S-B2 anchoring | Reproduce §2.2 on the current engine: a page-level and an inner-scroller anchoring correction, measured on the first frame, with the jump size. Confirm the correction is applied before the flush's first rect read, and that layout's `translate`/`scale` writes neither suppress nor alter anchoring (WebKit included) |
| S-B3 seen scroll | A React 18/19 transition, time-sliced and scrolled between chunks: the scroll event fires before the commit, and the refreshed capture equals the painted frame within 0.5 px |
| S-B4 scroll during a run | A user scroll mid-run, inner and page, nested under a scaling parent: drawn boxes equal `V − J_c(t)·Δ` every frame, and the next flush's B equals the painted box |

### 7.2 Oracle and acceptance rows

The oracle gains an independent closed-form spring, the perceptual timeline and the ledger
arithmetic, sharing no code with the solver or core `physics`. Every row passes in three
engines, at every frame:

| Row | Assertion |
|---|---|
| L-SCROLL-1 chat delete under anchoring (page and panel) | No visible message moves more than 0.5 px at any frame |
| L-SCROLL-2 kanban card moved, column auto-scrolls in the layout effect | Card and column members start at their seen boxes (P1) and land on A |
| L-SCROLL-3 accordion plus instant `scrollIntoView` | Participants start at their seen boxes; non-participants follow the scroll; settle exact |
| L-SCROLL-4 user scroll mid-run, then a commit | Tracks follow the content; the next flush continues velocity with no jump |
| L-SCROLL-5 list item to fixed detail and back (E4 in a scroller) | Shared handoff across frame roots; coverage 1 at every frame |
| L-SCROLL-6 sticky participant scrolled mid-run | Snaps `'stale'` at the next flush, with the reason reported |
| L-ROOT-1 fixed sheet with nested participants while the page scrolls | No motion from the page scroll; inner layout animates |
| L-SPRING-1 spring channels | `c(0) = B`, `c′(0) = v`, settle within ε, against the oracle for b ∈ {−0.3, 0, 0.2, 0.4}, at 60 and 120 Hz frame steps |
| L-SPRING-2 crossfade and radius on a spring lead | Coverage 1 at every frame; fade and blend end at `t = D`; presence releases at `D` |
| L-SPRING-3 WAAPI spring | RAF vs WAAPI ≤ 0.5 px per frame at `v₀ = 0` |
| L-DRIVE-1 take, move, reorder, release | Pointer-relative offset constant under reorder (≤ 0.5 px); release `c′(0) = v` exactly; snap-back with no layout change |
| L-DRIVE-2 catch a moving card | `take` returns the analytic velocity; no jump at take; size keeps its track |
| L-DRIVE-3 scroll while held (inner and page) | The held element stays under the pointer within 0.5 px |

Every existing row and cost gate stays green. Sensitivity is mandatory: each new row must fail
on the current engine for the defect it targets.

### 7.3 Fixtures and the default

If D1 is approved, every existing row and Motion-parity example that relies on the default
motion has its motion pinned explicitly first. The rows then keep their meaning, and the
default change is one line with its own row.

## 8. Checkpoints

Same loop as the cleanup: Task Agent → Valid Agent → orchestrator judgment, retry on FAIL.

| CP | Content | Gate | Depends on |
|---|---|---|---|
| B1 | Spikes S-B1 to S-B4 | All stop conditions. A failed spike applies its fallback and re-runs | — |
| B2 | Ledger, frames, fixed roots, sticky (§3); L-SCROLL and L-ROOT rows | Rows ×3 engines; cost gates (unscrolled exact, scrolled measured) | B1 |
| B3 | Core `physics` plus spring tracks, WAAPI and reduced motion (§4); L-SPRING rows | Property tests within 1e-9 against the oracle; rows ×3 | — (parallel to B1/B2) |
| B4 | External drive (§5); L-DRIVE rows | Rows ×3; React adapter tests | B2, B3 |
| B5 | ARCHITECTURE amendment, docs, showcase rows (chat, kanban, sheet), D1 default | Full gate on a fresh clone | B2–B4 |

## 9. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | Default `motion` | `spring: { duration: 0.55, bounce: 0 }`, SwiftUI's documented default since iOS 17. It reaches 91 % at 0.35 s (today's default ends at 0.35 s) and settles a 300 px move at 0.91 s. It changes the unreleased 0.2.0 default; curves stay available (§7.3). |
| D2 | Physics in core (additive public API) or inside layout | Core: C needs the same closed forms without importing layout. |
| D3 | Unseen scroll as part of the change (visual continuity) or Motion's content continuity | Visual continuity (§3.1): it is the only rule consistent with P1 and §3.3-1 of the authority. Its cost is shown in §3.1. |
| D4 | Clip-aware crossfade | Defer (§3.6). |

## 10. Risks

- **iOS Safari elastic overscroll** is visual only and is not reflected in `scrollTop`. A
  capture taken mid-rubber-band records the clamped offset, so it is off by the overscroll
  until the overscroll relaxes. Accepted; S-B4 covers it on WebKit as far as headless allows.
- **Compositor scroll ahead of the main thread.** During a fast user scroll, the compositor can
  paint offsets the main thread has not seen yet. The capture is then up to one frame of
  scroll behind the screen, as in every main-thread layout engine. Accepted.
- **The seen-refresh and held-scroll listeners** are the only event-driven reads. They exist
  only while a capture is open across tasks, or while an element is held.
- **`offsetParent` edge cases** (top layer, shadow trees) depend on S-B1. The fallback is a
  cached computed-`position` walk.
- **A fixed element inside a participant** is re-contained by the pose (§3.3-10). This is
  pre-existing and warned.
- **Spring runs** last until settle, longer than a curve's D (1.66 D for 300 px at bounce 0).
  Perceived completion (crossfade, radius blend, presence release) uses `p(t)` and ends at D.

## 11. Sources

- Apple, WWDC23 *Animate with springs* (duration/bounce mapping, retargeting velocity,
  perceptual vs settling duration): https://developer.apple.com/videos/play/wwdc2023/10158/
- Apple, SwiftUI `Animation.default` (spring, response 0.55, damping fraction 1.0, iOS 17+):
  https://developer.apple.com/documentation/swiftui/animation/default
- Apple, `UISpringTimingParameters` (initial velocity):
  https://developer.apple.com/documentation/uikit/uispringtimingparameters
- WWDC notes, *Animate with springs* and *Explore SwiftUI animation* (merge and velocity of
  springs): https://wwdcnotes.com/notes/wwdc23/10158, https://wwdcnotes.com/notes/wwdc23/10156
- WWDC14 notes, *Building Interruptible and Responsive Interactions*:
  https://wwdcnotes.com/notes/wwdc14/236
- Motion docs, layout animations (`layoutScroll`): https://framer.com/docs/layout-animations/
- `motion-dom` 14.6.0 source, `projection/node/create-projection-node.mjs`,
  `HTMLProjectionNode.mjs`; `framer-motion` `VisualElementDragControls.mjs` (read locally from
  the npm packages)
- CSS Scroll Anchoring Module Level 1 (suppression window, timing):
  https://www.w3.org/TR/css-scroll-anchoring-1/
- MDN, scroll anchoring guide:
  https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-anchor/Guide_to_scroll_anchoring
- CSSOM View, `offsetParent`: https://drafts.csswg.org/cssom-view/
- CSS Transforms 2, individual transform properties and containing blocks:
  https://drafts.csswg.org/css-transforms-2/
- WebKit r252205 (scroll events in the rendering update, before rAF):
  https://trac.webkit.org/r252205
- caniuse `css-overflow-anchor`: https://caniuse.com/css-overflow-anchor
- Nathan Gitter, *fluid-interfaces* (WWDC18 *Designing Fluid Interfaces* reimplementation):
  https://github.com/nathangitter/fluid-interfaces
