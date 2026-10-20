# Core Animation API

This API provides a declarative, compositional system for building complex, high-performance animations. You define an animation's structure by creating a tree of "animation nodes." This tree is then passed to a `Timeline` controller to be played.

The core principle is the separation of an animation's **structure** from its **values**. You can define a complex animation structure once and reuse it with different start and end values at runtime.

Timelines and state machines are **owned by whoever creates them**: call `dispose()` when the owner goes away. Per-frame cost depends on the number of animated properties, not on the number of segments. See the docs guides on large-scale usage, testing and SSR.

**Imports.** The recommended import is the namespace, `import * as a from '@freestylejs/ani-core'`: every builder and engine is reachable as `a.<name>` (`a.ani`, `a.sequence`, `a.rafTimeline`, `a.waapiTimeline`, `a.timing`, `a.createClock`, ...). The same names are also named exports of the root entry: the node builders `ani`, `delay`, `loop`, `parallel`, `sequence`, `stagger` (with their public types), `waapiTimeline` and `timing`. Engines and nodes are used through their interfaces (`RafTimeline`, `WaapiTimeline`, `RafGroup`, `Follower`, `StateController`, `Clock`) and node types; the classes behind them are not exported.

**Options objects.** Node modifiers take one options object: `sequence(children, { timing, id })`, `parallel(children, { timing, id })`, `loop(child, count, { timing, id })`, `stagger(children, { offset, timing, id })`, `delay(seconds, { id })` and `ani({ ..., id })`. A positional argument (or any extra argument) throws a `TypeError` that names the options form, as does a clock in place of the options of `rafTimeline(node, { clock })`.

**Units.** Every duration, delay and offset in the API is in **seconds**, including the RAF `delay` of `play()` / `transitionTo()`.

A key feature of this API is its **end-to-end type safety**. The entire animation node hierarchy is generic, ensuring that all animations within a single tree operate on the same data shape. This prevents a large class of runtime errors at compile time.

---

## `rafTimeline`

> **The main controller that runs an animation, manages its state, and controls its playback.**

### Example

```typescript
import * as a from "@freestylejs/ani-core";

// 1. Define the animation structure.
// TypeScript infers the data shape `G` as { opacity: number, x: number }
const myAnimation = a.sequence([
  a.ani({ to: { opacity: 1, x: 0 }, duration: 1 }),
  a.ani({ to: { opacity: 1, x: 100 }, duration: 2 }),
]);

// 2. Create a reusable timeline instance from the structure.
const myTimeline = a.rafTimeline(myAnimation);

// 3. Listen for updates to apply the animated values to your UI.
const unsubscribe = myTimeline.onUpdate(({ state }) => {
  // `state` is strongly typed as { opacity: number, x: number }
  console.log(`Opacity: ${state.opacity}, X: ${state.x}`);
  // e.g., element.style.opacity = state.opacity;
  // e.g., element.style.transform = `translateX(${state.x}px)`;
});

// 4. Play the animation from a starting state.
myTimeline.play({ from: { opacity: 0, x: 0 } });
```

### Usage & Concepts

#### Overview

The `rafTimeline` is the execution engine. It takes a static animation tree and brings it to life. It's responsible for calculating the animation's state at any given time, handling playback (play, pause, seek), and emitting update events. The key design principle is the separation of the animation's definition (the node tree) from its execution and values (the timeline). This makes animations reusable and dynamic.

#### Dynamic Animations

The `rafTimeline.play()` method accepts a configuration object that allows you to provide dynamic values at runtime. This is the primary mechanism for creating interactive animations.

-   `keyframes`: An array of `to` values that override the ones defined in the `ani` nodes. The number of keyframes must match the number of `ani` nodes (a `delay()` counts as one). Entries address the nodes **as written in the tree**, ordered by start time: the child of a `loop` is one entry, whatever the loop count, and it applies to every iteration.
-   `durations`: An array of `duration` values (in seconds) that override the original durations. The timeline `duration` reflects them; `reset()` restores the base duration.
-   `repeat`: The number of additional runs. Use `Infinity` for an endless loop. Frame overshoot carries into the next run (no drift).
-   `delay`: An initial delay in **seconds** before the animation starts (finite and `>= 0`, otherwise `play()` throws a `RangeError`). It equals a `delay` node of the same length in front of the tree.
-   `velocity`: Initial per-property velocity (units per second) that seeds dynamic springs.

```typescript
// 1. Define the structure. G is inferred as { y: number }.
const recoverAnimation = a.sequence([
  a.ani({ to: { y: -15 }, duration: 0.3 }), // Overshoot stage
  a.ani({ to: { y: 0 }, duration: 0.5 }),   // Settle stage
]);
const myTimeline = a.rafTimeline(recoverAnimation);

// 2. On user interaction, play the animation with dynamic values.
myTimeline.play({
  from: { y: 200 }, // Dynamic start position
  keyframes: [
    { y: -30 }, // This becomes the 'to' for the first ani()
    { y: 0 },   // This becomes the 'to' for the second ani()
  ],
  repeat: 2, // Repeat the whole animation twice
  delay: 0.5, // Wait 0.5 seconds before starting
});
```

#### Lifecycle and guarantees

-   `status` is `IDLE`, `PLAYING`, `PAUSED` or `ENDED`. `ENDED` is emitted exactly once per run.
-   `pause()` only acts on `PLAYING`, `resume()` only on `PAUSED`.
-   `seek(time)` clamps to `[0, duration]`, **pauses** a playing or ended timeline at that time and notifies once. It does nothing before the first `play()`.
-   `reset()` returns to `IDLE`, clears the value and restores the base duration. It takes no arguments.
-   `dispose()` leaves the clock, drops all `onUpdate` callbacks and bindings and turns `play()` / `resume()` into no-ops. Idempotent.
-   `play()` **throws synchronously** for malformed configs (missing `from` key for an animated property, array/record mismatch, record `timing` missing a property, non-finite `from` / `to` / `velocity`, negative or non-finite `delay` / duration). The timeline stays untouched.
-   `play()` over a `PLAYING` timeline interrupts it and **inherits its velocity** unless `velocity` is given (pass `velocity: { x: 0 }` to start from rest).
-   `value` is a frozen snapshot (or `null`); `velocity` is the per-property velocity (zeros unless `PLAYING`, `null` before the first advanced frame).
-   `play()` takes the config only (`interrupt` is a config key; the style mapping is `bind(target, { resolver })`). An extra argument throws a `TypeError` before anything changes.
-   The clock runs each frame in phases. `update` only computes; bound styles are written and `onUpdate` callbacks run in the **commit** phase, after every timeline on the clock has computed. A frame notifies **once**: the frame a run ends notifies once with `ENDED` and the final value, and a frame that wraps a repeat notifies once with the post-wrap value. `play()`, `seek()` and `reset()` still notify synchronously.
-   `bind(target, [{ resolver }])` writes the value to `target.style` (via `createStyleSheet`; `resolver` maps the animated values to style declarations) before the listeners of the same notification run, and only the declarations that changed since that binding's previous write. A timeline that already has a value writes it immediately. An invalid `target` (not an element or an object with a `style` object) throws a `TypeError` synchronously. The returned function unbinds (idempotent, styles are kept). Positional (array) values cannot be styled: the first write reports a `TypeError` asynchronously and drops the binding. A failing write is isolated per binding and reported asynchronously.
-   All `onUpdate` callbacks of one notification receive the **same** `state` object (read-only). Errors thrown by callbacks are rethrown asynchronously and do not affect other callbacks.
-   Same-property overlap: the most recently started segment produces the value (ties: later declaration); each segment's `from` is the value at its start.
-   Per-frame cost depends on the number of animated properties, not on the number of segments.

#### Progress-linked time

`drive(progress, config)` makes the time follow an external progress value (scroll position, a scrubbed gesture) instead of the clock. It starts a run from `config.from` (`keyframes` and `durations` are honored; `repeat`, `delay` and `velocity` are ignored) and replaces the current run, so a pending `play()` promise resolves `'interrupted'`.

```ts
const reveal = rafTimeline(a.ani({ to: { opacity: 1, translateY: 0 }, duration: 1 }))
reveal.bind(hero)
const stop = reveal.drive(() => Math.min(1, window.scrollY / 400), { from: { opacity: 0, translateY: 40 } })
```

