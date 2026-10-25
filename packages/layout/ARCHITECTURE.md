# ANI Layout — Architecture

**Status:** authority for `@freestylejs/ani-layout` and `@freestylejs/ani-react/layout` (0.2.0).
**Source decision:** *ANI Layout — Final Architecture* (APPROVE, 2026-10-23), with the
two open questions closed on 2026-10-23: the default `layout` is `true`, and stateful
timings (`dynamicSpring`) are rejected. This file replaces the 0.1.0 tiered FLIP
contract and the Compiled Projection Core (CPC); neither applies any more.

Execution plan and evidence: `.trace/ani_layout_final/`.

---

## 1. Decision

ani-layout is **one pure layout solver on Ani's own clock**.

At each commit it learns where every marked box *was drawn* (B) and where layout
*put it* (A). On every frame it re-solves every animating box top-down, parent before
child, and writes only `translate` and `scale` (plus `opacity` for a crossfade pair and
`border-radius` when asked).

- **Exact by construction.** Nesting at any depth, `layoutAnchor`, shared `layoutId` and
  crossfade are one equation per node. No keyframe sampling, no error budget, no depth
  limit.
- **Ani's moat.** Reads happen once per commit and never interleave with writes. Steady
  frames do zero DOM reads. The scope is one `Animatable` on the core clock, so it
  shares frame time, time scale, reduced motion and ownership with every other Ani
  animation.
- **Declarative.** In React you mark an element with `useLayout()`. It animates whenever
  its box changes across a commit. No `deps`, no capture or play calls.
- **Snap, never wrong motion.** Anything the solver cannot do exactly jumps to the real
  layout and is reported with a typed reason.

Presence and View Transitions stay. Jank resilience (compositor-only motion while the
main thread is blocked) is not promised for layout; it exists only as the optional,
gated WAAPI engine of §10.

## 2. Constraints

- Core V2's public API does not change. Layout uses only Core's public exports: the
  clock (`Animatable { read?, update(dt), commit? }`, `Clock`, `defaultClock`), timing
  functions, `createAniError`, `DEV`, and the reduced-motion policy type.
- Dependency direction: `ani-layout → ani-core`; `ani-react/layout → ani-layout + ani-core`.
  Core knows nothing of layout.
- The vanilla API must not block later Vue, Svelte and Solid adapters: an adapter only
  needs `add`, `set`, `capture` and `flush`.
- Out of scope: 3D, drag-coupled layout, loop/snap, `layoutScroll`/`layoutRoot`, arc paths,
  shadow correction, SVG and inline layout, rotation/skew projection.

## 3. Model

The real DOM after a commit is the only layout truth. The engine never decides where
anything ends; it only animates the visual difference back to that truth.

### 3.1 Spaces and maps

All boxes are **page boxes**: viewport rect plus page scroll, so page scrolling between
two measurements cancels out. Every axis is independent, and every map is an
axis-aligned affine map `x ↦ k·x + b` per axis.

For a participant `n`:

| Name | Meaning |
|---|---|
| **Local frame** | The coordinates the element's own transforms act in: its parent participant's frame before that parent's transforms (the page for a top-level participant; non-participant ancestors may only translate, §6). |
| **CSS box Lₙ, origin Oₙ** | The element's border box and its `transform-origin` point, in the local frame. |
| **Inner map Qₙ** | The element's own authored `translate`/`scale` and its inline `transform` (presence), about `Oₙ`. Not owned by layout; frozen at the flush. |
| **Box Xₙ = Qₙ(Lₙ)** | What layout's pose moves, in the local frame. |
| **Pose Pₙ** | Layout's own `(t, s)` per axis, about `Oₙ`. Owned by layout. |
| **Full map Mₙ** | `Mₙ = Mπ ∘ Pₙ ∘ Qₙ`, where `Mπ` is the parent participant's full map (identity for a top-level participant). |
| **Visual box** | `Mₙ(Lₙ)`: what the user sees, in page coordinates. |

CSS composes `translate · rotate · scale · transform`. Layout writes the *outer* map
(`translate = t + s·authoredTranslate`, `scale = s·authoredScale`) and presence's
`transform` stays inside, so `Pₙ ∘ Qₙ` is exactly what the browser applies.

**Track space is the visual space.** Every track runs between two visual boxes — what the
user saw before the change and what they will see at rest after it:

- **B** is the visual box at capture, measured as it is (the rect, nothing divided out), or
  the engine's own drawn box for a node it drives.
- **A** is the visual box at rest: the rect at the flush with only the poses the engine last
  wrote divided out, outermost first (`Mπ` and `Pₙ` as last written). Inner maps stay in, so
  no owned style is touched before a read.
- **Projection** draws the track's box `V(t)` exactly: `Pₙ` solves `Pₙ(Xₙ) = Mπ⁻¹(V)` with
  `Mπ` the parent's *full* map — its frozen inner map and its current pose (§5.3).

At the end of a run `V = A` for every node, so every pose is the identity: the settle is
exact even if an inner map changed during the run.

**Inner maps that change during a run.** An authored `translate`/`scale` change applies after
settle (§6). A presence `transform` that animates during the run is a visual layer: the
browser applies the current matrix where the projection assumed the flush-time one, to the
element and to everything inside it, exactly as to non-participant children. It ends with the
presence motion and never leaves a pose behind.

