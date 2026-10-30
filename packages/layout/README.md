# @freestylejs/ani-layout

Layout animation, presence and View Transition helpers for ANI 2.

Mark elements, change the DOM, and every marked element whose box changed animates from where
it was drawn to where layout put it. The default `'raf'` engine runs on Ani's clock and writes
only `translate` and `scale` (plus `opacity` for a shared-element crossfade and
`border-radius` when radius correction is on). It reads the DOM once before a change and
once after it; animation frames do no reads outside a drive hold.
Anything it cannot animate exactly jumps to its final layout; the reason is reported where the
contract names one (culled and reduced jumps are silent by design).
A kill switch and a versioned diagnostics stream let an app turn layout motion off remotely and
observe every degradation in production.

```sh
pnpm add @freestylejs/ani-core @freestylejs/ani-layout
```

For React, use `@freestylejs/ani-react/layout` (`useLayout`, `LayoutGroup`, `useLayoutGroup`,
`AnimatePresence`, `usePresence`, `usePresenceControl`, `useLayoutDrive`). See the
[Layout guide](https://freestyle-ani.vercel.app/en/docs/guides/layout).

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
- `stats` counts `captures`; the layout reads `rects`, `offsets` (layout-size pairs), computed
  `styles` and `layoutOffsets` (held rebase/support), with `reads` their sum; the scroll-anchoring
  `probes`; the `parents` (`offsetParent` reads of the viewport-fixed test); running `tracks`; and
  live `holds`.

## Options

`LayoutOptions`, per participant:

| Option | Default | Meaning |
| :--- | :--- | :--- |
| `layout` | `true` | `true` animates position and size. `'position'` keeps the size at its final value (counter-scaled under a scaling parent). `'size'` keeps the position at its final value. |
| `layoutId` | — | Shared identity in the group. A new element with the id starts from the box of the one that left. |
| `layoutAnchor` | — | `{ x, y }`, each from 0 to 1. Keeps this point of the box on the same point of the parent participant. |
| `layoutCrossfade` | `true` | Crossfade with an exiting element of the same `layoutId`. |
| `layoutDependency` | — | When given and `Object.is`-equal to its value at the previous flush, the element jumps instead of animating (not reported). |
| `layoutKey` | — | Semantic identity. A change resets the participant to a fresh baseline instead of interpolating from its old box. |
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
`createLayoutGroup`, `add`, `set` or `take`, never inside a frame.

### `engine: 'waapi'`

Each move becomes one `Element.animate()` on `translate`. It never falls back silently:

| Requirement | If it is not met |
| :--- | :--- |
| Every participant sets `layout: 'position'` | `add` / `set` throws `ANI_INVALID_OPTIONS` |
| No `layoutAnchor`, `layoutId`, `radius: true` or effective spring motion | `add` / `set` throws `ANI_INVALID_OPTIONS` |
| No participant inside another | `add` / `set` throws; a nesting that appears later in the DOM snaps as `'unsupported'` |
| CSS `linear()` easing is supported | The element snaps as `'unsupported'` |

Differences from `'raf'`: a retarget starts from the drawn box at rest (no velocity); the
animations run on the document timeline, so the Ani clock's time scale does not apply (reduced
motion is still read from it at each flush); a retarget during main-thread jank reads the drawn
box from `currentTime` and can step back by the frames the main thread missed; no inline style
is written.

## Direct manipulation

A participant can be taken as the user's finger:

```ts
const item = document.querySelector<HTMLLIElement>('#card')!
group.add(item, { layout: true })

const drive = group.take(item) // held
drive.move({ x: 12, y: -4 }) // view-space CSS px, from the take point
drive.release({ x: 0, y: 900 }) // incoming origin velocity, px/s (default 0)
// drive.cancel() hands back with zero velocity
```

`take` returns a `LayoutDriveHandle`:

```ts
type LayoutDriveState = 'held' | 'released' | 'cancelled' | 'invalidated'

interface LayoutDriveVector {
    readonly x: number
    readonly y: number
}

interface LayoutDriveHandle {
    readonly state: LayoutDriveState
    readonly velocity: LayoutDriveVector // drawn origin velocity at take, px/s
    move(offset: LayoutDriveVector): void // drawn origin = take point + offset
    release(velocity?: LayoutDriveVector): void
    cancel(): void
}
```