-   `progress()` is called once synchronously for the first value (targets written, listeners notified once) and then once per frame in the clock's **read** phase. The time is `clamp(progress(), 0, 1) * duration`.
-   Bound targets are written and listeners notified only in frames where the time changed. The status stays `PLAYING` and the run never ends by itself (reaching `1` does not emit `ENDED`).
-   `velocity` is the time-derivative of the values in units per second, and zero after a frame in which the progress did not change.
-   A non-finite progress keeps the previous time and is reported once, asynchronously.
-   Reduced motion does not apply: the user controls the motion.
-   The returned function stops driving (idempotent): the timeline leaves the clock and becomes `PAUSED` at the current time, and `resume()` plays forward from there. `play()`, `seek()`, `reset()` and `dispose()` stop driving too.
-   Invalid `config`, or a `progress` that is not a function, throws synchronously and changes nothing.

#### Best Practices

-   **Do** create one timeline per independent animation and share the node tree between timelines.
-   **Do** call `dispose()` for timelines you create when their owner goes away.
-   **Don't** create a new timeline inside a render loop or frequently. Create it once and store it.

### API Reference

#### Methods and members

| Member | Description |
| :--- | :--- |
| `play(config)` | Starts (or interrupts) the animation. Returns a `Promise<RunResult>` that never rejects and resolves once per run: `'ended'` (repeats included), `'interrupted'` (another `play()` replaced it), `'skipped'` (`interrupt: false` on a `PLAYING` timeline), `'reset'` (`reset()`), `'disposed'` (`dispose()`, or `play()` after it). An invalid config throws synchronously and creates no promise. |
| `drive(progress, config)` | Links the time to an external progress value (scroll, a gesture) instead of the clock; replaces the current run. Returns a stop function. See "Progress-linked time". |
| `pause()` | Pauses a `PLAYING` timeline. |
| `resume()` | Resumes a `PAUSED` timeline. |
| `reset()` | Resets to `IDLE` and notifies. |
| `seek(time)` | Jumps to a time (seconds) and pauses. |
| `dispose()` | Stops for good and releases everything. |
| `bind(target, [options])` | Writes the value to `target.style` on every notification, changed declarations only. Returns an unbind function. |
| `onUpdate(cb)` | Registers a callback for state and status updates (commit phase). Returns an unsubscribe function. |
| `value` | Frozen snapshot of the latest value, or `null`. |
| `velocity` | Per-property velocity, or `null`. |
| `config` | Config of the current run, or `null`. |
| `status` | `'IDLE' \| 'PLAYING' \| 'PAUSED' \| 'ENDED'`. |
| `duration` | Total duration (seconds) of the current plan. |

`isRafTimeline(value)` is a type guard that is `true` for a timeline made by `rafTimeline` and for the facade returned by `createTimelineController`.

#### Type Definitions

```typescript
// Factory Function
function rafTimeline<G extends Groupable>(
    rootNode: AnimationNode<G>,
    options?: { clock?: AnimationClockInterface; reducedMotion?: ReducedMotionPolicy }
): RafTimeline<G>

// Main play configuration
interface RafTimelineConfig<G extends Groupable> {
    from: AniGroup<G>;
    keyframes?: Array<G | 'keep'>;
    durations?: Array<number | 'keep'>;
    repeat?: number; // additional runs, e.g., Infinity
    delay?: number; // Delay in seconds before the animation starts
    velocity?: Partial<G>; // units per second, seeds dynamic springs
    interrupt?: boolean; // default true; false: do nothing on a PLAYING timeline and resolve 'skipped'
}

type TimelineStatus = 'IDLE' | 'PLAYING' | 'PAUSED' | 'ENDED';

// onUpdate callback signature
type OnUpdateCallback<G extends Groupable> = (current: {
    state: AniGroup<G>; // shared by all callbacks of one notification
    status: TimelineStatus;
}) => void;

type RunResult = 'ended' | 'interrupted' | 'skipped' | 'reset' | 'disposed';

interface RafTimeline<G extends Groupable> {
  readonly status: TimelineStatus;
  readonly duration: number;
  readonly config: RafTimelineConfig<G> | null;
  readonly value: AniGroup<G> | null;
  readonly velocity: AniGroup<G> | null;
  play(config: RafTimelineConfig<G>): Promise<RunResult>;
  drive(progress: () => number, config: RafTimelineConfig<G>): () => void;
  pause(): void;
  resume(): void;
  seek(time: number): void;
  reset(): void;
  dispose(): void;
  bind(target: { style: CSSStyleDeclaration } | HTMLElement, options?: { resolver?: Resolver<Record<string, number>> }): () => void;
  onUpdate(callback: OnUpdateCallback<G>): () => void;
}

function isRafTimeline(value: unknown): value is RafTimeline<Groupable>;
```

### Related Components

-   `ani` - The basic building block for animations controlled by a timeline.
-   `sequence` - A composition node to be passed to a timeline.
-   `parallel` - Another composition node to be passed to a timeline.

---

## `rafGroup`

> **One animation tree drives N targets through a single clock subscription.**

N elements animated with N `rafTimeline`s cost N subscriptions, N plan compilations and N status machines. A group costs one of each; targets may start at staggered offsets.

### Example

```typescript
const cards = a.rafGroup(a.ani({ to: { opacity: 1, translateY: 0 }, duration: 0.35 }), {
    stagger: (i) => Math.min(i, 20) * 0.03,
})
cards.bind(document.querySelectorAll<HTMLElement>('.card'))
// or bind elements individually (e.g. in framework list items):
// const unbindFirst = cards.bindAt(0, firstCard)
cards.play({ from: { opacity: 0, translateY: 12 } })
```

### Usage & Concepts

-   Target `i` evaluates the plan at `groupTime - offset_i`, clamped to `[0, planDuration]`; before its offset it shows its `from`. `duration` is the plan duration plus the largest offset (one run).
-   Targets with the same offset, `from` values and start velocity share one evaluation: cost is the number of distinct pairs, not N. Style objects are computed once per distinct runtime and frame.
-   `play(config)` validates synchronously (nothing changes on failure) and returns a promise that resolves once per run: `'ended'` (last target finished, after repeats), `'interrupted'`, `'reset'` or `'disposed'`. `ENDED` is notified once per run.
-   `count` defaults to the length of live array bindings (`bind(targets)`); `bindAt` bindings never set the count. `delay` is in **seconds**. `repeat` repeats the whole group run, offsets included.
-   `play()` over a `PLAYING` group starts from the config's `from`; each target inherits its own current velocity unless `velocity` is given.
-   `bind(targets, [{ resolver }])` writes element `i` with target `i` in the commit phase through one style writer per element (changed declarations only). Extra elements are left alone, missing ones are not written. A group that has a value writes immediately. Array values report one `TypeError` asynchronously and drop the binding.
-   `bindAt(index, target, [{ resolver }])` binds one element to target `index` (e.g. for framework refs mounting individually). It uses the same diffing writer and resolver logic as `bind`, writes immediately if a value exists, but does not provide a default `count`.
-   `onUpdate` listeners get `{ states, status }` (one frozen state per target) once per frame from the commit phase and synchronously on `play`, `seek` and `reset`. Listener errors are isolated and rethrown asynchronously.
-   Reduced motion is honored per run when the clock reports `reducedMotion`: `'jump'` (default) finishes the whole group run at final values in one frame, `'ignore'` animates normally, `{ maxDuration }` scales time so the run (stagger included) fits within `maxDuration` seconds.

### API Reference

| Member | Description |
| :--- | :--- |
| `rafGroup(node, [{ clock, stagger, reducedMotion }])` | `stagger` is seconds per target index or `(index, count) => seconds`; `reducedMotion` is policy (`'jump'` default, `'ignore'`, `{ maxDuration }`). |
| `play(config)` | `config`: `from` (value or `(index) => value`), `count`, `keyframes`, `durations`, `repeat`, `delay` (seconds), `velocity`. Returns `Promise<RunResult>`. |
| `pause()` / `resume()` | Pause a `PLAYING` group / resume a `PAUSED` one. |
| `seek(time)` | Group time clamped to `[0, duration]`; pauses and notifies once. |
| `reset()` / `dispose()` | Back to `IDLE` / stop for good. |
| `valueAt(index)` | Frozen snapshot of one target, `null` out of range or before `play()`. |
| `bind(targets, [options])` | Returns an unbind function. |
| `bindAt(index, target, [options])` | Binds one element to target `index`. Returns an unbind function. |
| `onUpdate(listener)` | Returns an unsubscribe function. |
| `status`, `duration`, `count` | Lifecycle status, one run's duration, targets of the current run. |

