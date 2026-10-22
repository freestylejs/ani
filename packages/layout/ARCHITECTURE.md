> **v0.2 authority notice:** `packages/layout/ARCHITECTURE_CPC.md` is the
> authoritative projection/API contract for the Compiled Projection Core. This
> file remains the v1 historical contract; where the two conflict, CPC wins.

> **Authority note (2026-10-21):** This is the implementation authority for `@freestylejs/ani-layout`. The earlier `ANI_LAYOUT_ARCHITECTURE_DECLARATIVE.md` is superseded; its declarative boundary goal is preserved here, while the engine is the final pragmatic tier: View Transitions + WAAPI approximate FLIP + snap. Read this document before changing the package.

# ANI Layout — Final Pragmatic Architecture

**Date:** 2026-10-21  
**Candidate:** ANI V2 `6715bb1`  
**Reviewer:** Claude Opus 5.5 `<high>` — fifth pass  
**Verdict:** **APPROVE** for the pragmatic, tiered Motion-level architecture  
**Implementation gate:** P0 browser hypotheses must pass; **H2 is a hard stop**.

---

## 0. The decision

Do not animate every layout in JavaScript, pixel by pixel.

Use two **browser-native** motion engines, and let ANI do math once per change:

1. **View Transitions** — for discrete route/page/view/shared-element swaps. Browser snapshots, zero per-frame JS.
2. **WAAPI approximate FLIP** — for interactive list reorder, tabs, accordions, cards. `Element.animate()` on the compositor, zero per-frame JS.
3. **Snap** — whenever measurement is unreliable, the change is too large, or the UI is not worth animating.

Quality is intentionally tiered:

- **Exact:** `p=0` matches the before visual; `p=1` is the real layout; no flash; no wrong final position.
- **Approximate:** size path, radius between samples, text raster sharpness, velocity on retarget.
- **Never:** pixel-perfect projection on every node at any cost.

This is the “cheap but good” model the user asked for.

---

## 1. Capability tiers

| UI class | Tier | Fallback | Never |
| :--- | :--- | :--- | :--- |
| Route / page / view swap | **View Transition** | Instant swap | Whole-page FLIP |
| Shared element, card→detail, card→modal (discrete) | **View Transition** + shared name | Instant | Cross-route FLIP |
| In-place interruptible expand | **FLIP `box`** surface + `position` content | Snap | View Transition |
| List reorder / insert / remove | **FLIP `position`** + presence | Snap | View Transition |
| Accordion / disclosure | **FLIP `position`** on siblings + presence content | Snap | Height animation |
| Tab indicator | **FLIP `box` + `layoutId`** | Snap | View Transition |
| Modal / toast | Presence; FLIP `position` for siblings | Instant | — |
| Grid N≥1000 | **FLIP `position`**, viewport-culled, max 300 movers | Snap | View Transition |
| Drag / scroll-linked | Core `follow`/springs | — | Layout FLIP |

**No precise-tier option and no `fidelity` switch.** The API you call chooses the tier; quality steps down automatically inside FLIP.

---

## 2. View Transitions

### 2.1 Where they are correct

Infrequent, user-initiated, discrete changes where blocking input for ≤0.5s is acceptable:

- routes/pages
- view-mode/theme switches
- hero/shared elements
- Suspense reveals
- card→modal when the change is discrete

### 2.2 Where they are wrong

| Case | Why |
| :--- | :--- |
| List reorder/insert/remove | N names/textures; duplicate names abort; not retargetable; list unclickable |
| Accordion, drawer, menu, tab indicator | Not interruptible; new transition skips old to end, causing a jump |
| Filter-as-you-type, live data, drag, resize, scroll | Freezes rendering during update; recaptures the document |
| Video/canvas/caret/spinner | Old snapshot is a frozen bitmap |
| Scroll/clip containers | Captured elements lift above overflow/sticky |
| Text aspect changes | Snapshot stretches unless author CSS corrects pseudo-elements |

**View Transitions are not the universal layout engine.** They are the discrete-swap tier.

### 2.3 Vanilla API

