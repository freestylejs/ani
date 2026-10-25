# @freestylejs/ani-layout

Layout animation, presence and View Transition helpers for ANI 2.

Mark elements, change the DOM, and every marked element whose box changed animates from where
it was drawn to where layout put it. The engine runs on Ani's clock and writes only
`translate` and `scale` (plus `opacity` for a shared-element crossfade and `border-radius` for
shared elements and when asked). It reads the DOM once before a change and once after it; animation frames do no reads.
Anything it cannot animate exactly jumps to its final layout and is reported with a reason.

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
- `stats` counts `captures`, `reads` and running `tracks`.

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
| `motion` | — | `{ duration, delay, timing }`, merged field by field over the group's `motion`. |

`LayoutMotion`: `duration` in seconds (default `0.35`); `delay` in seconds (default `0`, applies
to an element at rest when the change happens); `timing` (default `timing.easeOut()`). The
timing must be stateless and start with a finite slope: `timing.dynamicSpring` and a bezier
with `x1 = 0` and `y1 ≠ 0` throw.

`LayoutGroupOptions`, for `createLayoutGroup(options?)`:

| Option | Default | Meaning |
| :--- | :--- | :--- |
| `clock` | `defaultClock` | The Ani clock that drives the group. Its reduced-motion preference is read at every flush. |
| `motion` | — | Defaults for every participant's `motion`. |
| `reducedMotion` | `'jump'` | `'jump'`, `'ignore'` or `{ maxDuration }` in seconds. |
| `threshold` | `1` | Pixels a box must move to animate. |
| `maxNodes` | `300` | Visible moving elements per flush. Above it, the whole change jumps. |
| `retain` | `1` | Seconds a removed `layoutId` element's box stays available for a handoff. |
| `onSnap` | — | `(element, reason) => void`, called for every element that jumped. |
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
| `'ended'` | Every element of the run settled, or `finish()` was called. |
| `'interrupted'` | A later flush retargeted one of its elements. Its other elements keep running. |
| `'no-change'` | Nothing moved. |
| `'reduced'` | Reduced motion with the `'jump'` policy: everything jumped. |
| `'capped'` | More than `maxNodes` visible elements moved: everything jumped. |
| `'stale'` | A scroll container scrolled between capture and flush: everything jumped. |
| `'disposed'` | The group was disposed, or every element of the run was removed. |

`snapped` lists `{ element, reason }` for every element that jumped:

| Reason | Cause |
| :--- | :--- |
| `'culled'` | Both boxes are outside the viewport (plus 10 %). Silent. |
| `'capped'` | The change moved more than `maxNodes` visible elements. |
| `'unsupported'` | `rotate`, skew, a non-translation transform on a non-participant ancestor, a CSS transition or animation on `translate`, `scale` or `all`, zero size, `display: contents` or `inline`, or a size change beyond 50×. |
| `'stale'` | A scroll container moved between capture and flush. |
| `'reduced'` | Reduced motion with the `'jump'` policy. Silent. |

`'unsupported'`, `'capped'` and `'stale'` also print one development warning per group.

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