---

## `follow`

> **A value that chases a target with a spring and keeps its velocity when the target changes.**

Built on `rafTimeline` with a `dynamicSpring` timing. Repeated input builds on where the motion is heading (`target`), not where it currently is.

### Example

```typescript
const scroll = a.follow({ y: 0 })
scroll.bind(list, { resolver: { y: (v) => ({ key: 'transform', value: `translateY(${-v}px)` }) } })

// three quick presses end at +300, with no slowdown in between
window.addEventListener('keydown', () => void scroll.set({ y: scroll.target.y + 100 }))
```

### Usage & Concepts

-   Keys are fixed by `initial`. `set` / `jump` merge a partial record; an unknown key, a non-finite number or a non-record throws `TypeError` synchronously and changes nothing. `spring` is validated like `dynamicSpring` (`RangeError`).
-   `set(partial, [{ velocity }])`: `target` changes immediately, the value springs toward it and the current velocity carries over (`velocity` overrides it per key). The promise resolves `'ended'` (settled; also at once for a `set` to the current target while idle), `'interrupted'` (a later `set` / `jump`) or `'disposed'`.
-   `jump(partial)`: value and target change at once, velocity 0, `IDLE`; bound targets are written and listeners notified synchronously; a pending `set` resolves `'interrupted'`.
-   `status` is `PLAYING` while moving, else `IDLE`. One clock subscription while moving, none while idle.
-   `bind` writes in the commit phase (changed declarations only) and writes the current value at once. `onUpdate` gets one `{ state, status }` frame per clock frame while moving, plus `jump`'s synchronous notification.
-   `dispose()` stops the motion and drops bindings and listeners; later `set` resolves `'disposed'`, `jump` does nothing.
-   Reduced motion: `reducedMotion` option (`'jump'` default, `'ignore'`). While the clock reports `reducedMotion` and policy is `'jump'`, each `set()` lands at the target on the next frame with velocity 0 and settles. `{ maxDuration }` is rejected (`TypeError`, code `ANI_INVALID_OPTIONS`).

### API Reference

| Member | Description |
| :--- | :--- |
| `follow(initial, [{ spring, clock, reducedMotion }])` | `spring` is `{ m, k, c, tolerance? }`, default `{ m: 1, k: 170, c: 26 }`. `reducedMotion` is `'jump'` (default) or `'ignore'`. |
| `set(target, [{ velocity }])` | Returns `Promise<RunResult>`. |
| `jump(value)` | Lands at once. |
| `bind(target, [{ resolver }])` | Returns an unbind function. |
| `onUpdate(listener)` | Returns an unsubscribe function. |
| `dispose()` | Stop for good. |
| `value`, `velocity`, `target`, `status` | Frozen current value, units/s (zeros when idle), where it is heading, `'IDLE' \| 'PLAYING'`. |

---

## `waapiTimeline`

`waapiTimeline` is the WAAPI factory (a named export, also `a.waapiTimeline`). It returns a `WaapiTimeline`; `isWaapiTimeline(value)` is its type guard.

> **A high-performance, browser-native timeline powered by the Web Animations API (WAAPI).**

### Example

```typescript
import * as a from "@freestylejs/ani-core";

// 1. Define the animation structure.
const myAnimation = a.sequence([
  a.ani({ to: { x: 100 }, duration: 1 }),
  a.ani({ to: { y: 100 }, duration: 1 }),
]);

// 2. Create a web-native timeline.
const timeline = a.waapiTimeline(myAnimation);

// 3. Play on a specific DOM element.
const element = document.getElementById("box");
if (element) {
    timeline.play(element, {
        from: { x: 0, y: 0 },
        repeat: Infinity
    });
}
```

### Usage & Concepts

#### Overview

`waapiTimeline` compiles your declarative animation tree into native browser Keyframes and plays them using `Element.animate()`. This runs animations off the main thread (where possible), resulting in silky smooth performance even when the JavaScript main thread is busy.

Unlike `rafTimeline`, it does not emit `onUpdate` events because the animation state is managed by the browser's native engine.

Compiled keyframes are cached per root node, `from` values and `resolver` (plans with `keyframes` / `durations` overrides are not cached), so many elements sharing a tree compile once. One `play()` can drive several targets: every target gets its own native `Animation`, with an optional `stagger` start offset. A `from` function gives each target its own starting value; targets with equal values share the compiled keyframes. It needs the DOM (`KeyframeEffect`), so call it on the client only.

`play()` returns a `Promise<RunResult>` that never rejects. Exactly one result is reported per run:

| Result | When |
| :--- | :--- |
| `'ended'` | Every animation finished (or `finish()` was called). |
| `'interrupted'` | A later `play()` replaced the run. |
| `'skipped'` | The timeline was running and `interrupt: false` was set. Nothing was created. |
| `'reset'` | `cancel()` / `reset()` / `dispose()` stopped the run. |
| `'disposed'` | `play()` was called after `dispose()`. |

#### Interruption

Playing over a running timeline calls `commitStyles()` on every old animation (ignored when it throws for an element that is not rendered) and then cancels it, so the element continues from the value it showed instead of jumping. **Velocity is not continuous on WAAPI**: only the position is kept (use `rafTimeline` for velocity continuity).

#### Values

`value` / `valueAt(index)` return the value of a target, computed from the plan at that animation's `currentTime` (minus its delay, wrapped per repeat, clamped to the run) with the same evaluation as the RAF engine. Computed styles are never parsed. They are `null` without a run or for an unknown index.

#### Best Practices

- **Do** use `waapiTimeline` for simple to moderately complex UI transitions that don't require per-frame JavaScript callbacks.
- **Do** use it when performance is critical (e.g., infinite loops, background animations).
- **Don't** use it if you need to sync non-CSS properties (like scroll position or canvas drawing) to the animation. Use `rafTimeline` for that.

### API Reference

#### Methods

| Member | Description |
| :--- | :--- |
| `play(targets, config)` | Compiles and plays the animation on one element or a list of elements. Returns `Promise<RunResult>`. |
| `pause()` / `resume()` | No-op unless `PLAYING` / `PAUSED`. |
| `seek(time)` | Jumps every target to `time` (seconds, clamped), keeping their offsets. |
| `finish()` | Jumps to the end: status `ENDED`, result `'ended'`. Throws for `repeat: Infinity`. |
| `cancel()` / `reset()` | Cancels the animations: status `IDLE`, result `'reset'`. |
| `dispose()` | `cancel()`, drops listeners; further `play()` resolves `'disposed'`. Idempotent. |
| `onStatus(listener)` | Called on every status change. Returns an unsubscribe function. |
| `status` | `'IDLE' \| 'PLAYING' \| 'PAUSED' \| 'ENDED'`. |
| `duration` | Seconds of one run, without delay or stagger. |
| `animations` | The native `Animation` of every target (`readonly Animation[]`). |
| `value` / `valueAt(index)` | Plan value of a target, or `null`. |

#### Type Definitions

```typescript
function waapiTimeline<G extends Groupable>(
    rootNode: AnimationNode<G>,
    options?: { reducedMotion?: ReducedMotionPolicy; clock?: { readonly reducedMotion: boolean } }
): WaapiTimeline<G>;

function isWaapiTimeline(value: unknown): value is WaapiTimeline<Groupable>;

type RunResult = 'ended' | 'interrupted' | 'skipped' | 'reset' | 'disposed';

interface WaapiPlayConfig<G extends Groupable> {
    from: G | ((index: number) => G); // record shapes only (CSS properties)
    keyframes?: Array<G | 'keep'>;
    durations?: Array<number | 'keep'>;
    repeat?: number; // extra runs, Infinity allowed
    delay?: number; // seconds
    stagger?: number | ((index: number, count: number) => number); // seconds, start offset per target
    resolver?: Resolver<Record<string, number>>;
    effect?: Omit<KeyframeEffectOptions, 'duration' | 'iterations' | 'delay'>;
    interrupt?: boolean; // default true
}

interface WaapiTimeline<G extends Groupable> {
    play(targets: Element | ArrayLike<Element>, config: WaapiPlayConfig<G>): Promise<RunResult>;
    pause(): void;
    resume(): void;
    seek(time: number): void;
    finish(): void;
    cancel(): void;
    reset(): void;
    dispose(): void;
    onStatus(listener: (status: TimelineStatus) => void): () => void;
    readonly status: TimelineStatus;
    readonly duration: number;
    readonly animations: readonly Animation[];
    readonly value: Readonly<Record<string, number>> | null;
    valueAt(index: number): Readonly<Record<string, number>> | null;
}
```