```ts
import type { Clock, ReducedMotionPolicy } from '@freestylejs/ani-core'

export interface ViewTransitionOptions {
  /** layoutIds to morph; only these get names, only for this transition. */
  readonly share?: Iterable<string>
  /** Used when ViewTransition.prototype.types exists. */
  readonly types?: readonly string[]
  /** Retimes UA group/old/new animations. Clamped to [0.1, 0.5]s. */
  readonly motion?: LayoutMotion
  /** Default 'jump' → update runs without transition. */
  readonly reducedMotion?: ReducedMotionPolicy
  /** Live reduced-motion source. Default defaultClock. */
  readonly clock?: Pick<Clock, 'reducedMotion'>
}

export type ViewTransitionResult =
  | 'finished'
  | 'skipped'
  | 'interrupted'
  | 'yielded'
  | 'unsupported'
  | 'reduced'

/** update runs exactly once in every path. Rejects only if update throws/rejects. */
export function viewTransition(
  update: () => void | Promise<void>,
  options?: ViewTransitionOptions
): Promise<ViewTransitionResult>

/** Registers a shared-element candidate; writes nothing until shared. */
export function shareElement(element: HTMLElement, id: string): () => void

/**
 * Retimes running ::view-transition-* animations to ANI timing.
 * Springs are sampled to CSS linear(). 0 means cosmetic UA timing fallback.
 */
export function retimeViewTransition(
  motion: LayoutMotion,
  names?: readonly string[]
): number

export function supportsViewTransition(): boolean
```

### 2.4 Algorithm

1. No DOM / no `document.startViewTransition`: `await update()`, resolve `'unsupported'`.
2. Reduced motion: `await update()`, resolve `'reduced'`.
3. Foreign transition active (`document.activeViewTransition`, else `:active-view-transition` in try): run update, resolve `'yielded'`. **Do not call `startViewTransition`; it would kill React/router transition.**
4. ANI transition active: let browser skip old one (`'interrupted'`), start new one. Accept jump to old end.
5. Name shared elements only for the transition duration:
   - most recently registered connected element per id;
   - save inline `view-transition-name`;
   - inside update, after update resolves, newest connected registrant becomes lead;
   - restore old element, name lead;
   - cap 32 names; extras remain unnamed + dev error;
   - duplicates impossible: one name per id, one element.
6. On `ready`, `retimeViewTransition(motion, names)`.
7. On finish/skip, restore names byte-for-byte.
8. Dev warning if `update` >100ms. Data must load before transition.

### 2.5 React / routers

- **React ≥19.3:** use React's `<ViewTransition name>`; ANI only supplies `onShare={() => retimeViewTransition(motion, [name])}`.
- **Next.js App Router** with view transitions: same React path.
- **React Router `<Link viewTransition>`:** its update callback keeps the snapshot live; ANI FLIP yields.
- **React 18 / 19.0–19.2:** recipe `viewTransition(() => flushSync(fn), { share })`; no wrapper.
- **Vue Router / SvelteKit:** recipes with commit-completion hooks.
- **Cross-document:** CSS `@view-transition { navigation: auto }`; Chrome/Safari; Firefox instant fallback.
- **ANI ships no React VT wrapper.** React owns it and interrupts other callers.

### 2.6 Composition with core

- Old snapshot freezes in-flight core animations.
- New image is live; core continues inside it.
- Do not drive named elements with core during transition.
- FLIP yields during a transition.
- A VT started mid-FLIP captures the mid-flight visual; acceptable.

---

## 3. Approximate FLIP

### 3.1 Engine

Per participant: one `Element.animate()` per change.

- Keyframes computed once; `fill: 'none'`.
- Easing: ANI `timing` sampled to CSS `linear()` (48 points); fallback cubic-bezier or ease-out.
- Browser runs it on compositor for `translate`/`scale`.
- **No ANI clock subscription, no rAF, no per-frame reads or writes.**
- Main-thread jank after DOM change does not stutter motion.

### 3.2 `position` mode (default)

```js
el.animate(
  [{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }],
  { duration, easing, composite: 'add', fill: 'none' }
)
```

- `composite:'add'` adds to CSS/Tailwind `translate`, including percentages.
- Core `transform` untouched.
- No inline writes, no restore, no transition-neutralizing hack.

### 3.3 `box` mode (position + size; surfaces only)

