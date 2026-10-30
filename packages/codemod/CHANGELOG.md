# @freestylejs/ani-codemod

## 1.0.0

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
