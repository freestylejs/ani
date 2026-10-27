# iOS-grade layout — production architecture v2 (B completion and the B–C seam)

**Status:** v3 PROPOSAL, 2026-10-27. Supersedes v1 (`655432b`), which the owner judged "not
production grade", and v2 (`5d1fb18`). v3 is the result of a three-reviewer design review (R1
platform and math, R2 API and frameworks, R3 robustness and operations): 35 round-1 findings, a
cross-examination round, and a round-3 sign-off of v2 whose remaining blockers v3 closes (§0). All three
reviewers signed off after a fourth round (round-4 fixes in `1d57bad`). It awaits the owner's
decisions of §13.
Nothing here is implemented. On approval it amends `packages/layout/ARCHITECTURE.md` (the
authority) and opens the checkpoints of §12.

**Bar.** The first release that contains this work must be installable in a production app on day
one. Concretely: every path either produces the specified frame or a defined, reported safe
outcome (§6); every platform claim has an oracle that can prove it, including on real devices
(§11); every public surface is typed, validated, versioned and operable (§9, §7).

**Scope.** Goal B ("optional layout core, targeting iOS native grade layout transitions"):

1. Layout that is correct inside scroll containers, fixed and sticky elements, and under
   browser-driven layout changes.
2. A physical, velocity-native spring.
3. The external-drive seam for the gesture package (C).

C itself, motion tokens (D) and `GATE_AMENDMENT.md` are out of scope.

## 0. What changed from v1, and why

| # | v1 | v2 | Found by |
|---|---|---|---|
| 1 | A scroll ledger moved the engine's *predicted* drawn box across scrolls and frame roots, with lazy fixed-root classification | **Measured presentation** (§3): B is measured by a capture read in the flush's own rendering interval; the engine's model supplies only velocity. A capture that crossed a frame is aged and degrades (§3.3). No ledger, no frame-root classification | R1-03, R3-02, R3-03, R3-06 led to the redesign. Round 2 (all three) found a time-coherence flaw; v2's in-frame refresh fixed it, but round 3 (R1, R3) showed later rAF/observer callbacks defeat it, so v3 ages instead |
| 2 | `'stale'` snap kept for sticky | Sticky is browser positioning under the pose and is correct without snapping (§3.6) | R3-07 withdrawn in round 2 by all three |
| 3 | No failure policy except for one spike | A normative degradation table, a transactional flush, isolated callbacks, statuses `'failed'` and `'disabled'` (§6) | R3-01, R3-04, R2-06, R2-07 |
| 4 | No operations story | `layoutRuntime` kill switch and a versioned diagnostics stream (§7) | R3-14 |
| 5 | Spring as the new default | Spring ships **opt-in**; the 0.35 s ease-out default stays (§4, D1) | R2-08, R3 cut list |
| 6 | `spring` field beside `timing`/`duration`, kind replaced by layer | Discriminated `type: 'timing' \| 'spring'`, kind inherited across layers, `duration` never switches kind (§4.2) | R2-04 |
| 7 | WAAPI spring via `linear()` | `engine: 'waapi'` rejects springs at validation (§4.4) | R1-07 (the 1000-stop cap breaks the error bound: 4.2 px at bounce 0.95 over 1000 px) |
| 8 | Reduced-motion bisection | Deterministic finite search; bounce clamped to ≤ 0 under `maxDuration` (§4.5) | R1-08 (counterexample: the settle time is not monotone in the scale factor) |
| 9 | Drive types in core; `take`/`move`/`release` only | Types live in layout; C declares a structural port; full state machine with `cancel()`; held phase immune to reduced motion; one rect read per held element per frame (§5) | R2-01, R2-02, R2-03, R3-09, R1-06 |
| 10 | Implicit single-document assumption | Document-affine scopes; flat-tree ancestry (shadow DOM) (§3.8) | R1-04, R1-05, R3-08 |
| 11 | Recycled DOM nodes unaddressed | `layoutKey` (§3.9) | R2-02 round 2, R3-15 |
| 12 | Three desktop engines | Two tiers: per-PR deterministic oracle in three engines, plus a release device gate on real iOS and Android (§11) | R1-09, R3-12 |
| 13 | Spikes as gates, fallbacks mostly undefined | Every spike has a predeclared fallback that ships (§12) | R2-06 |
| 14 | — | Accessibility contract (§8); support matrix (§1.2); B0 design freeze (§12) | R2-09, R2-10, R3-16 |
| 15 | Settle example 0.914 s | 0.918 s (1.67 D) | R1-10 |
| 16 | v2: bounding-box size check as the unsupported-geometry proof | Layout-size (`offsetWidth/Height`) vs rect check in production; ancestors are a dev-checked precondition; box-preserving rotations documented (§3.4) | R1, R3 round 3 |
| 17 | v2: `useLayoutDrive()` inside a group returns that group | Always a dispatcher that routes `take` to the scope owning the element (§5.5) | R2 round 3 |
| 18 | v2: every `duration > 0` | Timing keeps `duration ≥ 0` (existing jump); only springs need `> 0` (§4.2) | R2 round 3 |
| 19 | v2: a core clock post-commit read phase | Not needed; core gains only `physics` (§9) | follows from 1 |

Review record: `reports/R{1,2,3}_round{1,2}.md` and the orchestrator memo, in the review workspace
(`ani-fx-brief/B_design/`).

---

## 1. Requirements

### 1.1 Properties

