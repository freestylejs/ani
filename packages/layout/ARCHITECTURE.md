# ANI Layout — Architecture

**Status:** authority for `@freestylejs/ani-layout` and `@freestylejs/ani-react/layout`.
**Version of the design:** v3 (measured presentation, the physical spring, the drive seam, the
safety and operations contract). It was signed off by a three-reviewer design review and approved
by the owner on 2026-10-27, with decisions D1–D6 (§2.2). The design record is
`.trace/ani_layout_ios/architecture.md`. This file replaces the 0.2.0 text completely: page boxes,
the inner-scroll `'stale'` snap, the analytic before-box for driven nodes and the field-by-field
motion merge no longer exist anywhere.

Execution plan and evidence: `.trace/ani_ios_production/`.

---

## 1. Decision

ani-layout is **one pure layout solver** fed by **measured presentation**. The default `'raf'`
realization runs it on Ani's own clock; the optional `'waapi'` realization is the §10 exception and
runs flat position tracks on the document timeline.

At each commit it learns where every marked box *was presented* (B, measured, never predicted) and
where layout *put it* (A). The engine's model supplies only what cannot be measured: velocity.
With `'raf'`, every frame re-solves every animating box top-down, parent before child, and writes
only `translate` and `scale` (plus `opacity` for a crossfade pair, `border-radius` when radius
correction is on, and `inert` on an exiting crossfade follower).

- **Exact by construction.** Nesting at any depth, `layoutAnchor`, shared `layoutId`, crossfade and
  a held (dragged) element are one equation per node. No keyframe sampling, no error budget, no
  depth limit. Scroll containers, sticky, fixed, the top layer, pinch zoom, dynamic toolbars and
  every browser-driven layout change are correct with no markers and no classification (§4).
- **Two motion kinds.** A timing curve (default: ease-out, 0.35 s) or a physical, velocity-native
  spring set by perceptual duration and bounce (§5.1–§5.3). Every retarget, handoff and release
  is continuous in position and velocity.
- **The drive seam.** A gesture layer takes an element, moves it 1:1, and releases it with the
  finger's velocity; layout lands it in its slot (§5.10). The gesture layer imports no layout type.
- **Ani's moat.** Reads happen once per commit and never interleave with writes. Steady frames do
  zero DOM reads (a held element reads one rect per frame, §5.10). The `'raf'` scope is one
  `Animatable` on the core clock, so it shares frame time, time scale, reduced motion and
  ownership with every other Ani animation.
- **Declarative.** In React you mark an element with `useLayout()`. It animates whenever its box
  changes across a commit. No `deps`, no capture or play calls.
- **Snap, never wrong motion.** Every visible frame is either the exact specified motion or a
  defined, reported degradation (§9). A path the solver cannot do exactly jumps to the real layout
  and is reported with a typed reason; an internal fault restores every owned style and reports
  `'failed'`; nothing ever throws inside a frame.
- **Operable.** A kill switch and a versioned diagnostics stream (§7.2) let an app turn layout
  motion off remotely and observe every degradation in production.

Presence and View Transitions stay. Jank resilience (compositor-only motion while the main thread
is blocked) is not promised for layout; it exists only as the optional WAAPI engine of §10.

## 2. Constraints, decisions and support

### 2.1 Constraints

- Dependency direction: `ani-layout → ani-core`; `ani-react/layout → ani-layout + ani-core`. Core
  knows nothing of layout.
- Layout uses only core's public exports: the clock (`Animatable { read?, update(dt), commit? }`,
  `Clock`, `defaultClock`, `Clock.inFrame`, `Clock.read`), timing functions, the `physics` module,
  `createAniError`, `DEV`, and the reduced-motion policy type.
- Core gains exactly two additive surfaces (D2): the pure numeric `physics` module (§5.3) and the
  read-only `Clock.inFrame` flag (true while the clock runs a frame: read callbacks, update and
  commit). Core gains no DOM or layout types.
- The vanilla API must not block later Vue, Svelte and Solid adapters: an adapter only needs
  `add`, `set`, `capture`, `flush` and, for gestures, `take`.
- Out of scope: 3D, rotation and skew projection, arc paths, shadow correction, SVG and inline
  layout, cross-document scopes and handoffs, iframes as one scope, clip-aware crossfade (D4),
  springs and drives on the WAAPI engine, a "quiet window" upgrade of aged captures, a
  perceptual-completion promise, a detectable presentation token for third-party rendering
  callbacks.

### 2.2 Owner's decisions (2026-10-27)

| # | Decision | Ruling |
|---|---|---|
| D1 | Spring as the default motion | Deferred: the spring is opt-in; the default stays ease-out, 0.35 s |
| D2 | Core additions | Approved: `physics`, and the read-only `Clock.inFrame` that §4.1 needs |
| D3 | Visual continuity (an unpresented scroll is part of the change) | Approved (§4.1) |
| D4 | Clip-aware crossfade | Deferred |
| D5 | Device gate | The bench harness of §11.5, in Chromium and WebKit under Playwright |
| D6 | New public surface: `layoutKey`, `maxParticipants`, `layoutRuntime`, diagnostics, `'failed'`/`'disabled'` | Approved as specified in §7 |

### 2.3 Support matrix

| Area | Exact | Defined degradation | Not supported (documented) |
|---|---|---|---|
| Packages | `@freestylejs/ani-layout` (vanilla), `@freestylejs/ani-react/layout` (React 18.3, 19) | — | Vue, Solid, Svelte layout bindings |
| Engines | Chromium, Gecko, WebKit | — | — |
| Scroll | Page and nested scrollers, scroll anchoring, smooth scroll, scroll snap, momentum, rubber-band, sticky | A shared handoff out of an actively scrolling container → presence enter (§5.8) | — |
| Roots | Fixed, top layer (dialog, popover), transformed containing blocks | — | A viewport-fixed descendant *inside* a posed participant is re-contained by the pose (dev warning; the fix is a portal, §4.6) |
| Viewport | Pinch zoom, visual-viewport pan, dynamic toolbars, on-screen keyboard | — | — |
| DOM | Open and closed shadow roots, `display: contents` parents | — | Cross-document scopes and handoffs |
| Geometry | 2D translate and scale poses; author translate and scale on participants; translate-only non-participant ancestors | Box-changing rotation, skew, 3D, CSS `zoom` on or between participants → `'unsupported'` | — |
| Reuse | Keyed React lists; vanilla remove + add | `layoutKey` change → fresh baseline (§4.7) | Recycling a node without remove + add or `layoutKey` |
| Capture timing | A capture read in the flush's rendering interval | An aged or missing capture → `'stale'` (§4.4) | A capture from a third-party rendering callback (§4.1) |
| Engine option | `'raf'` (everything) | — | `'waapi'` with springs, drives, nesting, `layoutAnchor`, `layoutId`, radius (rejected at validation) |

## 3. Model

The real DOM after a commit is the only layout truth. The engine never decides where anything
ends; it only animates the visual difference back to that truth.

### 3.1 Platform facts the model rests on

- **Rendering order.** HTML's *update the rendering* runs the scroll steps (scroll events) before
  `requestAnimationFrame` callbacks, and presents afterwards. A scroll whose event fired is
  presented no later than the frame the engine is about to produce.
- **Scroll anchoring** applies its correction when the suppression window ends, or before an
  operation that depends on scroll position, such as `getBoundingClientRect()`. For Ani that is the
  flush's first rect read, so the user never sees the pre-correction offset.
- **Measured boxes.** `getBoundingClientRect()` of a participant includes its own inline
  `translate`/`scale`, every ancestor transform, sticky offsets and every browser-driven layout
  change. During asynchronous (compositor) scrolling it can trail the screen by up to one frame;
  that lag is uniform inside the scrolled layer, so it matters only when content leaves that layer
  (§5.8, §5.10).
- **Visual viewport.** Pinch zoom and visual-viewport panning transform the whole layout viewport.
  Rects, scroll offsets and the engine's transforms are layout-viewport coordinates, so the visual
  viewport is a uniform camera. Toolbars and the on-screen keyboard that move fixed elements are
  browser layout changes, which measurement captures.
- **`scrollend`** is baseline in all three engines. The design uses it only to clear the
  "actively scrolling" state (§5.8).

### 3.2 Spaces and maps

Every flush plans in **its own view space**: layout-viewport coordinates at the flush instant,
which are the screen coordinates the user sees (modulo the uniform visual-viewport camera). B and A
are both taken in it, so no scroll offset or root offset enters a plan. Every axis is independent,
and every map is an axis-aligned affine map `x ↦ k·x + b` per axis.

For a participant `n`:

| Name | Meaning |
|---|---|
| **Local frame** | The coordinates the element's own transforms act in: its parent participant's frame before that parent's transforms (the view space for a top-level participant; non-participant ancestors may only translate, §6). |
| **CSS box Lₙ, origin Oₙ** | The element's border box and its `transform-origin` point, in the local frame. |
| **Inner map Qₙ** | The element's own authored `translate`/`scale` and its inline `transform` (presence), about `Oₙ`. Not owned by layout; frozen at the flush. |
| **Box Xₙ = Qₙ(Lₙ)** | What layout's pose moves, in the local frame. |
| **Pose Pₙ** | Layout's own `(t, s)` per axis, about `Oₙ`. Owned by layout. |
| **Full map Mₙ** | `Mₙ = Mπ ∘ Pₙ ∘ Qₙ`, where `Mπ` is the parent participant's full map (identity for a top-level participant). |
| **Visual box** | `Mₙ(Lₙ)`: what the user sees, in view space. |

CSS composes `translate · rotate · scale · transform`. Layout writes the *outer* map
(`translate = t + s·authoredTranslate`, `scale = s·authoredScale`) and presence's `transform`
stays inside, so `Pₙ ∘ Qₙ` is exactly what the browser applies.

**Track space is the visual space.** Every track runs between two visual boxes:

- **B** is the presented visual box, measured by the capture (§4.1) as it is: the rect, nothing
  divided out, for every participant, driven or not.
- **A** is the visual box at rest: the rect at the flush with only the poses the engine last wrote
  divided out, outermost first (`Mπ` and `Pₙ` as last written). Inner maps stay in, so no owned
  style is touched before a read.
- **Projection** draws the track's box `V(t)` exactly: `Pₙ` solves `Pₙ(Xₙ) = Mπ⁻¹(V)` with `Mπ`
  the parent's *full* map: its frozen inner map and its current pose (§5.5).

**Between flushes nothing is converted.** A pose is a translate and scale relative to the element's
own layout box, so whatever moves the box (a scroll, sticky, a toolbar, an image loading above)
moves the drawn box with it, exactly as it moves every non-participant. Frames read nothing. A
track's B and A stay in the view space of the flush that planned it; the next flush re-expresses a
kept track in its own view space (§5.7).

At the end of a run `V = A` for every node, so every pose is the identity: the settle is exact even
if an inner map or the camera changed during the run.

**Inner maps that change during a run.** An authored `translate`/`scale` change applies after
settle (§6). A presence `transform` that animates during the run is a visual layer: the browser
applies the current matrix where the projection assumed the flush-time one, to the element and to
everything inside it, exactly as to non-participant children. It ends with the presence motion and
never leaves a pose behind.

A track lives in the visual space of the flush that planned it: its B and A were measured through
the presence matrices of that flush, so `Mπ` composes the ancestors' poses with their inner maps
*as of that flush*, and only a change since then is a layer over it. Each node records its
participant ancestors' matrices when it is planned; a node planned later than a kept ancestor (a
child retargeted under a parent whose layer changed) composes that ancestor with the newer matrix,
while the ancestor's own track keeps its older one. A kept track (and a continuing crossfade
follower, §5.8) keeps those matrices, its own and its ancestors', but not its CSS box: `Lₙ` and
`Oₙ` are read again at every flush.