A track lives in the visual space of the flush that planned it: its B and A were measured
through the presence matrices of that flush, so `Mπ` composes the ancestors' poses with their
inner maps *as of that flush*, and only a change since then is a layer over it. Each node
records its participant ancestors' matrices when it is planned; a node planned later than a
kept ancestor (a child retargeted under a parent whose layer changed) composes that
ancestor with the newer matrix, while the ancestor's own track keeps its older one. A kept
track (and a continuing crossfade follower, §5.6) keeps those matrices, its own and its
ancestors', but not its CSS box: `Lₙ` and `Oₙ`
are read again at every flush, so a parent that moved a node's CSS box without moving its A
in the track's space leaves the track exactly where it was.

### 3.2 Data

| Data | Owner | Lifetime |
|---|---|---|
| Before box B per participant | Scope (capture) | One epoch |
| After box A per participant | Scope (flush) | One flush |
| Track per animating node: B, A, delay, duration, timing, velocity seed, start | Engine | Until it settles or is replaced |
| Pose per node per frame | Solver output | One frame |
| Registry: element → options; `layoutId` → lead and exiting follower; retained boxes | Scope | Until removal (+ `retain`) |
| Presence state: present / entering / exiting / exited | Presence handle | Until exit settles |

### 3.3 Invariants

1. The first painted frame after a change shows the previous drawn box (no flash, no late
   start).
2. The final frame is the real layout: identity pose, inline styles byte-identical to before
   the run, no clock subscription left.
3. One owner per CSS property on a participant (§6).
4. Interruption is continuous in position and velocity (§5.1 states the single physical
   limit: a size channel never drops below one pixel).
5. A node whose target did not move is never retargeted: an unrelated re-render cannot
   restart anything.
6. Anything the solver cannot do exactly snaps, with a typed reason.

## 4. Commit and frame model

Each commit costs one batched read before the mutation and one after. The capture batch
reads every undriven participant's rect and, after all rects, one computed style for each
undriven participant with a `layoutId` and radius on (§5.7); the flush batch is unchanged.
Every animation frame after that is arithmetic plus writes, inside the clock's `update` and
`commit` phases.

The one write-then-read of the engine is a capability probe, once per document when a scope
is created (outside every flush and frame): whether the browser applies a percentage
`transform-origin` to the border box snapped to device pixels (§5.3). A participant from a
document no scope was created for is probed at its first flush.

### 4.1 Capture (B)

`capture()` reads every registered participant of the scope that the engine does not
drive: `getBoundingClientRect`, page scroll, and the scroll position of each participant's
scroll container. The rect is B as it is (§3.1). After every rect is read, each such
participant with a `layoutId` and radius on gets one computed-style read; its four
corner radii are resolved against its CSS border box at B and stored as B's radius. A participant
without a `layoutId`, or with `radius: false`, adds no capture style read. Driven nodes are
not read: their drawn box and drawn radius are known exactly.

**Lifetime.** A scope has at most one capture. It belongs to the open epoch, which `flush()`
closes:

| Event | Effect |
|---|---|
| `capture()` with no capture | Read; the capture is stamped with the current task. |
| `capture()` in the task that took the capture | Reuse (StrictMode's second render, every further participant render of that pass). |
| `capture()` in a later task | Read again (refresh), restamp. |
| `flush()` | Consume the capture (if any) and close the epoch. |

The task stamp expires at the end of the task that took it (a microtask queued by the
capture), so every render pass that starts in a later task — a time-sliced render's next
chunk, a render restarted after another commit pre-empted it, a later update after an
abandoned render — re-reads the DOM it is about to change. A commit consumes a capture it did
not refresh only when its render's touches all happened in an earlier task; React restarts
any render of a root that another commit of the same root pre-empts, so no commit of that
root can lie between such a capture and its consumer. Mutations from outside React or from
another root are outside the trigger contract (§7.2).

**Hand-off.** React's scheduler can run a commit and the start of the next render in one task,
so the flush microtask runs after that render has already touched (and reused) the capture the
flush consumes. The React adapter sees layout effects, so it knows when a participant rendered
after the commit's last layout effect. In that case it calls `capture()` right after
`flush()`, in the same microtask. That read sees every node the engine does not drive at its
after-box A, which is the before-box of the render in progress. The scope needs no hidden hook,
and the extra read happens only in this interleaving.

In React, the first render of a `useLayout` participant, a `LayoutGroup` or an
`AnimatePresence` in an epoch calls `capture()`. React has not mutated the DOM yet, so this
is the true before-box, not a remembered one.

### 4.2 Flush (A, plan, t = 0 pose)

`flush()` consumes the capture synchronously, reads before it writes:

1. Read A for every participant (one layout): the rect, and for active nodes the inline
   `transform` and the computed `translate`/`scale`/`rotate`/`transform-origin`/corner
   radii, which give `Lₙ`, `Oₙ` and `Qₙ` (frozen for the run); where the browser snaps the
   reference box, also the Typed OM value of `transform-origin` (§5.3). Only the poses the engine
   last wrote are divided out (§3.1); nothing is restored or stripped first.
2. Plan (§5) — pure.
3. Write the pose of every engine node at its current time (the t = 0 pose of a new track
   reproduces B), then subscribe the scope's `Animatable` if any track exists.

In React, a layout effect of every participant, group and `AnimatePresence` queues **one**
microtask per scope and commit that calls `flush()`. It runs after every layout effect
(presence has lifted its `popLayout` exits by then) and before paint. Several commits
before one flush coalesce: B from the first capture, A from the last commit.

**B at flush:** the engine's current drawn box for a node it drives (or drove since the
capture: its settled box), otherwise the captured box. An animation frame between capture and
flush is therefore compensated exactly instead of invalidating the epoch.

