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
| **Inner map Qₙ** | The element's own authored `translate`/`scale` and its inline `transform` (presence), about its `transform-origin`. Not owned by layout. |
| **Pose Pₙ** | Layout's own `(t, s)` per axis, about the `transform-origin`. Owned by layout. |
| **Layout box Lₙ** | The CSS box with every participant pose and every inner map removed. |
| **Drawn box Vₙ** | Where the element appears with every pose applied and every inner map removed. |

CSS composes `translate · rotate · scale · transform`. Layout writes the *outer* map
(`translate = t + s·authoredTranslate`, `scale = s·authoredScale`) and presence's
`transform` stays inside, so the inner maps are a visual layer *inside* layout motion:

- **Measurement** divides the inner maps out along the participant chain, outermost first:
  `L = Qₙ⁻¹ ∘ … ∘ Q_root⁻¹ (rect)` with every pose stripped.
- **Projection** composes poses only: `Mₙ = Mπ ∘ Pₙ`, where `Mπ` is the parent
  participant's map.

At rest every pose is the identity and `V = L`.

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
4. Interruption is continuous in position and velocity.
5. A node whose target did not move is never retargeted: an unrelated re-render cannot
   restart anything.
6. Anything the solver cannot do exactly snaps, with a typed reason.

## 4. Commit and frame model

Each commit costs one batched read before the mutation and one after. Every animation
frame after that is arithmetic plus writes, inside the clock's `update` and `commit`
phases.

### 4.1 Capture (B)

`capture()` reads every registered participant of the scope that the engine does not
drive: `getBoundingClientRect`, page scroll, the inline `transform`, and the scroll
position of each participant's scroll container. Driven nodes are not read: their drawn
box is known exactly.

- Capture is idempotent within an epoch: StrictMode's second render and every further
  participant render reuse it.
- **Refresh:** a capture taken before an animation frame is read again by the next
  `capture()` (the first render touch after that frame). A render that never commits leaves
  a capture that is still the true before-box as long as no commit happened; the refresh rule
  covers a commit that painted in between.

In React, the first render of a `useLayout` participant, a `LayoutGroup` or an
`AnimatePresence` in an epoch calls `capture()`. React has not mutated the DOM yet, so this
is the true before-box, not a remembered one.

### 4.2 Flush (A, plan, t = 0 pose)

`flush()` consumes the capture synchronously:

1. Restore the owned styles of every engine node (writes only).
2. Read A for every participant (one layout).
3. Plan (§5) and write the t = 0 pose of every engine node, which reproduces B.
4. Subscribe the scope's `Animatable` if any track exists.

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

- A track's time starts at its first clock update, whose `dt` is forced to 0. A 120 ms block
  after the commit therefore costs one late frame, not 120 ms of progress.
- After that, tracks advance by the clock's `dt` (lag-smoothed, time-scaled), exactly like
  every other Ani animation.
- The read phase is unused; `update` solves; `commit` writes only declarations whose value
  changed.
- A node settles when its own track ended and no ancestor still animates: its saved inline
  declarations are restored byte for byte. The scope unsubscribes when no track is left.

## 5. Solver

### 5.1 Track

Each node animates four channels: the **origin point** (the box point under its
`transform-origin`, kept as a fraction of the box) and the size. Interpolating the origin
point matches Motion, whose layout origin defaults to the centre.

With `τ = (elapsed − delay) / duration`, `D` the duration and `e` the timing curve:

```
c(τ) = A + (B − A)·(1 − e(τ)) + k·τ·(1 − τ)²,   k = v·D + (B − A)·e′(0)
```

- `c(0) = B` and `c(1) = A` for every timing; `c′(0) = v`.
- Before its delay a channel holds B (a delayed retarget starts at rest).
- `k` carries the incoming velocity `v`, the central difference of the old track at the
  retarget instant. Core's `timing.spring` ignores a passed velocity, so this term is the
  only way to keep velocity continuous. `k` is clamped so that the bump never exceeds half
  of `max(|B − A|, size)` and a size channel never drops below one pixel.
- Timing must be stateless. A stateful timing (`timing.dynamicSpring`) throws
  `ANI_INVALID_OPTIONS`.

### 5.2 Modes

| `layout` | Origin point | Size |
|---|---|---|
| `true` (default) | animates | animates |
| `'position'` | animates | pinned to A (counter-scaled under a scaling parent) |
| `'size'` | pinned to A | animates |

### 5.3 Projection

For node `n` with drawn box `V(t)`, layout box `A`, origin offset `o` and parent map `Mπ`:

```
V′ = Mπ⁻¹(V),   s = V′_w / A_w,   t = V′_x − A_x − o_x·(1 − s),   Mₙ = Mπ ∘ Tₙ
```