### 3.3 Data

| Data | Owner | Lifetime |
|---|---|---|
| Capture: per participant rect, layout size, the computed values §4.1 lists, the read instant `t_k`, the frame marker, the task stamp | Scope | One epoch (until `flush()` consumes it) |
| Measured state per running node: B, presented layout box `L_k`, analytic velocity `v` at `t_k` | Scope (capture) | One epoch |
| After box A per participant | Scope (flush) | One flush |
| Track per animating node: kind (timing or spring), B, A, delay, parameters, velocity seed, start, settle time | Engine | Until it settles or is replaced |
| Hold per held node: take point, offset, handle state | Scope (drive) | Until a terminal state |
| Pose per node per frame | Solver output | One frame |
| Registry: element → options and `layoutKey`; `layoutId` → lead and exiting follower; retained boxes; the scope's document | Scope | Until removal (+ `retain`) |
| Active scroll containers (event targets between `scroll` and `scrollend`) | Scope | While the scope has a shared participant |
| Presence state: present / entering / exiting / exited | Presence handle | Until exit settles |

### 3.4 Invariants

1. **P1 — first frame.** The first frame after a change equals the last presented scene, modulo
   camera motion presented no later than that frame. It holds for every flush whose capture was
   read in the flush's rendering interval; every other flush degrades as §4.4 states, reported.
2. **Final frame.** The final frame is the real layout: identity pose, inline styles and the
   `inert` attribute byte-identical to before the run, no clock subscription, frame marker,
   listener or hold left.
3. One owner per CSS property on a participant (§6).
4. With `'raf'`, retarget, handoff and release are continuous in position and velocity (§5.2 states
   the single physical limit: a size channel never drops below one pixel). WAAPI deliberately drops
   retarget velocity (§10).
5. A node whose target did not move is never retargeted: an unrelated re-render or a presented
   scroll cannot restart anything (§5.7). The one exception is a kept track whose translation
   cannot be proven exact (a live ancestor scale, §5.7 path 3): it restarts from its measured
   `(B, v)`, continuous in position and velocity.
6. Anything the solver cannot do exactly snaps, with a typed reason; anything that fails restores
   and reports `'failed'` (§9).
7. Steady frames read nothing, except one rect per held element per frame, read before any write.

## 4. Commit and frame model

Each commit costs one batched read before the mutation (the capture) and one after (the flush).
With the default `'raf'` engine, every animation frame after that is arithmetic plus writes,
inside the clock's `update` and `commit` phases. WAAPI realization follows §10.

The one write-then-read of the engine is a capability probe, once per document when a scope binds
to it (outside every flush and frame): whether the browser applies a percentage `transform-origin`
to the border box snapped to device pixels (§5.5).

### 4.1 Capture (B)

**Reads.** If the scope's connected participants exceed `maxParticipants`, the capture reads
nothing and is marked capped (§9.1). Otherwise `capture()` reads every connected participant,
driven ones included, in one batch:

1. one `getBoundingClientRect()` and one `offsetWidth`/`offsetHeight` pair each;
2. for a participant whose layout-size check (§4.2) does not match on the known scales alone, its
   computed `translate`, `scale`, `rotate` and `transform`;
3. after every rect, for each participant with a `layoutId` and radius on, one computed-style read
   of its four corner radii, resolved against its CSS border box at B and stored as B's radius.

A participant without a `layoutId`, or with `radius: false`, adds no radius read.

**Time.** A capture is read in a task, after the last frame's writes. It reflects the state
presented at that frame, time `t_k`, and the engine's analytic state (velocity) is evaluated at the
same `t_k`: the instant its last written pose describes.

**Lifetime.** A scope has at most one capture. It belongs to the open epoch, which `flush()`
closes:

| Event | Effect |
|---|---|
| `capture()` with no capture | Read; stamp the capture with the current task; arm the frame marker. |
| `capture()` in the task that took the capture | Reuse (StrictMode's second render, every further participant render of that pass). |
| `capture()` in a later task | Read again (refresh), restamp, re-arm the marker. |
| A rendering opportunity passes (the marker fires) | The capture is **aged** (below). |
| `flush()` | Consume the capture (if any), disarm the marker, close the epoch. |

The task stamp expires at the end of the task that took it (a microtask queued by the capture), so
every render pass that starts in a later task re-reads the DOM it is about to change.

**Aging.** Arming a capture subscribes a one-shot **frame marker**: the scope clock's `read(fn)`
callback and the owner document's window `requestAnimationFrame`, whichever runs first; the marker
reads and writes nothing, and the other half is cancelled. If the marker fires before the flush, a
rendering opportunity has passed and the capture is aged. A rendering opportunity may have
presented changes the capture cannot see (a scroll, a layout change, a mutation by a later
animation-frame or observer callback), so **an aged capture never supplies B**. The re-read rule
above replaces an aged capture with a fresh one; in React this happens whenever any participant
renders in the slice that commits. A flush that consumes an aged capture degrades as §4.4 states,
with diagnostic `capture-aged`.

A capture is aged only when no participant renders in the task that commits: in React, a render
longer than one time slice whose last slice renders no participant; in vanilla code, an
asynchronous gap between `capture()` and `flush()`. Both get the diagnostic, and the docs give the
fix (render the group in the committing slice, or call `update()`/`capture()` immediately before
the mutation).

**Rendering-callback bound.** A capture must begin in an ordinary task, not inside a
rendering-update callback (`requestAnimationFrame`, `ResizeObserver`): an earlier callback of the
same frame may already have changed the scene without presenting it, and the marker cannot fire
before a synchronous flush. `capture()` or `update()` called while the scope's clock runs a frame
(`clock.inFrame`) is aged at once, with a dev warning. Third-party callbacks cannot be detected,
so calling from them is outside the supported contract, and the docs say so. The React adapter
never captures from such callbacks.

**Visual continuity (D3).** A change made in the commit's own task (a script scroll, the anchoring
correction, the mutation itself) was never presented, so it is part of the change: each
participant starts where it was last seen. After an instant, unpresented scroll in the commit (an
accordion followed by an instant `scrollIntoView`), participants glide from where they were seen
while non-participant content jumps by the scroll. An app that wants the scroll to glide uses
`behavior: 'smooth'`, which is presented, and therefore camera.

**Hand-off.** React's scheduler can run a commit and the start of the next render in one task, so
the flush microtask runs after that render has already touched (and reused) the capture the flush
consumes. The React adapter sees layout effects, so it knows when a participant rendered after the
commit's last layout effect. In that case it calls `capture()` right after `flush()`, in the same
microtask. That read sees every participant as the flush drew it: a new track at its t = 0 pose
(its B), a continuing track at `t_k`, a resting node at A. Until a rendering opportunity passes,
that is exactly the scene the next frame starts from, so the capture is valid under the same aging
rule. The scope needs no hidden hook, and the extra read happens only in this interleaving.

In React, the first render of a `useLayout` participant, a `LayoutGroup` or an `AnimatePresence`
in an epoch calls `capture()`. React has not mutated the DOM yet, so this is the true before-box,
not a remembered one.

### 4.2 Measured state, the support check, and the presented layout box

**Support check** (production, every participant, at capture and at flush). It never treats a
scale derived from a rounded layout size as exact; it propagates a **scale interval** that provably
contains the true total scale. Top-down, parent before child, per axis, with `R` the rect size and
`O` the integer layout size (`offsetWidth`, `offsetHeight`):

- **Measured interval.** The true layout size `W` satisfies `|W − O| < 1 px` (`offsetWidth` rounds
  or pixel-snaps a LayoutUnit size). So the true total scale `S = R / W` lies in
  `M = [R / (O + 1), R / (O − 1)]` for `O > 1`, and `M = [0, ∞)` for `O ≤ 1` (a degenerate axis
  proves nothing). Both ends are widened by a relative `1e-9` for floating-point rounding.
- **Expected interval.** `E = I_π · p · q`, with `I_π` the parent participant's propagated interval
  (`[1, 1]` at the top level, since non-participant ancestors only translate, §6), `p` the node's
  own pose scale as last written (known exactly) and `q` its inner-map scale. The check first
  assumes `q = 1`; on a mismatch it reads the computed values of item 2 of §4.1 (at flush, the
  active node's values are read anyway) and uses their scale.
- **Pass** when `M ∩ E ≠ ∅` on both axes.
- **Propagated interval.** `I = M ∩ E` when `q` was read; `I = M` when `q` was assumed (an assumed
  `q` is not knowledge). When `I` is wider than ±0.5 % relative (`O` below about 200 px, or a wide
  parent interval) and the node has participant children, its computed values are read as on a
  mismatch, so `I = M ∩ (I_π · p · q)` and every propagated interval stays within ±0.5 % of the
  truth by induction from the top level.

On a supported tree the true `S` lies in `M` and in `E` at every node, so the check has **no false
positive** at any scale, size or nesting depth: rounding can widen an interval but never exclude
the truth. It detects an unsupported map whose effect on the box exceeds the measurement interval
(about 1 px of the node's own size plus 0.5 % from its parent); smaller effects are drawn as their
box, like the small rotations below. The same intervals serve both reads of a flush; the computed
reads they add are counted in `stats.styles`.

- A mismatch, or computed values with a rotation, skew or 3D component, means a map the engine
  does not own (a box-changing rotation or skew, 3D, CSS `zoom`). The node and its participant
  subtree snap `'unsupported'`, with diagnostic `unsupported-geometry`.
- **Bounding-box-preserving author rotations** (180°, or 90° of a square) present at capture and
  removed by the commit are not detected, and need not be: the bounding box *is* the box, so the
  box's motion is exact, and the orientation change is the author's own instant change in that
  commit, like a colour or text change. Rotations too small to change the box by the tolerance are
  likewise drawn as their box. Both are documented.
- **Non-participant ancestors** must only translate (§6). Dev builds check this with a memoised
  computed-style walk at `add` and at the first flush, and warn once. Production does not read
  ancestors.
- The flush additionally runs the computed-value classifier of §9.1 on active nodes.

**Presented layout box.** For a node with a running track, the capture gives its presented drawn
box B at `t_k`. The scope recovers its **presented layout box** `L_k` top-down: it divides out the
engine's own pose as last written and the presence matrices of that capture, through the parents'
maps at the same instant. This is exact for the supported 2D model (verified on 10,000 random
nested cases to 1.4e-13). `L_k` is where the node's previous target is drawn now, camera included;
the keep test of §5.7 compares the new A with it.

**Velocity.** The pose velocity at `t_k` is analytic and exact. The layout box is static between
frames, so `(B, v)` is the true presented state. Nested parents and children come from one capture,
so they cannot shear. An analytic box never substitutes for a measured B.

### 4.3 Flush (A, plan, t = 0 pose)

`flush()` consumes the capture synchronously and reads before it writes. It runs inside the
transactional boundary of §9.2.

1. **Gate.** If the runtime mode is `'snap'`, every mover snaps `'disabled'` (§7.2). If connected
   participants exceed `maxParticipants`, the flush reads nothing and snaps the whole scope
   (`'capped'`).
2. **Read A** for every participant (one layout): the rect and the layout size; for active nodes
   the inline `transform` and the computed `translate`/`scale`/`rotate`/`transform-origin`/corner
   radii, which give `Lₙ`, `Oₙ` and `Qₙ` (frozen for the run); where the browser snaps the
   reference box, also the Typed OM value of `transform-origin` (§5.5). Only the poses the engine
   last wrote are divided out (§3.2); nothing is restored or stripped first. Then the support check
   (§4.2).
3. **Plan** (§5): pure. B per node comes from the consumed capture when it is fresh; §4.4 applies
   otherwise.
4. **Write.** With `'raf'`, write the pose of every engine node at its current time (the t = 0 pose
   of a new track reproduces B), then subscribe the scope's `Animatable` if any track or hold
   exists. With `'waapi'`, commit the flush writes and install the held track animations (§10).

In React, a layout effect of every participant, group and `AnimatePresence` queues **one** microtask
per scope and commit that calls `flush()`. It runs after every layout effect (presence has lifted
its `popLayout` exits by then) and before paint. Several commits before one flush coalesce: B from
the first capture, A from the last commit.

### 4.4 Capture-less or aged flush

A flush with no capture, or with an aged capture, has no valid measurement of what was presented:

| Node | Outcome | Report |
|---|---|---|
| Undriven | Appears at A (no track). | Reported `'stale'` when its A differs by at least `threshold` from its **last known box**: the aged capture's box when there is one, else its A at its previous flush (that flush's view space). A node with no last known box (registered since its last flush) is reported. |
| Driven (a running track) | Keeps its track whatever moved. Its pose stays relative to its layout box, so it moves with its layout like any non-participant and still ends at identity (the track is translated by `δ = A_new − A_old`, §5.7; with no valid B there is nothing to retarget from). | Reported `'stale'` when `|δ| ≥ threshold`, or when `|δ| ≥ 0.01 px` and the translation is not exact (an ancestor condition of §5.7 fails). |

The rule is **exhaustive and conservative**: every node that may have jumped by `threshold` or more
is reported, and a node that only moved with a scroll since its last known box may be reported too
(there is no measurement to tell them apart). The same rule fills `report.snapped`, the `onSnap`
calls and the diagnostic's count. The flush emits one diagnostic, `capture-less-flush` or
`capture-aged`, with the count of reported nodes. `'stale'` has this meaning only: **no valid
measurement of what was presented**. A flush with a valid capture never produces it, whatever
scrolled.

### 4.5 Frames

This subsection is the default `'raf'` frame contract; WAAPI timing is §10.

- A track **from rest** starts its time at its first clock update, whose `dt` is forced to 0: its
  first painted frame is B, and a 120 ms block after the commit costs one late frame, not 120 ms
  of progress.
- A track planned for a node **moving** at the flush (a retarget, a reduced-motion re-plan, a
  handoff from a moving node, all carrying a velocity) continues the time of the last painted
  frame: its B and velocity are the presented box and velocity of that frame, so its first update
  advances by the frame's `dt` like every running track. A track that no frame has drawn yet (two
  flushes in one frame) is still at rest. A crossfade's timeline starts with its lead's.
