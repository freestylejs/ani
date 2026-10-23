<!-- Verbatim export of the approved Claude Docs document "ANI Layout — Final Architecture" (rev 13, 2026-10-23, https://claude.ai/artifact/5VG9La89p2wUAn3MC3uy1z). Record only; packages/layout/ARCHITECTURE.md is the authority. Open questions at the end were answered on 2026-10-23: layout defaults to true; dynamicSpring is rejected. -->

# ANI Layout — Final Architecture

2026-10-23 · Junesung

**Verdict: APPROVE**, with four P0 evidence spikes as hard gates (see the last section). This replaces both `ARCHITECTURE.md` and `ARCHITECTURE_CPC.md` as the authority for `@freestylejs/ani-layout` and `@freestylejs/ani-react/layout`.

## Decision

ani-layout becomes **one pure layout solver on Ani's own clock**. At each commit it learns where every marked box *was drawn* and where layout *put it*. Each frame it re-solves every animating box top-down, parent before child, and writes only `translate` and `scale` (plus `opacity` for crossfade and `border-radius` when asked).

- **Exact by construction.** Nesting at any depth, `layoutAnchor`, shared `layoutId` and crossfade are one equation per node. There is no keyframe sampling, no error budget and no depth limit.
- **Ani's moat, not a second one.** Reads happen once per commit and never interleave with writes. Steady frames do zero DOM reads. The layout scope is one `Animatable` on the core clock, so it shares frame time, reduced motion and ownership with every other Ani animation.
- **Declarative by default.** In React you mark an element with `useLayout()`. It animates whenever its box changes across a commit. No `deps`, no capture or play calls.
- **Jank resilience only where it is cheap.** A WAAPI engine for flat moves is a defined later phase over the same plan, gated on proof that it actually stays on the compositor.

The compiled WAAPI projection core (CPC) is retired. Presence and View Transitions stay.

## Goals and constraints

Three decisions from you (2026-10-23) fix the shape; the debate did not reopen them.

| Decision | What it means for the design |
|---|---|
| **Moat = Ani core's moat** | One clock with read → update → commit, groups at scale, one semantics across explicit engines, reduced motion by default, seconds, explicit ownership. "Smooth while the main thread is blocked" is kept only for flat moves on WAAPI, not promised for nested layout. |
| **Automatic per commit** | Marking an element is the whole authoring step. `deps` / `layoutDependency` exist only as optional narrowing. |
| **Target = Motion E1–E5 + reduced 2D Gallery** | Proven by frame-level browser tests, never by final rects or no-crash tests. 3D, drag, loop, `layoutScroll`/`layoutRoot`, arc paths, shadow correction, SVG and rotation/skew projection stay out. |

**Fixed constraints.** Core V2's public API does not change; layout uses only Core's public clock (`Animatable { read?, update(dt), commit? }`), timing functions and reduced-motion policy. Dependency direction is layout → core, React adapter → layout + core. Vue, Svelte and Solid adapters come later; the vanilla API must not block them.

**Harm to avoid:** hidden coupling to Core internals, approximate behaviour sold as exact, per-render cost the user cannot see, silent degradation, a god module, and wrong motion (which is worse than no motion).

## Top-view map

The real DOM after a commit is the only layout truth; the engine never decides where anything ends, it only animates the visual difference back to that truth.

| Primitive | Element | Owner | Lifetime |
|---|---|---|---|
| Data | **Before box** B: where a participant was drawn just before the mutation | Scope (epoch) | One commit |
| Data | **After box** A: where layout put it after the mutation | Scope (epoch) | One commit |
| Data | **Track** per animating node: B, A, delay, duration, timing, velocity seed, start frame | Engine | Until it settles or is replaced |
| Data | **Pose** per node per frame: local `translate`/`scale` (+ opacity, radius) | Solver output | One frame |
| Data | **Registry**: element → options; `layoutId` → lead and exiting follower; retained departed boxes | Scope | Until unregister (+ retain window) |
| Data | **Presence state**: present / entering / exiting / exited, re-entry token | Presence handle | Until exit settles |
| Action | Commit transaction: capture B → mutation → measure A → plan → write t=0 pose | Scope | Per commit |
| Action | Frame: solve every track top-down → write changed declarations | Engine on the core clock | Per frame while animating |
| Action | Retarget, handoff, crossfade, snap, settle, dispose | Planner / scope | As triggered |
| Interface | Vanilla `createLayoutGroup` with `add / set / capture / flush / update / finish / dispose` | `ani-layout` | Public |
| Interface | React `useLayout`, `LayoutGroup`, `AnimatePresence`, `usePresence`, `useLayoutGroup` | `ani-react/layout` | Public |

**Invariants every design choice below must keep:**

1. First painted frame after a change = the previous visual box (no flash, no late start).
1. Final frame = the real layout, identity pose, inline styles byte-identical to before, no subscription left.
1. One owner per CSS property on a participant.
1. Interruption is continuous in position and velocity.
1. A node whose target did not change is never touched.
1. Anything the solver cannot do exactly snaps, with a typed reason.

## Commit and frame model

Each commit costs one batched read before the mutation and one after; every animation frame after that is pure arithmetic plus writes, inside the core clock's update and commit phases.

[diagram: commit and frame model · 5 steps, 2 branches]

**Capture B in render.** The first `useLayout` or `LayoutGroup` render of an epoch reads every participant of the outermost scope: `getBoundingClientRect`, page scroll, and the inline transform of participants that presence animates. React has not mutated the DOM yet, so this is the true before box, not a remembered one. Reads are idempotent, so StrictMode's double render is harmless.

**Flush from the commit, not from render.** A layout effect of the same commit closes the epoch and queues one microtask. The microtask runs after every layout effect (presence has lifted its `popLayout` exits by then) and before paint on every commit path. It reads A for all participants, plans, writes the t = 0 pose, then joins the clock.

**Validity rules for an epoch:**

- A capture is consumed only by the commit whose layout effect closes it (an epoch counter, bumped per scope commit). A render that never commits leaves nothing behind.
- Another commit between capture and flush, or a solver frame written in between, makes the epoch stale. A stale epoch snaps with `'stale'`; it never guesses.
- Several commits before one flush coalesce: B from the first, A from the last.
- Page scroll between capture and flush is compensated; a moved inner scroller makes the epoch stale.

**Timing rules on the clock:**

- A track's time starts at its first clock update, and that update's `dt` is forced to 0. Without this, a 120 ms block after the commit would hand the first frame `dt` ≈ 120 ms and recreate the measured late-start defect.
- After the first frame, tracks use the clock's lag-smoothed `dt`, so mid-run jank costs frames, not duration, exactly like every other Ani animation.
- No DOM read happens in any frame. The read phase is unused; update solves; commit writes only declarations whose value changed.

## Projection, interruption and presence

Every animating node's drawn box is a closed-form function of time, and its pose is that box seen through its parent's drawn map. That one rule gives nesting, counter-scale, anchors and handoff.

### Track

Each channel (x, y, width, height) runs from B to A on the node's own timeline, with τ = (elapsed − delay) / duration and e the core timing curve:

```latex
c(\tau) = A + (B - A)\,\bigl(1 - e(\tau)\bigr) + k\,\tau\,(1-\tau)^2, \qquad k = v\,D + (B - A)\,e'(0)
```

- c(0) = B and c(1) = A for every timing. Before its delay a channel holds B.
- The k term carries the incoming velocity v and vanishes at both ends. It works for bezier, linear and Core's stateless `timing.spring` alike; Core's spring starts at zero velocity and ignores a passed velocity, so the term is the only way to keep velocity continuous. k is clamped; the bound comes from the velocity frame test.
- Timing must be stateless. `dynamicSpring` is rejected synchronously with `ANI_INVALID_OPTIONS` in this version.

### Projection

Mπ is the parent chain's per-axis affine map from layout space to drawn space (scale and offset), solved parent-first each frame. For node n with drawn box V(t) and layout box A, and transform-origin offset o:

```latex
V' = M_\pi^{-1}(V), \qquad s = \frac{V'_w}{A_w}, \qquad t = V'_x - A_x - o_x\,(1 - s), \qquad M_n = M_\pi \circ T_n
```

- `layout: true` animates position and size. `'position'` pins the drawn size to A, so under a scaling parent the node gets a counter-scale automatically. `'size'` pins the drawn position.
- `layoutAnchor` (u, v) replaces the position channels: the node's anchor point is placed at the parent's drawn anchor point every frame, plus an initial discrepancy that decays on the node's own timeline (zero in E1).
- Depth is unlimited and cost is O(N) arithmetic per frame.
- `radius: true` reads the four corner radii once at flush and writes each as r/sx and r/sy (CSS elliptical radii), so corners stay round under scale.

### Interruption

A new commit while tracks run never reads animated state. B for an animating node is the engine's current drawn box; its velocity is the central difference of the old track at that instant. Only nodes whose A moved by at least `threshold` (or whose options changed) get a new track. Every other node keeps its track untouched, so an unrelated re-render cannot restart anything.

### Shared layoutId and crossfade

- Per id the registry keeps one **lead** (newest connected, non-exiting registrant) and at most one **follower** (a node exiting under presence).
- Handoff: the arriving lead's B is the departing node's drawn box, from the live follower or from a box retained for `retain` seconds (default 1) in page coordinates.
- Crossfade runs only when the lead changed in this epoch, the follower is exiting under presence, the box moved by at least `threshold`, and `layoutCrossfade` is not false. Both nodes draw at the lead's box; opacities are w and 1 − w on the lead's timeline.
- The follower is held at opacity 0 until presence unmounts it, and presence's release waits for the crossfade to end. Nothing pops back to opacity 1.
- Two live, non-exiting nodes with one id raise a dev warning; the newest leads and the other is left alone.

### Property ownership on one element

CSS composes individual properties as translate · rotate · scale · transform, so layout's projection is the outer map and presence's transform the inner one.

| Property | Owner | Rule |
|---|---|---|
| `translate`, `scale` | Layout | Authored values (Tailwind `translate-*`, `hover:scale-105`) are composed: translate = Δ + s·authored, scale = s·authored. They are frozen for the run and restored byte for byte on settle. A running CSS transition or animation on them snaps the node. |
| `transform` | Presence and core | Divided out of the measured rect (inline matrix, `DOMMatrix`). Participant ancestors' presence matrices join Mπ. |
| `transform-origin` | Author | Read once per mover, folded into the translate. |
| `opacity` | Presence; layout only for a crossfade pair | A presence `present` record that names `opacity` on a crossfade node gives a dev warning and no crossfade. |
| `border-radius` | Layout when `radius: true` | Restored on settle. |
| `rotate`, skew, non-translation ancestor transforms | Author | The subtree snaps with `'unsupported'`. |

**popLayout.** Presence lifts the exiting node to `position: absolute` in its layout effect, before the flush, at its previous drawn box relative to its containing block (fixing the 0.1.0 offset bug when `offsetParent` is unpositioned). Siblings are measured without the gap and move from t = 0.

## Public API

The API uses Motion's vocabulary (`layout`, `layoutId`, `layoutAnchor`, `layoutCrossfade`, `layoutDependency`) with Ani's own `motion` in seconds, so Motion's examples port line for line.

### Vanilla — `@freestylejs/ani-layout`

```ts
import type { Clock, ReducedMotionPolicy, TimingFunction } from '@freestylejs/ani-core'

export interface LayoutMotion {
  readonly duration?: number          // seconds, default 0.35
  readonly delay?: number             // seconds, default 0
  readonly timing?: TimingFunction    // stateless only; default ease-out bezier
}

export interface LayoutOptions {
  readonly layout?: true | 'position' | 'size'   // default true (position + size)
  readonly layoutId?: string
  readonly layoutAnchor?: { readonly x: number; readonly y: number }  // 0..1
  readonly layoutCrossfade?: boolean             // default true
  readonly layoutDependency?: unknown            // optional narrowing
  readonly radius?: boolean                      // default false
  readonly motion?: LayoutMotion
}

export interface LayoutGroupOptions {
  readonly id?: string                           // namespace for layoutIds
  readonly clock?: Clock                         // default defaultClock
  readonly motion?: LayoutMotion
  readonly reducedMotion?: ReducedMotionPolicy   // default 'jump'
  readonly threshold?: number                    // px, default 1
  readonly maxNodes?: number                     // visible movers, default 300
  readonly retain?: number                       // seconds a departed layoutId box is kept, default 1
  readonly onSnap?: (element: HTMLElement, reason: SnapReason) => void
}

export type SnapReason = 'culled' | 'capped' | 'unsupported' | 'stale' | 'reduced'

export interface LayoutReport {
  readonly status: 'ended' | 'interrupted' | 'no-change' | 'reduced' | 'capped' | 'stale' | 'disposed'
  readonly snapped: readonly { readonly element: HTMLElement; readonly reason: SnapReason }[]
}

export interface LayoutGroup {
  add(element: HTMLElement, options?: LayoutOptions): () => void
  set(element: HTMLElement, options: LayoutOptions): void
  capture(): void                                 // adapter hook: read B before a mutation
  flush(): Promise<LayoutReport>                  // adapter hook: read A, plan, run
  update(mutate: () => void): Promise<LayoutReport>  // capture → mutate → flush
  finish(): void
  dispose(): void
  readonly stats: { readonly captures: number; readonly reads: number; readonly tracks: number }
}

export function createLayoutGroup(options?: LayoutGroupOptions): LayoutGroup
```

`flush()` and `update()` follow Core's run contract: the promise never rejects and resolves once per run. Invalid options throw synchronously with an `AniError` code. `capture` / `flush` are the hooks future adapters use (Vue `onBeforeUpdate`, Svelte `beforeUpdate` give an exact pre-mutation moment).

### React — `@freestylejs/ani-react/layout`

```ts
useLayout<E extends HTMLElement>(options?: LayoutOptions & { ref?: Ref<E> }): RefCallback<E>
<LayoutGroup id? motion? reducedMotion? threshold? maxNodes? retain? onSnap?>  // no DOM, no deps
useLayoutGroup(): { update(fn: () => void): Promise<LayoutReport>; finish(): void }
<AnimatePresence initial? mode?: 'sync' | 'popLayout' | 'wait' custom? onExitComplete?>
usePresence(motion, options?): { ref, style, isPresent, custom }
```

- A participant with no `LayoutGroup` joins an implicit root scope (one per clock and document, created lazily, disposed when empty). `LayoutGroup` only namespaces ids and supplies defaults; nested groups inherit and share one epoch. `LayoutConfig` is folded into `LayoutGroup`.
- **Trigger contract:** a commit animates when it renders the group or any participant of the scope. If state lives in a component that renders neither (memoized children below), place the `LayoutGroup` inside that component, or wrap the change in `useLayoutGroup().update(fn)`. A dev-only MutationObserver warns when a scope's subtree changed with no capture.
- `layoutDependency`: when given and equal to the last value, that participant is left out of capture and planning.

### Usage

```tsx
// 1. List reorder: mark the items, nothing else
function Item({ item }) {
  const ref = useLayout({ layout: 'position' })
  return <li ref={ref}>{item.label}</li>
}

// 2. Card → detail with nested shared ids (E4)
<LayoutGroup motion={{ duration: 0.45, timing: timing.spring({ m: 1, k: 300, c: 30 }) }}>
  {cards.map((c) => <Card key={c.id} card={c} onOpen={() => setOpen(c.id)} />)}
  <AnimatePresence mode="popLayout">{open && <Detail key={open} id={open} />}</AnimatePresence>
</LayoutGroup>
// Card and Detail both mark: the surface useLayout({ layoutId: `card-${id}`, radius: true }),
// the image useLayout({ layoutId: `img-${id}` }), the title useLayout({ layoutId: `title-${id}`, layout: 'position' })

// 3. Toast stack (E5): CSS lays the list out; presence and layout share the element
function Toast({ toast }) {
  const layout = useLayout({ layout: 'position' })
  const presence = usePresence(toastMotion)       // enter/exit on transform + opacity
  return <li ref={mergeRefs(layout, presence.ref)} style={presence.style}>{toast.text}</li>
}
<AnimatePresence initial={false} mode="popLayout">
  {toasts.map((t) => <Toast key={t.id} toast={t} />)}
</AnimatePresence>
```

## Module boundaries

The 1,207-line `layout_group.ts` is replaced by seven small modules; only `dom.ts` touches the DOM and only `realize/*` touches the clock or WAAPI.

[diagram: module map · 4 layers, dependencies point down]

- **Pure core** (`geometry`, `motion`, `plan`, `solve`) imports nothing from the DOM or the clock. Every behaviour in the projection section is a unit test on these four files, against an oracle that shares no code with them.
- **Shell**: `scope.ts` owns the registry, epochs and lifecycle and stays under 300 lines; `dom.ts` owns every read and every owned-style write and restore; `realize/raf.ts` is the one `Animatable`.
- **Realizer seam**: `start / stop / restore` over engine-neutral tracks, so the WAAPI phase adds a file and changes nothing above it.
- **React adapter** calls only the public group API (`add`, `set`, `capture`, `flush`). The 0.1.0 facade and its microtask snapshots are deleted.
- Target size about 900 lines for the whole layout core, a third smaller than today.

## Failure, snap and reduced motion

The rule is **snap, never wrong motion**: anything the solver cannot do exactly jumps to the real layout and is reported with a typed reason in `report.snapped`, in `onSnap`, and once per reason as a dev warning.

| Condition | Behaviour | Reason |
|---|---|---|
| Both boxes outside the viewport + 10 % | That node jumps, uncounted | `'culled'` |
| Visible movers exceed `maxNodes` (300) | The whole change snaps; the unit is never a lone node inside an animating subtree or id pair | `'capped'` |
| Rotate, skew, non-translation ancestor transform, unparseable inline transform, running CSS transition on `translate`/`scale`, zero-size or `display: contents`, scale outside 1/50–50 | That subtree snaps | `'unsupported'` |
| Capture not consumed by its own commit, another commit or a solver frame in between, inner scroller moved | The epoch snaps | `'stale'` |
| Reduced motion `'jump'` (default) | No tracks, active tracks finish at once, zero writes, no clock subscription | `'reduced'` |
| Reduced motion `{ maxDuration }` | Duration and delay clamped in `motion.ts`, the single place | — |
| Reduced motion `'ignore'` | Plays in full | — |
| `dispose()` or unmount | Tracks cancelled, inline styles restored, presence released | status `'disposed'` |
| `finish()` | Every track jumps to A and settles | status `'ended'` |
| No DOM (SSR) or first client commit | No-op; hydration never animates | — |

Reduced motion is read from the scope's clock (`clock.reducedMotion`) at every flush, exactly as Core's timelines do, so a mid-run toggle applies at the next commit. Invalid options (negative duration, a stateful timing, an anchor outside 0–1) throw synchronously with `ANI_INVALID_OPTIONS`, never inside a frame.

## Test and acceptance

A row passes only when every frame of a real browser run matches an oracle that shares no code with the solver; final rects and no-crash tests count for nothing.

**Oracle.** At elapsed time t, every node's visual rect must equal its own track in absolute coordinates: `lerp(B, A, e(τ))` plus the velocity term, with its anchor rule applied. Nested exactness is exactly this statement, so depth, delays and mixed timings need no special test logic.

**Three layers:**

1. **Pure property tests** on `solve` and `plan`: random trees to depth 5, random timings and delays; composed pose equals the oracle within 1e-9; c(0) = B, c(1) = A, c′(0) = v; keep-versus-retarget; every snap reason.
1. **Deterministic browser tests** in Chromium, Firefox and WebKit with a manual clock (`createClock({ requestFrame, now })`). Each step records every participant's `getBoundingClientRect`, inline style and `getAnimations().length`, and compares rects with the oracle within 0.5 px.
1. **Real-clock tests**, few: the jank test, read counts, frame cost.

| Row | Frame-level assertion |
|---|---|
| E1 Layout Anchor | Child centre on parent centre ≤ 0.5 px every frame; child stays 70 px until 0.8 s; child starts at 0.8 s ± one frame |
| E2 Create Button | Opacity sum 1 ± 0.05 every frame; label glyph height constant ± 1 px (counter-scale); close and reopen at 100 ms and 500 ms |
| E3 iOS Folder | Four shared tiles first and final rects; tile scale 0.2 ± 0.02; stagger ± one frame; reopen at 500 ms |
| E4 App Store | Card, image and title nested ids; no gap > 0.5 px in image coverage; title size pinned (`'position'`); close and reopen |
| E5 Notifications | First frame equals the enter transform; siblings final at t = 0 under popLayout; exit ≈ 0.2 s; bottom edge ± 1 px under scaleX; five adds 80 ms apart |
| Reduced 2D Gallery | 16 tiles grid ↔ list, plus a detail view with a shared id |

**Regression tests for every defect found in 0.1.0:**

- **Late start:** state change, then a 120 ms block in the same task; the first painted frame is ≤ 6 % through the animation (0.1.0 measured 73–89 %).
- **Unrelated re-render:** re-render a participant and a non-participant ancestor mid-run; the trajectory is identical frame for frame to a control run.
- **Crossfade:** a re-render with no box change keeps opacity at 1 every frame; a real crossfade ends with no pop back to 1.
- **Velocity:** retarget mid-run in position and in size; velocity changes by ≤ 5 % across the retarget under a jank-injected clock.
- **Reduced motion:** zero writes, zero clock subscribers, exact final rect, and a mid-run toggle.
- **Showcase honesty:** toast rects never intersect once settled; E2–E4 fixtures must contain the shared tiles and nested ids their rows name.

**Invariants on every frame of a seeded fuzz** (random commits, mounts, interruptions): no NaN; no DOM read after the first write in a tick; one writer per property; final inline style byte-identical; no subscription left.

**Cost gates:** reads per commit = 2N rects plus one computed-style read per mover; zero reads on steady frames; frame time recorded at 50, 300 and 1,000 participants.

## Migration, phases and rollback

ani-layout 0.1.0 was never published, so this is a clean break to 0.2.0 with no shims, shipped separately from the ANI 2.0 core release.

| Part of 0.1.0 | Fate | Note |
|---|---|---|
| `presence.ts`, `presence_state.ts`, React `presence.tsx` | Keep | Small edits: popLayout containing-block fix, opacity rule, release held during crossfade |
| `view_transition.ts`, `feature.ts`, `easing.ts` | Keep | Discrete swaps only; separate from the interactive path |
| Browser harness and fixtures (`cpc_harness.ts`, E1–E5 pages) | Keep, re-derive | Expected values recomputed from the new oracle |
| `layout_group.ts` (1,207 lines) | Rewrite | Into `geometry`, `motion`, `plan`, `solve`, `dom`, `scope`, `realize/raf` |
| React `use_layout.ts`, `layout_group.tsx` | Rewrite | Render touch + function component; no class, no `deps` |
| `projection/*`, `cpc_oracle.test.ts`, WAAPI FLIP writer | Delete | CPC retired |
| React facade in `context.ts`, `LayoutConfig`, `maxBoxes`, `'preserve-aspect'` | Delete | `LayoutConfig` folds into `LayoutGroup` |
| `ARCHITECTURE.md`, `ARCHITECTURE_CPC.md` | Replace | One short document derived from this one |
| Showcase toasts at `top: index * 48` | Rewrite | Laid out by CSS flow |

**Renames:** `layout: 'box'` → `layout: true`; `LayoutResult` → `LayoutReport`; `play(snapshot)` → `flush()`.

**Phases, each closed by its own evidence:**

1. **P0 spikes** (next section). Any failed stop condition reopens this architecture before code is written.
1. **P1 pure core + RAF engine + vanilla API.** Gate: property tests green; deterministic browser tests for flat moves, nesting, anchor and interruption in three engines.
1. **P2 React adapter + presence composition.** Gate: StrictMode, concurrent transition and Suspense tests; the trigger-contract dev warning; E5 green.
1. **P3 E1–E5 + reduced 2D Gallery** rebuilt honestly. Gate: every row in the acceptance table, every regression test, cost gates.
1. **P4 WAAPI engine, optional.** Scope: depth-0 tracks only (no participant ancestor that animates), `'position'` first; no anchor, no velocity term; anything else throws at `add` / `set`, never degrades. It never writes `startTime`: animations are created in the flush and start at the browser's pending-play time, so the first painted frame is τ = 0. Gate: RAF-vs-WAAPI differential ≤ 0.5 px per frame; 120 ms block test ≤ 6 %; a trace showing compositor-only frames during a block. If the trace fails, the engine does not ship.
1. **Later:** Vue, Svelte and Solid adapters over `capture` / `flush`.

**Rollback.** Nothing is published, so rollback is a branch decision: the 0.1.0 code stays in git history on v2/main and the rewrite lands on its own branch until P3 passes. The V2 core release is independent of every phase here.

## Debate record

Two Sonnet 5.5 (high) agents worked independently from the same brief, then cross-examined each other: Agent A as simplicity architect, Agent B as critical judge. Both arrived separately at the same core (one solver on the core clock, exact nesting through the inverted parent map, layout owning `translate`/`scale`), so the debate settled only the points below.

| Point | Agent A (first pass) | Agent B (first pass) | Resolution |
|---|---|---|---|
| D1 Before box | Read in render, flush in a microtask | Remembered baseline + staleness events, read in the next frame | A's render capture (B conceded: a remembered baseline gives wrong motion after any unseen layout change). Hardened with B's three fixes: flush scheduled from the commit, epoch invalidated by any intervening commit, first `dt` forced to 0 |
| D2 Memoized subtree renders nothing | Contract: group at the state owner | MutationObserver + baseline | A's contract plus `useLayoutGroup().update(fn)`; the MutationObserver kept as a dev-only warning, since a baseline would reintroduce wrong motion |
| D3 Velocity | Additive k term, finite difference | Spring velocity via `step`; bezier restarts at 0 | A's k term with B's analytic central difference on the old track. Decisive fact: Core's `timing.spring` ignores a passed velocity |
| D4 Crossfade | Lead + exiting follower | Lead/follow gated on box change | Both conditions, plus presence release held until the fade ends |
| D5 Caps | Extras snap per node | Whole change snaps | Culled nodes jump alone; too many visible movers snap the whole change (A conceded overlap) |
| D6 Authored `translate`/`scale` | Snap | Snap | Both reversed in debate: compose and freeze for the run |
| D7 WAAPI | Later, same plan | Later, position only | A later gated phase; never write `startTime` |
| D8 Names | Short names | `mode`/`id`/`trigger` | Motion vocabulary; implicit root scope |

**Rejected alternatives:**

- **Repair the compiled WAAPI core (CPC).** Its sampling error is created by the engine and bounded by an estimator that was never built; depth is capped by the compiler's shape; velocity is approximate; the late-start and restart defects come from its structure; the compositor claim was never shown. Simpler and exact beats bounded and approximate.
- **Two complete engines with full parity now.** It doubles the test surface for a guarantee you chose not to require for nested layout.
- **A class component per participant (****`getSnapshotBeforeUpdate`****) or an element factory.** Exact, but it forces a wrapper component instead of a hook. Kept as the fallback if spike S1 fails.
- **The 0.1.0 ****`deps`**** boundary.** Ruled out by your authoring decision; it caused both missed animations and restarts.

## P0 spikes, risks and open questions

The approval holds only if four short spikes pass in Chromium, Firefox and WebKit before P1 code is written; each has a stop condition and a named fallback.

| Spike | Must show | Stop condition | Fallback |
|---|---|---|---|
| S1 Render capture | Captures stay valid under StrictMode, `startTransition`, `useDeferredValue`, Suspense and React Compiler, on React 18.3 and 19 | A capture can be consumed by the wrong commit, or ordinary transition updates go stale more than 1 in 20 | A per-participant class wrapper with `getSnapshotBeforeUpdate` (a component, not a hook) |
| S2 First frame | Commit-scheduled flush plus first `dt` = 0: after a 120 ms block, the first painted frame is ≤ 6 % through | Above one frame of progress in any engine | Reopen the commit model |
| S3 Composition | An E5 toast mid-enter and a `hover:scale-105` card measure within 0.5 px after dividing out presence and authored transforms | Error above 0.5 px | Snap those nodes with `'unsupported'` and document it |
| S4 Cost | Commit reads at 1,000 participants ≤ 4 ms; steady frame at 300 nested movers ≤ 2 ms p95 on the bench host | Either budget missed | Lower the `maxNodes` default to what passes |

**Accepted risks:**

- Nested layout motion is not compositor-smooth while the main thread is blocked; this follows from your moat decision, and P4 covers flat moves only.
- Render-phase DOM reads bend React's purity norm (reads only) and can force a layout during render when the DOM is dirty; S1 and S4 measure both.
- A state change that renders no participant and no group does not animate; documented, with a dev-only warning.
- The velocity term is a continuity device, not spring physics; a retarget may feel slightly different from Motion's.
- Text under scale re-rasterizes and can look soft mid-flight, as with any transform-based layout animation.
- An authored `translate`/`scale` change during a run (hover mid-flight) applies after settle.

**Open questions for you:**

- Default `layout` value: `true` (Motion parity, position + size) is proposed; 0.1.0 defaulted to `'position'`, which never stretches text.
- Reject `dynamicSpring` in layout motion for 0.2.0 (stateless timing only)?
