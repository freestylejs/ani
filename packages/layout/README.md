# @freestylejs/ani-layout

Layout animation, presence and View Transition helpers for ANI 2.

Mark elements, change the DOM, and every marked element whose box changed animates from where
it was drawn to where layout put it. The default `'raf'` engine runs on Ani's clock and writes
only `translate` and `scale` (plus `opacity` for a shared-element crossfade and
`border-radius` when radius correction is on). It reads the DOM once before a change and
once after it; animation frames do no reads.
Anything it cannot animate exactly jumps to its final layout and is reported with a reason.
A kill switch and a versioned diagnostics stream let an app turn layout motion off remotely and
observe every degradation in production.

```sh
pnpm add @freestylejs/ani-core @freestylejs/ani-layout
```

For React, use `@freestylejs/ani-react/layout` (`useLayout`, `LayoutGroup`, `AnimatePresence`,
`usePresence`). See the [Layout guide](https://freestyle-ani.vercel.app/en/docs/guides/layout).

## Quick start

```ts
import { createLayoutGroup } from '@freestylejs/ani-layout'

const list = document.querySelector<HTMLUListElement>('#list')!
const group = createLayoutGroup({ motion: { duration: 0.3 } })

for (const item of list.querySelectorAll<HTMLLIElement>('li')) {
    group.add(item, { layout: 'position' })
}

// capture → mutate → flush
const report = await group.update(() => {
    list.prepend(list.lastElementChild!)
})
console.log(report.status) // 'ended' once every item has settled
```

`update(mutate)` runs `capture()`, then `mutate()`, then `flush()`. Call them yourself when the
change happens somewhere else:

```ts
group.capture() // read the boxes before the change
list.prepend(list.lastElementChild!) // any synchronous DOM change
const run = await group.flush() // read the boxes after it and start the run
```

- `add(element, options?)` registers a participant and returns an idempotent remove function
  that restores its inline styles. `set(element, options)` replaces its options.
- An element added after the capture has no previous box: it appears in place, unless it takes
  over a `layoutId`.
- `finish()` jumps every running animation to its end. `dispose()` cancels everything and
  restores every inline style the group wrote.
- `capture()` is valid until the next frame: take it in the same task as the change. A capture
  in a later task reads again.
- `stats` counts `captures`, the layout reads (`rects`, `offsets` for layout-size pairs and
  computed `styles`, with `reads` their sum), the scroll-anchoring `probes`, the `parents`
  (`offsetParent` reads of the viewport-fixed test), running `tracks` and live `holds`.

## Options

`LayoutOptions`, per participant:

| Option | Default | Meaning |
| :--- | :--- | :--- |
| `layout` | `true` | `true` animates position and size. `'position'` keeps the size at its final value (counter-scaled under a scaling parent). `'size'` keeps the position at its final value. |
| `layoutId` | — | Shared identity in the group. A new element with the id starts from the box of the one that left. |
| `layoutAnchor` | — | `{ x, y }`, each from 0 to 1. Keeps this point of the box on the same point of the parent participant. |
| `layoutCrossfade` | `true` | Crossfade with an exiting element of the same `layoutId`. |
| `layoutDependency` | — | When given and `Object.is`-equal to its value at the previous flush, the element jumps instead of animating. |
| `radius` | `true` with a `layoutId`, else `false` | Keep the corners' on-screen radius while the box is scaled. Between two elements with one `layoutId`, the corners blend from one radius to the other unless either sets `radius: false`. |
| `motion` | — | `{ duration, delay, timing }`, merged by kind over the group's `motion` (see below). |

`LayoutMotion`: `duration` in seconds (default `0.35`); `delay` in seconds (default `0`, applies
to an element at rest when the change happens); `timing` (default `timing.easeOut()`), or
`{ type: 'spring', bounce }` for the physical spring. The timing must be stateless and start with
a finite slope: `timing.dynamicSpring` and a bezier with `x1 = 0` and `y1 ≠ 0` throw.

Layers merge by kind, outermost first: a layer that names `type: 'spring'`, `timing` or
`type: 'timing'` selects the kind; a kind switch keeps only `delay`; `duration`, `timing` and
`bounce` override within the chosen kind.

`LayoutGroupOptions`, for `createLayoutGroup(options?)`:

| Option | Default | Meaning |
| :--- | :--- | :--- |
| `clock` | `defaultClock` | Drives the default `'raf'` engine and supplies the reduced-motion preference read by both engines at every flush. |
| `motion` | — | Defaults for every participant's `motion`. |
| `reducedMotion` | `'jump'` | `'jump'`, `'ignore'` or `{ maxDuration }` in seconds. |
| `threshold` | `1` | Pixels a box must move to animate. |
| `maxNodes` | `300` | Visible moving elements per flush. Above it, the whole change jumps (`'capped'`). |
| `maxParticipants` | `2000` | Connected participants. Above it, `capture()` and `flush()` read nothing and the whole change jumps (`'capped'`). |
| `retain` | `1` | Seconds a removed `layoutId` element's box stays available for a handoff. |
| `onSnap` | — | `(element, reason) => void`, called for every element that jumped. Each call is isolated: a throwing callback never changes the engine's state. |
| `engine` | `'raf'` | `'waapi'` runs flat position moves as compositor animations, smooth while the main thread is blocked. Requirements below. |

Invalid options throw a `TypeError` or `RangeError` with the code `ANI_INVALID_OPTIONS`, from
`createLayoutGroup`, `add` or `set`, never inside a frame.

### `engine: 'waapi'`

Each move becomes one `Element.animate()` on `translate`. It never falls back silently:

| Requirement | If it is not met |
| :--- | :--- |
| Every participant sets `layout: 'position'` | `add` / `set` throws `ANI_INVALID_OPTIONS` |
| No `layoutAnchor`, `layoutId` or `radius: true` | `add` / `set` throws `ANI_INVALID_OPTIONS` |
| No participant inside another | `add` / `set` throws; a nesting that appears later in the DOM snaps as `'unsupported'` |
| CSS `linear()` easing is supported | The element snaps as `'unsupported'` |

Differences from `'raf'`: a retarget starts from the drawn box at rest (no velocity); the
animations run on the document timeline, so the Ani clock's time scale does not apply (reduced
motion is still read from it at each flush); a retarget during main-thread jank reads the drawn
box from `currentTime` and can step back by the frames the main thread missed; no inline style
is written.