Per axis, with layout box after `A` (`a`, `wA`), visual before `B` (`b`, `wB`), origin `o`:

```text
s = wB / wA
t = b - a - o * (1 - s)
```

Both edges move linearly in eased progress; box interpolation is exact. Assumes no rotation.

- Radius correction: sampled keyframes of `r/sx(p) r/sy(p)` (11 offsets), only for `box` nodes, ≤16 per change.
- One `getComputedStyle` per `box` node per change, after all rect reads; reads `transform-origin`, base `scale`, four radii.
- Base `scale ≠ none` → position-only.
- `layoutId`: new participant animates from departing participant’s captured box in same snapshot; newest wins; older still-mounted snaps.
- Nested correction P2, one level, gated on H5. Unregistered content inside `box` distorts by design.

### 3.4 Exact vs approximate

**Exact:**

- `p=1` real layout; effect removed.
- `p=0` within 0.5px position / 1px box edges.
- No flash: first frame is keyframe 0.
- No wrong final position.
- Interruption continuity within 0.5px.

**Approximate:**

- path when core transforms change simultaneously;
- velocity restarts at zero on retarget;
- radius between samples;
- text raster sharpness during scale;
- sub-pixel settle.

### 3.5 Automatic step-downs

| Condition | Action |
| :--- | :--- |
| `|dx|,|dy| < 1px` and scale within 1% | Skip |
| Zero-size, `display: contents`, SVG without offset, no before | Skip |
| `rect.w/offsetWidth` or `rect.h/offsetHeight` deviates >2% | **Snap** (unreliable measurement) |
| `box` scale outside `[0.25, 4]` | Position-only |
| `box` nodes beyond `maxBoxes` (16) | Position-only |
| Both boxes outside viewport +10% | Snap |
| Visible movers > `maxAnimated` (300) | **Whole change snaps** (`'capped'`) |
| Active View Transition at play | `'yielded'` |
| Reduced motion | `'reduced'`, zero animations |

### 3.6 Where cheap FLIP looks bad

1. `box` on text/icons/1px borders with aspect change: squash/stretch. Use surfaces/images; content sibling or registered child.
2. Width-changing text: line breaks cannot morph; position-only + snap size, or VT crossfade.
3. Shared element with different content without crossfade: content pops; use VT or surface + presence fade.
4. Exit-then-slide without popLayout: gap lingers; use `AnimatePresence mode="popLayout"` when siblings must move immediately.
5. Rapid reorder with springs: velocity kink; drag uses `follow`.
6. Moves across scroll containers: clipped mid-flight; VT for discrete drop.
7. `position: fixed` descendants of moving item: transform creates containing block; known break.

### 3.7 Why no Pretext-style prediction

FLIP needs real layout after DOM change. The browser does that layout before paint anyway; FLIP’s one read moves it earlier, not adds it. Predicting flex/grid/container-query layout in JS means reimplementing CSS and being wrong. No text measurement, no width/height/top/left/font animation, so no rewrap per frame.

---

## 4. Public API

### 4.1 `@freestylejs/ani-layout`

One root entry, zero dependencies, core diff 0 B.

```ts
import type { Clock, ReducedMotionPolicy, TimingFunction } from '@freestylejs/ani-core'

export interface LayoutMotion {
  readonly duration?: number // default 0.35s
  readonly timing?: TimingFunction // sampled to CSS linear()
}

export type LayoutMode = 'position' | 'box'

export interface LayoutParticipantOptions {
  /** Default 'position'. 'box' = position + scale + radius; surfaces only. */
  readonly layout?: LayoutMode
  /** Shared identity within root group (same-document, interruptible). */
  readonly layoutId?: string
}

export interface LayoutGroupOptions {
  motion?: LayoutMotion
  /** Default 'jump'. Evaluated at play against clock.reducedMotion. */
  reducedMotion?: ReducedMotionPolicy
  clock?: Pick<Clock, 'reducedMotion'>
  threshold?: number // default 1px
  maxAnimated?: number // default 300
  maxBoxes?: number // default 16
  onError?: (error: unknown, element: HTMLElement) => void
}

export type LayoutResult =
  | 'ended'
  | 'no-change'
  | 'interrupted'
  | 'finished'
  | 'disposed'
  | 'stale'
  | 'yielded'
  | 'capped'
  | 'reduced'
  | 'unsupported'

export interface LayoutGroup {
  add(element: HTMLElement, options?: LayoutParticipantOptions): () => void
  set(element: HTMLElement, options: LayoutParticipantOptions): void
  update(mutate: () => void, motion?: LayoutMotion): Promise<LayoutResult>
  capture(): LayoutSnapshot
  play(snapshot: LayoutSnapshot, motion?: LayoutMotion): Promise<LayoutResult>
  finish(): void
  readonly active: boolean
  dispose(): void
}

export function createLayoutGroup(options?: LayoutGroupOptions): LayoutGroup
```

