# `@freestylejs/ani-react`

React hooks for the FreestyleJS animation library. Frames are written to the DOM by the core engine, without rendering the component.

## Install

```sh
npm install @freestylejs/ani-core @freestylejs/ani-react
```

`react` `>=18.0.0` is a peer dependency.

## Quick start

```tsx
import * as a from '@freestylejs/ani-core'
import { useAniRef, useTimeline } from '@freestylejs/ani-react'

export function Box() {
    // The component owns the timeline and disposes it on unmount.
    const timeline = useTimeline(() =>
        a.rafTimeline(a.ani({ to: { translateX: 300 }, duration: 0.5 }))
    )
    // `style` is the initial inline style, rendered on the server too.
    const { ref, style } = useAniRef(timeline, {
        initialValue: { translateX: 0 },
    })

    return (
        <div
            ref={ref}
            style={style}
            onClick={() => timeline.play({ from: { translateX: 0 } })}
        />
    )
}
```

| Hook | Purpose |
| :--- | :--- |
| `useTimeline(factory, deps?)` | Create and dispose any object with `dispose()`. |
| `useAni(timeline, initialValue)` | Re-render with the timeline value. |
| `useAniRef(timeline, options?)` | Animate one element, no renders. |
| `useAniGroup(group, options?)` | Animate many elements, one ref per index. |
| `useAniStates(config)` | Own a state machine and animate an element. |
| `useFollow(initial, options?)` | Own a spring follower and animate an element. |

## Layout animation

`@freestylejs/ani-react/layout` animates layout changes on every commit. It needs the optional peer
`@freestylejs/ani-layout`:

```sh
npm install @freestylejs/ani-layout
```

```tsx
import { useLayout } from '@freestylejs/ani-react/layout'

function Item({ label }: { label: string }) {
    // animates whenever a commit moves this element
    const ref = useLayout<HTMLLIElement>({ layout: 'position' })
    return <li ref={ref}>{label}</li>
}
```

### `useLayout(options?)`

`useLayout` returns a stable ref callback that registers the element with the nearest
`LayoutGroup`, or with the implicit root group of its document. It animates on every commit that
moves or resizes the element; there is nothing to call. Options:

| Option | Default | Meaning |
| :--- | :--- | :--- |
| `layout` | `true` | `true` animates position and size. `'position'` keeps the size at its final value (counter-scaled under a scaling parent). `'size'` keeps the position at its final value. |
| `layoutId` | — | Shared identity within the group, for handoffs and crossfades. |
| `layoutAnchor` | — | `{ x, y }`, each 0–1. Keeps a point of the box on the same point of the parent participant. |
| `layoutCrossfade` | `true` | Crossfade with an exiting element of the same `layoutId`. |
| `layoutDependency` | — | When given and unchanged since the previous flush, the element jumps instead of animating (not reported). |
| `layoutKey` | — | Semantic identity. A change resets the participant to a fresh baseline instead of interpolating from its old box. |
| `radius` | `true` with a `layoutId`, else `false` | Keep the corners' on-screen radius while the box is scaled; blend it across a `layoutId` handoff. |
| `motion` | — | `{ duration, delay, timing }` in seconds, or `{ type: 'spring', bounce }`. Merged by kind over the group's `motion`. |
| `ref` | — | Another ref that receives the element. |

Options are compared by effective value, so inline objects and inline timings with the same values
change nothing. A change of `layout`, `layoutAnchor`, `radius` or `motion` restarts a running
animation from where the element is drawn; a `layoutKey` change starts a fresh baseline.
`layoutId`, `layoutCrossfade` and `layoutDependency` alone never restart a running animation.

### `LayoutGroup`

`LayoutGroup` renders no DOM. The outermost group owns the group options (`clock`, `motion`,
`reducedMotion`, `threshold`, `maxNodes`, `maxParticipants`, `retain`, `onSnap`, `engine`); nested
groups namespace `layoutId`s with `id` and supply `motion` defaults. A nested group that sets a
scope option prints a development warning. Without a `LayoutGroup`, participants join an implicit
root group per clock and document.

The default `'raf'` engine runs on Ani's clock. `engine: 'waapi'` accepts only top-level
`layout: 'position'` participants without `layoutAnchor`, `layoutId`, `radius: true` or a spring
motion; `add` / `set` throw `ANI_INVALID_OPTIONS`, a later nesting snaps as `'unsupported'`, and
missing CSS `linear()` support snaps. WAAPI retargets start at rest and use the document timeline,
so the clock's time scale does not apply; reduced motion still does. See the layout README for the
full engine contract.