- A track started by a **release** (§5.10) starts from rest timing-wise: its first update has
  `dt = 0`, and it carries the release velocity.
- After that, tracks advance by the clock's `dt` (lag-smoothed, time-scaled), exactly like every
  other Ani animation.
- The read phase is used only by held elements (one rect each, §5.10); `update` solves; `commit`
  writes only declarations whose value changed. Every restore (a settle, a lead giving back its
  opacity, a follower's `inert`) is queued in `update` and written in `commit`; in a flush, every
  restore is written after the last read.
- A node settles when its own track ended, no hold is live on it, and no ancestor still animates:
  its saved inline declarations are restored byte for byte (with the author's latest inline values,
  §6). The scope unsubscribes after the commit of the frame in which no track and no hold is left.

### 4.6 Ancestry, documents, and fixed descendants

- **Flat-tree ancestry.** One primitive (`assignedSlot`, then `parentElement`, then
  `ShadowRoot.host`) is used for every ancestor walk: the nearest participant, the containment
  tests of §5.8 and §8, and the dev warnings. Open and closed shadow roots are supported.
- **Document-affine scopes.** A scope binds to the `ownerDocument` of its first participant. `add`,
  `set` or `take` with an element of another document throws `ANI_INVALID_OPTIONS`. An element whose
  `ownerDocument` changes (adoption) has its track ended, styles restored and hold invalidated, is
  unregistered (diagnostic `document-mismatch`), and must be re-added. There is no cross-document
  `layoutId` handoff. In React, a portal into another document creates or joins that document's
  implicit scope rather than inheriting the outer group's.
- **A fixed descendant inside a posed participant** is re-contained by the pose: any non-`none`
  `translate`/`scale` establishes a fixed containing block (CSS Transforms 2). A dev-only subtree
  check at `add` warns once per participant; the fix is a portal.

### 4.7 Semantic identity: `layoutKey`

`LayoutOptions.layoutKey?: unknown`, compared with `Object.is`. When it changes, the node's track
ends, owned styles are restored, any hold is invalidated, and the node's current layout becomes a
fresh baseline: the flush that sees the change plans nothing for it. A virtualizer that recycles DOM
nodes sets it to the item id. React lists keyed by item identity remount instead, and need nothing.

## 5. Solver

### 5.1 Motion kinds, merge and validation

```ts
type LayoutMotion =
  | { readonly type?: undefined; readonly duration?: number; readonly delay?: number; readonly timing?: TimingFunction; readonly bounce?: never }
  | { readonly type: 'timing'; readonly duration?: number; readonly delay?: number; readonly timing?: TimingFunction; readonly bounce?: never }
  | { readonly type: 'spring'; readonly duration?: number; readonly delay?: number; readonly bounce?: number; readonly timing?: never }
```

**Merge across layers** (group, nested group, participant; the scope's root default is timing,
ease-out, 0.35 s, delay 0). Each layer, outermost first:

- `type: 'spring'` selects the spring kind; `timing` or `type: 'timing'` selects the timing kind;
  a layer with neither inherits the current kind;
- a kind switch drops the previous kind's own fields (`timing`, `bounce`) and keeps nothing but
  `delay`;
- `duration` never switches the kind: a child's `duration: 0.3` under a group spring makes a 0.3 s
  spring;
- `duration`, `timing` and `bounce` override within the kind; `delay` merges on its own.

After the merge, a spring without `duration` takes 0.55 s, and `bounce` defaults to 0. The merge is
one function in `motion.ts`, used by the vanilla scope and by the React adapter.

**Validation** is synchronous, throws `ANI_INVALID_OPTIONS`, and runs before any state changes, on
each layer and on the effective motion:

- timing: finite `duration ≥ 0` (`0` is a synchronous jump);
- spring: finite `duration > 0`;
- both: finite `delay ≥ 0`;
- `bounce`: finite and strictly inside (−1, 1), never on a timing layer; `timing` never on a spring
  layer;
- a timing must be stateless with a finite initial slope `e′(0)` (§5.2).

A refused track (the settle cap of §5.3, or no reduced-motion fit, §9.4) snaps its node, and a run
in which no track ran but a node was refused by reduced motion resolves `'reduced'` (§9.3).

**Comparison** in the keep test is by effective value after the merge (§5.7).

### 5.2 Timing track

Each node animates four channels: the **origin point** (the box point under its
`transform-origin`, kept as a fraction of the box) and the size. With `τ = (elapsed − delay) / D`,
`D` the duration and `e` the timing curve:

```
c(τ) = A + (B − A)·(1 − e(τ)) + k·τ·(1 − τ)²,   k = v·D + (B − A)·e′(0)
```

- `c(0) = B` and `c(1) = A` for every timing.
- `k` carries the incoming velocity `v` of a node that is **moving** at the flush (a retarget, a
  handoff from a moving node, a release): `dc/dτ(0) = v·D`, so `c′(0) = v` exactly. A node **at
  rest** has `k = 0` and its path is exactly the timing curve. `k` is not clamped: the bump
  `k·τ·(1 − τ)²` (at most `4|k|/27`, at τ = 1/3) is the carried momentum. For the same release
  velocity its peak excursion is `(4/27)·2π·e ≈ 2.53` times a critically damped spring's, which is
  fine for retargets between nearby targets; a flick wants the spring (§5.3).
- **Size floor.** A size channel never drops below one pixel, or below its smaller endpoint when
  that is under one pixel; the path is floored where the carried velocity or a timing overshoot
  would take it lower. `c′(0) = v` still holds; this is the only place a channel deviates from its
  equation.
- **Delay** applies to a node at rest at the flush: before it, the channels hold B. A node moving
  at the flush starts its new track at once, so its velocity is never dropped.
- A stateful timing (`timing.dynamicSpring`) or a curve that starts vertically (a bezier with
  `x1 = 0` and `y1 ≠ 0`, or a custom timing whose initial secants do not converge) throws
  `ANI_INVALID_OPTIONS` when the option is given: `k` must be finite. `timing.spring` stays a
  timing curve; it is not the physical spring.

### 5.3 Spring track

Per channel, with displacement `x₀ = B − A`, incoming velocity `v₀`, perceptual duration `D` and
bounce `b`: `ω₀ = 2π/D`; `ζ = 1 − b` for `b ≥ 0`, `ζ = 1/(1 + b)` for `b < 0` (Apple's model: mass
1, stiffness `(2π/D)²`). The channel is `c(t) = A + d(t)` with core's `physics.spring().at(t)`
displacement:

```
ζ = 1:  d(t) = (x₀ + (v₀ + ω₀x₀)t)·e^(−ω₀t)
ζ < 1:  d(t) = e^(−ζω₀t)·(x₀ cos ω_d t + ((v₀ + ζω₀x₀)/ω_d) sin ω_d t),  ω_d = ω₀√(1 − ζ²)
ζ > 1:  d(t) = c₁e^(r₁t) + c₂e^(r₂t),  r₁,₂ = −ω₀(ζ ∓ √(ζ² − 1)),  c₁ = (v₀ − r₂x₀)/(r₁ − r₂),  c₂ = x₀ − c₁
```

- **Exact velocity.** It is stateless, and `d′(0) = v₀` on every channel: origin point, size and
  anchor offset. A retarget from the presented `(B, v)` with the same parameters is the
  superposition model of UIKit and SwiftUI. Delay and the size floor follow §5.2.
- **Settle.** The track's settle time `T_s` is the first time after which every channel stays
  within 0.1 px of its target and its speed within 1 px/s, computed once at plan and exactly from
  the closed form: the closed-form envelopes bound it, and the last exit from each tolerance is
  found between the response's zeros and extremes, where its magnitude is monotone (an envelope
  alone ends an underdamped run up to several frames late). At `T_s` the channels are set to A exactly (a final step under 0.1 px). Example: 300 px,
  `D = 0.55`, bounce 0, `v₀ = 0` settles at **0.918 s (1.67 D)**; the documentation example is an
  executable test.
- **Settle cap.** If `T_s > 10 s` at plan (bounce near 1 with a long `D`), the node snaps
  `'unsupported'`, with diagnostic `spring-timeout` and a dev warning naming the parameters.
- **Perceptual timeline.** `p(t) = min(1, s(t)/s(D))`, with `s(t) = 1 − (1 + ω₀t)e^(−ω₀t)` and
  `s(D) ≈ 0.986399`; `t` is the lead's elapsed time after its delay. It is monotone, exactly 1 at
  `D`, and independent of bounce. It drives the crossfade opacities, the radius blend and
  presence's release hold for a spring lead, so all three finish at the perceptual duration. A
  timing lead uses `p = clamp(e(τ), 0, 1)`.
- **Completion.** `flush()`/`update()` resolve at physical settle, when owned styles are restored:
  later than the perceptual end (0.918 s vs 0.55 s in the example). The docs say so, and recommend
  not gating UI on the promise for springs.