**Stale:** an inner scroll container that moved between capture and flush makes the epoch
stale; it snaps with `'stale'` and never guesses.

### 4.3 Frames

- A track **from rest** starts its time at its first clock update, whose `dt` is forced to 0:
  its first painted frame is B, and a 120 ms block after the commit costs one late frame, not
  120 ms of progress.
- A track planned for a node **moving** at the flush (a retarget, a reduced-motion re-plan, or
  a handoff from a moving node, all carrying a velocity) continues the time of the last
  painted frame: its B and velocity are the drawn box and velocity of that frame, so its first
  update advances by the frame's `dt` like every running track. Holding that frame would stall
  the motion for one frame at every retarget (amended 2026-10-24 after the comparison with
  Motion, approved by the user). A drive that no frame has drawn yet (two flushes in one frame)
  is still at rest. A crossfade's timeline starts with its lead's.
- After that, tracks advance by the clock's `dt` (lag-smoothed, time-scaled), exactly like
  every other Ani animation.
- The read phase is unused; `update` solves; `commit` writes only declarations whose value
  changed. Every restore (a settle, a lead giving back its opacity) is queued in `update` and
  written in `commit`; in a flush, every restore is written after the last read.
- A node settles when its own track ended and no ancestor still animates: its saved inline
  declarations are restored byte for byte (with the author's latest inline values, §6). The
  scope unsubscribes after the commit of the frame in which no track is left.

## 5. Solver

### 5.1 Track

Each node animates four channels: the **origin point** (the box point under its
`transform-origin`, kept as a fraction of the box) and the size. Interpolating the origin
point matches Motion, whose layout origin defaults to the centre.

With `τ = (elapsed − delay) / duration`, `D` the duration and `e` the timing curve:

```
c(τ) = A + (B − A)·(1 − e(τ)) + k·τ·(1 − τ)²,   k = v·D + (B − A)·e′(0)
```

- `c(0) = B` and `c(1) = A` for every timing.
- `k` carries the incoming velocity `v` of a node that is **moving** at the flush (a retarget,
  or a handoff from a moving node): `v` is the old track's analytic velocity at that instant,
  and `dc/dτ(0) = −(B − A)·e′(0) + k = v·D`, so `c′(0) = v` exactly. A node **at rest** has no
  incoming motion: `k = 0` and its path is exactly the timing curve (with `v = 0` the formula
  would force a zero start velocity and turn every ease-out into an ease-in-out). Core's
  `timing.spring` ignores a passed velocity, so this term is the only way to keep velocity
  continuous. `k` is not clamped: the bump `k·τ·(1 − τ)²` (at most `4|k|/27`, at τ = 1/3) is
  the carried momentum.
- **Size floor.** The one physical limit: a size channel never drops below one pixel, or below
  its smaller endpoint when that is under one pixel, since `c(0) = B` and `c(1) = A` are exact
  (the path is floored where the carried velocity or a timing overshoot would take it lower).
  `c′(0) = v` still holds; this is the only place a channel deviates from the equation.
- **Delay.** `delay` applies to a node at rest at the flush: before it, the channels hold B.
  A node that is moving at the flush (a retarget) starts its new track at once, so its
  velocity is never dropped.
- Timing must be stateless and start with a finite slope `e′(0)`. Otherwise
  `ANI_INVALID_OPTIONS` is thrown when the option is given:
  - A stateful timing (`timing.dynamicSpring`).
  - A curve that starts vertically. Examples: a bezier with `x1 = 0` and `y1 ≠ 0`, or a custom
    timing whose initial secants do not converge.
  - Reason: `k` must be finite to carry velocity.

### 5.2 Modes

| `layout` | Origin point | Size |
|---|---|---|
| `true` (default) | animates | animates |
| `'position'` | animates | pinned to A (counter-scaled under a scaling parent) |
| `'size'` | pinned to A | animates |

### 5.3 Projection

For node `n` with drawn (visual) box `V(t)`, box `X = Qₙ(Lₙ)`, origin `O` (both in the
local frame) and parent full map `Mπ` (§3.1), per axis:

```
V′ = Mπ⁻¹(V),   s = V′_w / X_w,   t = V′_x − O_x − s·(X_x − O_x),   Mₙ = Mπ ∘ Pₙ ∘ Qₙ
```

The track's origin fraction is `(O_x − L_x) / L_w`, the transform origin's place in the box
(an affine `Qₙ` keeps it). Depth is unlimited.

`O` in the projection (and in `Qₙ`, and wherever a drawn rect is divided back to `Lₙ`) is the
origin the browser *applies*. Chromium and Gecko apply the computed origin. WebKit applies an
origin's percentage to the border box snapped to device pixels, `round(L_w·dpr)/dpr`, so a
fractional box drawn at scale `s` lands `|s − 1|·δ` off (δ < 0.5/dpr px) if the computed
origin is used. Where the probe of §4 finds snapping, the percentage part of each origin axis
is read from the Typed OM computed value (`computedStyleMap()`, which keeps `%` and `calc()`;
the resolved value is px only) and applied to the snapped box. The track's origin fraction
stays the computed one: only the projection follows the browser.

`Mπ` is the parent's map in the node's own flush space (§3.1). Every full map is the map that
carries `Lₐ` onto the drawn box, so it needs no chain. Let `Ωₐ` be `a`'s full map with every
ancestor's own frozen inner map. A node whose flush saw ancestors `a` with other presence
matrices (a *layer*, `Γₐ = Qₐ⁻¹ ∘ Qₐ′`) uses `Mπ = corr ∘ Ω_parent`, where
`corr = Π Ωₐ ∘ Γₐ ∘ Ωₐ⁻¹` over its layers, root first, and `Ωₐ = corrₐ⁻¹ ∘ Mₐ`. The cost per
frame is O(N) map arithmetic, plus a constant per layer. A layer is a pair (node, ancestor)
whose presence transform changed between their two flushes, so a run without a presence
change has none.
Every participant under an animating ancestor is solved each frame (a node whose own box did
not move keeps `V = A` and is counter-projected), so nesting never distorts it.

### 5.4 Anchor

`layoutAnchor {x, y}` (0–1) replaces the origin channels with an offset:

- **Placement.** Every frame, the node's anchor point is placed on the parent participant's
  drawn anchor point, plus the offset. The parent is taken as the node's own flush space draws
  it (§3.1, §5.3), and the keep test (§5.5) compares the offset target with the parent's A in
  that same space.
- **Offset path.** The offset moves from the initial discrepancy to the final one on the node's
  own timeline. It follows the channel equation of §5.1, including its delay and its momentum
  term. A moving node's `k` carries its velocity relative to the parent's anchor point, so an
  anchored retarget keeps its visual velocity. The offset is zero when the anchor points
  coincide, as in E1.
- **When it moves.** An anchored node has moved when its size or its offset changed by at least
  `threshold`. It also moves whenever its parent moves. A running anchored track is kept only
  while its size target and offset target are unchanged.
- **Without a parent participant** the anchor is ignored: the node animates by its `layout`
  mode.

### 5.5 Interruption

A new flush while tracks run never reads animated state. B for a driven node is its current
drawn box and `v` its current velocity, both seen through the presence layers as they are at
this flush: a presence `transform` that changed since the last flush changed what the user
sees, so the drawn box is mapped through the current presence matrices (the poses are the
engine's own; the presence matrix is read with the other computed values of active nodes).
Each pose is recovered *with its rate* from the drawn box and velocity, and recomposed through
the current maps (maps with time derivatives compose exactly by the product rule), so the
velocity is carried exactly: a parent's motion stays a translation of the child whatever the
child's own scale became. Only a node whose A moved by at least `threshold`, or whose track
options changed, gets a new track; every other node keeps its track untouched. That A is
judged under the presence matrices its track was planned with: a presence `transform` that
changed since is a visual layer (§3.1), not a move, so a re-render during a presence
animation keeps the track, and a kept track keeps the geometry and the ancestor matrices it
was planned with (§3.1), while a node planned now starts in this flush's space. Track options
are compared by their *effective* value under the group's motion: `layout`, `layoutAnchor`,
`radius` and `motion` with the defaults and the group's fields merged in (`{}` equals
`{ motion: { delay: 0 } }`), a timing by its class and parameters in any key order, so an
inline `timing.spring({…})` equals the previous render's. `layoutId`, `layoutCrossfade` and
`layoutDependency` act at the flush and never restart a track. A reduced-motion mode that
changed since a track was planned (§9) re-plans it at the next flush, from its drawn box with
its velocity.

### 5.6 Shared `layoutId` and crossfade

- Per id the scope keeps one **lead** (newest connected, non-exiting registrant) and at most
  one **follower** (a registrant exiting under presence).
- **Handoff.** When the lead changes because the previous lead departs (exits under presence,
  or leaves the scope), the new lead's B and velocity are the departing node's drawn box and
  velocity. This holds even when the new lead was already registered.
  - An exiting lead gives its live drawn box.
  - A removed lead gives the box and velocity retained for `retain` seconds (default 1)
    after its removal (the velocity only if its own track was moving, not holding a delay).
    The next flush carries them through its parent participant's current presence layers, as
    §5.5 does for driven nodes; the removed element's own layer stays as last measured.
  - A previous lead that is still live and not exiting does not hand off (duplicate id).
- **Crossfade** runs only when the lead changed in this flush, the previous lead is exiting
  under presence, the box moved by at least `threshold` (or the pair is reversing, below),
  and neither node sets `layoutCrossfade: false`. Both nodes draw at the lead's box; the
  follower takes it as its own flush space draws the lead (§3.1, §5.3): its ancestors as its
  flush saw them, every other presence as the lead was drawn with. Only the layers at the
  follower's ancestors that also draw the lead convert, `corr_f ∘ corr_l⁻¹` over those; a lead
  outside the follower's layered parent is taken as is. A continuing follower keeps the space
  of the flush that started it, like a kept track.
  Opacity uses the lead's eased progress `p = clamp(e(τ), 0, 1)` with
  `in(p) = circOut(min(1, p / 0.5))`, `circOut(x) = √(1 − (1 − x)²)`, and
  `out(p) = clamp((p − 0.5) / 0.45, 0, 1)`. The lead draws
  `L = from_L + (1 − from_L)·in(p)` and the follower draws
  `F = from_F·(1 − out(p))`. A new handoff starts with `from_L = 0` and
  `from_F = 1`. Therefore an opaque new pair has source-over coverage
  `1 − (1 − L)(1 − F) = 1` at every frame: the follower stays opaque through
  `p = 0.5`, and the lead is opaque from `p = 0.5` onward.
- **Reversal.** When the new lead is the follower of the running crossfade (a menu reopened
  while it closes), the pair keeps crossfading however little it moves. `from_L` is the opacity
  the new lead currently shows and `from_F` is the opacity the new follower currently shows:
  neither layer pops, no box jumps, and pair coverage cannot decrease from the reversal frame.
- The follower is held at opacity 0 (where it was drawn when the fade ended) until presence
  unmounts it, and presence's release waits for the crossfade to end. Nothing pops back to
  opacity 1.
- A lead retargeted during its crossfade (same lead, A moved) keeps the fade: its timeline,
  the follower's and the release stay one, so the asymmetric opacity curves continue without
  restarting; the lead gives its opacity back when the fade ends, not when its new track ends.
- If presence animates `opacity` on a crossfade node (its `present` record names `opacity`),
  the pair hands off without a crossfade and a development warning is printed.
- Two live, non-exiting nodes with one id print a development warning; the newest leads and
  the other animates on its own.

### 5.7 Radius

Radius is on for a participant with `radius: true`, and for one with a `layoutId` that
omits `radius` (shared elements correct their corners by default); `radius: false` turns it
off. A participant with radius on uses the author's four corner radii of A at every flush. When layout does not
own a corner, its computed value is read with the node's other computed values. While layout
owns it and its inline declaration still holds layout's own `!important` write, the authored
length captured when ownership began is reused instead; percentages and `calc()` keep their
length components and resolve against the current CSS box. A plain inline author replacement
recognised by §6 becomes the source from that flush onward. Each corner is written as
`r·A_w/V_w` / `r·A_h/V_h` (elliptical radii), so corners keep their on-screen radius under
any total scale. The declaration is restored on settle.

A shared `layoutId` handoff blends the on-screen corner shape when both the departing node and
new lead have radius on. Per corner and axis, let `ρ_A` be the new lead's authored radius
resolved at A, and let `ρ_B` be the departing node's on-screen radius at the flush. Its source
order is exact: (1) a driven departing node's currently drawn `ρ`; (2) the departing node's
radius from the consumed capture, for a resting node; (3) its stored geometry from the last
ordinary measurement, only as a fallback when no capture value exists. A removed lead keeps
the radius from the same source as its retained box: drawn state when driven, otherwise the
same capture that supplied `capture.rects`, then stored geometry as fallback. The retained
radius lives with its box and velocity for `retain` seconds. On the new lead's track timeline,
`p = clamp(e(τ), 0, 1)` and `ρ(p) = ρ_B + (ρ_A − ρ_B)·p`. During a live crossfade both layers
draw the same `ρ(p)` and each converts it to its own declaration with its own `A_w/V_w` or
`A_h/V_h`, so their silhouettes are identical.

A retarget or reversal during a radius blend starts the new blend from the `ρ` currently drawn;
at `p = 1` the lead draws exactly `ρ_A`, so ending the blend, settling the track and restoring
the authored declaration introduce no radius jump. There is no radius blend when either side
has `radius: false`. A style-only radius change made while a shared participant rests is
therefore included by the next capture instead of using a lifetime bootstrap. Flushes add no
radius-only measurement, and frames add no DOM read.

## 6. Property ownership on one element

| Property | Owner | Rule |
|---|---|---|
| `translate`, `scale` | Layout | Authored values (inline or stylesheet, e.g. Tailwind `translate-*`, `hover:scale-105`) are composed (§3.1), frozen for the run and restored byte for byte. Layout writes them `!important`; an author's inline write during the run (React re-rendering a `style` prop) replaces that declaration, so it is recognised by its priority and taken in at the next flush or settle: the run keeps its frozen composition and the author's value is what the settle restores. A CSS transition configured on them (`translate`, `scale` or `all`, which would animate layout's own writes) or a running CSS animation of them snaps the node with a development warning naming the fix (e.g. Tailwind `transition-colors` instead of `transition`). |
| `transform` | Presence and Core | Part of the inner map (§3.1); never written by layout. |
| `transform-origin` | Author | Read once per flush for active nodes (with its Typed OM value where the browser snaps the reference box, §5.3). |
| `opacity` | Presence; layout only for a crossfade pair | §5.6. |
| `border-radius` | Layout when radius is on (§5.7) | A resting shared participant is read-only snapshotted at capture (§4.1); capture does not take ownership. Saved when layout first owns it (also when `radius` turns on mid-run), then frozen as the authored radius while the inline declaration still holds layout's own `!important` write (§5.7). An author's plain inline replacement is recognised by priority like `translate`/`scale`, used from the next flush and restored on settle. Turning `radius` off gives the corners back at once. |
| `rotate`, skew, non-translation ancestor transforms | Author | The subtree snaps with `'unsupported'`. |

Presence and layout meet only inside the package: `createPresence` registers its element,
its exiting phase, whether its record names `opacity`, and a release hold
(`presence_link.ts`). Adapters see none of it.

**popLayout.** In the render where a child stops being present, `usePresence` measures its
CSS box relative to its real containing block (the nearest ancestor that establishes one
for absolute positioning, or the initial containing block). The commit lifts it to
`position: absolute` at that box, before the flush, so siblings are measured without the gap
and move from t = 0.

## 7. Public API

The vocabulary is Motion's (`layout`, `layoutId`, `layoutAnchor`, `layoutCrossfade`,
`layoutDependency`) with Ani's own `motion` in seconds.

### 7.1 Vanilla — `@freestylejs/ani-layout`

```ts
interface LayoutMotion {
  readonly duration?: number          // seconds, default 0.35
  readonly delay?: number             // seconds, default 0
  readonly timing?: TimingFunction    // stateless only; default timing.easeOut()
}

interface LayoutOptions {
  readonly layout?: true | 'position' | 'size'   // default true
  readonly layoutId?: string
  readonly layoutAnchor?: { readonly x: number; readonly y: number }  // 0..1
  readonly layoutCrossfade?: boolean             // default true
  readonly layoutDependency?: unknown            // optional narrowing
  readonly radius?: boolean                      // default: true with a layoutId, else false
  readonly motion?: LayoutMotion
}

interface LayoutGroupOptions {
  readonly clock?: Clock                         // default defaultClock
  readonly motion?: LayoutMotion
  readonly reducedMotion?: ReducedMotionPolicy   // default 'jump'
  readonly threshold?: number                    // px, default 1
  readonly maxNodes?: number                     // visible movers, default 300
  readonly retain?: number                       // seconds, default 1
  readonly onSnap?: (element: HTMLElement, reason: SnapReason) => void
  readonly engine?: 'raf' | 'waapi'              // default 'raf' (§10)
}

type SnapReason = 'culled' | 'capped' | 'unsupported' | 'stale' | 'reduced'

interface LayoutReport {
  readonly status: 'ended' | 'interrupted' | 'no-change' | 'reduced' | 'capped' | 'stale' | 'disposed'
  readonly snapped: readonly { readonly element: HTMLElement; readonly reason: SnapReason }[]
}

interface LayoutGroup {
  add(element: HTMLElement, options?: LayoutOptions): () => void
  set(element: HTMLElement, options: LayoutOptions): void
  capture(): void
  flush(): Promise<LayoutReport>
  update(mutate: () => void): Promise<LayoutReport>   // capture → mutate → flush
  finish(): void
  dispose(): void
  readonly stats: { readonly captures: number; readonly reads: number; readonly tracks: number }
}

function createLayoutGroup(options?: LayoutGroupOptions): LayoutGroup
```

- `flush()` and `update()` follow Core's run contract: the promise never rejects and resolves
  once per run. A run whose track is replaced by a later flush resolves `'interrupted'` at that
  moment; its untouched tracks keep running under the engine.
- Invalid options throw synchronously with `ANI_INVALID_OPTIONS`, never inside a frame. A
  throwing `mutate` in `update()` discards the capture and rethrows.
- `layoutDependency`: when given and equal (`Object.is`) to its value at the participant's
  previous flush, the participant is left out of planning (it jumps, unreported).
- A scope is a namespace by itself, so the vanilla API has no `id`; the React `LayoutGroup`
  namespaces the ids of nested groups that share one scope.

### 7.2 React — `@freestylejs/ani-react/layout`

```ts
useLayout<E extends HTMLElement>(options?: LayoutOptions & { ref?: Ref<E> }): RefCallback<E>
<LayoutGroup id? clock? motion? reducedMotion? threshold? maxNodes? retain? onSnap?>  // no DOM
useLayoutGroup(): { update(fn: () => void): Promise<LayoutReport>; finish(): void }
<AnimatePresence initial? mode?: 'sync' | 'popLayout' | 'wait' custom? onExitComplete?>
usePresence(motion, options?): { ref, style, isPresent, custom }
usePresenceControl(options?): { isPresent, safeToRemove }
```

- A participant with no `LayoutGroup` joins an implicit root scope: one per
  `(clock, document)` pair (the participant's `ownerDocument`), created lazily and disposed
  when its last participant leaves, independently of every other pair.
- The outermost `LayoutGroup` owns a scope. Nested groups join it: they namespace `layoutId`s
  (`id`) and supply `motion` defaults; scope options (`clock`, `reducedMotion`, `threshold`,
  `maxNodes`, `retain`, `onSnap`, `engine`) are read from the outermost group only, and a nested group
  that sets one prints a development warning. A change of a scope option recreates the scope
  (compared by value; `onSnap` is always the latest prop).
- A participant's `motion` is merged field by field over its groups' `motion`.
- **Trigger contract:** a commit animates when it renders the group, an `AnimatePresence` or
  any participant of the scope. If state lives in a component that renders none of them
  (memoized children below), place the `LayoutGroup` inside that component, or wrap the change
  in `useLayoutGroup().update(fn)`. A development-only `MutationObserver` warns once per scope
  when the DOM around its participants changed with no capture.
- **Adapter mechanics.** A render of a participant, group or `AnimatePresence` calls
  `capture()` on its scope (only on a scope that exists: registration creates an implicit
  root), except while that scope's flush is queued: React 18 can start the next render in the
  commit's task, after the DOM changed, and that render's before-boxes come from the hand-off
  capture instead. Their layout effects queue one microtask per scope that calls `flush()`, followed by
  `capture()` when a render touched the scope after the commit's last layout effect (§4.1
  hand-off). Participant options are compared by value (§5.5); only a change calls `set`.
  `useLayoutGroup().update(fn)` flushes a pending commit's flush first, then runs
  `capture()` → `flushSync(fn)` → `flush()`.
- **StrictMode.** React 19 replays the ref callbacks and effects of fibers it mounts *and*
  moves (a reorder). A participant's removal therefore waits until the end of the task: a
  re-attach of the same element in that task keeps its registration and its captured B. The
  outermost group disposes its scope one microtask after its layout effect's cleanup, unless
  the effect re-ran.
- **Presence styles.** `usePresence().style` carries `motion.initial` from the first render
  until the enter has finished, so React never clears the values the enter is writing (a
  re-render that dropped them would show the present state for a frame and read as a layout
  change). Under `popLayout`, the exiting render measures the box relative to its containing
  block (§6) and the style lifts it there.

```tsx
// List reorder: mark the items, nothing else
function Item({ item }) {
  const ref = useLayout({ layout: 'position' })
  return <li ref={ref}>{item.label}</li>
}

// Toast stack: CSS lays the list out; presence and layout share the element
function Toast({ toast }) {
  const presence = usePresence(toastMotion)
  // `ref` forwards the element: one stable ref (an inline merged ref would be new per render)
  const ref = useLayout({ layout: 'position', ref: presence.ref })
  return <li ref={ref} style={presence.style}>{toast.text}</li>
}
```

## 8. Module boundaries

| Layer | Module | Owns |
|---|---|---|
| Pure | `geometry.ts` | Boxes, axis maps, composition and inversion, pose from box. |
| Pure | `motion.ts` | Option validation, defaults, timing evaluation, reduced-motion clamp. |
| Pure | `plan.ts` | Per flush: who animates, handoff, crossfade pairs, every snap reason. |
| Pure | `solve.ts` | Per frame: tracks → drawn boxes → poses, opacities, radii. |
| Shell | `dom.ts` | Every DOM read, every owned-style write and byte-exact restore. |
| Shell | `scope.ts` | Registry, epochs, runs, lifecycle; the public `LayoutGroup`. |
| Shell | `realize/raf.ts` | The one `Animatable`. |
| Shell | `realize/waapi.ts` | The WAAPI engine's animations and sampled easing (§10). |
| Shell | `presence_link.ts` | Package-internal presence registry (§6). |
| Kept | `presence.ts`, `presence_state.ts`, `view_transition.ts`, `feature.ts`, `easing.ts` | Presence, View Transitions. |

The pure modules import nothing from the DOM or the clock. Only `dom.ts` reads layout and
writes owned styles, and only `realize/*` realizes tracks (the clock, `Element.animate`). The React adapter calls only the public
group API.

## 9. Failure, snap and reduced motion

| Condition | Behaviour | Reason |
|---|---|---|
| Both boxes outside the viewport ± 10 % (the union of B and A) | That node jumps, uncounted toward `maxNodes`; under a moving ancestor it is still counter-projected | `'culled'` |
| Visible movers exceed `maxNodes` | The whole flush snaps | `'capped'` |
| Rotate, skew, a non-translation transform on a non-participant ancestor (detected by the border box's size), unparseable transform or authored value, a CSS transition or animation on `translate`/`scale` (§6), zero size, `display: contents`/`inline`, a size change beyond 50× | That subtree snaps | `'unsupported'` |
| An inner scroll container moved between capture and flush | The flush snaps | `'stale'` |
| Reduced motion with policy `'jump'` (default) | No tracks; active tracks finish at once; no clock subscription | `'reduced'` |
| Reduced motion `{ maxDuration }` | Delay + duration scaled down to fit, in `motion.ts` only | — |
| Reduced motion `'ignore'` | Plays in full | — |
| `dispose()` or unmount | Tracks cancelled, inline styles restored, presence holds released | status `'disposed'` |
| A moving participant unregistered, or gone from the document at a flush | Its track is cancelled and its styles restored at once (pending writes for it dropped); the rest of its run goes on; a run left with no node resolves `'disposed'`; the scope unsubscribes when nothing else moves, once the task's microtasks have run (before any frame), so a handoff flushed in the same task keeps a continuous subscription (§4.3) | status `'disposed'` (a run of only such nodes) |
| Reduced motion toggled during a run | The next flush applies the current mode to running tracks: `'jump'` finishes them, `maxDuration` re-plans them clamped from their drawn box and velocity. A crossfade finished by `'jump'` ends as a completed fade: the lead gets its opacity back, and the exiting follower is held at opacity 0 until presence unmounts it (§5.6) | — |
| `finish()` | Every track jumps to A and settles | status `'ended'` |
| No DOM (SSR), first client commit | No-op; hydration never animates | — |

Snapped nodes are listed in `report.snapped` and passed to `onSnap`. A development warning is
printed once per scope for `'unsupported'`, `'capped'` and `'stale'` (actionable);
`'culled'` and `'reduced'` are normal operation and stay silent. Reduced motion is read from
the scope's clock at every flush.

## 10. WAAPI engine (`engine: 'waapi'`)

An explicit group option, for flat moves that must stay smooth while the main thread is
blocked. Same plan, realized with `Element.animate()` (`realize/waapi.ts`):

- **Shape.** Top-level `layout: 'position'` participants only, without `layoutAnchor`,
  `layoutId` or `radius`; anything else throws `ANI_INVALID_OPTIONS` at `add`/`set` (a nested
  participant included), never degrades. A nesting that appears later in the DOM snaps as
  `'unsupported'`. There is no velocity term: a retarget starts from the drawn box at rest.
- **Realization.** Each track is one `translate` animation from its start pose to the authored
  translate, with the track's curve sampled into a CSS `linear()` easing (stops chosen so a
  move is drawn within 0.05 px), its delay and `fill: 'backwards'`. It is created in the flush
  and held at τ = 0, then played from the next animation frame without a `startTime`: the
  first painted frame is τ = 0 in every browser (Gecko and WebKit would otherwise count a
  block right after the flush as elapsed time). It writes no inline style; settle, `finish`,
  `dispose`, removal and reduced motion cancel the animation.
- **Time.** A track's elapsed time is its animation's `currentTime`, read wherever the scope
  needs a drawn box (the next flush's B, a removal). The animations run on the document
  timeline, not on the Ani clock: they do not follow its time scale; reduced motion is still
  read from the clock at each flush.
- **Gates (all met).** (1) RAF-vs-WAAPI differential ≤ 0.5 px per frame (`waapi:W1`, seeking
  the paused animation to each frame's time); (2) the first painted frame after a 120 ms
  block ≤ 6 % (`waapi:W3`); (3) a Chromium trace shows compositor frames drawing during a
  120 ms block, where the RAF engine draws none (`pnpm test:waapi-trace`).

## 11. Acceptance

A row passes only when every frame of a real browser run (Chromium, Firefox, WebKit) matches
an oracle that shares no code with the solver. Final rects and no-crash tests count for
nothing.

- **Oracle:** at elapsed time t, every node's *visual* rect (the browser's
  `getBoundingClientRect` plus page scroll) equals its own track in page coordinates, with its
  anchor rule applied (§3.1). When a presence `transform` on the node or an ancestor
  animates during the run, the expected rect is that track with the change of those inner
  maps since the flush applied, which the test sets and knows.
- **Layers:** pure property tests on `solve`/`plan` (random trees to depth 5, within 1e-9);
  deterministic browser tests on a manual clock (0.5 px per frame); a few real-clock tests
  (jank, read counts, frame cost).
- **Coverage:** each file is measured where its tests run. The pure modules count in the
  jsdom coverage of `pnpm test:ci`; the DOM engine (`scope.ts`, `dom.ts`, `realize/*`) needs
  real layout, so its coverage is the V8 coverage of every Chromium case page, mapped to the
  sources and gated by a full `pnpm test:browser --coverage` run (CI's browser job).

| Row | Frame-level assertion |
|---|---|
| E1 Layout Anchor | Child centre on parent centre ≤ 0.5 px every frame; child stays 70 px until 0.8 s; child starts at 0.8 s ± one frame |
| E2 Create Button | Shared-pair source-over coverage ≥ 0.99 every frame; label glyph height constant ± 1 px; close and reopen at 100 ms and 500 ms |
| E3 iOS Folder | Four shared tiles first and final rects; tile scale 0.2 ± 0.02; stagger ± one frame; reopen at 500 ms; the shared `folder` surface starts on the departing surface's box and follows its track, and the departing surface stays until its opacity is 0; above a shared tile pair only that pair, the surface or another tile pair paints; staggered items keep their aspect under the scaling surface; on-screen radii stay within their authored ends |
| E4 App Store | Card, image and title nested ids; no gap > 0.5 px in image coverage; title size pinned; close and reopen |
| E5 Notifications | First frame equals the enter transform; siblings final at t = 0 under popLayout; exit ≈ 0.2 s; bottom edge ± 1 px under scaleX; five adds 80 ms apart |
| Reduced 2D Gallery | 16 tiles grid ↔ list, plus a detail view with a shared id; on-screen radii of tile and detail stay within their authored ends every frame |

Regression tests: late start after a 120 ms block (≤ 6 %), unrelated re-render (identical
trajectory), crossfade only on a real handoff with no opacity pop and coverage preserved by the
§5.6 asymmetric curves (including reversal and nested shared ids), shared-handoff radius blending
with identical silhouettes (live and retained, including `%`/elliptical corners, no blend when
one side opts out, continuous retarget/reversal, and a resting style-only radius change captured
before both retained and live handoffs), velocity ≤ 5 % across a retarget under jank, reduced
motion (zero writes, zero subscribers, mid-run toggle), showcase honesty, fractional boxes under
scale within 0.05 px in every engine (`layout:REFBOX`, the WebKit reference box). The
Motion-parity examples (`showcase` module) are checked the same way: every frame on the oracle
from rest, and through mid-flight changes on a chain of oracle tracks that carries each track's
velocity. Seeded fuzz invariants: no NaN, no read after the first write in a tick, one writer
per property, byte-identical final inline style, no subscription left.

Cost gates: the flush read set stays base-exact: 2N rects plus one computed-style read per active
node. Capture adds exactly one computed-style read for each undriven shared participant with
radius on, after all capture rects; unrelated-sibling and no-op flush counts therefore stay
unchanged, and steady frames read zero. Commit reads at 1,000 participants ≤ 4 ms; steady frame
at 300 nested movers ≤ 2 ms p95. The whole commit and the steady frame with every participant
moving are recorded at 50, 300 and 1,000 participants.

## 12. Accepted risks

- Nested layout motion is not compositor-smooth while the main thread is blocked.
- The WAAPI engine reads a retarget's B from `currentTime` on the main thread; under jank the
  compositor may have drawn ahead of it, so a retarget during jank can step back by the
  frames the main thread missed. It does not follow the Ani clock's time scale.
- Render-phase reads bend React's purity norm (reads only) and can force a layout during render
  when the DOM is dirty. A capture also pays one computed-style read per undriven shared
  participant with radius on so its B radius is current; this deliberate accuracy cost does not
  recur in flush or frames.
- A direct `flush()` with no capture cannot observe a resting style-only radius change; §5.7
  falls back to the participant's last ordinary geometry in that case.
- A state change that renders no participant, group or `AnimatePresence` does not animate
  (documented, development warning).
- The velocity term is a continuity device, not spring physics.
- Text under scale re-rasterizes and can look soft mid-flight.
- An authored `translate`/`scale` change during a run applies after settle (one jump at the
  settle, from the frozen composition to the author's value).
- A presence `transform` that animates during a layout run is a visual layer on top of the
  tracks of its element and its participant descendants, like on its other children (§3.1).
- A size channel whose carried velocity would take it below one pixel loses that part of the
  velocity (§5.1).