- `take` throws `ANI_INVALID_OPTIONS` before changing any state unless the element is registered in
  this group, connected, in the same document, on the `'raf'` engine, not held, has no held ancestor
  or descendant, and has supported geometry. One element belongs to at most one live group. Take
  under the runtime kill switch returns a handle already `'invalidated'` and emits
  `runtime-disabled`, even on a `'waapi'` group (the kill switch wins). An exiting crossfade
  follower is rejected with `ANI_INVALID_OPTIONS` and a `drive-rejected` diagnostic: it is inert
  and is not a drive hold. A `take` during a released/cancelled landing settles the old landing at
  its current drawn box, invalidates the old handle and starts a new hold from that box.
- The drawn origin stays at the take point plus the offset every frame, under a scroll, a live
  ancestor scale, sticky positioning (the element or an ancestor) and re-layout. The only read
  added to a frame is one rect per held element, in the clock's read phase before any write; a
  size change additionally verifies the held element's support and the animated-owned probe
  (a running CSS animation or transition on `translate`/`scale` invalidates). `stats.rects` counts
  the reads; `stats.holds` counts every live hold (`held`, `released` and `cancelled` until the hold
  finishes or is invalidated).
- The held node's size keeps its track under one hold-specific tolerance (0.5 px): a supported
  re-layout is taken into the hold, a sub-threshold difference is snapped, and release can always
  reach its finish rather than leaving the clock running. Descendants ride one inherited
  displacement `h(t)` with their own residuals, so their geometry relative to the held element does
  not depend on how fast the shared displacement decays. The release velocity enters exactly once,
  through the held node's origin track.
- `release` and `cancel` are terminal and idempotent. A `move` after a terminal state is a no-op
  (one development warning per handle). Non-finite offsets and velocities throw synchronously.
  A released/cancelled landing is still a live hold: the kill switch, abort, cap, removal, support
  failure and dispose invalidate it (`invalidated` before the hold clears); only normal landing
  completion keeps the terminal `released`/`cancelled` state.
- A release under reduced motion obeys the policy at that moment: `'jump'` lands at A with no
  motion, `{ maxDuration }` clamps, `'ignore'` plays in full. A release that finds no fitting
  reduced-motion path becomes `released` and lands at A (a reduced jump), never `invalidated`; a
  refused spring emits `spring-timeout` and snaps. A policy change while held never interrupts the
  hold; a change while landing applies at the next flush.
- Removal, `ownerDocument` change, `layoutKey` change, `dispose()`, `finish()`, the kill switch, a
  failed held read or a `'failed'` abort invalidate the handle; the element follows that event's
  rule and the held read stops. A running CSS animation or transition on `translate`/`scale` on the
  held element, a participant ancestor, or any element in the held subtree invalidates with
  `unsupported-geometry` (P4-C7). A box-preserving 180° rotation/zoom that the support check cannot
  classify is a documented residual risk: the check may invalidate the hold rather than accept it.
  The authored inline style is restored byte for byte. A held node and its riding descendants are
  visible movers: a flush that would exceed `maxNodes` invalidates the holds, snaps the scope and
  reports `'capped'`; `onSnap` lists each held node and rider with reason `'capped'`.
- Under `'jump'`, a flush while held or landing settles every descendant residual at its own A (the
  descendant still rides `h` while held). A release that finds no fitting reduced-motion path emits
  the typed `reduced-no-fit` diagnostic and lands at A with the handle `released`.
- A `take` before an unflushed layout uses its own rect/computed reads for the new held geometry,
  not the stale last-flush geometry; if the current geometry cannot be supported it throws.
- A trackless participant child that is counter-projected to its own A under an animating
  participant ancestor still reports the ancestor's drawn origin velocity at `take` (P4-C10), so a
  caught card does not lose the ancestor's motion. The ancestor/descendant hold exclusion is
  scope-local. A participant registered in another group is outside this group's hold graph; a
  cross-scope nested hold is not prevented, and a driven cross-scope child does not ride the other
  group's `h` (a documented one-owner limitation).
