# @freestylejs/ani-react

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

- 05e5bba: New opt-in entry `@freestylejs/ani-react/layout`, the React adapter for `@freestylejs/ani-layout` 0.2.0 (an optional peer dependency, `^0.2.0`). It replaces the unreleased 0.1/0.2 layout entry with no facade, alias or legacy bridge.

  - **`useLayout(options?)`** returns a ref callback that marks an element. The element animates on every commit that moves or resizes it; there is nothing to call. Options: `layout`, `layoutId`, `layoutAnchor`, `layoutCrossfade`, `layoutDependency`, `layoutKey`, `radius`, `motion` (seconds, or a spring) and `ref` to forward the element. `radius` defaults to `true` with a `layoutId` and to `false` otherwise; `radius: false` opts a shared element out. Options are compared by value, so inline objects and inline timings do not restart anything; `layoutKey` starts a fresh baseline.
  - **`LayoutGroup`** renders no DOM. The outermost group owns the group options (`clock`, `motion`, `reducedMotion`, `threshold`, `maxNodes`, `maxParticipants`, `retain`, `onSnap`, `engine`); nested groups namespace `layoutId`s with `id` and supply `motion` defaults. Without a `LayoutGroup`, participants join an implicit root group per clock and document. The default `'raf'` engine runs on Ani's clock. `engine: 'waapi'` accepts top-level `layout: 'position'` participants only: `layoutAnchor`, `layoutId`, `radius: true`, a spring motion and nesting at `add` / `set` throw; nesting introduced later and missing CSS `linear()` support snap as `'unsupported'`. WAAPI retargets from the drawn box without velocity and writes no inline style; tracks use the document timeline, so the clock's time scale does not apply while reduced motion still does, and a jank retarget can step back by missed compositor frames.
  - **`useLayoutDrive`.** Returns a dispatcher for the direct-manipulation port. `take(element)` routes to the live scope that owns the registered element, otherwise to the implicit root of its document, and throws `ANI_INVALID_OPTIONS` when no scope owns it. The gesture layer owns pointer capture, `pointerId`, `touch-action`, velocity estimation, keyboard operation and announcements; map `pointercancel` and `lostpointercapture` to `cancel()`. The drive is not available on `engine: 'waapi'` except for the kill switch's invalidated handle.
  - **Trigger contract.** A commit animates when it renders a participant, a `LayoutGroup` or an `AnimatePresence`: that render captures the boxes, and one microtask per group flushes after the commit's layout effects, before paint. For a change that renders none of them (memoized children), `useLayoutGroup().update(fn)` captures, runs `fn` in `flushSync` and flushes; a development warning names both fixes. `useLayoutGroup().update()` resolves the `LayoutReport` (`{ status, snapped }`).
  - **`AnimatePresence`, `usePresence`, `usePresenceControl`.** An exiting child takes part in `layoutId` handoffs and crossfades. Under `mode="popLayout"` the exiting child is measured against its real containing block in the render that removes it, so its siblings move from the first frame. `usePresence().style` keeps `initial` until the enter has finished; layout owns `inert` on an exiting crossfade follower.
  - **`StrictMode` and concurrency.** Replayed renders, effects and ref callbacks keep one group and each participant's captured box; a same-task ref detach and re-attach preserves the registration and a live hold. A render React restarts in a later task captures again; a capture that crossed a rendering opportunity is reported as `capture-aged`, never used as a wrong before-box. Tested on React 19 and 18.3, plain and compiled by the React Compiler.
  - **Hard migration.** The snapshot/`play()` API, `LayoutResult`, `layout: 'box'`/`'preserve-aspect'`, `deps`, `LayoutConfig`, `maxAnimated`/`maxBoxes` and the old facade are gone. `useLayout` accepts the full `LayoutOptions`, and there is no bridge or alias. The migration tables are in the layout README and the Layout guide.

- 9d1b777: Lifecycle and robustness hardening of the React bindings.

  - `useAniStates` now owns and disposes its state controller: unmounting stops a running (even `repeat: Infinity`) timeline instead of leaving it on the global clock forever. It no longer misses a timeline swap when `transitionTo` is called before its subscription existed (e.g. from a child's mount effect). `transitionTo` is referentially stable, validates before updating React state, and `props` are read on the first render only (documented).
  - `useAniRef` binds the initial style and event handlers when `ref.current` appears later (conditional rendering), independent of the identity of `events` / `initialValue`. Handlers are resolved at event time, so inline `events` objects no longer re-attach listeners every render. The initial style is applied in a layout effect (SSR-safe, before paint). The returned controller is stable per `timeline` and now forwards `canBeIntercepted`, `status`, `dispose` and `getCurrentVelocity`.
  - Styles are applied with `setProperty` for custom properties / hyphenated keys (e.g. a `propertyResolver` returning `--x`).
  - `useAni` keeps `initialValue` from the first render and returns a controller that follows timeline changes.
  - Bindings never dispose a timeline they were given; they only detach.
  - Controllers and style writing now come from `@freestylejs/ani-core` (`createTimelineController`, `applyStyleSheet`); this release needs the matching `@freestylejs/ani-core` version.

### Patch Changes

- Updated dependencies [3927376]
- Updated dependencies [9d1b777]
- Updated dependencies [6691fff]
  - @freestylejs/ani-layout@0.2.0
  - @freestylejs/ani-core@2.0.0

## 1.1.0

### Minor Changes

- Support raf/waapi based animation timeline using compilation. Update framework bindings.

### Patch Changes

- Updated dependencies
  - @freestylejs/ani-core@1.2.0

## 1.0.0

### Major Changes

- Major V1 release of ani library.

### Patch Changes

- Updated dependencies
  - @freestylejs/ani-core@1.0.0