### Trigger contract

A commit animates when it renders a participant, a `LayoutGroup` or an `AnimatePresence`: that
render captures the before-boxes, and one microtask per group flushes after the commit's layout
effects, before paint. A change that renders none of them (for example, a reorder under memoized
children) changes the DOM without a capture and does not animate; a development-only
`MutationObserver` prints one warning per group.

Two fixes:

- Put the `LayoutGroup` inside the component that owns the state, so that component's render
  renders the group.
- Wrap the change in `useLayoutGroup().update(fn)`. It captures, runs `fn` in `flushSync` and
  flushes, and resolves the layout report.

`useLayoutGroup()` returns the nearest group's controls: `update(fn)` and `finish()`. Under
`StrictMode`, replayed renders, effects and ref callbacks keep one group and each participant's
captured box; a same-task ref detach and re-attach preserves the registration and a live hold.
Transitions, deferred values and Suspense work as well: a render React restarts in a later task
captures again, and a capture that crossed a rendering opportunity is reported as `capture-aged`
rather than used as a wrong before-box.

### `useLayoutDrive()`

`useLayoutDrive()` returns a dispatcher for the direct-manipulation port. `take(element)` routes
to the live group that owns the registered element, otherwise to the implicit root of its
document, and throws `ANI_INVALID_OPTIONS` when no scope owns it.

```tsx
import { useLayout, useLayoutDrive } from '@freestylejs/ani-react/layout'

function Card() {
    const ref = useLayout<HTMLDivElement>()
    const drive = useLayoutDrive()
    return (
        <div
            ref={ref}
            onPointerDown={(event) => {
                const handle = drive.take(event.currentTarget)
                // the gesture layer owns pointer capture, pointerId,
                // touch-action, velocity estimation, keyboard operation and
                // announcements; layout owns the held styles
                handle.release({ x: 0, y: 0 })
            }}
        />
    )
}
```

A hold survives a StrictMode same-task ref detach/re-attach. Map `pointercancel` and
`lostpointercapture` to `cancel()`, so a cancelled gesture never becomes a release. The drive is
not available on `engine: 'waapi'` except for the kill switch's invalidated handle.

### Presence

`AnimatePresence` keeps a removed child mounted while it exits. It renders no DOM and never clones
its children; each child that should animate calls `usePresence(motion)`. `mode` is `'sync'`
(default), `'popLayout'` (the exiting child leaves the flow at once, so siblings move from the
first frame) or `'wait'` (the enter waits for the exit).

`usePresence(motion, options?)` returns `{ ref, style, isPresent, custom }`. The motion has
`present`, a required `exit`, and optional `enter` and `initial`. Spread `style` after your own
styles: it carries `initial` from the first render (also on the server) until the enter has
finished, and the position of an exiting child under `popLayout`. Layout owns `inert` on an exiting
crossfade follower; `isPresent` is for your own inert/disabled states. `usePresenceControl()`
returns `{ isPresent, safeToRemove }` for an exit you run yourself; it takes no part in a
crossfade.

See the [Layout guide](https://freestyle-ani.vercel.app/en/docs/guides/layout) for the full
presence, accessibility and shared-element contracts.

### Migrating the layout entry

This entry replaces the unreleased 0.1/0.2 layout surface with no bridge or alias. The React
changes are: `useLayout` now accepts all `LayoutOptions` (not only `layout` and `layoutId`);
`layout: 'box'` / `'preserve-aspect'` are gone (`layout: true` plus `radius: true` replaces box);
`useLayoutGroup().update()` resolves `LayoutReport` (`{ status, snapped }`), not a `LayoutResult`
string; `useLayoutDrive` is new; there is no snapshot API, no `play()`, no `deps` and no facade.
The vanilla migration table is in the layout README.

### Release status

The iOS-native-grade claim is a **certification target**, not a shipped claim. It is earned only
when `.trace/ani_ios_production/p5_bench.md` is a TRIBUNAL PASS on the D9 instrument; at this
commit P5 has no report, so the adapter does not claim it. The layout README carries the evidence
contract and the certification commands.

## Documentation

Visit [ani](https://freestyle-ani.vercel.app/en/docs/react/use-timeline) to read the documentation.

## Upgrading from 1.x

Run `npx @freestylejs/ani-codemod src` once on your 1.x code (commit before you do), read every warning, then follow the [migration guide](https://freestyle-ani.vercel.app/en/docs/guides/migration-v2). `useAniRef` and `useAniStates` changed their signatures and need manual updates.