| # | Property | Ani before this work |
|---|---|---|
| P1 | **The first frame after a change equals the last presented scene, modulo camera motion presented no later than that frame.** A scroll, pinch or visual-viewport pan presented in the same frame moves participants and their surroundings by the same amount. It holds for every flush whose capture was read in the flush's rendering interval; any other flush degrades as reported (§3.3, §3.5) | Holds without scroll; fails when a scroll lands between capture and flush (snaps `'stale'`), and for browser layout changes between flushes |
| P2 | Velocity is continuous on retarget, handoff and gesture release | Retarget and handoff exact; no release seam |
| P3 | Physical spring set by perceptual duration and bounce (Apple's model) | Curves plus a momentum term |
| P4 | Interruptible at any frame | Holds |
| P5 | Correct in scroll containers, fixed sheets, sticky headers, and under browser-driven layout change | Snaps on inner scroll; unmodelled otherwise |
| P6 | A released drag settles into its slot with the finger's speed | No seam |
| P7 | Frame-rate independent (60/120 Hz) | Holds |
| P8 | Reduced motion respected; direct manipulation stays direct | Automatic motion only |

### 1.2 Support matrix (v1 of this work)

| Area | Exact | Defined degradation | Not supported (documented) |
|---|---|---|---|
| Packages | `@freestylejs/ani-layout` (vanilla), `@freestylejs/ani-react/layout` (React 18.3, 19) | — | Vue, Solid, Svelte layout bindings (deferred; not advertised) |
| Engines | Chromium, Gecko, WebKit (desktop and mobile) | — | — |
| Scroll | Page and nested inner scrollers, scroll anchoring, smooth scroll, scroll snap, momentum, rubber-band, sticky | Shared handoff out of an actively scrolling chain → presence enter (§3.7) | — |
| Roots | Fixed, top layer (dialog, popover), transformed containing blocks | — | A viewport-fixed descendant *inside* a posed participant is re-contained by the pose (CSS Transforms 2); dev warning, fix is a portal (§3.8) |
| Viewport | Pinch zoom, visual-viewport pan, dynamic toolbars, on-screen keyboard (uniform camera or measured) | — | — |
| DOM | Shadow DOM (open and closed), `display: contents` parents | — | Cross-document scopes and handoffs; iframes (§3.8) |
| Geometry | 2D translate and scale poses; author translate on non-participant ancestors | Rotation, skew, 3D, CSS `zoom` changes on participants or between participants → `'unsupported'` snap | — |
| Reuse | Keyed React lists; vanilla remove+add | `layoutKey` change → fresh baseline | Recycling a node without remove+add or `layoutKey` |
| Engine option | `'raf'` (all features) | — | `'waapi'` with springs, drives, nesting (rejected at validation) |

## 2. Platform findings that shape the design

- **Rendering order.** HTML's *update the rendering* runs scroll steps (scroll events) before
  `requestAnimationFrame` callbacks, and presents afterwards. A scroll whose event fired is
  presented no later than the frame the engine is about to produce. This is P1's camera rule.
- **Scroll anchoring** applies its correction when the suppression window ends, or before an
  operation that depends on scroll position, such as `getBoundingClientRect()` (CSS Scroll
  Anchoring 1). For Ani, that is the flush's first rect read, so the user never sees the
  pre-correction offset. Spike S2 confirms this for each engine.
- **Measured boxes.** `getBoundingClientRect()` of a participant includes its own inline
  `translate`/`scale`, every ancestor transform, sticky offsets, and every browser-driven layout
  change. It reflects the main thread's state, which during asynchronous (compositor) scrolling
  can be up to one frame behind the screen. That lag is uniform for everything inside the
  scrolled layer, so it matters only when content leaves that layer (§3.7, §5.4).
- **Visual viewport.** Pinch zoom and visual-viewport panning transform the whole layout viewport.
  Rects, scroll offsets and the engine's transforms are layout-viewport coordinates, so the
  visual viewport is a uniform camera. Dynamic toolbars and the on-screen keyboard can move fixed
  elements: those are browser layout changes, which measurement captures.
- **`scrollend`** is baseline across engines (WebKit since Safari 26.2). The design uses it only
  to clear an "actively scrolling" state (§3.7).
- **Motion 14.6** needs `layoutScroll`/`layoutRoot` markers and keeps content continuity; a drag
  release never reaches its layout animation. **Apple:** a retargeted spring keeps its velocity;
  perceptual duration and settling duration are distinct; user-facing state should not wait for
  settle (WWDC23 *Animate with springs*).
- **Momentum term vs spring** (unchanged from v1): for the same release velocity the momentum
  term's peak excursion is exactly `(4/27)·2π·e ≈ 2.53` times a critically damped spring's. That
  is fine for retargets between nearby targets and wrong for a flick (P6).

## 3. Design A — measured presentation (replaces `'stale'` and page boxes)

### 3.1 Principle

> **B is what was presented. It is measured, never predicted. The engine's model supplies only
> what cannot be measured: velocity.**
>
> A scroll or browser layout change that was presented is in the measurement, and is camera. A
> change made in the commit's own task (script scroll, the anchoring correction, the mutation)
> was never presented, so it is part of the change, and each participant starts where it was
> last seen (decision D3, visual continuity).

This is UIKit's transaction model applied at commit level. It needs no scroll-container markers,
no frame-root classification and no model of sticky, toolbars or third-party layout changes.

**Cost of D3** (unchanged from v1, still accepted by all three reviewers): after an instant,
unpresented scroll in the commit (an accordion followed by an instant `scrollIntoView`),
participants glide from where they were seen while non-participant content jumps by the scroll.
That is how every layout change already behaves: only participants animate. An app that wants
the scroll to glide uses `behavior: 'smooth'`, which is presented, and therefore camera.

### 3.2 Coordinates

Every flush plans in **its own view space**: viewport (layout-viewport) coordinates at the flush
instant. B and A are both taken in it, so no root offset enters a plan. This replaces the
authority's page boxes (`rect + page scroll`), whose content continuity for the page scroller is
the existing P1 defect under page-level anchoring (v1 §2.2; spike S2 reproduces it).

Between flushes nothing is converted: a pose is a translate and scale relative to the element's
own layout box, so whatever moves the box (scroll, sticky, a toolbar, an image loading above)
moves the drawn box with it, exactly as it moves every non-participant. Frames stay zero-read.

### 3.3 Capture and its rendering interval

A **rendering interval** is the time between two rendering opportunities (two presented frames).
Nothing the engine reads inside one interval can differ from the presented scene except through
changes made in that interval's own tasks, which the user has not seen either.

1. **`capture()` reads every connected participant**, driven ones included:
   - one `getBoundingClientRect` and one `offsetWidth`/`offsetHeight` pair each (the support
     check of §3.4);
   - for nodes with a presence layer or a shared radius, the computed values the authority
     already reads (§4.1 and §5.7 of the authority).

   The rect reads stay ≤ N per batch, so the authority's 2N-per-commit rect gate is unchanged. It
   is reached more often during runs, and the gate is re-measured with the added offset reads
   (§11.4).
2. **Time.** A capture is read in a task, after the last frame's writes. It reflects the state
   presented at that frame, time `t_k`, and the engine's analytic state is evaluated at the same
   `t_k`.
3. **Aging.** Opening a capture subscribes a one-shot **frame marker** to the scope's clock: no
   reads, no writes, independent of whether any track runs. If the marker fires before the flush,
   a rendering opportunity has passed and the capture is **aged**.
   - A rendering opportunity may have presented changes the capture cannot see: a scroll, a
     layout change, or a mutation by a later animation-frame or observer callback. An aged
     capture therefore never supplies B.
   - The authority's existing re-read rule (`capture()` in a later task reads again) replaces an
     aged capture with a fresh one. In React this happens whenever any participant renders in the
     slice that commits.
   - A flush that consumes an aged capture degrades exactly as a capture-less flush does (§3.5),
     with diagnostic `capture-aged`.
   - **Why no in-frame refresh** (v2 re-measured open captures after each frame's writes): the
     reviewers showed that later `requestAnimationFrame` and `ResizeObserver` callbacks can still
     change the scene before paint. The platform offers no "after all callbacks, before paint"
     hook, so an in-frame read is not proof of what was presented. A verified "quiet window"
     upgrade, which would let an aged capture animate when nothing could have changed, is a
     follow-up and is not in this release.
4. **Who is affected.** A capture is aged only when no participant renders in the task that
   commits:
   - in React, a render longer than one time slice whose last slice renders no participant;
   - in vanilla code, an asynchronous gap between `capture()` and `flush()`.

   Both get the diagnostic, and the docs give the fix (render the group in the committing slice,
   or call `update()`/`capture()` immediately before the mutation). Measured frequency in the
   showcase rows is a gate input (§11.3, S1).
5. **Rendering-callback bound.** A capture must begin in an ordinary task, not inside a
   rendering-update callback (`requestAnimationFrame`, `ResizeObserver`). There, an earlier callback
   of the same frame may already have changed the scene without presenting it, and the frame
   marker cannot fire before a synchronous flush.
   - `capture()`/`update()` called while Ani's own clock is running a frame is aged at once, with
     a dev warning.
   - Third-party callbacks cannot be detected, so calling from them is outside the supported
     contract, and the docs say so.
   - The React adapter never captures from such callbacks.
   - Row L-MEAS-13 covers it.
   - A detectable presentation token is a follow-up.
6. **Invariant.** "Animation frames read zero" holds, except for one rect per held element per
   frame (§5.3).

### 3.4 The measured state, the support check, and the keep test

For a node with a running track, the capture gives its **drawn box** `B` at `t_k`. The scope
recovers the node's **presented layout box** `L_k` top-down: it divides out the engine's own
pose at `t_k` and the presence matrices of that capture, through the parents' maps at the same
instant. This is exact for the supported 2D model, and the solver already recovers poses this way
for undriven nodes. R1 verified 10,000 random nested cases to 1.4e-13.

- **Velocity.** The pose velocity at `t_k` is analytic and exact. The layout box is static between
  frames, so `(B, v)` is the true presented state. Nested parents and children come from one
  capture, so they cannot shear.
- **Support check** (production, every participant, every capture and flush). The layout size
  `offsetWidth × offsetHeight` (untransformed), multiplied by the known scales (the node's own pose
  and its participant ancestors' maps), must equal the rect's size within 1 px plus 0.5 %.
  - A mismatch means a map the engine does not own: a rotation or skew that changes the bounding
    box, 3D, or CSS `zoom`. The node and its participant subtree snap `'unsupported'`, with
    diagnostic `unsupported-geometry`.
  - The flush additionally runs the authority's computed-value classifier on active nodes, as
    today.
- **Bounding-box-preserving author rotations** (180°, or 90° of a square) present at capture and
  removed by the commit are not detected, and need not be. The bounding box *is* the box, so the
  box's motion is exact. The orientation change is the author's own instant change in that
  commit, like a colour or text change, which layout does not animate. This is documented.
- **Non-participant ancestors** must not rotate, skew, apply 3D or change `zoom` (the authority's
  existing precondition: they may only translate). Dev builds check this with a memoised
  computed-style walk at `add` and at the first flush, and warn once. Production does not read
  ancestors.
- **Keep test** (replaces §5.5's comparison with the plan-time A). A running track is kept only
  when its new A equals `L_k` within `threshold`, judged in rest space as the authority does, and
  its track options are unchanged.
  - A presented scroll or layout change moved `L_k` and A together, so the track is kept and
    continues relative to its box.
  - A change in the commit's own task (the mutation, an unpresented scroll) moved A only, so the
    node retargets from `B` with `v` (D3).
- **No thrash.** The test has the authority's semantics: a node retargets only when its target
  moved. R1 and R3 confirmed that the residual-retarget loop of the round-2 proposal is gone.
- **Time.** A flush continues the time of the last painted frame (`t_k`), as the authority does.

### 3.5 Capture-less or aged flush

A flush with no capture, or with an aged capture, has no valid measurement of what was presented:

- an undriven node appears at A, unchanged from today (the React adapter's existing dev warning
  names the fix);
- a driven node keeps its track whatever moved. Its pose stays relative to its layout box, so it
  moves with its layout like any non-participant, and still ends at identity;
- each node that would have moved is reported in `snapped` with reason `'stale'` (no valid
  before-box), with diagnostic `capture-less-flush` or `capture-aged`.

### 3.6 Sticky, fixed and browser-driven change

- **Sticky.** The browser applies the sticky offset to the layout box; the pose layers on top. A
  subtree under a sticky element that engages mid-run moves like any camera and ends at its real
  sticky position. At the next commit the measurement contains the offset. No snap.
- **Fixed, top layer, transformed containing blocks** need no classification: B and A are
  measured in one view space, and frames are relative to the box.
- **Dynamic toolbars, the on-screen keyboard, image and font loads, third-party style changes**
  are presented layout changes, so they are in the next measurement. During a run they move the
  box like a camera.

### 3.7 Shared handoff and retained boxes

- **Handoff** (shared `layoutId`): the lead's B is the follower's measured view box, as today, in
  the flush's view space.
- **Retained boxes** (a removed lead, available for `retain` seconds) are stored in view space, as
  measured, and used as they are: the new lead flies from where the old one was last seen on screen.
- **Actively scrolling source.** The main thread can lag the compositor by up to one frame during
  asynchronous scrolling. Inside one scrolled layer this lag is uniform; it is visible only when an
  element leaves that layer. Rule: a scroll container (or the document) is **active** from its
  first `scroll` event until its `scrollend`. A handoff, or a reparent of a participant, whose
  follower is inside an active container while the lead is outside it, does not fly. The lead
  enters as a presence enter, with diagnostic `handoff-scroll-active`. Time never clears the
  state; only `scrollend` does. Where `scrollend` is unavailable, every such handoff out of a
  container that has scrolled degrades the same way.
  - The listener is one passive capture-phase `scroll` and `scrollend` pair per event root
    (`Document` and each `ShadowRoot` that holds a participant), armed only while the scope has a
    shared participant. Each event records its target, with no reads.
  - On touch devices the tap that starts a handoff normally stops the fling first, so this mostly
    affects programmatic handoffs.

### 3.8 Ancestry, documents, and fixed descendants

- **Flat-tree ancestry.** One primitive (`assignedSlot`, `parentElement`, `ShadowRoot.host`) is
  used for every ancestor walk: the nearest participant, the containment test of §3.7, and the
  dev warning below. Open and closed shadow roots are supported.
- **Document-affine scopes.** A scope binds to the `ownerDocument` of its first participant.
  `add`/`set`/`take` with an element of another document throw `ANI_INVALID_OPTIONS`. An element
  whose `ownerDocument` changes (adoption) has its track ended, styles restored and hold
  invalidated, and must be re-added. There is no cross-document `layoutId` handoff. In React, a
  portal into another document creates or joins that document's implicit scope rather than
  inheriting the outer group's.
- **A fixed descendant inside a posed participant** is re-contained by the pose. Any non-`none`
  `translate`/`scale` establishes a fixed containing block (CSS Transforms 2). This is
  pre-existing and shared with Motion. A dev-only subtree check at `add` (outside production
  reads) warns once per participant, and the fix is a portal.

### 3.9 Semantic identity: `layoutKey`

`LayoutOptions.layoutKey?: unknown`, compared with `Object.is`. When it changes, the node's track
ends, owned styles are restored, any hold is invalidated, and the current layout becomes a fresh
baseline with no interpolation from the previous item. A virtualizer that recycles DOM nodes sets
it to the item id. React lists keyed by item identity remount instead, and need nothing.

### 3.10 Cost

| Batch | Reads |
|---|---|
| Commit (capture + flush) | ≤ 2N rects, 2N `offsetWidth/Height` pairs, and the authority's computed values; gate ≤ 4 ms at 1,000 participants, re-measured |
| Open capture | 0 reads; one frame marker |
| Held element | 1 rect per held element per frame, before writes |
| Steady frame | 0 reads; gate p95 ≤ 2 ms unchanged |
| Events | `scroll`/`scrollend` record targets only, while shared participants exist |

`stats` counts every read, including offset sizes and computed values (R3-05, R3-11).

## 4. Design B — the physical spring (opt-in)

### 4.1 Model (verified by R1)

- Inputs: displacement `x₀ = B − A`, incoming velocity `v₀`, perceptual duration `D`.
- Frequency: `ω₀ = 2π/D`.
- Damping ratio from bounce `b ∈ (−1, 1)`: `ζ = 1 − b` for `b ≥ 0`, `ζ = 1/(1 + b)` for `b < 0`.
  This is Apple's mapping (WWDC23: mass 1, stiffness `(2π/D)²`).

`physics.spring().at()` returns **displacement** `d(t) = x(t) − A`:

```
ζ = 1:  d(t) = (x₀ + (v₀ + ω₀x₀)t)·e^(−ω₀t)
ζ < 1:  d(t) = e^(−ζω₀t)·(x₀ cos ω_d t + ((v₀ + ζω₀x₀)/ω_d) sin ω_d t),  ω_d = ω₀√(1 − ζ²)
ζ > 1:  d(t) = c₁e^(r₁t) + c₂e^(r₂t),  r₁,₂ = −ω₀(ζ ∓ √(ζ² − 1)),  c₁ = (v₀ − r₂x₀)/(r₁ − r₂),  c₂ = x₀ − c₁
```

- **Exact velocity.** It is stateless, and `d′(0) = v₀` on every channel: the origin point, size
  and anchor offset. A retarget from the presented `(B, v)` with the same parameters is the
  superposition model of UIKit and SwiftUI.
- **Settle.** `T_s` is the first time after which position stays within 0.1 visual px of the
  target and speed stays under 1 px/s, from closed-form envelopes, evaluated once at plan. Example:
  300 px, D = 0.55, bounce 0, v₀ = 0 settles at **0.918 s (1.67 D)**. The documentation example is
  an executable test.
- **Settle cap.** If `T_s > 10 s` at plan (bounce near 1 with a long D), the node snaps
  `'unsupported'`, with diagnostic `spring-timeout` and a dev warning naming the parameters.
- **Perceptual timeline.** `p(t) = min(1, s(t)/s(D))`, where `s(t) = 1 − (1 + ω₀t)e^(−ω₀t)` and
  `s(D) ≈ 0.986399`. It is monotone, exactly 1 at `D`, and independent of bounce.
  - It drives the crossfade opacities, the radius blend and presence's release hold for spring
    leads. All three finish at the perceptual duration.
  - Curve leads keep `clamp(e(τ), 0, 1)`.
- **Completion semantics.** `flush()`/`update()` resolve at physical settle, when owned styles are
  restored. That is later than the perceptual end (0.918 s vs 0.55 s in the example). The docs
  state it, and recommend not gating UI on the promise for springs. A perceptual-completion signal
  is a candidate follow-up, not in this release.

### 4.2 API: a discriminated motion type

```ts
export type LayoutMotion =
  | { readonly type?: undefined; readonly duration?: number; readonly delay?: number; readonly timing?: TimingFunction; readonly bounce?: never }
  | { readonly type: 'timing'; readonly duration?: number; readonly delay?: number; readonly timing?: TimingFunction; readonly bounce?: never }
  | { readonly type: 'spring'; readonly duration?: number; readonly delay?: number; readonly bounce?: number; readonly timing?: never }
```

- **Merge across layers** (group, nested group, participant):
  - `type` absent and `timing` absent inherits the current kind;
  - `duration` never switches the kind (a child's `duration: 0.3` under a group spring makes a
    0.3 s spring);
  - `timing` or `type: 'timing'` selects timing;
  - `type: 'spring'` selects spring;
  - `delay` merges on its own.

  The root default is timing: ease-out, 0.35 s. A spring with no `duration` after the merge takes
  0.55 s, and `bounce` defaults to 0.
- **Validation** is synchronous, throws `ANI_INVALID_OPTIONS`, and runs before any state changes.
  It is kind-specific after merge:
  - timing: finite `duration ≥ 0` (`0` keeps today's synchronous jump);
  - spring: finite `duration > 0`;
  - both: finite `delay ≥ 0`;
  - `bounce`: finite and strictly inside (−1, 1), and never on timing.
  It runs in both packages, whose field-by-field `mergeMotion` functions are replaced by this
  kind-level rule.
- **Comparison** in the keep test: by effective value, after merge.
- Docs state the semantic difference from Motion: Motion's duration-based spring ignores gesture
  velocity, while Ani's physical spring carries it.

### 4.3 Placement

The closed forms, `settleTime`, `perceptual` and the decay projection C needs
(`v·r/(1 − r)`, UIKit `decelerationRate` 0.998 per ms) go into a new pure numeric module
`physics` in core (D2). Core gains no DOM or layout types. `timing.spring` stays a timing curve.

### 4.4 WAAPI

`engine: 'waapi'` with an effective spring motion throws `ANI_INVALID_OPTIONS`, at `add`/`set` and
when the group's own `motion` is a spring. This follows the WAAPI engine's existing rule ("never
falls back silently"). An error-bounded adaptive sampler is a follow-up.

### 4.5 Reduced motion

- `'jump'` and `'ignore'` are unchanged for automatic motion.
- `{ maxDuration }` clamps a spring as follows:
  1. Bounce is clamped to ≤ 0 (no overshoot).
  2. The largest factor `f` from the fixed grid `{1, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2, 0.1}` is
     chosen such that `delay·f + T_s(D·f, x₀, v₀) ≤ maxDuration`, each candidate evaluated
     exactly.
  3. If no factor fits, steps 1–2 are retried with `v₀ = 0`.
  4. If still none fits, the node jumps (`'reduced'`).

  The search is deterministic, needs no monotonicity, and costs at most 16 evaluations per track.
  It is property-tested over the full parameter domain.

## 5. Design C — the external-drive seam (B–C)

### 5.1 Surface (layout-owned)

```ts
// @freestylejs/ani-layout
export interface LayoutDriveVector { readonly x: number; readonly y: number }   // layout-viewport CSS px
export type LayoutDriveState = 'held' | 'released' | 'cancelled' | 'invalidated'
export interface LayoutDriveHandle {
  readonly state: LayoutDriveState
  readonly velocity: LayoutDriveVector        // drawn origin velocity at take (0 at rest)
  move(offset: LayoutDriveVector): void       // drawn origin = take point + offset
  release(velocity?: LayoutDriveVector): void // hand back with this incoming velocity (default 0)
  cancel(): void                              // hand back to the current slot with zero velocity
}
export interface LayoutDrive { take(element: HTMLElement): LayoutDriveHandle }
export interface LayoutGroup extends LayoutDrive { /* existing members */ }
```

- The gesture package imports **no** layout type. It declares a structurally identical port, so a
  `LayoutGroup` satisfies it with no package dependency. Core gains nothing for the seam.
- **Responsibilities.** C owns pointer capture, `pointerId`, `touch-action`, velocity estimation,
  coordinate conversion to layout-viewport CSS px, keyboard operation and announcements. C maps
  `pointercancel`/`lostpointercapture` to `cancel()`. Layout owns every style it writes.

### 5.2 State machine

| From | Event | To / effect |
|---|---|---|
| — | `take(el)`: `el` registered in this scope, connected, same document, `'raf'`, not held, no held ancestor or descendant | `held`. Origin channels freeze at their presented value; size channels keep their track; `velocity` = analytic origin velocity (catch a moving card without a jump) |
| — | `take` violating any precondition | throws `ANI_INVALID_OPTIONS`, no state change |
| `held` | `move(o)` with finite `o` | origin target = take point + `o`; applied next frame |
| `held` | `move`/`release` with a non-finite component | throws `ANI_INVALID_OPTIONS`, no state change |
| `held` | `release(v)` | `released`; next frame starts the origin track from the presented box toward the current A with incoming `v`, first frame `dt = 0`, under the node's effective motion and the reduced-motion policy at that moment |
| `held` | `cancel()` | `cancelled`; as `release({0,0})` |
| `held` | removal, `ownerDocument` change, `layoutKey` change, `dispose`, `finish`, kill switch (§7) | `invalidated`; the node follows that event's rule; listeners and reads stop |
| terminal | `release`/`cancel` | no-op (idempotent) |
| terminal | `move` | no-op, with a dev warning once per handle |

- **Concurrency.** Distinct participants without an ancestor relation may be held at once (multi-
  touch). One element belongs to at most one live scope, and `add` to a second scope throws.
- **Re-render while held.** It updates A and options, not the grip point. Release uses the latest
  effective motion.
- **React StrictMode.** The same-task ref detach and re-attach preserves a live hold, as it
  preserves registration.

### 5.3 While held

- **Ownership.** Layout stays the only writer of `translate`/`scale`. The hold is an orthogonal
  field on the node's drive, not a new drive kind: the existing `'held'` kind means an invisible
  crossfade follower and is unrelated.
- **The held point is immutable** in view space: `H = take point + offset`. Each frame, in the
  read phase before any write, the scope reads the held element's rect, divides out the pose it
  wrote last frame to get the presented layout box (§3.4), and solves the pose that puts the drawn
  origin at `H`, through the parents' current maps, with the size channels' current values. This
  holds under any scroll, any animating parent scale, sticky and toolbar changes, with no events
  and no classification (R1-06).
- **Children** stay in layout under the held map.
- **Bound.** During compositor-driven scrolling (mouse wheel or trackpad while dragging), the held
  element can trail by up to one frame of scroll. The error does not accumulate. Touch drags stop
  the scroller's own fling, so they are unaffected.

### 5.4 Release and reduced motion

- The held phase is direct manipulation: `move` stays 1:1 under every reduced-motion policy, and a
  policy change while held never ends the hold (R2-01, matching core's existing
  "reduced motion does not apply to driven runs").
- The policy applies at `release`/`cancel`:
  - `'jump'`: lands at A with no motion;
  - `{ maxDuration }`: clamps per §4.5;
  - `'ignore'`: the full motion.
- With the spring, the landing is physical. With a curve, the momentum term carries `v`. A release
  with no layout change springs back to the slot, so C needs no animation code.

### 5.5 React

`useLayoutDrive()` always returns a dispatcher. `take(el)` routes to the live scope that currently
owns the registered element: the explicit group only when it owns `el`, otherwise the implicit
scope of `el.ownerDocument` (portals into other documents stay correct). If no scope owns `el`,
`take` throws `ANI_INVALID_OPTIONS`. C's React hook accepts the dispatcher as an option.

## 6. Safety contract

### 6.1 Degradation table (normative)

| Condition | Detection | Outcome | Report |
|---|---|---|---|
| No valid before-box (no capture, or an aged capture) | flush; frame marker (§3.3) | undriven appear at A; driven keep their tracks (§3.5) | `snapped: 'stale'`; diagnostic `capture-less-flush` / `capture-aged` |
| Map change the engine does not own (box-changing rotation or skew, 3D, `zoom`) on a participant | layout-size vs rect check at capture and flush (§3.4); the authority's computed-value checks | the subtree snaps to A | `'unsupported'` |
| Shared handoff out of an active scroller | §3.7 | presence enter at A | diagnostic `handoff-scroll-active` |
| Spring settle > 10 s; non-finite inputs | plan, validation | snap / throw before any state change | `'unsupported'`; `ANI_INVALID_OPTIONS` |
| Connected participants > `maxParticipants` (default 2,000) | count, before any read | the whole flush snaps, with no geometry reads | status `'capped'` |
| Movers > `maxNodes` (default 300) | plan (existing) | the whole flush snaps | status `'capped'` |
| Detach, document change, `layoutKey` change, dispose | lifecycle checks | track ends, styles restored, hold invalidated, listeners released | per node `snapped`; status `'disposed'` for `dispose` |
| Reduced motion | at plan and at release | automatic motion per policy; an active hold stays direct | `'reduced'` |
| Kill switch on | `layoutRuntime.mode` | live tracks finish at identity, holds invalidated, future movers snap | status and reason `'disabled'` |
| Internal exception during a flush or frame | transactional boundary (§6.2) | abort: restore, release, resolve | status `'failed'`; diagnostic `internal-error` |
| User callback throws (`onSnap`, a diagnostic listener) | isolation (§6.2) | ignored after the engine's state is consistent; reported | diagnostic `callback-error`; rethrown asynchronously in dev |

`'stale'` no longer comes from scroll. The only remaining meaning is "no measurement of what was
presented".

### 6.2 Transactions

- `flush()` and every frame callback run inside one idempotent boundary. On an exception it:
  1. restores every owned declaration byte-identically and cancels WAAPI animations;
  2. clears pending writes, invalidates holds and releases presence holds;
  3. disarms listeners and stops the realizer when nothing runs;
  4. resolves every affected report with `'failed'`;
  5. reports the error through the diagnostics stream.

  `flush()` keeps its contract: it never rejects.
- User callbacks run after the engine's state is consistent, each inside its own `try`. A throwing
  callback cannot change engine state.

### 6.3 Status precedence

`status` describes the run's lifecycle and `snapped` describes per-node degradation. One run
resolves to the first status that applies, in this order:

1. `'failed'`
2. `'disposed'`
3. `'disabled'`
4. `'capped'`
5. `'interrupted'`
6. `'ended'`
7. `'reduced'`
8. `'stale'`
9. `'no-change'`

`'reduced'`, `'stale'` and `'no-change'` apply only when no track ran. A mixed run (some nodes
animate, some snap) resolves by its tracks, and lists the snapped nodes with their reasons.

## 7. Operations

```ts
export type LayoutDiagnosticCode =
  | 'capture-less-flush' | 'capture-aged' | 'measurement-unsupported' | 'unsupported-geometry' | 'handoff-scroll-active'
  | 'spring-timeout' | 'participant-cap' | 'mover-cap' | 'document-mismatch'
  | 'runtime-disabled' | 'focus-in-follower' | 'callback-error' | 'internal-error'
  | (string & Record<never, never>)   // new codes may be added; existing meanings are stable

export interface LayoutDiagnostic {
  readonly version: 1
  readonly code: LayoutDiagnosticCode
  readonly scope: number              // stable per scope for the page's lifetime
  readonly run: number | null
  readonly engine: 'raf' | 'waapi'
  readonly action: 'none' | 'snap' | 'enter' | 'finish' | 'abort'
  readonly element?: HTMLElement
  readonly reason?: SnapReason
  readonly metrics: {
    readonly participants: number
    readonly rectReads: number
    readonly styleReads: number
    readonly springSettleMs: number | null
  }
  readonly error?: unknown
}

export interface LayoutRuntime {
  readonly mode: 'animate' | 'snap'
  setMode(mode: 'animate' | 'snap'): void       // covers explicit and implicit scopes
  onDiagnostic(listener: (event: LayoutDiagnostic) => void): () => void
}
export const layoutRuntime: LayoutRuntime
```

- **Kill switch.** `setMode('snap')` takes effect synchronously:
  - live tracks finish at identity with styles restored;
  - holds become `invalidated`;
  - pending reports resolve `'disabled'`;
  - later movers snap `'disabled'`.

  An app wires it to remote config. It is distinct from reduced motion.
- **Cost of diagnostics.** None when nothing listens; payloads are built only for listeners. The
  hook works in production. Dev builds additionally log warnings.
- **Isolation.** A throwing listener is reported as `callback-error` to the *other* listeners only,
  never back to itself, and never recursively.
- `onSnap` stays as it is.

## 8. Accessibility contract

- Layout never changes DOM order, never moves focus, and never owns `tabindex`, roles or ARIA. A
  keyed reorder or a held re-render keeps the same element and `document.activeElement`
  throughout the motion.
- **Crossfade followers.** An exiting crossfade follower is set `inert` for its exit, and restored
  byte-identically if it re-enters, so no duplicate interactive or accessible target exists during
  a shared crossfade. If focus is inside the follower when the exit starts, the crossfade is
  skipped for that pair (the lead appears at A) and diagnostic `focus-in-follower` is emitted. The
  author moves focus.
- **Gestures.** C must offer keyboard operation through the same port (take, stepwise move,
  cancel, release), with announcements as component patterns. The held phase is direct
  manipulation (§5.4).
- **Reduced motion:** §4.5, §5.4.

## 9. Public API delta (complete)

| Package | Addition / change |
|---|---|
| core | `physics` module (pure numeric: `spring`, `settleTime`, `perceptual`, `decay`). Nothing DOM-related; the clock is unchanged |
| layout | `LayoutMotion` union (§4.2); `LayoutOptions.layoutKey`; `LayoutGroupOptions.maxParticipants`; `LayoutDrive*` types and `LayoutGroup.take` (§5.1); `LayoutStatus` and `SnapReason` gain `'failed'` and `'disabled'`; `layoutRuntime`, `LayoutDiagnostic*` (§7); motion merge rule; document-affine scopes |
| react/layout | `useLayoutDrive()`; `mergeMotion` kind-level rule; portal scoping per document. The `'use client'` directive is a release assertion in both ESM and CJS |

Nothing is removed. Defaults are unchanged (D1 deferred).

**Migration notes** ship with the release:

- **From Motion:** `layoutScroll`/`layoutRoot` are unnecessary. Ani's spring carries gesture
  velocity. `type: 'spring'` maps by name.
- **Within Ani:**
  - ordinary scroll no longer produces `'stale'`;
  - `'stale'` now means "no valid before-box" (§3.5);
  - `LayoutStatus` and `SnapReason` gain `'failed'` and `'disabled'`, so exhaustive switches must
    handle them;
  - a spring's promise resolves at settle;
  - timing `duration: 0` is unchanged.

## 10. Module changes

| Module | Change |
|---|---|
| `layout/dom.ts` | Flat-tree ancestry primitive; all-participant capture reads and the layout-size check; held-element read; dev-only ancestor classifier |
| `layout/scope.ts` | Capture aging (frame marker); view-space planning; measured state; capture-less rules; transactional boundary; the orthogonal hold field and the drive state machine; `layoutKey`; document affinity; active-scroller listeners; runtime and diagnostics plumbing |
| `layout/plan.ts` | Keep test against `L_k`; status precedence; new reasons |
| `layout/solve.ts` | Pose inversion of measured boxes; spring channels; perceptual timeline; held origin channels |
| `layout/motion.ts` | Discriminated union, kind-level merge, validation, settle cap, reduced-motion search |
| `layout/runtime.ts` (new) | `layoutRuntime`, diagnostics stream |
| `layout/realize/waapi.ts` | Spring rejection (validation) |
| core `physics` (new) | Pure closed forms; settle; perceptual; decay |
| `react/layout` | `useLayoutDrive`, merge rule, portal document scoping |

`plan.ts`, `solve.ts`, `motion.ts` and `physics` stay DOM-free and clock-free. Only `dom.ts` reads
the DOM.

## 11. Verification

### 11.1 Tier 1 — per PR (deterministic, Chromium, Firefox, WebKit, manual clock)

An independent oracle (sharing no code with the solver or `physics`) holds the closed-form spring,
the perceptual timeline and pose inversion. Every row passes in three engines, at every frame, and
**fails on the current engine** for the defect it targets. Every existing row and gate stays green.

| Row | Assertion |
|---|---|
| L-MEAS-1 chat delete under anchoring (page and panel) | No visible message moves > 0.5 px at any frame (reproduces the page-level P1 defect first) |
| L-MEAS-2 kanban: card moved, column auto-scrolls in the layout effect | All participants start at their presented boxes; land on A |
| L-MEAS-3 accordion + instant `scrollIntoView` | Participants start where seen; non-participants follow the scroll; exact settle |
| L-MEAS-4 user scroll mid-run (inner and page, under a scaling parent), then a commit | Drawn boxes follow content every frame; the commit continues position and velocity |
| L-MEAS-5 React 18.3 and 19: time-sliced render scrolled between chunks (a) with a participant in the committing slice, (b) without; transition interrupted by an urgent update; Suspense fallback then reveal while scrolled; two commits coalesced | (a) first frame = last presented within 0.5 px; (b) §3.5 outcome with `capture-aged`; never a wrong first frame |
| L-MEAS-6 sticky engages mid-run: (a) no later commit, (b) a later commit | (a) final frame exact, no snap; (b) continuity |
| L-MEAS-7 browser layout change mid-run (image above loads), then a commit | Continuity; track kept or retargeted per §3.4 |
| L-MEAS-8 fixed sheet with nested participants while the page scrolls | No motion from the page scroll; inner layout animates |
| L-MEAS-9 nested driven parent and child: (a) fresh capture mid-run, (b) a frame advanced past the capture (R1's round-2 counterexample) | (a) no shear, exact `(B, v)`; (b) aged, §3.5 outcome, no rewind |
| L-MEAS-10 participant in an open and a closed shadow root inside an outer scroller | As L-MEAS-4 |
| L-MEAS-11 capture-less flush; vanilla capture with an async gap (aged) | §3.5 outcomes and reports |
| L-MEAS-12 author rotation: (a) box-changing rotation added mid-run, (b) present at capture and removed by the commit, (c) a 180° rotation removed by the commit | (a), (b) subtree snaps `'unsupported'`; (c) the box moves exactly (documented) |
| L-MEAS-13 an earlier rAF callback moves an ancestor; a later rAF callback calls `update()` (vanilla and via Ani's clock) | Ani's clock: aged, §3.5, never the intermediate box as B; documented third-party case asserted to be outside the adapter path |
| L-HAND-1 list item → fixed detail and back (in a scroller) | Shared handoff; coverage 1 at every frame |
| L-HAND-2 handoff while the source scroller is active; after `scrollend` | Presence enter, diagnostic; then a normal flight |
| L-SPRING-1 channels, b ∈ {−0.8, −0.3, 0, 0.2, 0.4, 0.9}, 60/120 Hz | `c(0) = B`, `c′(0) = v`, settle within ε, against the oracle |
| L-SPRING-2 crossfade, radius and presence release on a spring lead | Coverage 1; fade, blend and release end at `t = D` |
| L-SPRING-3 merge, validation, WAAPI rejection, settle cap | Union semantics; throws before state change |
| L-SPRING-4 reduced motion `{maxDuration}` | Grid search property over the domain; never exceeds `maxDuration` |
| L-DRIVE-1 take, move, reorder, release; snap-back; cancel | Pointer offset constant under reorder (≤ 0.5 px); `c′(0) = v` exactly; first release frame `dt = 0` |
| L-DRIVE-2 catch a moving card | Analytic velocity; no jump; size keeps its track |
| L-DRIVE-3 scroll while held, under a parent scaling 1 → 2 | Held element under `H` ≤ 0.5 px every frame |
| L-DRIVE-4 state machine: stale calls, non-finite input, two scopes, ancestor holds, unmount, StrictMode replay, dispose mid-hold | Per §5.2 |
| L-DRIVE-5 reduced motion on at take, toggled while held, three policies at release | Per §5.4 |
| L-OPS-1 kill switch mid-run and mid-hold, explicit and implicit scopes | Per §7 |
| L-OPS-2 injected exceptions (measure, write, `animate`, `onSnap`, diagnostic listener) | `'failed'`; styles byte-identical; no listener or subscription left |
| L-KEY-1 recycled node with `layoutKey` change under scroll | Fresh baseline, no interpolation |
| L-DOC-1 cross-document `add`; adoption; React portal into an iframe | Throw; invalidation; per-document scope |
| L-A11Y-1 reorder and hold with focus inside; crossfade follower | `activeElement` stable; follower `inert`; focus-in-follower rule |

**Model-based fuzzing.** A pure model of the scope's lifecycle generates seeded event sequences:
capture, frame markers, flush, presented and unpresented scroll, browser layout change, detach and
re-add, document change, `layoutKey` change, take, move, release, cancel, reduced-motion toggles,
the kill switch, visibility changes and injected exceptions. Properties:

- no NaN;
- B equals the box at a capture read in the flush's rendering interval, or the node is reported
  snapped;
- no read after the first write in a batch;
- every listener and subscription is released when idle;
- every handle reaches a terminal state;
- every report resolves;
- styles restore byte-identically.

**Mutation tests** each must fail a named row: consume an aged capture; skip the frame marker; use
the predicted box instead of the measured one; drop the layout-size check; ignore `scrollend`; skip cleanup on
abort; release with `dt ≠ 0`.

### 11.2 Tier 2 — release device gate (mandatory before a release claims B)

Real devices, not simulators only:

- iPhone, current and previous iOS, one 60 Hz and one ProMotion (120 Hz) device, Safari;
- Android Chrome on a mid-tier device.

Scripted scenarios:

- touch momentum and rubber-band during capture, run and commit;
- pinch zoom and visual-viewport pan;
- dynamic toolbar collapse and the on-screen keyboard;
- orientation and resize storms;
- hide and foreground during a run;
- long-task injection;
- drag with scroll;
- the showcase rows (chat, kanban, sheet).

Evidence per scenario: a frame-time trace (60/120 Hz), the diagnostics stream, and a recorded video
checked against the expected outcome (exact or the defined degradation). Ownership and the device
source are decision D5.

### 11.3 Spikes (B1), each with the fallback that ships if it fails

| Spike | Must show (three engines) | Fallback |
|---|---|---|
| S1 measurement | (a) A capture of a driven node equals its presented box (0.01 px), including WAAPI-driven boxes. (b) The layout-size check has no false positive at DPR 1, 2 and 3, fractional sizes, and pinch zoom. (c) The aging frequency in the showcase rows, React 18.3 and 19 | (a) On that engine a driven participant's measurement is invalid: its subtree degrades as §3.5 (`'stale'`, diagnostic `measurement-unsupported`), and a shared handoff involving it becomes a presence enter. An analytic box never substitutes for B in a new or retargeted plan; a failed spike may reduce animation coverage, never restore predicted presentation. (b) Widen the tolerance to the measured rounding bound. (c) If aging is frequent in a showcase row, the adapter docs and the row are changed before B5 |
| S2 anchoring | The correction is applied before the flush's first rect read; layout's writes neither suppress nor alter anchoring | Read one scroll offset per anchoring candidate container before the first rect (forces the correction). If still not exact, an unpresented anchoring correction behaves as a capture-less flush for that subtree (`'stale'`) |
| S3 React | Every L-MEAS-5 sequence in 18.3 and 19 gives a fresh capture or a reported aged one, never a wrong first frame | None needed: aging is the conservative path. The spike measures how often it happens |
| S4 held read | A per-frame rect read before writes is exact and costs ≤ 0.1 ms per held element | None needed: an inexact read only adds the bound of §5.3. The spike then measures that bound |
| S5 `scrollend` | Fires after momentum and smooth scroll in each engine | §3.7's conservative rule (no flight out of any container that has scrolled) |

### 11.4 Cost gates

- Commit: ≤ 4 ms at 1,000 participants (unchanged), both unscrolled and scrolled.
- Steady frame: p95 ≤ 2 ms (unchanged).
- Sustained commits: 60 Hz commits with 300 moving participants hold the steady-frame gate.
- Held frame: ≤ 0.1 ms per held element.

All gates run in Tier 1 on desktop and are re-measured on the Tier 2 devices.

## 12. Checkpoints

Same loop as before: Task Agent → Valid Agent → orchestrator judgment, retry on FAIL.

| CP | Content | Gate | Depends on |
|---|---|---|---|
| **B0** design freeze | This document; the owner's decisions (§13); the reviewers' sign-off | No open blocker | — |
| B1 | Spikes S1–S5 | Each passes or its fallback is applied and documented | B0 |
| B2 | Measured presentation (§3), safety contract (§6), operations (§7), accessibility of crossfade (§8); L-MEAS, L-HAND, L-OPS, L-KEY, L-DOC, L-A11Y rows; model fuzz | Rows ×3; cost gates; mutation tests | B1 |
| B3 | Core `physics`; spring (§4); L-SPRING rows | Property tests within 1e-9 against the oracle; rows ×3 | B0 (parallel with B1/B2) |
| B4 | Drive (§5); L-DRIVE rows; React adapter | Rows ×3 | B2, B3 |
| B5 | Authority amendment; docs, migration notes, layout changelog; showcase rows; package version and peer alignment | Full gate on a fresh clone; Tier 2 device gate | B2–B4 |

## 13. Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | Spring as the default motion | **Defer.** All three reviewers: ship the spring opt-in; the default change is a separate later release with migration notes |
| D2 | Core addition: the pure `physics` module | **Approve.** Additive; core gains no DOM or layout types, and the clock is unchanged |
| D3 | Visual continuity (unpresented scroll is part of the change) | **Approve.** Unanimous; the only rule consistent with P1 |
| D4 | Clip-aware crossfade | **Defer** |
| D5 | Source of the Tier 2 devices: owner's own iPhone (60 Hz + ProMotion) and Android device, or a device cloud | Owner's call. A release cannot claim B without it |
| D6 | New public surface: `layoutKey`, `maxParticipants`, `layoutRuntime`, diagnostics, `'failed'`/`'disabled'` | **Approve** as specified in §7 and §9 |

## 14. Documented platform bounds

These are bounds, not open questions. Each is stated in the docs and measured in Tier 2.

- **Compositor lag.** During asynchronous scrolling the main thread can trail the screen by up to
  one frame. It is uniform inside the scrolled layer (no visible effect). Across layers it is
  handled by §3.7 for handoffs and bounded per frame for held elements (§5.3).
- **Fixed descendants of posed participants** are re-contained (§3.8).
- **Captures from rendering callbacks** (§3.3-5) are outside the contract when the callback
  belongs to a third party.
- **Aged captures** do not animate undriven participants. This is reported, and the fix is
  documented (§3.3).
- **Bounding-box-preserving author rotations** removed by a commit are not detected. The box
  motion stays exact (§3.4).
- **Spring runs** last until settle (1.67 D for the example). Perceived completion uses `p(t)` and
  ends at D. The promise resolves at settle (§4.1).

## 15. Sources

- HTML, update the rendering: https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering
- CSS Scroll Anchoring 1: https://www.w3.org/TR/css-scroll-anchoring-1/
- CSSOM View (`getBoundingClientRect`, scroll events, `scrollend`): https://drafts.csswg.org/cssom-view/
- CSS Viewport (visual viewport scale): https://drafts.csswg.org/css-viewport/
- MDN, viewport concepts: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/CSSOM_view/Viewport_concepts
- CSS Positioned Layout (sticky): https://drafts.csswg.org/css-position/
- CSS Transforms 2 (individual transforms, containing blocks): https://drafts.csswg.org/css-transforms-2/
- DOM, event `composed`: https://dom.spec.whatwg.org/#dom-event-composed
- Pointer Events 4: https://www.w3.org/TR/pointerevents4/
- WCAG 2.2, animation from interactions; focus order: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions , https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html
- Safari `scrollend` (26.2): https://www.infoq.com/news/2026/04/safari-scrollend-support , https://bugs.webkit.org/show_bug.cgi?id=201556
- WebKit scrolling architecture: https://trac.webkit.org/wiki/Scrolling
- Apple, WWDC23 *Animate with springs*: https://developer.apple.com/videos/play/wwdc2023/10158/
- Apple, SwiftUI `Animation.default`, `Spring.duration`, `Spring.bounce`: https://developer.apple.com/documentation/swiftui/animation/default , https://developer.apple.com/documentation/swiftui/spring/duration , https://developer.apple.com/documentation/swiftui/spring/bounce
- React: `startTransition`, `useLayoutEffect`, React 19 upgrade guide, `'use client'`: https://react.dev/reference/react/startTransition , https://react.dev/reference/react/useLayoutEffect , https://react.dev/blog/2024/04/25/react-19-upgrade-guide , https://react.dev/reference/rsc/use-client
- Motion: https://motion.dev/docs/react-layout-animations , https://motion.dev/docs/react-transitions ; `motion-dom` 14.6.0 source (read locally)
- Playwright browsers (WebKit is not branded Safari): https://playwright.dev/docs/browsers