Depth is unlimited and the cost is O(N) arithmetic per frame. Every participant under an
animating ancestor is solved each frame (a node whose own box did not move keeps `V = A` and
is counter-projected), so nesting never distorts it.

### 5.4 Anchor

`layoutAnchor {x, y}` (0–1) replaces the origin channels: the node's anchor point is placed
on the parent participant's drawn anchor point every frame, plus an offset that moves from
the initial discrepancy to the final one on the node's own timeline (zero when the anchor
points coincide, as in E1). Without a parent participant the anchor is ignored.

### 5.5 Interruption

A new flush while tracks run never reads animated state. B for a driven node is its current
drawn box and `v` its current velocity. Only a node whose A moved by at least `threshold`
(or whose options changed) gets a new track; every other node keeps its track untouched.

### 5.6 Shared `layoutId` and crossfade

- Per id the scope keeps one **lead** (newest connected, non-exiting registrant) and at most
  one **follower** (a registrant exiting under presence).
- **Handoff:** a new lead's B is the departing node's drawn box: from the live follower, or
  from a box retained for `retain` seconds (default 1) after its removal.
- **Crossfade** runs only when the lead changed in this flush, the previous lead is exiting
  under presence, the box moved by at least `threshold`, and neither node sets
  `layoutCrossfade: false`. Both nodes draw at the lead's box; the opacities are `w` and
  `1 − w`, with `w = clamp(e(τ), 0, 1)` on the lead's timeline.
- The follower is held at opacity 0 until presence unmounts it, and presence's release waits
  for the crossfade to end. Nothing pops back to opacity 1.
- If presence animates `opacity` on a crossfade node (its `present` record names `opacity`),
  the pair hands off without a crossfade and a development warning is printed.
- Two live, non-exiting nodes with one id print a development warning; the newest leads and
  the other animates on its own.

### 5.7 Radius

`radius: true` reads the four corner radii of A once per flush and writes each corner as
`r·A_w/V_w` / `r·A_h/V_h` (elliptical radii), so corners keep their on-screen radius under
any total scale. The declaration is restored on settle.

## 6. Property ownership on one element

| Property | Owner | Rule |
|---|---|---|
| `translate`, `scale` | Layout | Authored values (inline or stylesheet, e.g. Tailwind `translate-*`, `hover:scale-105`) are composed (§3.1), frozen for the run and restored byte for byte. A running CSS transition or animation on them snaps the node. |
| `transform` | Presence and Core | Divided out of measurement. |
| `transform-origin` | Author | Read once per flush for active nodes. |
| `opacity` | Presence; layout only for a crossfade pair | §5.6. |
| `border-radius` | Layout when `radius: true` | Restored on settle. |
| `rotate`, skew, non-translation ancestor transforms | Author | The subtree snaps with `'unsupported'`. |

Presence and layout meet only inside the package: `createPresence` registers its element,
its exiting phase, whether its record names `opacity`, and a release hold
(`presence_link.ts`). Adapters see none of it.