- **Placement.** The closed forms, `settleTime`, `perceptual` and the decay projection a gesture
  layer needs (`decay(v, rate)` = `v·r/(1 − r)` per ms, UIKit's 0.998 normal rate) are core's pure
  `physics` module. Layout imports them; the independent test oracle does not (§11.1).

### 5.4 Modes

| `layout` | Origin point | Size |
|---|---|---|
| `true` (default) | animates | animates |
| `'position'` | animates | pinned to A (counter-scaled under a scaling parent) |
| `'size'` | pinned to A | animates |

### 5.5 Projection

For node `n` with drawn (visual) box `V(t)`, box `X = Qₙ(Lₙ)`, origin `O` (both in the local frame)
and parent full map `Mπ` (§3.2), per axis:

```
V′ = Mπ⁻¹(V),   s = V′_w / X_w,   t = V′_x − O_x − s·(X_x − O_x),   Mₙ = Mπ ∘ Pₙ ∘ Qₙ
```

The track's origin fraction is `(O_x − L_x) / L_w`, the transform origin's place in the box (an
affine `Qₙ` keeps it). Depth is unlimited.

`O` in the projection (and in `Qₙ`, and wherever a drawn rect is divided back to `Lₙ`) is the
origin the browser *applies*. Chromium and Gecko apply the computed origin. WebKit applies an
origin's percentage to the border box snapped to device pixels, `round(L_w·dpr)/dpr`, so a
fractional box drawn at scale `s` lands `|s − 1|·δ` off (δ < 0.5/dpr px) if the computed origin is
used. Where the probe of §4 finds snapping, the percentage part of each origin axis is read from
the Typed OM computed value (`computedStyleMap()`, which keeps `%` and `calc()`) and applied to the
snapped box. The track's origin fraction stays the computed one: only the projection follows the
browser.

`Mπ` is the parent's map in the node's own flush space (§3.2). Every full map is the map that
carries `Lₐ` onto the drawn box, so it needs no chain. Let `Ωₐ` be `a`'s full map with every
ancestor's own frozen inner map. A node whose flush saw ancestors `a` with other presence matrices
(a *layer*, `Γₐ = Qₐ⁻¹ ∘ Qₐ′`) uses `Mπ = corr ∘ Ω_parent`, where `corr = Π Ωₐ ∘ Γₐ ∘ Ωₐ⁻¹` over its
layers, root first, and `Ωₐ = corrₐ⁻¹ ∘ Mₐ`. The cost per frame is O(N) map arithmetic, plus a
constant per layer. Every participant under an animating ancestor is solved each frame (a node
whose own box did not move keeps `V = A` and is counter-projected), so nesting never distorts it.

### 5.6 Anchor

`layoutAnchor {x, y}` (0–1) replaces the origin channels with an offset:

- **Placement.** Every frame, the node's anchor point is placed on the parent participant's drawn
  anchor point, plus the offset. The parent is taken as the node's own flush space draws it (§3.2,
  §5.5), and the keep test (§5.7) compares the offset target with the parent's A in that space.
- **Offset path.** The offset moves from the initial discrepancy to the final one on the node's own
  timeline, by the node's motion kind (§5.2 or §5.3), including its delay and its velocity term. A
  moving node carries its velocity relative to the parent's anchor point, so an anchored retarget
  keeps its visual velocity. The offset is zero when the anchor points coincide.
- **When it moves.** An anchored node has moved when its size or its offset changed by at least
  `threshold`, and whenever its parent moves. A running anchored track is kept only while its size
  target and offset target are unchanged.
- **Without a parent participant** the anchor is ignored: the node animates by its `layout` mode.

### 5.7 Interruption and the keep test

A new flush while tracks run never reads animated state as truth. With `'raf'`, a running node's B
is its measured box from the fresh capture and `v` its analytic velocity at `t_k` (§4.2), both seen
through the presence layers of this capture: a presence `transform` that changed since the last
flush changed what the user sees. Each pose is recovered *with its rate* from the presented box and
velocity, and recomposed through the current maps (maps with time derivatives compose exactly by
the product rule), so a parent's motion stays a translation of the child whatever the child's own
scale became.

**Keep test.** A running track is kept only when

1. its new A equals `L_k` (§4.2) within `threshold`, judged under the presence matrices its track
   was planned with (a presence `transform` that changed since is a visual layer, not a move); and
2. its size target equals its previous size target within `threshold`; and
3. its track options are unchanged by effective value: `layout`, `layoutAnchor`, `radius` and the
   merged `motion` (`{}` equals `{ motion: { delay: 0 } }`; a timing compared by its class and
   parameters in any key order, so an inline `timing.easeOut()` equals the previous render's).

A presented scroll or layout shift moved `L_k` and A together, so the track is kept. A change in the
commit's own task (the mutation, an unpresented scroll) moved A only, so the node retargets from
`(B, v)` (D3). A presented resize of the box changed its size target, so the node retargets from
`(B, v)`, which keeps the first frame exact.

**Re-expression of a kept track.** With `δ = A_new − A_old` per axis (both rest boxes, each in its
own flush's view space), a kept track takes exactly one of three paths:

1. **Unchanged** when `|δ| < 0.01 px` on both axes.
2. **Translated** by `δ` when the translation is provably exact: at `t_k` every participant
   ancestor's pose has scale 1 on both axes (no ancestor track or hold is changing a scale), and
   every participant ancestor's inner-map scale is the one the track was planned with. Then the
   node's drawn box moved by exactly the rest-space `δ` (the composed linear map from its layout
   box to the screen is the same at rest and at `t_k`), so translating its origin channels (and
   its anchor offset target, unchanged) by `δ` reproduces the measured B. Shape, timing, elapsed
   time, velocity and size channels are unchanged; it lands exactly on `A_new`, and it keeps the
   ancestor matrices it was planned with (§3.2).
3. **Retargeted from `(B, v)`** otherwise. Under an ancestor whose scale is live, the camera moved
   the drawn box by `k·δ`, not by `δ` (a 20 px presented scroll inside a parent at scale 0.5 moves
   the child's B by 10 px while `A_new − A_old` is 20 px), so no translation of the old track is
   exact. The node is planned now from its measured presented box and analytic velocity toward
   `A_new`, in this flush's space: the first frame is B and velocity is continuous (invariant 4).

A node planned now starts in this flush's space.

`layoutId`, `layoutCrossfade` and `layoutDependency` act at the flush and never restart a track. A
reduced-motion mode that changed since a track was planned (§9.4) re-plans it at the next flush from
its presented box, carrying its velocity. WAAPI supplies no `v`; within its flat position-only shape
the same keep test applies (§10).

### 5.8 Shared `layoutId`, crossfade and handoff

- Per id the scope keeps one **lead** (newest connected, non-exiting registrant) and at most one
  **follower** (a registrant exiting under presence).
- **Handoff.** When the lead changes because the previous lead departs (exits under presence, or
  leaves the scope), the new lead's B and velocity are the departing node's presented box (from
  this flush's capture, in this flush's view space) and its analytic velocity. This holds even when
  the new lead was already registered. A previous lead that is still live and not exiting does not
  hand off (duplicate id).
- **Retained boxes.** A removed lead's last presented box, radius and velocity (the velocity only if
  its own track was moving, not holding a delay) are retained for `retain` seconds (default 1)
  after its removal, in view space as measured. The next flush uses them as they are: the new lead
  flies from where the old one was last seen on screen.
- **Actively scrolling source.** A scroll container (or the document) is **active** from its first
  `scroll` event until its `scrollend`. A handoff, or a reparent of a participant, whose departing
  node is inside an active container while the new lead is outside it, does not fly: the lead
  enters as a presence enter (or appears at A when it has no presence), with diagnostic
  `handoff-scroll-active`. Time never clears the state; only `scrollend` does. Where `scrollend` is
  unavailable, every such handoff out of a container that has scrolled since the scope bound
  degrades the same way. The listeners are one passive capture-phase `scroll` and `scrollend` pair
  per event root (the `Document` and each `ShadowRoot` holding a participant), armed only while the
  scope has a shared participant; each event records its target, with no reads. When the departing
  node is in the document scroller and the new lead is viewport-fixed (an `offsetParent` walk that
  ends at a fixed element, run on this path only), the lead is outside it.
- **Crossfade** runs only when the lead changed in this flush, the previous lead is exiting under
  presence, the box moved by at least `threshold` (or the pair is reversing, below), neither node
  sets `layoutCrossfade: false`, and focus is not inside the follower (§8). Both nodes draw at the
  lead's box; the follower takes it as its own flush space draws the lead (§3.2, §5.5): its
  ancestors as its flush saw them, every other presence as the lead was drawn with. Only the layers
  at the follower's ancestors that also draw the lead convert, `corr_f ∘ corr_l⁻¹` over those; a
  lead outside the follower's layered parent is taken as is. A continuing follower keeps the space
  of the flush that started it, like a kept track.
- **Opacity.** With the lead's progress `p` (§5.3: perceptual for a spring lead, eased for a timing
  lead), `in(p) = circOut(min(1, p / 0.5))`, `circOut(x) = √(1 − (1 − x)²)`, and
  `out(p) = clamp((p − 0.5) / 0.45, 0, 1)`. The lead draws `L = from_L + (1 − from_L)·in(p)` and the
  follower draws `F = from_F·(1 − out(p))`. A new handoff starts with `from_L = 0` and `from_F = 1`,
  so an opaque new pair has source-over coverage `1 − (1 − L)(1 − F) = 1` at every frame.
- **Inert follower.** The exiting follower is set `inert` from the crossfade's first frame and
  restored byte-identically if it re-enters (reversal) or when presence unmounts it (§6, §8).
- **Reversal.** When the new lead is the follower of the running crossfade (a menu reopened while it
  closes), the pair keeps crossfading however little it moves. `from_L` is the opacity the new lead
  currently shows and `from_F` is the opacity the new follower currently shows: neither layer pops,
  no box jumps, and pair coverage cannot decrease from the reversal frame.
- The follower is held at opacity 0 (where it was drawn when the fade ended) until presence
  unmounts it, and presence's release waits for the crossfade to end (`p = 1`). Nothing pops back to
  opacity 1.
- A lead retargeted during its crossfade (same lead, A moved) keeps the fade: its timeline, the
  follower's and the release stay one; the lead gives its opacity back when the fade ends, not when
  its new track ends.
- If presence animates `opacity` on a crossfade node (its `present` record names `opacity`), the pair
  hands off without a crossfade and a development warning is printed.
- Two live, non-exiting nodes with one id print a development warning; the newest leads and the
  other animates on its own.

### 5.9 Radius

Radius is on for a participant with `radius: true`, and for one with a `layoutId` that omits
`radius`; `radius: false` turns it off. A participant with radius on uses the author's four corner
radii of A at every flush. When layout does not own a corner, its computed value is read with the
node's other computed values. While layout owns it and its inline declaration still holds layout's
own `!important` write, the authored length captured when ownership began is reused instead;
percentages and `calc()` keep their length components and resolve against the current CSS box. A
plain inline author replacement recognised by §6 becomes the source from that flush onward. Each
corner is written as `r·A_w/V_w` / `r·A_h/V_h` (elliptical radii), so corners keep their on-screen
radius under any total scale. The declaration is restored on settle.

A shared `layoutId` handoff blends the on-screen corner shape when both the departing node and the
new lead have radius on. Per corner and axis, `ρ_A` is the new lead's authored radius resolved at A
and `ρ_B` the departing node's on-screen radius at the flush, from: (1) a driven departing node's
currently drawn `ρ`; (2) the consumed fresh capture, for a resting node; (3) its retained radius,
for a removed lead. With no valid source (an aged or missing capture for a resting node) there is
no blend: the lead draws `ρ_A`. On the new lead's timeline `ρ(p) = ρ_B + (ρ_A − ρ_B)·p`, with `p` of
§5.3. During a live crossfade both layers draw the same `ρ(p)` and each converts it with its own
`A_w/V_w` or `A_h/V_h`, so their silhouettes are identical.