- The gesture layer owns pointer capture, `pointerId`, `touch-action`, velocity estimation,
  keyboard operation and announcements; it maps `pointercancel` and `lostpointercapture` to
  `cancel()`. Layout owns every style it writes. The drive is not available on the `'waapi'`
  engine except for the kill-switch invalidated handle.

In React, `useLayoutDrive()` returns a dispatcher for the same port; its `take(element)` routes to
the live `LayoutGroup` (or the implicit root) that owns the registered element, and throws
`ANI_INVALID_OPTIONS` when no scope owns it. A StrictMode same-task ref detach/re-attach preserves a
live hold. The gesture layer maps `pointercancel` and `lostpointercapture` to `cancel()` so a
cancelled gesture never becomes an accidental release; a box-preserving 180° rotation/zoom is the
same documented support residual risk as above. `dispose()`, abort and the kill switch remove the
scope's scroll listeners and clock subscription; `setMode('animate')` re-arms the scroll listeners
so a later handoff still sees an active scroll. The gesture layer owns pointer capture and
listener teardown for the pointer stream itself.

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

`'stale'` has exactly one meaning: no valid measurement of what was presented (no capture, or a
capture that aged past a frame). A flush with a valid capture never reports it, whatever scrolled
between the two reads. A scroll is measured, not a snap reason; `'stale'` is not the old
inner-scroll degradation.

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

## Limits

- The default `'raf'` engine runs on the main thread on Ani's clock, so it does not advance on
  screen while the main thread is blocked. The optional `'waapi'` engine is the gated
  compositor-smooth exception.
- Layout never animates 3D transforms, rotation, skew, SVG or inline elements, scroll-linked
  layout without a scroll driver, shadow correction or curved paths.
- Capture reads the DOM during render. These are reads only, but a style change since the last
  layout can force one.
- Text inside a scaled element is re-rasterized and can look soft until the run ends. Use
  `layout: 'position'` on text.
- An authored `translate` or `scale` change during a run applies at settle, as one jump from the
  frozen composition to the author's value.
- A presence `transform` that animates during a layout run moves the element and its participants
  on top of their layout motion.
- A size channel whose carried velocity would take it below one pixel loses that part of the
  velocity; the channel still reaches its target.
- Nested layout motion is not compositor-smooth while the main thread is blocked. Under the WAAPI
  engine a jank retarget can step back by the frames the main thread missed.
- Scroll anchoring during a run is compensated only through non-driven content; with only driven
  nodes visible in a scroller the shift is presented uncompensated. A driven node is never the
  anchor.
- Scrollers inside an unknown closed shadow root hide their scroll events; registering any element
  inside that root makes it known.
- A non-participant ancestor moved into a viewport-fixed sheet while the document scrolls carries
  its participants without the viewport-fixed test; register the moved container as a participant
  to cover it.

## Accessibility

- Layout never changes DOM order, never moves focus, and never owns `tabindex`, roles or ARIA. A
  keyed reorder and a re-render while an element moves keep the same element and `document.activeElement`.
- An exiting crossfade follower is `inert` from the first frame, so the pair does not expose a
  duplicate interactive or accessible target while it crossfades. If focus is inside a live
  follower (for example after its `inert` was removed), the pair is ended at once: both opacities
  return, the presence hold releases, the follower exits under presence alone, and
  `focus-in-follower` is emitted; a held follower is settled the same way. The authored `inert`
  value (present or absent, and its value) is restored byte for byte on reversal, unmount, abort
  and dispose.
- If focus is inside the exiting follower (in the flat tree, through open and closed shadow
  roots), the pair does not crossfade: the lead appears at its final layout, the follower exits
  under presence alone, and the `focus-in-follower` diagnostic is emitted with action `'none'`.
  Layout does not set `inert` in this case, because that would move focus; the author moves it.