**popLayout.** In the render where a child stops being present, `usePresence` measures its
layout box relative to its real containing block (the nearest ancestor that establishes one
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
  readonly radius?: boolean                      // default false
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

- A participant with no `LayoutGroup` joins an implicit root scope (one per clock, created
  lazily, disposed when empty).
- The outermost `LayoutGroup` owns a scope. Nested groups join it: they namespace `layoutId`s
  (`id`) and supply `motion` defaults; scope options (`clock`, `reducedMotion`, `threshold`,
  `maxNodes`, `retain`, `onSnap`) are read from the outermost group only, and a nested group
  that sets one prints a development warning. A change of a scope option recreates the scope
  (compared by value; `onSnap` is always the latest prop).
- A participant's `motion` is merged field by field over its groups' `motion`.
- **Trigger contract:** a commit animates when it renders the group, an `AnimatePresence` or
  any participant of the scope. If state lives in a component that renders none of them
  (memoized children below), place the `LayoutGroup` inside that component, or wrap the change
  in `useLayoutGroup().update(fn)`. A development-only `MutationObserver` warns once per scope
  when the DOM around its participants changed with no capture.

```tsx
// List reorder: mark the items, nothing else
function Item({ item }) {
  const ref = useLayout({ layout: 'position' })
  return <li ref={ref}>{item.label}</li>
}

// Toast stack: CSS lays the list out; presence and layout share the element
function Toast({ toast }) {
  const layout = useLayout({ layout: 'position' })
  const presence = usePresence(toastMotion)
  return <li ref={mergeRefs(layout, presence.ref)} style={presence.style}>{toast.text}</li>
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
| Shell | `presence_link.ts` | Package-internal presence registry (§6). |
| Kept | `presence.ts`, `presence_state.ts`, `view_transition.ts`, `feature.ts`, `easing.ts` | Presence, View Transitions. |

The pure modules import nothing from the DOM or the clock. Only `dom.ts` touches the DOM
for layout and only `realize/*` touches the clock. The React adapter calls only the public
group API.

## 9. Failure, snap and reduced motion

| Condition | Behaviour | Reason |
|---|---|---|
| Both boxes outside the viewport ± 10 % | That node jumps, uncounted | `'culled'` |
| Visible movers exceed `maxNodes` | The whole flush snaps | `'capped'` |
| Rotate, skew, non-translation ancestor transform, unparseable inline transform or authored value, running CSS transition/animation on `translate`/`scale`, zero size, `display: contents`, scale outside 1/50–50 | That subtree snaps | `'unsupported'` |
| An inner scroll container moved between capture and flush | The flush snaps | `'stale'` |
| Reduced motion with policy `'jump'` (default) | No tracks; active tracks finish at once; no clock subscription | `'reduced'` |
| Reduced motion `{ maxDuration }` | Delay + duration scaled down to fit, in `motion.ts` only | — |
| Reduced motion `'ignore'` | Plays in full | — |
| `dispose()` or unmount | Tracks cancelled, inline styles restored, presence holds released | status `'disposed'` |
| `finish()` | Every track jumps to A and settles | status `'ended'` |
| No DOM (SSR), first client commit | No-op; hydration never animates | — |

Snapped nodes are listed in `report.snapped` and passed to `onSnap`. A development warning is
printed once per scope for `'unsupported'`, `'capped'` and `'stale'` (actionable);
`'culled'` and `'reduced'` are normal operation and stay silent. Reduced motion is read from
the scope's clock at every flush.

## 10. WAAPI engine (optional, gated)

Same plan, realized with `Element.animate()`: depth-0 tracks only (no participant ancestor
that animates), `'position'` mode, no anchor, no velocity term; anything else throws at
`add`/`set`. It never writes `startTime`: animations are created in the flush and start at
the browser's pending-play time, so the first painted frame is τ = 0. It ships only if
(1) the RAF-vs-WAAPI differential is ≤ 0.5 px per frame, (2) the 120 ms block test is ≤ 6 %,
and (3) a trace shows compositor-only frames during a block. If any gate fails, it does not
ship.

## 11. Acceptance

A row passes only when every frame of a real browser run (Chromium, Firefox, WebKit) matches
an oracle that shares no code with the solver. Final rects and no-crash tests count for
nothing.

- **Oracle:** at elapsed time t, every node's drawn rect equals its own track in page
  coordinates, with its anchor rule applied.
- **Layers:** pure property tests on `solve`/`plan` (random trees to depth 5, within 1e-9);
  deterministic browser tests on a manual clock (0.5 px per frame); a few real-clock tests
  (jank, read counts, frame cost).

| Row | Frame-level assertion |
|---|---|
| E1 Layout Anchor | Child centre on parent centre ≤ 0.5 px every frame; child stays 70 px until 0.8 s; child starts at 0.8 s ± one frame |
| E2 Create Button | Opacity sum 1 ± 0.05 every frame; label glyph height constant ± 1 px; close and reopen at 100 ms and 500 ms |
| E3 iOS Folder | Four shared tiles first and final rects; tile scale 0.2 ± 0.02; stagger ± one frame; reopen at 500 ms |
| E4 App Store | Card, image and title nested ids; no gap > 0.5 px in image coverage; title size pinned; close and reopen |
| E5 Notifications | First frame equals the enter transform; siblings final at t = 0 under popLayout; exit ≈ 0.2 s; bottom edge ± 1 px under scaleX; five adds 80 ms apart |
| Reduced 2D Gallery | 16 tiles grid ↔ list, plus a detail view with a shared id |

Regression tests: late start after a 120 ms block (≤ 6 %), unrelated re-render (identical
trajectory), crossfade only on a real handoff with no pop to 1, velocity ≤ 5 % across a
retarget under jank, reduced motion (zero writes, zero subscribers, mid-run toggle), showcase
honesty. Seeded fuzz invariants: no NaN, no read after the first write in a tick, one writer
per property, byte-identical final inline style, no subscription left.

Cost gates: reads per commit = 2N rects plus one computed-style read per active node; zero
reads on steady frames; commit reads at 1,000 participants ≤ 4 ms; steady frame at 300 nested
movers ≤ 2 ms p95.

## 12. Accepted risks

- Nested layout motion is not compositor-smooth while the main thread is blocked.
- Render-phase reads bend React's purity norm (reads only) and can force a layout during render
  when the DOM is dirty.
- A state change that renders no participant, group or `AnimatePresence` does not animate
  (documented, development warning).
- The velocity term is a continuity device, not spring physics.
- Text under scale re-rasterizes and can look soft mid-flight.
- An authored `translate`/`scale` change during a run applies after settle.
- A participant's presence transform that animates while its participant descendants move is a
  visual layer: their tracks are exact in layout space and the presence motion renders inside.