`capture`/`play` are the adapter interface; `update` is the vanilla declarative-in-scope transaction.

**Presence API is unchanged** from the prior final architecture:

- `reconcilePresence` / `settlePresence`
- `createPresence` on `createStates`
- `PresenceMotion`, `PresenceHandle`
- watchdog, re-entry token, reduced-motion release

### 4.2 `@freestylejs/ani-react/layout`

`'use client'` first; React 18/19 peers.

```ts
export interface LayoutGroupProps extends LayoutGroupOptions {
  children?: ReactNode
  deps?: DependencyList
}
export const LayoutGroup: ComponentType<LayoutGroupProps>

export interface UseLayoutOptions<E extends HTMLElement>
  extends LayoutParticipantOptions {
  ref?: Ref<E>
}
/** Stable callback; options read from latest render. */
export function useLayout<E extends HTMLElement = HTMLElement>(
  options?: UseLayoutOptions<E>
): RefCallback<E>

export interface LayoutGroupControl {
  update(fn: () => void): Promise<LayoutResult>
  finish(): void
}
export function useLayoutGroup(): LayoutGroupControl

export interface AnimatePresenceProps {
  children?: ReactNode
  initial?: boolean
  mode?: 'sync' | 'popLayout'
  onExitComplete?: (key: string) => void
}
export function AnimatePresence(props: AnimatePresenceProps): ReactElement

export interface UsePresenceResult<E extends HTMLElement> {
  ref: RefCallback<E>
  style: CSSProperties | undefined
  isPresent: boolean
}
export function usePresence<G extends GroupableRecord, E extends HTMLElement = HTMLElement>(
  motion: PresenceMotion<G>,
  options?: PresenceOptions
): UsePresenceResult<E>

export function usePresenceControl(options?: { maxExitMs?: number }): {
  isPresent: boolean
  safeToRemove: () => void
}
```

### 4.3 Usage

```tsx
// Tab indicator: FLIP box + layoutId
function Tab({ active, label }) {
  const ref = useLayout({ layout: 'box', layoutId: 'tab-indicator' })
  return <button>{label}{active && <span ref={ref} className="indicator" />}</button>
}

// Route hero: React 19.3 owns the transition
<ViewTransition
  name={`photo-${id}`}
  onShare={() => retimeViewTransition(motion, [`photo-${id}`])}
>
  <img src={src} />
</ViewTransition>

// Vanilla
const group = createLayoutGroup({ motion: { duration: 0.3 } })
items.forEach((el) => group.add(el))
await group.update(() => list.append(list.firstElementChild!))
await viewTransition(() => render(next), { share: ['hero-42'], motion })
```

**Rejected:** `<layout.div>` element factory, `fidelity` option, ANI React VT wrapper. Reasons: measurement frequency, API noise, duplicate orchestrator.

---

## 5. Performance model

| Phase | Reads | Writes | Forced layouts |
| :--- | :--- | :--- | :--- |
| Capture | N `getBoundingClientRect`; 0 `getComputedStyle` | 0 | 0 if clean, ≤1 if dirty |
| Play | N rects; active retarget may use N precheck + N post-cancel layout reads (≤2N); `offsetWidth/Height` for movers; ≤16 gCS (box); `getComputedTiming()` for interrupted | `animate()` × movers after all reads | **Exactly 1** (owed anyway) |
| Frames | **0** | **0 JS**; radius on ≤16 nodes painted | 0 |
| No-change | N precheck rects; active run untouched | 0 | ≤1 |
| View Transition | 0 per frame | ≤32 names written/restored | Browser capture only |