Invalid input (array `from`, negative or non-finite `delay` / stagger offsets, no target) throws synchronously, before anything is touched.

### Related Components

-   `rafTimeline` - The standard JavaScript-based controller.

---

## `ani`

> **Defines a single animation segment from a start value to an end value over a duration.**

### Example

```typescript
import * as a from "@freestylejs/ani-core";

// 1. Define a simple animation that moves an object on the x-axis.
const moveRight = a.ani({ to: { x: 100 }, duration: 0.5 });

// 2. Create a timeline to control the animation.
// The data shape `{ x: number }` is inferred from the `ani` node.
const myTimeline = a.rafTimeline(moveRight);

// 3. Listen for updates to apply the animated values.
myTimeline.onUpdate(({ state }) => {
  // `state` is strongly typed as { x: number }
  console.log(`Current x value: ${state.x}`);
});

// 4. Play the animation from a starting state.
myTimeline.play({ from: { x: 0 } });
// Console will log 'x' increasing from 0 to 100 over 0.5 seconds.
```

### Usage & Concepts

#### Overview

The `ani` function is the fundamental building block of the entire animation system. It represents a single, atomic "tween"—a transition from a starting state to a target `to` state over a specified `duration`. It is a "leaf" node in the animation tree, meaning it doesn't contain other animation nodes. All complex animations are built by composing these `ani` nodes inside "branch" nodes like `sequence` or `parallel`.

`duration` must be a finite number `>= 0`, otherwise a `RangeError` is thrown. `timing` accepts one timing function, one per property (record shapes) or one per value (array shapes).

#### Best Practices

-   **Do** use `ani` for any individual tween.
-   **Do** share one node (and tree) between many timelines. Nodes are immutable.
-   **Don't** try to animate multiple, unrelated properties in a single `ani` call if they belong to different conceptual animations. Instead, use multiple `ani` nodes within a `parallel` block.

### API Reference

#### Parameters

| Name | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `props` | `SegmentNodeProps<G> & { id?: AnimationId }` | An object containing the animation's properties and optional `id`. | — |

A second argument throws a `TypeError`: the `id` is part of `props`.

#### Type Definitions

```typescript
interface SegmentNodeProps<G extends Groupable> {
  readonly to: G;
  readonly duration: number;
  readonly timing?: SegmentTiming<G>;
  readonly id?: AnimationId;
}

function ani<G extends Groupable>(
  props: SegmentNodeProps<G> & { id?: AnimationId }
): SegmentNode<G>;
```

### Related Components

-   `rafTimeline` - The controller required to run the animation.
-   `sequence` - To play multiple `ani` nodes one after another.
-   `parallel` - To play multiple `ani` nodes at the same time.

---

## `delay`

> **A node that introduces a pause in an animation sequence.**

### Example

```typescript
import * as a from "@freestylejs/ani-core";

// 1. Define an animation that fades in, waits, and then moves.
const myAnimation = a.sequence([
  a.ani({ to: { opacity: 1, x: 0 }, duration: 0.5 }),
  a.delay(1), // 2. Wait for 1 second.
  a.ani({ to: { opacity: 1, x: 100 }, duration: 1 }),
]);

// 3. Create and play the timeline.
const myTimeline = a.rafTimeline(myAnimation);
myTimeline.play({ from: { opacity: 0, x: 0 } });
```

### Usage & Concepts

#### Overview

`delay` is a simple utility node that does nothing for a specified `duration`. Its primary purpose is to insert pauses within a `sequence` composition. It is a "leaf" node, similar to `ani`, but it does not change any values: it **holds every property** for its duration (record and array timelines). `duration` must be a finite number `>= 0`, otherwise a `RangeError` is thrown.

#### Best Practices

-   **Do** use `delay` inside a `sequence` to create a pause between two animations.
-   **Do** use `delay` at the start of one branch of a `parallel` block to offset that branch.
-   **Don't** expect `delay` inside a `parallel` block to pause the other branches. It only extends the total duration of the block when it is the longest item (a trailing `delay` counts).

### API Reference

#### Parameters

| Name | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `duration` | `number` | The duration of the delay in seconds. | — |
| `options` | `DelayOptions` | (Optional) Options object `{ id?: AnimationId }`. A string or any extra argument throws a `TypeError`. | `undefined` |

#### Type Definitions

```typescript
interface DelayOptions {
  id?: AnimationId;
}

function delay(
  duration: number,
  options?: DelayOptions
): SegmentNode<PreserveRecord>;
```

### Related Components

-   `sequence` - The primary composition where `delay` is used.

---

## `sequence`

> **A composition node that plays its child animations one after another.**

### Example

```typescript
import * as a from "@freestylejs/ani-core";

// 1. Define two separate animation segments.
const fadeIn = a.ani({ to: { opacity: 1, x: 50 }, duration: 1 });
const moveRight = a.ani({ to: { opacity: 1, x: 100 }, duration: 2 });

// 2. Create a sequence. `moveRight` will start only after `fadeIn` completes.
// The data shape `{ opacity: number, x: number }` must be consistent across all children.
const myAnimation = a.sequence([fadeIn, moveRight]);

// 3. Create a timeline to run the sequence.
const myTimeline = a.rafTimeline(myAnimation);

// 4. Play the animation. Total duration will be 1 + 2 = 3 seconds.
myTimeline.play({ from: { opacity: 0, x: 50 } });
```

### Usage & Concepts

#### Overview

`sequence` is a "branch" composition node. Its role is to organize other animation nodes (either `ani` leaves or other branches) into a linear, chronological order. The total duration of a `sequence` is the sum of the durations of all its children.

#### Type Safety

`sequence` enforces that all its direct children operate on the same data shape `G`. This is a core feature that prevents you from sequencing animations with incompatible data types, catching errors at compile time.

> **Note:** The type inference for `G` is based on the *first* element in the children array. If subsequent elements have a different shape, TypeScript will raise an error.

#### Best Practices

-   **Do** use `sequence` for multi-stage animations, like an element fading in and then moving.
-   **Don't** use `sequence` if you just need two properties to animate at the same time. Use `parallel` for that.

### API Reference

#### Parameters

| Name | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `children` | `readonly AnimationNode<Groupable>[]` | An array of animation nodes to play in order. | — |
| `options` | `NodeOptions` | (Optional) Options object `{ timing?: TimingFunction, id?: AnimationId }`. A timing function or any extra argument throws a `TypeError`. | `undefined` |

#### Type Definitions

```typescript
interface NodeOptions {
  timing?: TimingFunction;
  id?: AnimationId;
}

function sequence<const Children extends readonly AnimationNode<Groupable>[]>(
  children: Children,
  options?: NodeOptions
): SequenceNode<Children>;
```

### Related Components

-   `parallel` - To run animations simultaneously instead of in order.
-   `stagger` - A specialized sequence for creating cascading effects.
-   `ani` - The leaf nodes that are typically placed inside a `sequence`.

---

## `parallel`

> **A composition node that plays all of its child animations at the same time.**

### Example

```typescript
import * as a from "@freestylejs/ani-core";

// 1. Define two animations with different durations.
const fadeIn = a.ani({ to: { opacity: 1, scale: 1.2 }, duration: 0.5 });
const move = a.ani({ to: { x: 100, y: 50 }, duration: 0.8 });

// 2. Create a parallel block. Both animations will start at the same time.
const popIn = a.parallel([fadeIn, move]);

// 3. Create a timeline. The total duration will be that of the longest child (0.8s).
const myTimeline = a.rafTimeline(popIn);

// 4. Play the animation.
myTimeline.play({ from: { opacity: 0, scale: 1, x: 0, y: 0 } });
```

### Usage & Concepts

#### Overview

`parallel` is a "branch" composition node that groups animations to run concurrently. This is useful for creating effects where multiple properties change at once, like an element fading in while scaling up. The total duration of a `parallel` block is determined by the duration of its longest child animation.

#### Type Safety

Like `sequence`, `parallel` enforces that all children operate on a compatible data shape `G`.

#### Animating the same property twice

