---
'@freestylejs/ani-core': minor
---

Correctness, lifecycle and performance hardening of the core engine. The public API only grows; behavior changed only where the old behavior was a defect.

## Fixes

- **Clock**: a single frame loop with strict invariants. It no longer dies when its pending frame is lost, nor when a subscriber throws (errors go to `createClock({ onError })` or are rethrown asynchronously; other subscribers and the next frame are unaffected). Re-entrant subscribe/unsubscribe can no longer start a second loop.
- **Clock**: a timeline that starts between frames or inside a tick advances only by the time since it subscribed (no head start).
- **Clock**: without a frame source (server rendering, plain workers) `subscribe` is a silent no-op that retains nothing; `play()` / `transitionTo()` no longer throw `window is not defined`.
- **Timeline**: `play()` throws synchronously (descriptive `TypeError` / `RangeError`) for malformed configs: a `from` key missing for an animated property, array/record mismatches, a record `timing` without a function for an animated property, non-finite `from` / `to` / `velocity`, negative or non-finite `delay` or durations. The timeline is left untouched; nothing can throw later inside a frame.
- **Timeline**: `pause()` only acts on `PLAYING`, `resume()` only on `PAUSED`, `ENDED` is emitted exactly once per run, `seek()` before `play()` is a no-op and `reset()` restores the base duration.
- **Timeline**: `repeat` carries the frame overshoot into the next run (no drift). End detection uses a `1e-9` s tolerance, so sub-millisecond segments work.
- **Timeline**: a throwing `onUpdate` callback no longer affects the other callbacks or the timeline (the error is rethrown asynchronously).
- **Overlap**: segments animating the same property at overlapping times now follow one rule in every shape (record, array, nested, `stagger`): the most recently started segment produces the value (ties: later declaration), and its `from` is the property's value at the segment's start, captured once. `delay()` holds every property in record and array timelines. `parallel` keeps fully-overridden segments as holds, so their duration and their `keyframes` / `durations` slot are preserved.
- **Springs**: `dynamicSpring` integrates with fixed substeps (at most 1/120 s), so results no longer depend on the frame rate; it honours `tolerance`, keeps its state per timeline (one instance can be shared by segments, properties and timelines) and `seek` re-simulates deterministically. `T.spring` / `T.dynamicSpring` validate `m > 0`, `k > 0`, `c >= 0`; `T.spring` no longer mutates the options you pass and `c = 0` is finite.
- **createStates**: `transitionTo` honours `canBeIntercepted = false`, throws a `RangeError` for an unknown state before changing anything, and rolls back when the play config is invalid.
- **Nodes**: `loop()` requires a finite integer count (use `repeat: Infinity`); `ani()`, `delay()` and `stagger()` validate durations and offsets with `RangeError`.
- No dynamic code generation (`new Function` / `eval`) in the shipped code, so strict CSP and Trusted Types pages emit no violation reports.

## Behavior changes

- `getCurrentValue()` returns a frozen snapshot (stable until the next frame); `from` is copied at `play()`.
- All `onUpdate` callbacks of one notification receive the same, read-only `state` object.
- `play()` on a `PLAYING` timeline inherits its current velocity (velocity-continuous retargeting). Pass `velocity: { x: 0 }` to start from rest. `getCurrentVelocity()` returns zeros unless `PLAYING`.
- A timeline made only of `dynamicSpring` segments may end before its nominal duration once everything has settled; a spring segment ends when settled or at its duration, whichever comes first.
- `createStates`: replaced timelines are disposed (use `onTimelineChange`, do not keep old timelines); the playing timeline's velocity is handed to the next one; after `timeline().reset()` the last shown value is used as `from`; `onTimelineChange` subscriber errors are rethrown asynchronously.
- Frame time uses lag smoothing instead of a 0.1 s cap: a gap up to `lagThreshold` (default 0.5 s) advances animations by the real elapsed time, so jank no longer slows them down and RAF timelines stay in sync with WAAPI, CSS and timers; a longer gap (hidden tab, debugger, sleep) advances by one ordinary frame, so animations resume instead of jumping. `lagThreshold: Infinity` gives pure wall-clock time. `maxDeltaTime` is now an optional hard cap (unlimited by default); `AnimationClock.configure(0.1)` restores the old behavior.
- `AnimationClock.create(maxDeltaTime)` applies to an already existing clock; `AnimationClock.configure` also accepts `{ lagThreshold, maxDeltaTime }`; invalid values throw a `RangeError` before anything changes.
- `AniRefContext` is typed on the stricter `play()` signature of the timeline.
- `module` in `package.json` points at the file that ships (`./dist/index.js`).

## New APIs

- `RafAniTimeline`: `status`, `dispose()`, `getCurrentVelocity()`; `RafTimelineConfig.velocity`; `TimelineStatus`.
- `createClock(options)` (independent clocks with a manual frame source for tests), `AnimationClock.reset()`, `clock.size`; clock option `lagThreshold` and type `ClockTimingOptions`; `AnimationClock.configure({ lagThreshold, maxDeltaTime })`.
- `StateController.dispose()`.
- Timing: `TimingFunction.stateful`, `TimingFunctionContext.state` / `velocity`, `BezierTimingFunction.ease()`.
- `TimelineBase<G, PlayArgs>`.
- `createTimelineController(getTimeline, hooks?)`, `applyStyleSheet(element, style)` and the types `TimelineControllerHooks`, `TimelineMembers`: the single source of the framework bindings' controller and style writing.

## Performance

- Per-frame cost no longer depends on the number of segments in the tree: a 1000-segment timeline late in the animation costs 1.3x the early frame cost (was 61x).
- 1000 timelines of 20 segments: 0.6 ms per frame (was 6.8 ms).
- Compiling a 1000-segment tree to WAAPI keyframes: about 2 ms (was about 300 ms); keyframes are cached per root node, `from` and resolver.
- Subscribers of one timeline share a single state object per frame. The clock's own per-frame allocation is constant (about 100 bytes) whatever the number of subscribers (was about 2.7 bytes per subscriber per frame, 13.7 KB at 5000), and a timeline allocates about 400 bytes per frame (was about 3 KB, and about 2 KB more per finished segment).