**Interruption:** the pre-mutation snapshot is the `before` box. Play first measures the current visual once for the no-change check; if changed, it cancels the old animation, measures the new layout, and starts a replacement from the snapshot. An active no-change stops before cancellation. No animated state is inferred or analytically subtracted.

**Budgets:**

- N=1000, 300 visible movers:
  - capture ≤2ms desktop
  - play JS ≤6ms desktop / ≤16ms mobile
  - at most 1 dropped frame per change (Chromium trace)
- N=50 list: play ≤1ms.
- Forced layouts: capture ≤1, play =1, frames 0.
- gCS: position path 0; per change ≤ `maxBoxes`.

**Size budgets:**

| Entry | Budget | v1 measured (tree-shaken) |
| :--- | ---: | ---: |
| Core delta | 0 B | 0 B |
| `ani-layout` all | ≤7.5KB gzip | 7,274 B |
| FLIP-only | ≤3.0KB | 2,749 B |
| View Transition-only | ≤2.2KB | 1,915 B |
| Presence-only | ≤1.2KB | 815 B |
| `ani-react/layout` layout-only | ≤1.5KB | 1,340 B |
| `ani-react/layout` presence-only | ≤2.0KB | 1,785 B |
| `ani-react/layout` all | ≤3.2KB | 3,129 B |

Measured with esbuild, minified ESM, gzip, core/React/layout peers external, one feature entry per row. The root entry includes all three features, hence its larger budget. These are v1 gates; a change requires a measured amendment.

---

## 6. Browser / feature detection

| Capability | Detect | Floor | Below floor |
| :--- | :--- | :--- | :--- |
| FLIP | `Element.prototype.animate` && `CSS.supports('translate','1px')` && additive KeyframeEffect | Chrome 112, Firefox 104, Safari 16 | `'unsupported'`, snap |
| `linear()` | `CSS.supports('animation-timing-function','linear(0,1)')` | Chrome 113, Firefox 112, Safari 17.2 | cubic-bezier/ease-out |
| Same-doc VT | `typeof document.startViewTransition === 'function'` | Chrome 111, Safari 18, Firefox 144 | Instant |
| VT `types` | `'types' in ViewTransition.prototype` | per engine | Drop types |
| Active transition | `document.activeViewTransition`, else `:active-view-transition` try | per engine | Own flag + snapshot expiry |
| Cross-document VT | CSS `@view-transition` | Chrome 126, Safari 18.2; Firefox no | Instant |
| Element-scoped VT | not used | Chrome 147 only | Reopen when 2 engines ship |
| SSR/no DOM | `typeof document` | — | no-op; update runs |

Browser support must be rechecked in P0; floors are not a substitute for the harness.

---

## 7. Failure / skip / snap

| Case | Behavior |
| :--- | :--- |
| `update`/`mutate` throws | FLIP snapshot discarded, nothing written; VT rejects, names restored |
| Element detached mid-run | Cancel its animation; no inline restore needed |
| FLIP during VT | `'yielded'`, zero animations |
| ANI VT superseded | Old `'interrupted'` (visual jump accepted); updates run once, in order |
| Hidden doc/timeout | `'skipped'`; DOM correct; names restored |
| Duplicate shared ids | Newest wins; never two names |
| >32 shared elements | Extras unnamed, dev error |
| >300 visible movers | `'capped'`, whole change snaps |
| Unreliable measurement | Node snaps |
| `dispose()`/`finish()` | Cancel/finish group animations; idempotent |
| Presence | Watchdog, re-entry token, reduced-motion release unchanged |

---

## 8. Hard gates

**P0 hypotheses (Chromium/Firefox/WebKit before P1):**

| # | Must prove | Failure |
| :--- | :--- | :--- |
| H1 | `composite:'add'` translate sums with CSS `translate` (px, %) | Fallback: one gCS per moved node + `replace` |
| H2 | WAAPI created inside React/sync commit paints keyframe 0 on first frame, no flash | **Stop; reopen engine** |
| H3 | Analytic offset from `getComputedTiming` matches live rect within 0.5px | Cancel-then-read fallback |
| H4 | Budgets at 300 movers | Lower `maxAnimated` |
| H5 (P2) | Parent/child sampled animations drift ≤0.5px at 60/120Hz | Nested correction not shipped |
| T1 | VT pseudo animations retimable via `document.getAnimations()` | UA timing cosmetic fallback |
| T2 | Active-transition detection in React 19.3/React Router/ANI callbacks | Snapshot expiry + own flag |
| T3 | Inline name set inside update captured as new state | Framework hook names lead before resolving |