When two children animate the same property, the later child wins. Record-shaped direct `ani` children are resolved when the node is created. A child left with no properties is **kept as a hold**: it still contributes its duration (and its slot in `keyframes` / `durations` overrides), like `delay`. Array shapes and nested trees follow the timeline's overlap rule (the most recently started segment wins; each `from` is the value at the segment start).

#### Best Practices

-   **Do** use `parallel` whenever you want two or more animations to happen simultaneously.
-   **Don't** nest `parallel` blocks if a single one will suffice. `parallel([a, parallel([b, c])])` is the same as `parallel([a, b, c])`.

### API Reference

#### Parameters

| Name | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `children` | `readonly AnimationNode<Groupable>[]` | An array of animation nodes to play simultaneously. | — |
| `options` | `NodeOptions` | (Optional) Options object `{ timing?: TimingFunction, id?: AnimationId }`. A timing function or any extra argument throws a `TypeError`. | `undefined` |

#### Type Definitions

```typescript
function parallel<const Children extends readonly AnimationNode<Groupable>[]>(
  children: Children,
  options?: NodeOptions
): ParallelNode<Children>;
```

### Related Components

-   `sequence` - To run animations in order instead of simultaneously.
-   `ani` - The leaf nodes that are typically placed inside a `parallel` block.

---

## `stagger`

> **A composition node that starts each child animation a fixed offset after the previous one started.**

### Example

```typescript
import * as a from "@freestylejs/ani-core";

// 1. Define the animation for a single list item.
const itemAnimation = a.ani({ to: { opacity: 1, y: 0 }, duration: 0.5 });

// 2. Create a stagger animation for three items.
// Each subsequent animation will start 0.1s after the previous one.
const listEntrance = a.stagger(
  [
    itemAnimation, // for item 1
    itemAnimation, // for item 2
    itemAnimation, // for item 3
  ],
  { offset: 0.1 }
);

// 3. Create a timeline.
const myTimeline = a.rafTimeline(listEntrance);

// 4. Play the animation.
// All three children animate the same properties, so the most recently
// started child drives the value. Use one timeline per element for lists.
myTimeline.play({ from: { opacity: 0, y: 20 } });
```

### Usage & Concepts

#### Overview

`stagger` is a specialized composition node for creating cascading or "domino" effects, typically used for lists of elements. Child `i` starts at `i * offset`; a child does not wait for the previous one to finish. The total duration is the latest child end (`i * offset + duration`). `offset` must be a finite number `>= 0` (seconds), otherwise a `RangeError` is thrown.

#### Best Practices

-   **Do** use `stagger` for animating lists of items into or out of view.
-   **Don't** use `stagger` if you need variable delays between animations; build a custom `sequence` with `delay` nodes instead.

### API Reference

#### Parameters

| Name | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `children` | `readonly AnimationNode<Groupable>[]` | An array of animation nodes to play. | — |
| `options` | `StaggerOptions` | Options object `{ offset, timing?, id? }`: `offset` is the seconds between child starts, `timing` is inherited by child segments without their own. A number or any extra argument throws a `TypeError`. | — |

#### Type Definitions

```typescript
interface StaggerOptions extends NodeOptions {
  offset: number;
}

function stagger<const Children extends readonly AnimationNode<Groupable>[]>(
  children: Children,
  options: StaggerOptions
): StaggerNode<Children>;
```

### Related Components

-   `sequence` - The underlying concept for `stagger`.
-   `delay` - A utility node that can be used to create custom stagger effects within a `sequence`.

---

## `loop`

> **A composition node that repeats a child animation a specified number of times.**

### Example

```typescript
import * as a from "@freestylejs/ani-core";

// 1. Define an animation that pulses an element's scale.
const pulse = a.sequence([
    a.ani({ to: { scale: 1.2 }, duration: 0.5 }),
    a.ani({ to: { scale: 1 }, duration: 0.5 }),
]);

// 2. Create a loop to repeat the pulse animation 3 times.
const loopedPulse = a.loop(pulse, 3);

// 3. Create and play the timeline.
const myTimeline = a.rafTimeline(loopedPulse);
myTimeline.play({ from: { scale: 1 } });
```

### Usage & Concepts

#### Overview

`loop` is a composition node that takes a single child animation and repeats it a set number of times. The total duration of the `loop` node is the duration of its child multiplied by the loop count. This is a convenient alternative to manually creating a long `sequence` of identical animations.

`loopCount` is an integer `>= 0` or `Infinity`; anything else throws a `RangeError`.

#### Cost does not depend on the count

A loop is represented once in the plan, not `count` times: the first iteration starts from the value the animated properties have where the loop starts, every later one from the end state of the previous iteration, which is the same for all of them. Seeking anywhere costs the same as seeking in the first iteration, and `loop(child, 1e6)` builds as fast as `loop(child, 2)`. Values equal those of the same tree written as a `sequence` of copies (dynamic springs restart in every iteration), to 1e-9 (absolute, scaled by the distance travelled), whatever the timing, `bezier` / `ease*` included.

A finite loop that shares a property with another segment running while the loop runs (for example `parallel([loop(a, 3), b])` where both animate `x`) is written out as copies instead, with identical values; the plan then grows with the count.

#### Endless loops (`Infinity`)

`loop(child, Infinity)` repeats forever. Its `duration` is `Infinity`, and so is the duration of every container that holds it in time (a `sequence` sums, a `parallel` takes the maximum). `loop(endless, n)` is just the endless loop.

-   **Unreachable:** a `sequence` child placed after an endless child can never run, so constructing that `sequence` throws a `RangeError`. Put the endless child last, or run it in a `parallel`.
-   **Shared properties:** an endless loop owns its properties from its start on. Another segment that writes the same property while the loop runs (`parallel([loop(a, Infinity), b])` with both animating `x`) throws a `RangeError` naming the property, when the node that creates the overlap is built.
-   A timeline with an infinite duration never ends: no `ENDED` notification, `play()` resolves only when the run is interrupted, `reset()` or `dispose()`d, and `repeat` is ignored. `seek(t)` accepts any finite `t >= 0`; `drive()` needs a finite duration and throws a `RangeError`.
-   Reduced motion: `'jump'` shows the state at the end of the first iteration of every endless loop, with all finite parts completed, and holds it (`PAUSED`); `{ maxDuration }` does not apply, the run plays unchanged.
-   WAAPI: only a root `loop(child, Infinity)` is supported (the child is compiled once, `iterations: Infinity`). Any other tree with an endless loop throws a `RangeError` from `play()` that points to the RAF engine.
-   `rafGroup` offsets work as usual.

#### Overrides

`keyframes` / `durations` of `play()` hold one entry per `ani` / `delay` node **as written in the tree**: the child of a loop counts once, whatever the count (also `0` and `Infinity`), and its entry applies to every iteration. A `durations` entry that makes a segment run past the end of its iteration cuts it off at the next one; a finite loop is then written out, and an endless one throws a `RangeError` from `play()`.

#### Best Practices

-   **Do** use `loop` for repetitive animations like pulsing or bouncing, finite or endless.
-   **Don't** nest an endless loop where something else writes its properties; split the properties between a `parallel`'s children.

### API Reference

#### Parameters

| Name | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `child` | `AnimationNode<G>` | The animation node to repeat. | — |
| `loopCount` | `number` | The number of times to repeat the child node: an integer `>= 0`, or `Infinity`. | — |
| `options` | `NodeOptions` | (Optional) Options object `{ timing?: TimingFunction, id?: AnimationId }`. A timing function or any extra argument throws a `TypeError`. | `undefined` |

#### Type Definitions

```typescript
function loop<G extends Groupable>(
    child: AnimationNode<G>,
    loopCount: number,
    options?: NodeOptions
): LoopNode<G>;
```

### Related Components

-   `rafTimeline` - The `play` method's `repeat` option repeats the whole timeline.
-   `sequence` - Can be used to manually create loops, though `loop` is more concise.

---

## `timing` (`a.timing`)

`timing` is a named export of the root entry (`import { timing } from '@freestylejs/ani-core'`, or `a.timing` through the namespace). It holds the presets `linear`, `bezier`, `spring`, `dynamicSpring`, `ease`, `easeIn`, `easeOut` and `easeInOut`.

> **A collection of functions that control the rate of change of an animation over time.**