A retarget or reversal during a radius blend starts the new blend from the `ρ` currently drawn; at
`p = 1` the lead draws exactly `ρ_A`, so ending the blend, settling and restoring introduce no radius
jump. There is no blend when either side has `radius: false`. Flushes add no radius-only
measurement, and frames add no DOM read.

### 5.10 The drive seam

**Surface** (layout-owned types; the gesture layer declares a structurally identical port and
imports no layout type):

```ts
interface LayoutDriveVector { readonly x: number; readonly y: number }   // view-space CSS px (per s for velocities)
type LayoutDriveState = 'held' | 'released' | 'cancelled' | 'invalidated'
interface LayoutDriveHandle {
  readonly state: LayoutDriveState
  readonly velocity: LayoutDriveVector        // drawn origin velocity at take (0 at rest)
  move(offset: LayoutDriveVector): void       // drawn origin = take point + offset
  release(velocity?: LayoutDriveVector): void // hand back with this incoming velocity (default 0)
  cancel(): void                              // hand back to the slot with zero velocity
}
interface LayoutDrive { take(element: HTMLElement): LayoutDriveHandle }
```

**Responsibilities.** The gesture layer owns pointer capture, `pointerId`, `touch-action`, velocity
estimation, conversion to view-space CSS px, keyboard operation and announcements, and maps
`pointercancel`/`lostpointercapture` to `cancel()`. Layout owns every style it writes.

**State machine.**

| From | Event | To / effect |
|---|---|---|
| — | `take(el)`: `el` registered in this scope, connected, same document, engine `'raf'`, not held, no held ancestor or descendant, supported geometry | `held`. Origin channels freeze at their presented value (the take point); size channels keep their track; `velocity` = analytic origin velocity at the take (catching a moving card has no jump) |
| — | `take` violating a precondition | throws `ANI_INVALID_OPTIONS`, no state change |
| — | `take` while the runtime mode is `'snap'` | returns a handle already `invalidated` (diagnostic `runtime-disabled`); the gesture layer moves nothing through layout |
| `held` | `move(o)` with finite `o` | origin target = take point + `o`; applied at the next frame |
| `held` | `move`/`release` with a non-finite component | throws `ANI_INVALID_OPTIONS`, no state change |
| `held` | `release(v)` | `released`; the next frame starts the origin track from the presented origin toward the current A with incoming `v`, first update `dt = 0`, under the node's effective motion and the reduced-motion policy at that moment; descendants keep their residuals and ride `h` (below) |
| `held` | `cancel()` | `cancelled`; as `release({ x: 0, y: 0 })` |
| `held` | removal, `ownerDocument` change, `layoutKey` change, `dispose`, `finish`, kill switch, a failed support check of the held read, a `'failed'` abort | `invalidated`; the node follows that event's rule; reads stop |
| terminal | `release`/`cancel` | no-op (idempotent) |
| terminal | `move` | no-op, with a dev warning once per handle |

- **Concurrency.** Distinct participants without an ancestor relation may be held at once
  (multi-touch). One element belongs to at most one live scope; `add` to a second scope throws.
- **Re-render while held.** A flush updates A, the size target and the options, never the held
  point. Release uses the latest effective motion and A.
- **React StrictMode.** The same-task ref detach and re-attach preserves a live hold, as it preserves
  registration.

**While held.**

- Layout stays the only writer of `translate`/`scale`. The hold is an orthogonal field on the node,
  not a new drive kind (the internal `'held'` kind of an invisible crossfade follower is unrelated).
- The held point is fixed on screen: `H = take point + offset`, in current view space. Each frame,
  in the clock's read phase before any write, the scope reads the held element's rect, divides out
  the pose it wrote last frame to get the presented layout box (§4.2), and solves the pose that puts
  the drawn origin at `H` through the parents' current maps, with the size channels' current values.
  This holds under any scroll, any animating parent scale, sticky and toolbar changes, with no events
  and no classification.
- **Descendants ride one common displacement.** The held node owns one **inherited displacement**
  `h(t) = drawn origin(t) − rest origin(t)` (its origin as drawn minus the origin of its current A,
  both in current view space). `h` is a single function: the held point while held, and the held
  node's own origin track after release, until that track settles (`h = 0`). Every descendant
  participant, whatever its mode (`'size'` included) and whether or not it has a track, is drawn at
  `own(t) + h(t)`, where `own(t)` is its **residual**: its own track box, or its A when it has
  none. Its geometry relative to the held node therefore depends on its own residual only, never on
  how fast the shared displacement decays, so a 100 ms child cannot detach from a 500 ms parent.
- **At take**, each descendant's running track is re-planned as a residual from
  `(drawn box − h(t_take), drawn velocity − ḣ(t_take⁻))` toward its A, under its own effective
  motion, where `ḣ(t_take⁻)` is the held node's analytic origin velocity just before the take (the
  part of the descendant's motion it inherited from its ancestor's flight). Its drawn box is
  continuous at the take; from the take its drawn velocity is its residual velocity plus `ḣ`, so a
  caught card stops its content's inherited motion with it while their own relative motion goes on.
  A descendant with no track gets none (its residual is A).
- **At release**, the release velocity enters exactly once, as the held node's origin track's
  incoming velocity; descendants inherit it through `h` and their residuals receive none. The run
  ends when `h` and every residual have settled.
- **A flush while held or landing** plans a descendant's residual from its measured `(B − h(t_k),
  v − ḣ(t_k))`, with `h` and `ḣ` analytic at `t_k`, and keeps or retargets it by §5.7 on the
  residual. A descendant whose own residual ends first is drawn at `A + h` until `h` settles.
- **Bound.** During compositor-driven scrolling (wheel or trackpad while dragging) the held element
  can trail by up to one frame of scroll. The error does not accumulate. Touch drags stop the
  scroller's own fling, so they are unaffected.

**Release and reduced motion.** The held phase is direct manipulation: `move` stays 1:1 under every
reduced-motion policy, and a policy change while held never ends the hold. The policy applies at
`release`/`cancel`: `'jump'` lands at A with no motion; `{ maxDuration }` clamps per §9.4;
`'ignore'` plays the full motion. With the spring the landing is physical; with a curve the
momentum term carries `v`. A release with no layout change springs back to the slot, so the gesture
layer needs no animation code.

## 6. Property ownership on one element

This table is the default `'raf'` ownership contract. WAAPI writes no inline style: its flat
position-only track is an `Element.animate()` effect on `translate` (§10).

| Property | Owner | Rule |
|---|---|---|
| `translate`, `scale` | Layout | Authored values (inline or stylesheet, e.g. Tailwind `translate-*`, `hover:scale-105`) are composed (§3.2), frozen for the run and restored byte for byte. Layout writes them `!important`; an author's inline write during the run (React re-rendering a `style` prop) replaces that declaration, so it is recognised by its priority and taken in at the next flush or settle: the run keeps its frozen composition and the author's value is what the settle restores. A CSS transition configured on them (`translate`, `scale` or `all`) or a running CSS animation of them snaps the node `'unsupported'` with a development warning naming the fix (e.g. Tailwind `transition-colors` instead of `transition`). |
| `transform` | Presence and Core | Part of the inner map (§3.2); never written by layout. |
| `transform-origin` | Author | Read once per flush for active nodes (with its Typed OM value where the browser snaps the reference box, §5.5). |
| `opacity` | Presence; layout only for a crossfade pair | §5.8. |
| `border-radius` | Layout when radius is on (§5.9) | A resting shared participant is read-only snapshotted at capture (§4.1); capture does not take ownership. Saved when layout first owns it (also when `radius` turns on mid-run), then frozen as the authored radius while the inline declaration still holds layout's own `!important` write. An author's plain inline replacement is recognised by priority, used from the next flush and restored on settle. Turning `radius` off gives the corners back at once. |
| `inert` attribute | Layout, only on an exiting crossfade follower | Saved (present or absent, and its value) when the crossfade starts; restored byte-identically on reversal, on unmount, on abort and on dispose. |
| `rotate`, skew, non-translation ancestor transforms | Author | Detected by the support check (§4.2) and the computed-value classifier (§9.1): the subtree snaps `'unsupported'`. |

Presence and layout meet only inside the package: `createPresence` registers its element, its
exiting phase, whether its record names `opacity`, and a release hold (`presence_link.ts`).
Adapters see none of it.

**popLayout.** In the render where a child stops being present, `usePresence` measures its CSS box
relative to its real containing block (the nearest ancestor that establishes one for absolute
positioning, or the initial containing block). The commit lifts it to `position: absolute` at that
box, before the flush, so siblings are measured without the gap and move from t = 0.

## 7. Public API

The vocabulary is Motion's (`layout`, `layoutId`, `layoutAnchor`, `layoutCrossfade`,
`layoutDependency`, `type: 'spring'`) with Ani's own `motion` in seconds.

### 7.1 Vanilla — `@freestylejs/ani-layout`

```ts
type LayoutMotion = /* §5.1 */

interface LayoutOptions {
  readonly layout?: true | 'position' | 'size'   // default true
  readonly layoutId?: string
  readonly layoutAnchor?: { readonly x: number; readonly y: number }  // 0..1
  readonly layoutCrossfade?: boolean             // default true
  readonly layoutDependency?: unknown            // optional narrowing
  readonly layoutKey?: unknown                   // semantic identity (§4.7)
  readonly radius?: boolean                      // default: true with a layoutId, else false
  readonly motion?: LayoutMotion
}

interface LayoutGroupOptions {
  readonly clock?: Clock                         // default defaultClock
  readonly motion?: LayoutMotion
  readonly reducedMotion?: ReducedMotionPolicy   // default 'jump'
  readonly threshold?: number                    // px, default 1
  readonly maxNodes?: number                     // visible movers, default 300
  readonly maxParticipants?: number              // connected participants, default 2000
  readonly retain?: number                       // seconds, default 1
  readonly onSnap?: (element: HTMLElement, reason: SnapReason) => void
  readonly engine?: 'raf' | 'waapi'              // default 'raf' (§10)
}

type SnapReason = 'culled' | 'capped' | 'unsupported' | 'stale' | 'reduced' | 'disabled' | 'failed'

type LayoutStatus =
  | 'failed' | 'disposed' | 'disabled' | 'capped' | 'interrupted' | 'ended' | 'reduced' | 'stale' | 'no-change'

interface LayoutReport {
  readonly status: LayoutStatus
  readonly snapped: readonly { readonly element: HTMLElement; readonly reason: SnapReason }[]
}

interface LayoutStats {
  readonly captures: number
  readonly reads: number      // rects + offsets + styles
  readonly rects: number      // getBoundingClientRect calls
  readonly offsets: number    // offsetWidth/offsetHeight pairs
  readonly styles: number     // computed-style reads
  readonly tracks: number     // running tracks
  readonly holds: number      // live holds
}

interface LayoutGroup extends LayoutDrive {
  add(element: HTMLElement, options?: LayoutOptions): () => void
  set(element: HTMLElement, options: LayoutOptions): void
  capture(): void
  flush(): Promise<LayoutReport>
  update(mutate: () => void): Promise<LayoutReport>   // capture → mutate → flush
  take(element: HTMLElement): LayoutDriveHandle        // §5.10
  finish(): void
  dispose(): void
  readonly stats: LayoutStats
}

function createLayoutGroup(options?: LayoutGroupOptions): LayoutGroup