**Release gates:** kept D1–D12, D14, D16–D18, D21, D22, D26 plus:

- **G1 Frame path:** static ban on `requestAnimationFrame`/observers; zero layout clock subscriptions; `animate()` only in FLIP writer; `startViewTransition` only in `viewTransition`.
- **G2 No inline writes (FLIP):** randomized lifecycle leaves `style` byte-identical; `getAnimations()` empty after settle.
- **G3 Read/write order:** instrumented; capture 0 writes; play all reads before first `animate()`; forced layouts ≤1; gCS 0 position path / ≤maxBoxes.
- **G4 Endpoints:** paused `currentTime` 0/50/100%; p=0 within 0.5/1px; p=1 exact; first frame p=0.
- **G5 Interruption:** 10 retargets/300ms continuity ≤0.5px; one live animation per node.
- **G6 No-change:** 2N rects, 0 gCS, 0 animations created/cancelled, run untouched.
- **G7 Step-downs:** transformed-context/caps/culling/box-limit produce snaps, never wrong motion.
- **G8 VT names:** 50-cycle churn fuzzed share sets; zero `InvalidStateError`; names restored.
- **G9 VT paths:** update exactly once across unsupported/reduced/yielded/skipped/interrupted/finished/throw.
- **G10 Yield:** zero FLIP animations during active VT.
- **G11 Performance:** budgets.
- **G12 Size:** budgets.
- **G13 Disjointness:** dev error if core animates `translate`/`scale` on participant.

---

## 9. Implementation sequence

| Phase | Scope | Exit |
| :--- | :--- | :--- |
| **P0** | Three-engine harness for H1–H4, T1–T3 | Decision tree; H2 failure stops |
| **P1** | `ani-layout`: presence; FLIP position/box/layoutId; step-downs; `viewTransition`, `shareElement`, `retimeViewTransition`; React `LayoutGroup`, `useLayout`, presence; recipes list/tab/accordion/toast/route | G1–G13 + kept D-gates → 0.1.0 |
| **P2** | One-level nested correction; card-expand recipe | H5 + G4 nested |
| **P3** | Vue/Svelte/Solid adapters; router/MPA recipes; `popLayout` landed in the React adapter behind an opt-in mode | Per-adapter boundary matrix |
| **Reopen only on evidence** | Element-scoped VT, crossfade, `layoutScroll`, rotation projection, velocity handoff | — |

---

## 10. Accepted risks / deferred

| Item | Reopen when |
| :--- | :--- |
| No pixel-perfect projection on every node | Real user complaint; cost budget allows precise tier |
| `box` text/border distortion | Content-aware surface contract becomes necessary |
| Text raster softness | Never gated; `position` escape hatch |
| Velocity kink on retarget | Measured complaint |
| Shared element across routes | View Transition covers discrete; FLIP cross-route deferred |
| `layoutScroll`/`layoutRoot` | VT/scroll-container evidence |
| `layoutId` cross-route without VT | Requires View Transition |
| Rotation/skew projection | Separate cycle |
| Element-scoped VT | Two engines ship |
| Observers | Not needed; VT/FLIP cover the cases |

---

## 11. Final verdict

**APPROVE** for the pragmatic tiered architecture:

- **View Transitions** for discrete, infrequent swaps; React 19.3 owns React transitions.
- **WAAPI approximate FLIP** for interactive layout; zero ANI JS per frame, zero inline writes.
- **Snap** when measurement is unreliable or the change is too large.
- Exact `p=0`/`p=1`, no flash, no wrong final position; approximate path/radius/text.
- Core unchanged; no text measurement; no per-frame gCS; no `matrix3d` conflict.
- P0 H2 is the single hard stop.

> **Use the browser where it is best, use math where it is cheap, and snap when precision is not worth the cost.**