Timing functions, often called "easing functions," are mathematical formulas that determine an animation's acceleration and deceleration. They are the key to making animations feel natural and lifelike. You can apply a timing function to any `ani` node or to an entire composition like `sequence` or `parallel`.

### Example

```typescript
import * as a from "@freestylejs/ani-core";

// Use a spring-like bounce effect for the animation.
const myAnimation = a.ani({
  to: { y: 100 },
  duration: 1,
  timing: a.timing.spring({ m: 1, k: 100, c: 10 }), // Mass, stiffness, damping
});

const myTimeline = a.rafTimeline(myAnimation);
myTimeline.play({ from: { y: 0 } });
```

### Available Timing Functions

#### `linear()`

The default timing function. Creates an animation that proceeds at a constant speed.

#### `bezier(opt)`

Creates a cubic Bézier curve. This is a versatile function that can create a wide variety of easing effects, including "ease-in," "ease-out," and "ease-in-out."

-   `opt`: An object with `p2` and `p3` coordinates, e.g., `{ p2: {x: 0.42, y: 0}, p3: {x: 0.58, y: 1} }`.

#### `spring(opt)`

Simulates a physical spring. This is great for creating bouncy, organic animations.

-   `opt`: An object with physical properties:
    -   `m`: Mass (heaviness)
    -   `k`: Spring constant (stiffness)
    -   `c`: Damping constant (resistance)

#### `ease()`, `easeIn()`, `easeOut()`, `easeInOut()`

The standard CSS easing curves as `bezier` presets.

#### `dynamicSpring(opt)`

A physically simulated spring (RK4 with fixed substeps of at most 1/120 s) for interactive animations. It uses the same options as `spring`.

-   **Frame-rate independent:** the value depends on the time into the segment, not on the frame `dt`. `seek` re-simulates deterministically from the segment start.
-   **Ends when settled or at the segment `duration`**, whichever comes first, and snaps to `to`. A timeline made only of springs may end before its nominal duration. `opt.tolerance` (default `1e-3`) sets the settling threshold.
-   **State lives in the timeline** (per segment and property), so one instance can be shared. Playing over a running animation keeps the velocity; `play({ velocity })` seeds it.
-   Options are validated: `m > 0`, `k > 0`, `c >= 0` (`RangeError`). `spring` also validates, never mutates the options object, and supports `c = 0`.

### API Reference

```typescript
const a = {
  // ...
  timing: {
    linear: () => LinearTimingFunction;
    bezier: (opt: BezierTimingFunctionOpt) => BezierTimingFunction;
    spring: (opt: SpringTimingFunctionOpt) => SpringTimingFunction;
    dynamicSpring: (opt: SpringTimingFunctionOpt) => DynamicSpringTimingFunction;
  }
}

interface BezierTimingFunctionOpt {
  p2: { x: number; y: number };
  p3: { x: number; y: number };
}

interface SpringTimingFunctionOpt {
  m: number; // Mass (> 0)
  k: number; // Spring constant (> 0)
  c: number; // Damping constant (>= 0)
  tolerance?: number; // settling threshold, default 1e-3
}

// Custom timing functions
abstract class TimingFunction {
  readonly stateful?: boolean; // true => the timeline provides `context.state`
  abstract step(time: number, context: TimingFunctionContext): { value: number; endOfAnimation: boolean };
}

interface TimingFunctionContext {
  dt: number;
  from: number;
  to: number;
  duration: number;
  tolerance?: number;
  state?: Record<string, any>; // private per (timeline, segment, property); stateful timings only
  velocity?: number;           // initial velocity (units/s) for stateful timings
}
```

---

## `createStates`

> **Creates a state machine to manage and transition between different animations.**

### Example

```typescript
import * as a from "@freestylejs/ani-core";

// 1. Define different animation structures for each state.
const animations = {
  inactive: a.ani({ to: { scale: 1, opacity: 0.5 }, duration: 0.5 }),
  active: a.ani({ to: { scale: 1.2, opacity: 1 }, duration: 0.3 }),
};

// 2. Create a state machine controller.
const myStates = a.createStates({
  initial: 'inactive',
  initialValue: { scale: 1, opacity: 0.5 },
  states: animations,
});

// 3. Write the value to an element. The binding follows every transition.
const unbind = myStates.bind(element);

// 4. Transition to a new state. This will switch to the 'active' animation.
const result = await myStates.transitionTo('active'); // 'ended'
```

### Usage & Concepts

#### Overview

`createStates` is a high-level utility for managing complex animation logic. It allows you to define a set of named animation trees and provides a simple API to transition between them. Each `transitionTo` creates a **new timeline** for the target state and plays it from the current value. This is ideal for UI components with multiple visual states (e.g., hover, active, disabled) or for character animations.

The new state's `from` is, in order: `timelineConfig.from`, the current timeline's value, the last value the machine showed (it survives `timeline().reset()`), then `initialValue`. A **playing** timeline hands its velocity to the new one (override with `timelineConfig.velocity`).

#### Transition rules

-   **Atomic:** an unknown state name throws a `RangeError` before anything changes. An invalid `timelineConfig` is rolled back (previous state and timeline are kept) and the error is rethrown.
-   **`interrupt: false`** (in the config): if the current timeline is `PLAYING`, the transition is rejected, nothing changes and the promise resolves `'skipped'`.
-   **One config only:** a third argument throws a `TypeError` before anything changes.
-   **The promise** never rejects: `'ended'`, `'interrupted'` (another transition replaced it), `'skipped'`, `'reset'` or `'disposed'` (also after `dispose()`).
-   **Reduced motion:** `createStates` takes `reducedMotion?: ReducedMotionPolicy` (default `'jump'`), forwarded to every state's timeline.
-   **Replaced timelines are disposed**, with the bindings and listeners attached through the machine. Do not keep references across transitions; use `bind`, `onUpdate` or `onTransition`.

#### The Controller

| Member | Description |
| :--- | :--- |
| `timeline()` | The currently active timeline. |
| `state()` | The current state name. |
| `value` | Current timeline's value, else the last shown value, else the initial value. Frozen. |
| `transitionTo(newState, [config])` | Switches state and returns `Promise<RunResult>`. `config` is `play()` options with an optional `from`; its `delay` is in seconds. |
| `bind(target, [{ resolver }])` | Writes the value to `target.style` for the current and every later timeline. Returns unbind. |
| `onUpdate(callback)` | Receives `{ state, status }` frames of the current and every later timeline. Returns unsubscribe. |
| `onTransition(callback)` | Called with `(state, timeline)` right **before** the new timeline starts playing. Returns an unsubscribe function. Errors thrown by callbacks are rethrown asynchronously. |
| `dispose()` | Disposes the current timeline and clears every binding and subscriber. Idempotent; afterwards `transitionTo` resolves `'disposed'`. |

The controller owns its timelines: call `dispose()` when the owner goes away.

### API Reference

#### Parameters

| Name | Type | Description |
| :--- | :--- | :--- |
| `config` | `StateProps` | The state machine configuration. |

#### Type Definitions

```typescript
// Configuration object
type StateProps<AnimationStates extends AnimationStateShape> = {
    initial: keyof AnimationStates;
    initialValue: AniGroup<ExtractAnimationNode<AnimationStates[keyof AnimationStates]>>;
    states: AnimationStates;
    clock?: AnimationClockInterface;
    reducedMotion?: ReducedMotionPolicy;
};

// Returned controller
interface StateController<AnimationStates extends AnimationStateShape> {
    timeline: () => GetTimeline<AnimationStates>;
    transitionTo(
        newState: keyof AnimationStates,
        timelineConfig?: Partial<RafTimelineConfig<
            ExtractAnimationNode<AnimationStates[keyof AnimationStates]>
        >>
    ): Promise<RunResult>;
    state: () => keyof AnimationStates;
    readonly value: AniGroup<ExtractAnimationNode<AnimationStates[keyof AnimationStates]>>;
    bind(target: { style: CSSStyleDeclaration } | HTMLElement, options?: BindOptions): () => void;
    onUpdate(callback: (frame: { state: AniGroup<...>; status: TimelineStatus }) => void): () => void;
    onTransition(
        callback: (state: keyof AnimationStates, timeline: GetTimeline<AnimationStates>) => void
    ): () => void;
    dispose(): void;
}

function createStates<AnimationStates extends AnimationStateShape>(
  config: StateProps<AnimationStates>
): StateController<AnimationStates>;
```

### Related Components

-   `rafTimeline` - The underlying controller for each state within the machine.