## Report

`flush()` and `update()` return a promise that never rejects. It resolves once per run with
`{ status, snapped }`:

| `status` | When |
| :--- | :--- |
| `'failed'` | An internal exception aborted a flush or frame. Every owned style and the crossfade follower's `inert` are restored byte-identically and every affected element is listed as `'failed'`; nothing is left running. |
| `'disposed'` | The group was disposed, or every element of the run was removed. |
| `'disabled'` | The layout runtime's kill switch was on: every mover jumped. |
| `'capped'` | More than `maxNodes` visible elements moved, or more than `maxParticipants` are connected: everything jumped. |
| `'interrupted'` | A later flush retargeted one of its elements. Its other elements keep running. |
| `'ended'` | Every element of the run settled, or `finish()` was called. |
| `'reduced'` | Reduced motion with the `'jump'` policy: everything jumped. |
| `'stale'` | The flush had no valid capture (none was taken, or it aged past a frame) and nothing animated. |
| `'no-change'` | Nothing moved. |

Statuses resolve in that precedence order (§9.3): `failed`, `disposed`, `disabled`, `capped`,
`interrupted`, `ended`, `reduced`, `stale`, `no-change`. `reduced`, `stale` and `no-change` apply
only when no track ran.

`snapped` lists `{ element, reason }` for every element that jumped:

| Reason | Cause |
| :--- | :--- |
| `'culled'` | Both boxes are outside the viewport (plus 10 %). Silent. |
| `'capped'` | The change moved more than `maxNodes` visible elements, or more than `maxParticipants` are connected. |
| `'unsupported'` | `rotate`, skew, a non-translation transform on a non-participant ancestor, a CSS transition or animation on `translate`, `scale` or `all`, zero size, `display: contents` or `inline`, a size change beyond 50×, or a spring settling after 10 s. |
| `'stale'` | No valid measurement of what was presented: no capture, or an aged one. The element may have jumped by `threshold` or more; running animations keep going. |
| `'reduced'` | Reduced motion with the `'jump'` policy. Silent. |
| `'disabled'` | The runtime's kill switch was on. |
| `'failed'` | The transaction aborted on an internal exception; every owned style is restored. |

`'unsupported'`, `'capped'` and `'stale'` also print one development warning per group.