// the §5.1 rule, for adapters that merge their own layers
function mergeLayoutMotion(layers: readonly (LayoutMotion | undefined)[]): LayoutMotion  // kind explicit, defaults absent
function sameLayoutMotion(a: LayoutMotion | undefined, b: LayoutMotion | undefined): boolean  // by effective value
```

- `flush()` and `update()` follow core's run contract: the promise never rejects and resolves once
  per run. A run whose track is replaced by a later flush resolves `'interrupted'` at that moment;
  its untouched tracks keep running under the engine. Status precedence is §9.3.
- Invalid options throw synchronously with `ANI_INVALID_OPTIONS`, never inside a frame. A throwing
  `mutate` in `update()` discards the capture and rethrows.
- `layoutDependency`: when given and equal (`Object.is`) to its value at the participant's previous
  flush, the participant is left out of planning (it jumps, unreported).
- A scope is a namespace by itself, so the vanilla API has no `id`; the React `LayoutGroup`
  namespaces the ids of nested groups that share one scope.

### 7.2 Runtime and diagnostics

```ts
type LayoutDiagnosticCode =
  | 'capture-less-flush' | 'capture-aged' | 'measurement-unsupported' | 'unsupported-geometry' | 'handoff-scroll-active'
  | 'spring-timeout' | 'participant-cap' | 'mover-cap' | 'document-mismatch'
  | 'runtime-disabled' | 'focus-in-follower' | 'callback-error' | 'internal-error'
  | (string & Record<never, never>)   // codes may be added; existing meanings are stable