---

## `clock` (`createClock` / `defaultClock`)

> **The frame loop that drives timelines.**

### Example

```typescript
import * as a from "@freestylejs/ani-core";
import { createClock } from "@freestylejs/ani-core";

let now = 0;
let pending: ((t: number) => void) | null = null;
const clock = createClock({
  requestFrame: (cb) => { pending = cb; return 1; },
  cancelFrame: () => { pending = null; },
  now: () => now,
});

const timeline = a.rafTimeline(a.ani({ to: { x: 100 }, duration: 1 }), { clock });
timeline.play({ from: { x: 0 } });
now += 100;
pending?.(now); // one frame
```

### Usage & Concepts

By default timelines share one process-wide clock with a **single** `requestAnimationFrame` loop. A playing timeline subscribes; the loop stops when the last one leaves.

-   At most one pending frame request; a re-entrant `subscribe` / `unsubscribe` never creates a second loop.
-   Every frame runs three phases over all subscribers: **read** (first the one-shot `clock.read(fn)` callbacks in FIFO order, then each subscriber's optional `read()`), **update** (`update(dt)`, compute only) and **commit** (each subscriber's optional `commit()`, write only). Rule: read in `read`, compute in `update`, write in `commit`. A subscriber with only `update` works as before.
-   A subscriber added during a tick (in any phase) first runs on the next tick; one unsubscribed before its `update` ran gets neither `update` nor `commit`. One that unsubscribes itself in `update` still commits in that tick (a timeline ending this frame writes its final value). The first update advances by the time since it subscribed.
-   `clock.read(fn)` queues `fn` for the read phase of the next frame and arms an idle loop; callbacks queued during a tick run in the next tick, and a queued callback does not keep the loop alive after it ran. Without a frame source it is a silent no-op.
-   A callback that throws (in any phase) does not stop the others or the next frame. The error goes to `onError` or is rethrown asynchronously.
-   Quarantine: a subscriber whose `read`, `update` or `commit` throws in **3 consecutive ticks** is unsubscribed. Each error is still reported, then one extra `AniError('ANI_SUBSCRIBER_QUARANTINED')` whose `cause` is the last error. A tick without a throw (or an `unsubscribe`) resets the count.
-   `timeScale` (default 1, finite and >= 0) multiplies every delta handed to `update`, including a new subscriber's first one, after lag smoothing and `maxDeltaTime`. `0` freezes animation time: frames keep running and timelines stay `PLAYING` with `dt = 0`. A change applies from the next frame and never alters lag detection. Invalid values throw a `RangeError` (also from `createClock`) and change nothing.
-   `pause()` cancels the pending frame and keeps every subscriber; while paused, `subscribe` and `read(fn)` retain their work but request no frame. `resume()` re-arms with a restarted time base, so the paused gap is never applied (the first frame advances by the time since `resume()`). Both are idempotent; `dispose()` also clears `paused`.
-   `subscribe` re-arms the loop if the environment dropped the pending frame (a pending frame older than 1 s is treated as lost).
-   Without a frame source (SSR, plain workers) `subscribe` is a silent no-op and nothing is retained.
-   Lag smoothing: a frame gap up to `lagThreshold` (default 0.5 s) advances animations by the real elapsed time (no slow motion under jank); a longer gap (hidden tab, debugger, sleep) advances by one ordinary frame. `lagThreshold: Infinity` follows the wall clock exactly. `maxDeltaTime` (unlimited by default) is an optional hard cap. Invalid values throw a `RangeError`.
-   Visibility (default on): a frame gap during which the page became hidden (`visibilitychange` fired while `hidden` was `true`) is a suspension **whatever its length**, so a tab hidden for less than `lagThreshold` no longer jumps on return. Only events suspend: a `hidden` value read at frame time does not. The listener exists only while the loop is armed (an idle clock holds none). `visibility: false` disables detection and attaches nothing, an object injects a `VisibilitySource` (tests, custom hosts), and without a usable `document` it is a silent no-op (SSR, workers). Invalid values throw a `TypeError`.

### API Reference

| Member | Description |
| :--- | :--- |
| `createClock(options?)` | Independent clock: `lagThreshold`, `maxDeltaTime`, `timeScale`, `visibility`, `reducedMotion`, `requestFrame`, `cancelFrame`, `now`, `onError`. Returns a `Clock` with a read-only `size`. |
| `Clock` | What `createClock`, `defaultClock` and `createManualClock().clock` return. `AnimationClockInterface` (`subscribe` / `unsubscribe`) is the minimal clock a timeline accepts. |
| `VisibilitySource` | `{ readonly hidden: boolean; addEventListener('visibilitychange', listener): void; removeEventListener('visibilitychange', listener): void }`. What `visibility: true` resolves to (`globalThis.document`); inject your own in tests. |
| `defaultClock` | The process-wide shared clock instance (creating it touches neither the DOM nor `requestAnimationFrame`). Reconfigure it with `defaultClock.configure({ maxDeltaTime })`. |
| `createManualClock(options?)` | `@freestylejs/ani-core/testing`, not in the root entry. A real clock driven by hand: `{ clock, now, pending, frame(ms = 16), frames(count, ms), advance(ms), drop(), setHidden(hidden), setReducedMotion(on) }`. Options: `lagThreshold`, `maxDeltaTime`, `timeScale`, `onError`, `visibility` (default `true`; `false` makes `setHidden` throw `TypeError`), `reducedMotion` (default `false`). |
| `resetDefaultClock()` | `@freestylejs/ani-core/testing`. Disposes `defaultClock` and restores its defaults (timing options, `timeScale` 1, not paused); the instance stays the same (test isolation, hot reload). |
| `clock.size` | Number of subscribed animatables. |
| `clock.read(fn)` | Runs `fn` once in the read phase of the next frame, before any subscriber's `read` / `update`. |
| `clock.configure({ lagThreshold?, maxDeltaTime? })` | Reconfigures the timing of any clock (`defaultClock`, `createClock()`, `createManualClock().clock`) with the same validation as the constructor options. Atomic: an invalid field throws a `RangeError` and changes nothing. |
| `clock.timeScale` | Get / set the delta multiplier (finite, >= 0, default 1). Throws `RangeError` otherwise. |
| `clock.pause()` / `clock.resume()` / `clock.paused` | Stop the frame loop keeping subscribers / restart it without the paused gap / whether it is paused. |
| `AniError` code `ANI_SUBSCRIBER_QUARANTINED` | Reported when a subscriber is unsubscribed after 3 consecutive failing ticks; `cause` is its last error. |
| `Animatable` | `{ read?(): void; update(dt: number): void; commit?(): void }`. |

---

## Reduced motion

> **Animations honor `prefers-reduced-motion` by default.**

The clock owns the preference (`createClock({ reducedMotion })`, read-only `clock.reducedMotion`); each timeline applies a policy.

```typescript
import * as a from "@freestylejs/ani-core";

const t = a.rafTimeline(node); // 'jump' (default)
const capped = a.rafTimeline(node, { reducedMotion: { maxDuration: 0.2 } });
const essential = a.rafTimeline(node, { reducedMotion: "ignore" });
```

