# @freestylejs/ani-core

## 2.0.0

### Major Changes

- 6691fff: ANI 2.0. The 1.x surface is removed and replaced by one that batches DOM writes in a commit phase, drives lists through groups, behaves the same on the RAF and WAAPI engines, honors reduced motion by default and measures every duration in seconds.

  **Upgrade:** run `npx @freestylejs/ani-codemod <dirs>` once on your 1.x code (commit before you do), read every warning it prints, then read the migration guide "Migrating from 1.x" on the documentation site. Removed names are gone, and 1.x call shapes throw a `TypeError` that names the 2.0 form. The changes that do not throw are listed under "Behavior changes"; the one to watch is `delay`, which is now in seconds.

  ## @freestylejs/ani-core

  ### Breaking changes

  - **Namespace import.** Use `import * as a from '@freestylejs/ani-core'`. The `a` object and `T` are removed; use `a.timing` or the `timing` export.
  - **Renamed timelines.** `dynamicTimeline` is `rafTimeline`; `timeline` and `webTimeline` are `waapiTimeline`. The classes `RafAniTimeline` and `WebAniTimeline` are no longer exported: use the `RafTimeline` and `WaapiTimeline` interfaces and the guards `isRafTimeline` / `isWaapiTimeline`.
  - **Options objects.** `sequence(children, { timing, id })`, `parallel(children, { timing, id })`, `loop(child, count, { timing, id })`, `stagger(children, { offset, timing, id })`, `delay(seconds, { id })`, `ani({ ..., id })` and `rafTimeline(node, { clock })`. Positional arguments throw a `TypeError`.
  - **`play()` takes the config only.** `play(config, canBeIntercepted)` becomes `play({ ...config, interrupt })`; `transitionTo(state, config, canBeIntercepted)` becomes `transitionTo(state, { ...config, interrupt })`. `reset()` takes no arguments and always notifies. The `context` and `propertyResolver` config keys are removed (pass the resolver to `bind(target, { resolver })`).
  - **Seconds everywhere.** The `delay` of `play()` and `transitionTo()` is in seconds (it was milliseconds).
  - **Members.** `getCurrentValue()`, `getCurrentVelocity()` and `currentConfig` are `value`, `velocity` and `config`. WAAPI `nativeAnimation` is `animations[0]`, and its `propertyResolver` / `keyframeEffect` options are `resolver` / `effect`.
  - **State machines.** `initialFrom` is `initialValue`, `onTimelineChange` is `onTransition`.
  - **Clock.** `AnimationClock` is removed: use `defaultClock`, `createClock` and `clock.configure({ lagThreshold, maxDeltaTime })`. `clock.setTiming` is removed. Error messages carry the prefix `[Clock]` (was `[AnimationClock]`).
  - **Events.** `EventManager` and the `events` option are removed; use your framework's event handlers.
  - **Removed helpers.** `applyStyleSheet` (use `timeline.bind`), `calculateSegmentState`, `PlanRuntime`, `TimelineBase` and the node classes.

  ### Behavior changes

  - Animations honor `prefers-reduced-motion` by default (policy `'jump'`). Opt out per timeline with `reducedMotion: 'ignore'`.
  - `bind()` and `onUpdate` run in the clock's commit phase, after every timeline has computed. A frame notifies once.
  - `play()`, `transitionTo()` and `follow().set()` return a promise that never rejects and resolves once per run with `'ended'`, `'interrupted'`, `'skipped'`, `'reset'` or `'disposed'`.
  - `keyframes` and `durations` hold one entry per `ani` / `delay` node as written in the tree: the child of a `loop` counts once.

  ### New

  - `rafGroup`: one animation tree drives N targets through one clock subscription.
  - `follow`: a spring-driven value that keeps its velocity when the target changes.
  - `timeline.bind(target, { resolver })`, `timeline.drive(progress, config)` for progress-linked time, and `waapiTimeline` on several targets with `stagger`.
  - `loop(child, Infinity)`; the cost of a loop no longer depends on its count.
  - Clock: read / update / commit phases, `read(fn)`, `timeScale`, `pause()` / `resume()`, quarantine of failing subscribers and visibility-aware lag smoothing.
  - `@freestylejs/ani-core/testing` (`createManualClock`, `resetDefaultClock`) and `@freestylejs/ani-core/values` (color, length, template and record codecs).

  ## @freestylejs/ani-react, @freestylejs/ani-vue, @freestylejs/ani-solid, @freestylejs/ani-svelte

  - **`useAniRef` / `createAniRef`** takes the timeline and an options object, and returns `{ ref, style }` (Svelte: `{ action, style }`). Spread `style` on the element so the first server render already shows the initial value. The `events` and `cleanupEvents` options are removed: use `onClick`, `@click`, `on:click` and friends and call the timeline.
  - **`useAniStates` / `createAniStates`** takes a single config and returns `{ ref, style, state, transitionTo, machine }` (Svelte: `action` instead of `ref`). `initialFrom` is `initialValue`, and the `timeline` member is `machine.timeline()`. In React the element ref is no longer an argument.
  - **`useAni` / `createAni`** keep their `[value, controller]` tuple.
  - **New:** `useTimeline` / `createTimeline` own any object with `dispose()`; `useAniGroup` / `createAniGroup` animate a list with one `rafGroup`; `useFollow` / `createFollow` own a spring follower.
  - Bindings never dispose a timeline or group they are given, and dispose what they create.

  ## @freestylejs/ani-codemod

  Initial release, published together with ANI 2. `npx @freestylejs/ani-codemod [--dry] <file-or-dir>...` rewrites the 1.x call sites that have a safe 2.0 form (imports, timeline names, options objects, getters, `play` / `transitionTo` arguments, `delay` from milliseconds to seconds, `initialFrom`, `onTimelineChange`, the clock statics) in `.ts`, `.tsx`, `.js`, `.jsx`, `.vue`, `.svelte`, `.md` and `.mdx` files, and reports everything else with file, line and column. Run it once: a second run divides `delay` again.

### Minor Changes

- 9d1b777: Correctness, lifecycle and performance hardening of the core engine. The public API only grows; behavior changed only where the old behavior was a defect.

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

## 1.3.0

### Minor Changes

- Fix all logic problems

## 1.2.1

### Patch Changes

- Fix start iterative fast calling makes lag

## 1.2.0

### Minor Changes

- Support raf/waapi based animation timeline using compilation. Update framework bindings.

## 1.1.0

### Minor Changes

- Support dynamic sptring feature and initial delay(MS) at core.

## 1.0.0

### Major Changes

- Major V1 release of ani library.