interface LayoutDiagnostic {
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

interface LayoutRuntime {
  readonly mode: 'animate' | 'snap'
  setMode(mode: 'animate' | 'snap'): void       // every explicit and implicit scope
  onDiagnostic(listener: (event: LayoutDiagnostic) => void): () => void
}
const layoutRuntime: LayoutRuntime
```

| Code | Emitted when | Action |
|---|---|---|
| `capture-less-flush` | A flush ran with no capture (§4.4) | `snap` |
| `capture-aged` | A flush consumed an aged capture, or a capture began inside a clock frame (§4.1, §4.4) | `snap` |
| `measurement-unsupported` | An engine's measurement of a driven participant is invalid (the S1 fallback, §11.4): the subtree degrades as §4.4 | `snap` |
| `unsupported-geometry` | The support check failed (§4.2) | `snap` |
| `handoff-scroll-active` | A handoff out of an active scroller (§5.8) | `enter` |
| `spring-timeout` | A spring's settle exceeds 10 s (§5.3) | `snap` |
| `participant-cap` / `mover-cap` | `maxParticipants` / `maxNodes` exceeded (§9.1) | `snap` |
| `document-mismatch` | An adopted participant was unregistered (§4.6) | `finish` |
| `runtime-disabled` | A flush's movers or a `take` met mode `'snap'` | `snap` |
| `focus-in-follower` | A crossfade was skipped for focus (§8) | `none` |
| `callback-error` | `onSnap` or a diagnostic listener threw (§9.2) | `none` |
| `internal-error` | A flush or frame aborted (§9.2) | `abort` |

- **Kill switch.** `setMode('snap')` takes effect synchronously in every scope: live tracks finish
  at identity with styles restored, holds become `invalidated`, pending reports resolve
  `'disabled'`, and later movers snap `'disabled'`. `setMode('animate')` restores normal planning
  from the next flush. An app wires it to remote config. It is distinct from reduced motion.
- **Cost.** None when nothing listens: payloads are built only for listeners. The stream works in
  production; dev builds additionally log warnings.
- **Isolation.** Listeners run after the engine's state is consistent, each inside its own `try`. A
  throwing listener is reported as `callback-error` to the *other* listeners only, never back to
  itself and never recursively, and is rethrown asynchronously in dev.
- `onSnap` keeps its API surface; its calls become isolated the same way (each inside its own
  `try`, after the engine's state is consistent). Today's direct call is not isolated; the
  isolation is a behaviour change of the safety phase (§9.2).
- The runtime is a module singleton of the installed package copy.

### 7.3 React — `@freestylejs/ani-react/layout`

```ts
useLayout<E extends HTMLElement>(options?: LayoutOptions & { ref?: Ref<E> }): RefCallback<E>
<LayoutGroup id? clock? motion? reducedMotion? threshold? maxNodes? maxParticipants? retain? onSnap? engine?>  // no DOM
useLayoutGroup(): { update(fn: () => void): Promise<LayoutReport>; finish(): void }
useLayoutDrive(): LayoutDrive        // a dispatcher (below)
<AnimatePresence initial? mode?: 'sync' | 'popLayout' | 'wait' custom? onExitComplete?>
usePresence(motion, options?): { ref, style, isPresent, custom }
usePresenceControl(options?): { isPresent, safeToRemove }
```

- A participant with no `LayoutGroup` joins an implicit root scope: one per `(clock, document)`
  pair (the participant's `ownerDocument`), created lazily and disposed when its last participant
  leaves. A portal into another document joins that document's implicit scope (§4.6).
- The outermost `LayoutGroup` owns a scope. Nested groups join it: they namespace `layoutId`s
  (`id`) and supply `motion` layers; scope options (`clock`, `reducedMotion`, `threshold`,
  `maxNodes`, `maxParticipants`, `retain`, `onSnap`, `engine`) are read from the outermost group
  only, and a nested group that sets one prints a development warning. A change of a scope option
  recreates the scope (compared by value; `onSnap` is always the latest prop).
- A participant's `motion` is merged over its groups' `motion` by the kind-level rule of §5.1 (the
  same function as the vanilla scope).
- **`useLayoutDrive()`** always returns a dispatcher. `take(el)` routes to the live scope that
  currently owns the registered element: the explicit group when it owns `el`, otherwise the
  implicit scope of `el.ownerDocument`. If no scope owns `el`, `take` throws
  `ANI_INVALID_OPTIONS`. A gesture hook accepts the dispatcher as an option.
- **Trigger contract.** A commit animates when it renders the group, an `AnimatePresence` or any
  participant of the scope. If state lives in a component that renders none of them (memoized
  children below), place the `LayoutGroup` inside that component, or wrap the change in
  `useLayoutGroup().update(fn)`. A development-only `MutationObserver` warns once per scope when
  the DOM around its participants changed with no capture. A commit whose capture aged gets
  diagnostic `capture-aged`.
- **Adapter mechanics.** A render of a participant, group or `AnimatePresence` calls `capture()` on
  its scope (only on a scope that exists), except while that scope's flush is queued: React 18 can
  start the next render in the commit's task, after the DOM changed, and that render's before-boxes
  come from the hand-off capture instead. Their layout effects queue one microtask per scope that
  calls `flush()`, followed by `capture()` when a render touched the scope after the commit's last
  layout effect (§4.1 hand-off). Participant options are compared by value (§5.7); only a change
  calls `set`. `useLayoutGroup().update(fn)` flushes a pending commit's flush first, then runs
  `capture()` → `flushSync(fn)` → `flush()`. The adapter never captures inside a rendering callback.
- **StrictMode.** React 19 replays the ref callbacks and effects of fibers it mounts *and* moves (a
  reorder). A participant's removal therefore waits until the end of the task: a re-attach of the
  same element in that task keeps its registration, its captured B and its live hold. The
  outermost group disposes its scope one microtask after its layout effect's cleanup, unless the
  effect re-ran.
- **Presence styles.** `usePresence().style` carries `motion.initial` from the first render until
  the enter has finished, so React never clears the values the enter is writing. Under
  `popLayout`, the exiting render measures the box relative to its containing block (§6) and the
  style lifts it there.
- The entry carries the `'use client'` directive in both its ESM and CJS builds (a release
  assertion).

### 7.4 Module boundaries

| Layer | Module | Owns |
|---|---|---|
| Core (pure) | `physics` | Spring closed forms, `settleTime`, `perceptual`, `decay`. |
| Pure | `geometry.ts` | Boxes, axis maps, composition and inversion, pose from box, pose inversion of measured boxes. |
| Pure | `motion.ts` | The motion union, the kind-level merge, validation, defaults, timing evaluation, the settle cap, the reduced-motion clamp and grid search. |
| Pure | `plan.ts` | Per flush: who animates, the keep test, handoff, crossfade pairs, every snap reason, status precedence. |
| Pure | `solve.ts` | Per frame: tracks (timing and spring) → drawn boxes → poses, opacities, radii, the perceptual timeline, held origins. |
| Shell | `dom.ts` | Every DOM read (rects, layout sizes, computed values, the held read), every owned-style and `inert` write and byte-exact restore, the flat-tree ancestry primitive, the dev-only ancestor classifier. |
| Shell | `scope.ts` | Registry, epochs, captures and their aging, runs, the drive state machine, `layoutKey`, document affinity, active-scroller listeners, the transactional boundary; the public `LayoutGroup`. |
| Shell | `runtime.ts` | `layoutRuntime`, the diagnostics stream and its isolation. |
| Shell | `realize/raf.ts` | The one `Animatable`. |
| Shell | `realize/waapi.ts` | The WAAPI engine's animations, sampled easing and its validation (§10). |
| Shell | `presence_link.ts` | Package-internal presence registry (§6). |
| Kept | `presence.ts`, `presence_state.ts`, `view_transition.ts`, `feature.ts`, `easing.ts` | Presence, View Transitions. |

The pure modules and `physics` import nothing from the DOM or the clock. Only `dom.ts` reads layout
and writes owned styles, and only `realize/*` realizes tracks. The React adapter calls only the
public group API, `layoutRuntime`, `mergeLayoutMotion` and `sameLayoutMotion`.

```tsx
// List reorder: mark the items, nothing else
function Item({ item }) {
  const ref = useLayout({ layout: 'position', motion: { type: 'spring', bounce: 0.15 } })
  return <li ref={ref}>{item.label}</li>
}

// Toast stack: CSS lays the list out; presence and layout share the element
function Toast({ toast }) {
  const presence = usePresence(toastMotion)
  const ref = useLayout({ layout: 'position', ref: presence.ref })
  return <li ref={ref} style={presence.style}>{toast.text}</li>
}
```

## 8. Accessibility contract

- Layout never changes DOM order, never moves focus, and never owns `tabindex`, roles or ARIA. A
  keyed reorder or a held re-render keeps the same element and `document.activeElement` throughout
  the motion.
- **Crossfade followers.** An exiting crossfade follower is `inert` for its exit (§5.8, §6), so no
  duplicate interactive or accessible target exists during a shared crossfade. If focus is inside
  the follower (flat-tree containment of `document.activeElement`, through shadow roots) when the
  exit starts, the crossfade is skipped for that pair (the lead appears at A, the follower exits
  under presence alone) and diagnostic `focus-in-follower` is emitted. The author moves focus.
- **Gestures.** The gesture layer must offer keyboard operation through the same port (take,
  stepwise move, cancel, release), with announcements as component patterns. The held phase is
  direct manipulation (§5.10).
- **Reduced motion:** §9.4.

## 9. Safety

### 9.1 Degradation table (normative)

| Condition | Detection | Outcome | Report |
|---|---|---|---|
| No valid before-box (no capture, an aged capture) | flush; frame marker (§4.1) | §4.4 | `'stale'`; `capture-less-flush` / `capture-aged` |
| Both boxes outside the viewport ± 10 % (the union of B and A) | plan | that node jumps, uncounted toward `maxNodes`; under a moving ancestor it is still counter-projected | `'culled'` (silent) |
| Visible movers exceed `maxNodes` | plan | the whole flush snaps | status `'capped'`; `mover-cap` |
| Connected participants exceed `maxParticipants` | count, before any read | capture and flush read nothing; the whole flush snaps | status `'capped'`; `participant-cap` |
| A map the engine does not own on a participant (box-changing rotation or skew, 3D, `zoom`) | support check (§4.2) | that subtree snaps to A | `'unsupported'`; `unsupported-geometry` |
| Rotate, skew or a non-translation transform in computed values, an unparseable transform or authored value, a CSS transition or animation on `translate`/`scale` (§6), zero size, `display: contents`/`inline`, a size change beyond 50× | computed-value classifier on active nodes | that subtree snaps | `'unsupported'` |
| Spring settle > 10 s | plan | the node snaps | `'unsupported'`; `spring-timeout` |
| Non-finite or out-of-range options | validation | throws before any state change | `ANI_INVALID_OPTIONS` |
| Shared handoff out of an active scroller | §5.8 | presence enter at A | `handoff-scroll-active` |
| Focus inside a crossfade follower | §8 | no crossfade for the pair | `focus-in-follower` |
| Detach, `ownerDocument` change, `layoutKey` change | lifecycle checks at the flush | track ends, styles restored, hold invalidated | the run resolves `'disposed'` when only such nodes were in it; `document-mismatch` for adoption |
| `dispose()` or unmount | — | tracks cancelled, styles restored, presence holds released, holds invalidated, listeners and markers released | status `'disposed'` |
| Reduced motion | at plan and at release | per policy (§9.4); an active hold stays direct | `'reduced'` |
| Kill switch on | `layoutRuntime.mode` | §7.2 | status and reason `'disabled'`; `runtime-disabled` |
| Internal exception during a flush or frame | transactional boundary (§9.2) | abort: restore, release, resolve | status `'failed'`; `internal-error` |
| A user callback throws (`onSnap`, a diagnostic listener) | isolation (§9.2) | ignored after the engine's state is consistent | `callback-error`; rethrown asynchronously in dev |
| No DOM (SSR), first client commit | — | no-op; hydration never animates | — |

Snapped nodes are listed in `report.snapped` and passed to `onSnap`. A development warning is
printed once per scope for `'unsupported'`, `'capped'` and `'stale'` (actionable); `'culled'` and
`'reduced'` are normal operation and stay silent. Reduced motion is read from the scope's clock at
every flush.

### 9.2 Transactions

`flush()` and every frame callback run inside one idempotent boundary. On an exception it:

1. restores every owned declaration and the `inert` attribute byte-identically and cancels WAAPI
   animations;
2. clears pending writes, invalidates holds, releases presence holds, disarms the frame marker;
3. disarms listeners and stops the realizer when nothing runs;
4. resolves every affected report with `'failed'` (each affected node in `snapped` with
   `'failed'`);
5. reports the error through the diagnostics stream (`internal-error`).

`flush()` keeps its contract: it never rejects. User callbacks run after the engine's state is
consistent, each inside its own `try`; a throwing callback cannot change engine state.

### 9.3 Status precedence

`status` describes the run's lifecycle and `snapped` describes per-node degradation. One run
resolves to the first status that applies, in this order: `'failed'`, `'disposed'`, `'disabled'`,
`'capped'`, `'interrupted'`, `'ended'`, `'reduced'`, `'stale'`, `'no-change'`. `'reduced'`,
`'stale'` and `'no-change'` apply only when no track ran. A mixed run (some nodes animate, some
snap) resolves by its tracks, and lists the snapped nodes with their reasons.

### 9.4 Reduced motion

| Policy | Automatic motion | Release of a hold |
|---|---|---|
| `'jump'` (default) | No tracks; active tracks finish at once; no clock subscription | Lands at A with no motion |
| `{ maxDuration }` | Timing: delay and duration scaled down to fit. Spring: bounce clamped to ≤ 0; the largest factor `f` of the grid `{1, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2, 0.1}` with `delay·f + T_s(D·f, x₀, v₀) ≤ maxDuration`, each candidate evaluated exactly; if none fits, the same search with `v₀ = 0`; if still none, the node jumps (`'reduced'`). At most 16 evaluations per track, deterministic, no monotonicity assumed | The same clamp |
| `'ignore'` | Plays in full | Full motion |

A held phase is never affected. A mode toggled during a run applies at the next flush to running
tracks: `'jump'` finishes them; `maxDuration` re-plans them clamped from their presented box,
carrying velocity under `'raf'` and starting at rest under WAAPI. A crossfade finished by `'jump'`
ends as a completed fade: the lead gets its opacity back, and the exiting follower is held at
opacity 0 (and `inert`) until presence unmounts it.

## 10. WAAPI engine (`engine: 'waapi'`)

An explicit group option, for flat moves that must stay smooth while the main thread is blocked.
Same plan, realized with `Element.animate()` (`realize/waapi.ts`):

- **Shape.** Top-level `layout: 'position'` participants only, with a timing motion, without
  `layoutAnchor`, `layoutId` or `radius: true`; an effective spring motion (on `add`/`set`, or the
  group's own `motion`), a nested participant, or `take` throws `ANI_INVALID_OPTIONS`, never
  degrades. A nesting that appears later in the DOM snaps `'unsupported'`. There is no velocity
  term: a retarget starts from the presented box at rest.
- **Realization.** Each track is one `translate` animation from its start pose to the authored
  translate, with the track's curve sampled into a CSS `linear()` easing (stops chosen so a move is
  drawn within 0.05 px), its delay and `fill: 'backwards'`. Without CSS `linear()` support the
  element snaps `'unsupported'`. The animation is created in the flush and held at τ = 0, then
  played from the next animation frame without a `startTime`: the first painted frame is τ = 0 in
  every browser. It writes no inline style; settle, `finish`, `dispose`, removal, the kill switch,
  an abort and reduced motion cancel the animation.
- **Measurement.** B is measured by the capture exactly as with `'raf'` (the rect includes the
  animation's current value). A track's elapsed time is its animation's `currentTime`.
- **Time.** The animations run on the document timeline, not on the Ani clock: they do not follow
  its time scale; reduced motion is still read from the clock at each flush. Under main-thread jank
  the compositor may have drawn ahead of the main thread's value, so a retarget can step back by
  the frames the main thread missed.
- **Gates.** (1) RAF-vs-WAAPI differential ≤ 0.5 px per frame (`waapi:W1`); (2) the first painted
  frame after a 120 ms block ≤ 6 % (`waapi:W3`); (3) a Chromium trace shows compositor frames
  drawing during a 120 ms block, where the RAF engine draws none (`pnpm test:waapi-trace`).

## 11. Acceptance

A row passes only when every frame of a real browser run matches an oracle that shares no code with
the solver or `physics`. Final rects and no-crash tests count for nothing. Every row of §11.2
**fails on the 0.2.0 engine** for the defect it targets (or is new surface).

### 11.1 Oracle and layers

- **Oracle:** at elapsed time t, every node's visual rect (`getBoundingClientRect`, view space)
  equals its own track (closed-form timing or spring, its anchor rule applied) in the view space of
  the frame, that is, translated by the camera motion presented since its flush. When a presence
  `transform` on the node or an ancestor animates during the run, the expected rect is that track
  with the change of those inner maps applied, which the test sets and knows.
- **Pure layers:** property tests on `solve`, `plan`, `motion` and core `physics` (random trees to
  depth 5; every kind and bounce; within 1e-9 against the independent oracle).
- **Browser layers:** deterministic tests on a manual clock in Chromium, Firefox and WebKit (0.5 px
  per frame), plus real-clock tests (jank, read counts, frame cost).
- **Coverage:** the pure modules count in the jsdom coverage of `pnpm test:ci`; the DOM engine
  (`scope.ts`, `dom.ts`, `runtime.ts`, `realize/*`) is covered by the V8 coverage of every Chromium
  case page, mapped to the sources and gated by `pnpm test:browser --coverage`.

### 11.2 Rows (Chromium, Firefox, WebKit, manual clock)

| Row | Frame-level assertion |
|---|---|
| E1 Layout Anchor | Child centre on parent centre ≤ 0.5 px every frame; child stays 70 px until 0.8 s; child starts at 0.8 s ± one frame |
| E2 Create Button | Shared-pair source-over coverage ≥ 0.99 every frame; label glyph height constant ± 1 px; close and reopen at 100 ms and 500 ms |
| E3 iOS Folder | Four shared tiles first and final rects; tile scale 0.2 ± 0.02; stagger ± one frame; reopen at 500 ms; the shared surface starts on the departing surface's box; stacking of shared pairs; staggered items keep their aspect; on-screen radii within their authored ends |
| E4 App Store | Card, image and title nested ids; no gap > 0.5 px in image coverage; title size pinned; close and reopen |
| E5 Notifications | First frame equals the enter transform; siblings final at t = 0 under popLayout; exit ≈ 0.2 s; bottom edge ± 1 px under scaleX; five adds 80 ms apart |
| Reduced 2D Gallery | 16 tiles grid ↔ list, plus a detail view with a shared id; on-screen radii within their authored ends every frame |
| L-MEAS-1 chat delete under anchoring (page and panel) | No visible message moves > 0.5 px at any frame |
| L-MEAS-2 kanban: card moved, column auto-scrolls in the layout effect | All participants start at their presented boxes; land on A |
| L-MEAS-3 accordion + instant `scrollIntoView` | Participants start where seen; non-participants follow the scroll; exact settle |
| L-MEAS-4 user scroll mid-run (inner and page, under a scaling parent), then a commit | Drawn boxes follow content every frame; the commit continues position and velocity. Under a parent at a live scale (0.5 and 2) the child takes §5.7 path 3 (first frame = measured B ≤ 0.5 px, velocity continuous); with the parent at rest it takes path 2 (no restart) |
| L-MEAS-5 React 18.3 and 19: time-sliced render scrolled between chunks (a) with a participant in the committing slice, (b) without; a transition interrupted by an urgent update; Suspense fallback then reveal while scrolled; two commits coalesced | (a) first frame = last presented within 0.5 px; (b) §4.4 outcome with `capture-aged`; never a wrong first frame |
| L-MEAS-6 sticky engages mid-run: (a) no later commit, (b) a later commit | (a) final frame exact, no snap; (b) continuity |
| L-MEAS-7 browser layout change mid-run (an image above loads), then a commit; flat and nested (a child under a scaling parent) | Continuity ≤ 0.5 px every frame; the §5.7 path taken is the one its ancestor condition selects |
| L-MEAS-8 fixed sheet with nested participants while the page scrolls | No motion from the page scroll; inner layout animates |
| L-MEAS-9 nested driven parent and child: (a) fresh capture mid-run, (b) a frame advanced past the capture | (a) no shear, exact `(B, v)`; (b) aged, §4.4 outcome, no rewind |
| L-MEAS-10 participant in an open and a closed shadow root inside an outer scroller | As L-MEAS-4 |
| L-MEAS-11 capture-less flush; vanilla capture with an async gap (aged); undriven moved, undriven unmoved, newly registered, driven with `|δ|` above and below `threshold` | §4.4 outcomes; `status`, `report.snapped`, the `onSnap` calls and the diagnostic count agree exactly with the §4.4 rule |
| L-MEAS-12 author rotation: (a) box-changing rotation added mid-run, (b) present at capture and removed by the commit, (c) a 180° rotation removed by the commit | (a), (b) subtree snaps `'unsupported'`; (c) the box moves exactly |
| L-MEAS-13 an earlier rAF callback moves an ancestor; a later callback calls `update()` (via Ani's clock) | Aged at once, §4.4, never the intermediate box as B |
| L-HAND-1 list item → fixed detail and back (in a scroller) | Shared handoff; coverage 1 at every frame |
| L-HAND-2 handoff while the source scroller is active; after `scrollend` | Presence enter and diagnostic; then a normal flight |
| L-SPRING-1 channels, b ∈ {−0.8, −0.3, 0, 0.2, 0.4, 0.9}, 60/120 Hz | `c(0) = B`, `c′(0) = v`, settle within ε, against the oracle |
| L-SPRING-2 crossfade, radius and presence release on a spring lead | Coverage 1; fade, blend and release end at `t = D` |
| L-SPRING-3 merge, validation, WAAPI rejection, settle cap | Union semantics; throws before any state change |
| L-SPRING-4 reduced motion `{ maxDuration }` | Grid search property over the domain; never exceeds `maxDuration` |
| L-DRIVE-1 take, move, reorder, release; snap-back; cancel | Pointer offset constant under reorder (≤ 0.5 px); `c′(0) = v` exactly; first release update `dt = 0` |
| L-DRIVE-2 catch a moving card | Analytic velocity; no jump; size keeps its track |
| L-DRIVE-6 descendants: parent spring 0.5 s with a child timing 0.1 s, a `layout: 'size'` child, a child already moving at take; take, move, release | Every descendant drawn at residual + `h` (≤ 0.5 px every frame); child-to-parent geometry follows the residual only; release velocity counted once (descendant velocity = residual + `ḣ`) |
| L-DRIVE-3 scroll while held, under a parent scaling 1 → 2 | Held element under `H` ≤ 0.5 px every frame |
| L-DRIVE-4 state machine: stale calls, non-finite input, two scopes, ancestor holds, unmount, StrictMode replay, dispose mid-hold | Per §5.10 |
| L-DRIVE-5 reduced motion on at take, toggled while held, three policies at release | Per §5.10 and §9.4 |
| L-OPS-1 kill switch mid-run and mid-hold, explicit and implicit scopes | Per §7.2 |
| L-OPS-2 injected exceptions (measure, write, `animate`, `onSnap`, diagnostic listener) | `'failed'`; styles byte-identical; no listener or subscription left |
| L-KEY-1 recycled node with a `layoutKey` change under scroll | Fresh baseline, no interpolation |
| L-DOC-1 cross-document `add`; adoption; React portal into an iframe | Throw; invalidation; per-document scope |
| L-A11Y-1 reorder and hold with focus inside; crossfade follower | `activeElement` stable; follower `inert`; focus-in-follower rule |

Regression tests: late start after a 120 ms block (≤ 6 %), unrelated re-render (identical
trajectory), crossfade only on a real handoff with no opacity pop and coverage preserved (including
reversal and nested shared ids), shared-handoff radius blending with identical silhouettes (live and
retained, `%` and elliptical corners, no blend when one side opts out, continuous retarget and
reversal), RAF velocity ≤ 5 % across a retarget under jank, reduced motion (zero writes, zero
subscribers, mid-run toggle), showcase honesty, fractional boxes under scale within 0.05 px in every
engine (`layout:REFBOX`). The Motion-parity examples (`showcase` module) are checked every frame on
the oracle from rest, and through mid-flight changes on a chain of oracle tracks that carries each
track's velocity.

### 11.3 Fuzz and mutation

**Model-based fuzzing.** A pure model of the scope's lifecycle generates seeded event sequences:
capture, frame markers, flush, presented and unpresented scroll, browser layout change, detach and
re-add, document change, `layoutKey` change, take, move, release, cancel, reduced-motion toggles,
the kill switch, visibility changes and injected exceptions. Properties: no NaN; B equals the box
of a capture read in the flush's rendering interval, or the node is reported snapped; no read after
the first write in a batch; one writer per property; every listener, marker and subscription is
released when idle; every handle reaches a terminal state; every report resolves; styles and
`inert` restore byte-identically.

**Mutation tests**, each of which must fail a named row: consume an aged capture; skip the frame
marker; use the predicted box instead of the measured one; drop the layout-size check; ignore
`scrollend`; skip cleanup on abort; release with `dt ≠ 0`; merge motion field by field.

### 11.4 Spikes and their shipped fallbacks

| Spike | Must show (three engines) | Fallback that ships if it fails |
|---|---|---|
| S1 measurement | (a) A capture of a driven node equals its presented box (0.01 px), WAAPI-driven boxes included. (b) The interval support check (§4.2) has no false positive at DPR 1, 2 and 3, fractional parent and child sizes (50.49 px parent, 1000 px child), total scales 0.1, 1 and 10, and pinch zoom. (c) The aging frequency in the showcase rows, React 18.3 and 19 | (a) On that engine a driven participant's measurement is invalid: its subtree degrades as §4.4 (`'stale'`, `measurement-unsupported`) and a shared handoff involving it becomes a presence enter; an analytic box never substitutes for B. (b) Widen `|W − O|` to the measured rounding bound. (c) Change the adapter docs and the row |
| S2 anchoring | The correction is applied before the flush's first rect read; layout's writes neither suppress nor alter anchoring | Read one scroll offset per anchoring candidate container before the first rect; if still not exact, an unpresented anchoring correction behaves as a capture-less flush for that subtree |
| S3 React | Every L-MEAS-5 sequence in 18.3 and 19 gives a fresh capture or a reported aged one | None needed: aging is the conservative path |
| S4 held read | A per-frame rect read before writes is exact and costs ≤ 0.1 ms per held element | None needed: an inexact read only adds the bound of §5.10 |
| S5 `scrollend` | Fires after momentum and smooth scroll | §5.8's conservative rule |

Each spike's outcome is recorded in the evidence trace.

### 11.5 Bench harness and cost gates (D5)

The device gate is a **bench harness** of iOS-native-grade interaction scenes that runs under
Playwright in Chromium and WebKit. Each scene is scored frame by frame on the manual clock (oracle
error, first-frame continuity, velocity continuity, spring fidelity, settle exactness, inline-style
restoration) and on the real clock (script cost per frame and per commit, long frames). A scene
passes only with every metric inside its gate in both engines. The harness runs in iterations until
every scene passes; the iteration log is evidence.

Cost gates, measured by the harness:

- Commit (capture + flush) ≤ 4 ms at 1,000 participants, unscrolled and scrolled.
- Steady frame p95 ≤ 2 ms at 300 nested movers.
- Sustained commits: 60 Hz commits with 300 moving participants hold the steady-frame gate.
- Held frame: ≤ 0.1 ms per held element.
- Read counts are exact: a commit reads ≤ 2N rects and 2N layout-size pairs, plus the computed
  values of §4.1 and §4.3; steady frames read zero; `stats` counts every read.

**Reference environment.** The cost gates are decided on one pinned environment, and every bench
report records its fingerprint:

| Item | Pinned value |
|---|---|
| Image | Ubuntu 24.04.5 LTS, x86-64, kernel 6.18.44 (the project's Claude Code cloud container image) |
| CPU and memory | 4 vCPU, `model name` "Intel(R) Xeon(R) Processor @ 2.80GHz", 16 GB, no CPU quota below 4 |
| Runtime | Node 22.22.0, Playwright 1.55.0 |
| Browsers | `chromium_headless_shell-1187` (Chromium), `webkit-2203` (WebKit), headless |
| Load | 1-minute load average below 1.0 at start; no other browser or build running |

The fingerprint is the `/etc/os-release` `PRETTY_NAME`, `uname -r`, the CPU `model name` and count
from `/proc/cpuinfo`, `MemTotal`, `node --version`, the Playwright version and the browser build
directories. A report whose fingerprint differs anywhere is **advisory** for the cost gates (its
frame-scoring gates still decide); only a matching report decides a cost gate.

**Measurement.** The bench page is served cross-origin isolated (COOP `same-origin`, COEP
`require-corp`) and measures script cost with `performance.now()` around the engine's own work: a
commit is `capture()` start to `flush()` return; a frame is the clock's `update` and `commit`
phases. Each run first measures the timer granularity `g` (the smallest non-zero difference over
1,000 consecutive reads). When `g ≤ 0.05 ms`, a frame sample is one frame; otherwise a sample is the
mean of 20 consecutive frames timed as one interval. Percentiles are nearest-rank.

| Gate | Per-run statistic |
|---|---|
| Commit ≤ 4 ms (1,000 participants; unscrolled, and scrolled by 1.5 viewports) | median of 30 commits, after 5 commits discarded |
| Steady frame p95 ≤ 2 ms (300 nested movers) | p95 of 600 frame samples |
| Sustained commits (60 Hz commits, 300 moving participants, 5 s) | p95 of every frame sample in the window ≤ 2 ms |
| Held frame ≤ 0.1 ms per held element (1 and 10 held) | p95 of 600 frame samples, divided by the held count |

**Aggregation.** Per engine, one warm-up run is discarded, then 5 runs are measured, each in a fresh
browser process. A gate's value is the median of the 5 per-run statistics, and it passes only when
that value meets the gate in both engines. The report lists every per-run statistic, the medians,
`g` and the fingerprint, so an independent runner on the pinned environment reaches the same
pass/fail with no parameter left to choose.

## 12. Accepted risks and documented platform bounds

- **Compositor lag.** During asynchronous scrolling the main thread can trail the screen by up to
  one frame. It is uniform inside the scrolled layer (no visible effect); across layers it is
  handled by §5.8 for handoffs and bounded per frame for held elements (§5.10).
- **Fixed descendants of posed participants** are re-contained (§4.6).
- **Captures from third-party rendering callbacks** are outside the contract (§4.1).
- **Aged captures** do not animate undriven participants; this is reported, and the fix is
  documented (§4.1, §4.4).
- **Bounding-box-preserving author rotations** removed by a commit are not detected; the box motion
  stays exact (§4.2).
- **Spring runs** last until settle (1.67 D in the example); perceived completion uses `p(t)` and
  ends at D; the promise resolves at settle (§5.3).
- Nested layout motion is not compositor-smooth while the main thread is blocked.
- The WAAPI engine reads a retarget's B on the main thread; under jank the compositor may have drawn
  ahead of it. It does not follow the Ani clock's time scale.
- Render-phase reads bend React's purity norm (reads only) and can force a layout during render when
  the DOM is dirty.
- A state change that renders no participant, group or `AnimatePresence` does not animate
  (documented, development warning).
- The timing kind's velocity term is a continuity device, not spring physics; the spring kind is.
- Text under scale re-rasterizes and can look soft mid-flight.
- An authored `translate`/`scale` change during a run applies after settle (one jump at the settle,
  from the frozen composition to the author's value).
- A presence `transform` that animates during a layout run is a visual layer on top of the tracks of
  its element and its participant descendants (§3.2).
- A size channel whose carried velocity would take it below one pixel loses that part of the
  velocity (§5.2).

## 13. Sources

- HTML, update the rendering: https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering
- CSS Scroll Anchoring 1: https://www.w3.org/TR/css-scroll-anchoring-1/
- CSSOM View (`getBoundingClientRect`, scroll events, `scrollend`): https://drafts.csswg.org/cssom-view/
- CSS Viewport (visual viewport scale): https://drafts.csswg.org/css-viewport/
- CSS Positioned Layout (sticky): https://drafts.csswg.org/css-position/
- CSS Transforms 2 (individual transforms, containing blocks): https://drafts.csswg.org/css-transforms-2/
- HTML `inert`: https://html.spec.whatwg.org/multipage/interaction.html#the-inert-attribute
- Pointer Events 4: https://www.w3.org/TR/pointerevents4/
- WCAG 2.2, animation from interactions; focus order: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions , https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html
- Apple, WWDC23 *Animate with springs*: https://developer.apple.com/videos/play/wwdc2023/10158/
- React: `startTransition`, `useLayoutEffect`, `'use client'`: https://react.dev/reference/react/startTransition , https://react.dev/reference/react/useLayoutEffect , https://react.dev/reference/rsc/use-client
- Motion layout animations: https://motion.dev/docs/react-layout-animations
- Playwright browsers (WebKit is not branded Safari): https://playwright.dev/docs/browsers