-   `reducedMotion` on a clock: `'system'` (default; lazily follows `matchMedia('(prefers-reduced-motion: reduce)')`, `false` without `matchMedia`), a boolean to force it, or an object with a boolean `matches` (a `MediaQueryList`) as an injected live source. Anything else throws a `TypeError`. `resetDefaultClock()` keeps the source.
-   Policy `ReducedMotionPolicy = 'jump' | 'ignore' | { maxDuration: number }`, per timeline, validated at construction (`maxDuration` must be finite and > 0, else `RangeError`).
-   The preference is read **once at the start of each `play()`**: a change affects the next run, never a running one.
-   RAF `'jump'` (default): `play()` validates as usual, then the run completes at once. The value is the end state (the plan at its duration; with `repeat`, the end of the last run; `repeat: Infinity` ends after one run), the status is `ENDED`, bound targets are written, listeners are notified once with `ENDED` and the promise resolves `'ended'`. The clock is not subscribed.
-   RAF `{ maxDuration }`: a run longer than `maxDuration` plays `duration / maxDuration` times faster (springs included); `duration` still reports the plan's. Shorter runs are untouched.
-   A run of infinite duration (a tree with `loop(child, Infinity)`) never ends: RAF `'jump'` shows every finite part completed and each endless loop at the end of its first iteration, then holds that state `PAUSED` (no `ENDED`; the promise stays pending until `reset()` / `dispose()` / the next `play()`); `{ maxDuration }` does not apply and the run plays unchanged.
-   WAAPI (`waapiTimeline(node, { reducedMotion, clock })`; `clock` only provides the preference, default `defaultClock`): `'jump'` creates the animations and `finish()`es them at once (`ENDED`, `'ended'`; a `repeat: Infinity` run ends after one; a root `loop(child, Infinity)` shows the end of its first iteration and holds `PAUSED` with the promise pending, like RAF), `{ maxDuration }` sets `playbackRate` to `duration / maxDuration` when longer.
-   `rafGroup(node, { reducedMotion })`: honors the policy across all targets; `'jump'` completes the whole group run (stagger included) in one frame at its final values, `{ maxDuration }` compresses the whole group run.
-   `follow(initial, { reducedMotion })`: takes `'jump'` (default) or `'ignore'`; under `'jump'`, `set()` reaches the target on the next frame with velocity 0. `{ maxDuration }` throws a `TypeError` (`ANI_INVALID_OPTIONS`).
-   `createStates({ reducedMotion })`: forwards the policy to each state's timeline (default `'jump'`).
-   `'ignore'` keeps the normal behavior; use it for essential motion (progress indicators).
-   Tests: `createManualClock({ reducedMotion })` and `setReducedMotion(on)` flip the preference.

| Member | Description |
| :--- | :--- |
| `ReducedMotionPolicy` | `'jump' \| 'ignore' \| { maxDuration: number }`. |
| `RafTimelineOptions.reducedMotion` / `WaapiTimelineOptions.reducedMotion` / `RafGroupOptions.reducedMotion` / `StateBaseProps.reducedMotion` | Policy, default `'jump'`. |
| `FollowerOptions.reducedMotion` | `'jump' (default) \| 'ignore'`. |
| `clock.reducedMotion` | Current effective preference (read-only boolean). |
| `ReducedMotionSource` | `{ readonly matches: boolean }`, what an injected `reducedMotion` object satisfies. |

---

## Value codecs (`@freestylejs/ani-core/values`)

> **Colors, lengths and strings with numbers, on top of a numbers-only engine.**

The engine animates numbers only. A **codec** turns a display value into a number vector (to animate) and back (to display). Codecs live in their own entry point that the engine never imports; the root entry does not export them.

```typescript
import { color } from '@freestylejs/ani-core/values'

const tint = rafTimeline(a.ani({ to: color.encode('#ff3366'), duration: 0.4 }))
tint.onUpdate(({ state }) => { swatch.style.backgroundColor = color.decode(state) })
tint.play({ from: color.encode('rgb(51 85 255)') })
```

| Codec | Size | Notes |
| :--- | :--- | :--- |
| `color` / `colorIn(space)` | 4 | `[c1, c2, c3, alpha]` in `'oklab'` (default), `'srgb'` or `'srgb-linear'`. Accepts hex, `rgb()`, `hsl()`, `oklab()`, `oklch()`, `transparent` and the CSS named colors. |
| `length(unit)` | 1 | `px`, `rem`, `em`, `%`, `vw`, `vh` or `deg`. No unit conversion; unitless `0` is accepted. |
| `template` tagged template | one per slot | Each interpolation is the unit of its slot (`''` for unitless). |
| `record({ bg: color, w: length('px') })` | sum of members | Members laid out in key order. |

Decoded numbers have at most 4 decimals. Invalid input (and a vector of the wrong length) throws `AniError` with code `ANI_CODEC_MISMATCH`.

---

## `createStyleSheet`, `createTimelineController`

> **The helpers behind the framework bindings.**

-   `createStyleSheet(values, resolver?)` converts animation values to a style object: transform properties (`translateX`, `rotate`, `scale`, ...) are joined into one `transform`; length properties get `px`; anything else is passed through (`x` is **not** a transform shorthand, use `translateX`). A `resolver` entry returns a custom `{ key, value }`. It is what server rendering uses for the first paint; on the client, `bind()` writes the styles.
-   `createTimelineController(getTimeline, hooks?)` returns a stable facade that forwards every public member of the timeline to `getTimeline()` at call time (so it never goes stale when a state machine swaps timelines). `hooks.onPlay(config)` runs before each forwarded `play()`, `hooks.onReset()` after each `reset()`. `dispose()` is forwarded as is: bindings only call it on timelines they created.

```typescript
function createStyleSheet(values: Record<string, number>, resolver?: Resolver<Record<string, number>>): Record<string, any>;
function createTimelineController<G extends Groupable>(
  getTimeline: () => RafTimeline<G>,
  hooks?: { onPlay?: (config: RafTimelineConfig<G>) => void; onReset?: () => void }
): RafTimeline<G>;
```

---

## Errors

> **Every error ani throws or reports is an ani error: a stable `code` and a docs URL.**

-   Errors stay native: a wrong type is a `TypeError`, a value out of range a `RangeError`. Each carries `code` and `docs` (`https://ani.freestylejs.dev/docs/errors#<code in lowercase>`), and its message starts with `[CODE] `.
-   `error instanceof AniError` is true for every ani error, including those native instances. `isAniError(value)` is the type guard `value is Error & { code: AniErrorCode; docs: string }`; it is false for plain errors, non-errors and look-alikes with an unknown code.
-   `createAniError(Kind, code, message, options?)` makes such an error (`Kind` is `TypeError`, `RangeError` or `Error`). It is for binding authors; application code does not need it.
-   Invalid input throws synchronously and changes nothing. Failures inside a frame are reported to the clock, never thrown into it.

| Code | Class | Meaning |
| :--- | :--- | :--- |
| `ANI_INVALID_NODE` | `TypeError` / `RangeError` | A bad duration, offset, count, timing, props or children when building a node. |
| `ANI_UNREACHABLE_NODE` | `RangeError` | A node that can never run: a child after an endless loop, an endless loop sharing a property, an endless tree that is not the root of a WAAPI timeline. |
| `ANI_INVALID_CONFIG` | `TypeError` / `RangeError` | A wrong `play` / `drive` / `seek` / group `play` config or argument (`from`, shape, non-finite number, `delay`, `count`, `keyframes`, `durations`, `velocity`, seek time). |
| `ANI_UNKNOWN_STATE` | `RangeError` | `transitionTo` with a name that is not a state; `createStates` with an `initial` that is not a state. |
| `ANI_INVALID_OPTIONS` | `TypeError` / `RangeError` | Wrong factory or clock options, `reducedMotion` policy, `bind` / `bindAt` target, index or resolver, or binding primitive arguments. |
| `ANI_REMOVED_API` | `TypeError` | A 1.x call shape; the message names the 2.0 form. |
| `ANI_CODEC_MISMATCH` | `AniError` | A value codec can not parse or encode its input. |
| `ANI_SUBSCRIBER_QUARANTINED` | `AniError` | Reported once a clock subscriber failed in 3 consecutive ticks. |

```typescript
type AniErrorCode =
  | 'ANI_INVALID_NODE' | 'ANI_UNREACHABLE_NODE' | 'ANI_INVALID_CONFIG' | 'ANI_UNKNOWN_STATE'
  | 'ANI_INVALID_OPTIONS' | 'ANI_REMOVED_API' | 'ANI_CODEC_MISMATCH' | 'ANI_SUBSCRIBER_QUARANTINED';
function isAniError(value: unknown): value is Error & { code: AniErrorCode; docs: string };
function createAniError<E extends Error>(
  Kind: new (message?: string, options?: ErrorOptions) => E,
  code: AniErrorCode,
  message: string,
  options?: ErrorOptions
): E & { code: AniErrorCode; docs: string };
```


## Surface audit (2.0)

The root export list is intentional:

- `normalizeRepeatCount` and `toIterationCount` are kept public: they define the
  repeat/iteration contract shared by the RAF and WAAPI engines.
- `compileToKeyframes` is kept public: it is the WAAPI compilation primitive and
  is used by integrations that build their own `Animation` objects.
- `DEV` is kept public: external error factories can use the same
  `DEV ? longMessage : ''` pattern as core and keep production messages minimal.

Internal engine types (`PlanRuntime`, `ValueStylePlan`, `ValueStyleFrame`,
`compilePlan`) are not exported. `dist/index.d.ts` contains no internal name;
the root entry is the public surface.