- Reduced motion only shortens or removes the motion; these rules do not change.
- The drive seam is the direct-manipulation contract (see [Direct manipulation](#direct-manipulation)).
  Pointer capture, `pointerId`, `touch-action`, velocity estimation, keyboard operation and
  announcements belong to the gesture layer; layout owns the styles and the hold state.

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
  identity with their styles restored, P3 crossfade/presence holds finish as a completed fade,
  drive holds are invalidated and restored, and pending reports resolve `'disabled'` with reason
  `'disabled'`. Later movers snap `'disabled'`. `setMode('animate')` restores normal planning from
  the next flush. It is distinct from reduced motion.
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
`focus-in-follower`, `drive-rejected`, `reduced-no-fit`, `callback-error`, `internal-error`. `measurement-unsupported` is reserved
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

## Migrating from the 0.1/0.2 surface

The old 0.1.0 surface was never published; 0.2.0 replaces it. This is a hard migration: there is
no shim, alias, compatibility layer or legacy bridge. Code written against the earlier surface
must be changed as follows.

- **No page boxes.** The old surface assumed page coordinates and scroll markers. The engine now
  plans each flush in its own view space and moves kept tracks by their rest displacement. There
  is no `layoutScroll` or `layoutRoot`; a scroll is measured, not a stale trigger.
- **No inner-scroll `'stale'`.** `'stale'` now means only "no valid before-box". A flush with a
  valid capture never produces it, whatever scrolled between capture and flush.
- **No field-by-field merge.** Motion layers merge by kind (timing or spring), outermost first. A
  layer that names `type: 'spring'`, `timing` or `type: 'timing'` selects the kind; a kind switch
  keeps only `delay`; `duration`, `timing` and `bounce` override within the chosen kind.
  `duration` never switches the kind.
- **No legacy bridge.** Removed names have no aliases: `LayoutSnapshot` and `play(snapshot)` are
  gone (use `capture()` then `flush()`, or `update(mutate)`); `capture()` returns nothing;
  `update()` takes no `motion` argument; `active` is removed. `LayoutResult` is now
  `LayoutReport` (`{ status, snapped }`). `layout: 'box'` and `'preserve-aspect'` are removed
  (`layout: true` is the old box mode; `radius: true` keeps corners). `LayoutParticipantOptions`
  is `LayoutOptions`. `maxAnimated` is `maxNodes`; `maxBoxes`, `onError`, `deps`, `LayoutConfig`
  and `supportsFlip` are removed (`onError` is `onSnap`). `layout` now defaults to `true`, not
  `'position'`, so size animates unless you ask for `'position'`.

## Release status and evidence

The iOS-native-grade claim is **earned** by the P5 evidence body: `.trace/ani_ios_production/p5_bench.md`
is a **final TRIBUNAL PASS** on the D9 instrument in §11.5, after the P0–P4 evidence body and every
carried tribunal defect was closed. The full certification report is
`bench/layout/iteration-12/pre-fix/report.json` at code `f552728` (all 11 primary scenes and 23
support variants green in Chromium; WebKit frame/scoring/shape/status green with D12 cost
advisories; G11 1.959×, G9/G10/G12/G13 green; controls 94/94). D13's independent repeat is
`pre-fix/cost-repeat-3.json` (G11 2.000×). The final code `ea1475c` adds the lifecycle fix covered
by the final-source Chromium/WebKit browser suite; the owner-approved evidence bridge and the
final P4/P5 tribunals are recorded in `.trace/ani_ios_production/`. The claim is bounded
Chromium/WebKit Playwright evidence under D5/D8–D13, not iOS-device or Mobile Safari
certification. A report with a mismatched fingerprint, a skipped scene, a missing metric or a
weakened tolerance is not a pass.

Cost evidence follows D12/D13: Chromium decides G9/G11/G12; WebKit cost rows are BLOCK/advisory
while its frame/scoring/shape/status rows decide. The recorded 1-minute load may be above the
retired D9 `<1.0` pin; under D13 it is controlled-load evidence, not by itself an advisory reason.
P5 requires two independent five-run Chromium cost invocations (a full combined report plus a
cost-only repeat) with G11 ≤ 2× and G9/G10/G12 green.

## Checks

Run the release checks from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm ts:typecheck
pnpm check
pnpm --filter @freestylejs/ani-web build
pnpm test:browser --browser chromium
pnpm test:browser --browser webkit
pnpm bench:layout --runs 5 --engine chromium --engine webkit --check
```

The browser suite and the bench are the certification instrument; do not treat a docs-only run as
native-grade evidence. Firefox is advisory (D5/D9); a launch failure on macOS 27 is recorded, not
counted as a pass.

`ARCHITECTURE.md` holds the full model and its contracts.