## Accessibility

- Layout never changes DOM order, never moves focus, and never owns `tabindex`, roles or ARIA. A
  keyed reorder and a re-render while an element moves keep the same element and `document.activeElement`.
- An exiting crossfade follower is `inert` from the first frame, so the pair never exposes a
  duplicate interactive or accessible target. The authored `inert` value (present or absent, and
  its value) is restored byte for byte on reversal, unmount, abort and dispose.
- If focus is inside the exiting follower (in the flat tree, through open and closed shadow
  roots), the pair does not crossfade: the lead appears at its final layout, the follower exits
  under presence alone, and the `focus-in-follower` diagnostic is emitted with action `'none'`.
  Layout does not set `inert` in this case, because that would move focus; the author moves it.
- Reduced motion only shortens or removes the motion; these rules do not change.
- The drive seam and its hold state are P4. P3's holds are the crossfade and presence holds
  described above; a re-render during a track is not a drive hold.

## Runtime and diagnostics

`layoutRuntime` is a module singleton for the installed package copy:

```ts
import { layoutRuntime } from '@freestylejs/ani-layout'

const stop = layoutRuntime.onDiagnostic((event) => {
    console.warn(event.code, event.element, event.metrics)
})
layoutRuntime.setMode('snap') // the kill switch
layoutRuntime.setMode('animate')
stop()
```

- `mode` is `'animate'` (default) or `'snap'`.
- `setMode('snap')` acts synchronously in every explicit and implicit scope: live tracks finish at
  identity with their styles restored, P3 crossfade/presence holds finish as a completed fade, and
  pending reports resolve `'disabled'` with reason `'disabled'`. Drive-hold invalidation is the
  P4 `L-DRIVE-4` path. Later movers snap `'disabled'`. `setMode('animate')` restores normal
  planning from the next flush. It is distinct from reduced motion.
- `onDiagnostic(listener)` returns an unsubscribe. Payloads are built only when a listener exists;
  the stream works in production. Every listener runs after the engine's state is consistent,
  inside its own `try`. A throwing listener is reported as `callback-error` to the others only
  and rethrown asynchronously in development; it cannot change the engine's state.
- Each event is version 1 and carries `code`, a stable `scope` id, `run`, `engine`, `action`,
  `element` and `reason` where they apply, and `metrics` (`participants`, `rectReads`,
  `styleReads`, `springSettleMs`). A capture begun inside a clock frame prints the §4.1
  development warning at capture; the flush that consumes the aged capture emits one
  `capture-aged` event per reported node (or one element-less event when none is reported).

Codes: `capture-less-flush`, `capture-aged`, `unsupported-geometry`, `handoff-scroll-active`,
`spring-timeout`, `participant-cap`, `mover-cap`, `document-mismatch`, `runtime-disabled`,
`focus-in-follower`, `callback-error`, `internal-error`. `measurement-unsupported` is reserved
for the engine's measurement fallback; `focus-in-follower` is emitted by the accessibility rule
with action `'none'` and is never a snap.

A flush and every frame callback run inside one transactional boundary: on an internal exception
the engine restores every owned declaration and the crossfade follower's `inert` byte-identically,
cancels WAAPI animations, clears pending writes, invalidates holds, releases presence holds,
disarms markers and listeners, stops the clock subscription, resolves every affected report
`'failed'` and emits `internal-error`. A failed report lists only the participants the transaction
touched and the affected run nodes; the style and `inert` restore remains conservative for the
whole scope. `flush()` never rejects.

## Reduced motion

The preference comes from the group's clock and is read at every flush. `'jump'` (the
default) starts nothing, finishes running animations at once and leaves the clock
unsubscribed. `{ maxDuration }` scales delay and duration down to fit. `'ignore'` plays in
full.

## Presence and View Transitions

- `createPresence(element, motion, options?)` gives one element an enter and an exit, with a
  watchdog. While it exits, the participants at or inside that element count as exiting for a
  `layoutId` handoff and crossfade.
- `viewTransition(update, { share, types, motion })`, `shareElement(element, id)` and
  `retimeViewTransition(motion, names?)` wrap the browser's View Transitions for discrete swaps
  such as route changes. Without browser support the update runs without a transition and
  resolves `'unsupported'`.

`ARCHITECTURE.md` holds the full model and its contracts.
