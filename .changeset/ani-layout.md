---
'@freestylejs/ani-layout': minor
---

`@freestylejs/ani-layout` 0.2.0: layout animation on Ani's own clock. Mark an element and it animates whenever a change moves or resizes it, from where it was drawn to where layout put it.

- **One engine.** At each change the group reads every participant's box once before and once after; animation frames do no DOM reads. Every frame computes each moving box from its two ends, parent before child, and writes only `translate` and `scale` (plus `opacity` for a `layoutId` crossfade and `border-radius` with `radius: true`). The group is one subscriber of the core clock, so it shares frame time, time scale and reduced motion with every other Ani animation.
- **Exact nesting.** Nested participants, `layoutAnchor`, shared `layoutId` handoffs and crossfades stay exact at any depth. An interrupted element continues from where it is drawn, with its velocity; an element whose target did not move keeps its animation untouched.
- **Jump, never move wrongly.** What cannot be animated exactly (rotation, skew, a CSS transition on `translate`/`scale`, too many movers, a scroll between the two reads) jumps to its final layout and is reported as `'culled'`, `'capped'`, `'unsupported'`, `'stale'` or `'reduced'` in `report.snapped` and `onSnap`.
- **API.** `createLayoutGroup(options?)` returns `add`, `set`, `capture`, `flush`, `update`, `finish`, `dispose` and `stats`. Options use Motion's vocabulary: `layout` (`true`, `'position'`, `'size'`), `layoutId`, `layoutAnchor`, `layoutCrossfade`, `layoutDependency`, `radius` and `motion` (`duration` and `delay` in seconds, a stateless `timing`). Group options: `clock`, `motion`, `reducedMotion` (default `'jump'`), `threshold`, `maxNodes`, `retain`, `onSnap`. `flush()` and `update()` resolve once per run with `{ status, snapped }` and never reject; invalid options throw `ANI_INVALID_OPTIONS` synchronously.
- **Presence and View Transitions.** `createPresence` links its element to layout: an exiting element hands its box to the next element with the same `layoutId`, and its release waits for the crossfade. `popLayout` measures the exiting element against its real containing block. `viewTransition`, `shareElement` and `retimeViewTransition` are unchanged.

### Breaking changes from the unreleased 0.1.0

0.1.0 was never published; this list is for code written against the repository.

- The snapshot API is removed: `capture()` returns nothing, and `play(snapshot)` and `LayoutSnapshot` are gone. Use `update(mutate)`, or `capture()` and then `flush()`. `update()` no longer takes a `motion` argument (set `motion` on the group or the participant), and `active` is removed.
- The default `layout` is `true` (position and size); it was `'position'`. `layout: 'box'` and `'preserve-aspect'` are removed: use `true` (with `radius: true` for corners) or `'size'`.
- `update()` and `flush()` resolve a `LayoutReport` (`{ status, snapped }`) instead of a `LayoutResult` string. `LayoutParticipantOptions` is `LayoutOptions`.
- `maxAnimated` is `maxNodes`. `maxBoxes` is removed (there is no per-mode cap). `onError` is removed: use `onSnap`. `supportsFlip` is removed.
- `timing.dynamicSpring` and timings that start vertically throw `ANI_INVALID_OPTIONS`.
