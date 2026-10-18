# Core Animation API

This API provides a declarative, compositional system for building complex, high-performance animations. You define an animation's structure by creating a tree of "animation nodes." This tree is then passed to a `Timeline` controller to be played.

The core principle is the separation of an animation's **structure** from its **values**. You can define a complex animation structure once and reuse it with different start and end values at runtime.

Timelines and state machines are **owned by whoever creates them**: call `dispose()` when the owner goes away. Per-frame cost depends on the number of animated properties, not on the number of segments. See the docs guides on large-scale usage, testing and SSR.

A key feature of this API is its **end-to-end type safety**. The entire animation node hierarchy is generic, ensuring that all animations within a single tree operate on the same data shape. This prevents a large class of runtime errors at compile time.

---

## `dynamicTimeline` (`rafTimeline`)

> **The main controller that runs an animation, manages its state, and controls its playback.**

### Example

```typescript
import { a } from "@freestylejs/ani-core";

// 1. Define the animation structure.
// TypeScript infers the data shape `G` as { opacity: number, x: number }
const myAnimation = a.sequence([
  a.ani({ to: { opacity: 1, x: 0 }, duration: 1 }),
  a.ani({ to: { opacity: 1, x: 100 }, duration: 2 }),
]);

// 2. Create a reusable timeline instance from the structure.
const myTimeline = a.dynamicTimeline(myAnimation);

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

The `dynamicTimeline` is the execution engine. It takes a static animation tree and brings it to life. It's responsible for calculating the animation's state at any given time, handling playback (play, pause, seek), and emitting update events. The key design principle is the separation of the animation's definition (the node tree) from its execution and values (the timeline). This makes animations reusable and dynamic.

#### Dynamic Animations

The `dynamicTimeline.play()` method accepts a configuration object that allows you to provide dynamic values at runtime. This is the primary mechanism for creating interactive animations.

-   `keyframes`: An array of `to` values that override the ones defined in the `ani` nodes. The number of keyframes must match the number of `ani` nodes (a `delay()` counts as one).
-   `durations`: An array of `duration` values (in seconds) that override the original durations. The timeline `duration` reflects them; `reset()` restores the base duration.
-   `repeat`: The number of additional runs. Use `Infinity` for an endless loop. Frame overshoot carries into the next run (no drift).
-   `delay`: An initial delay in milliseconds before the animation starts.
-   `velocity`: Initial per-property velocity (units per second) that seeds dynamic springs.

```typescript
// 1. Define the structure. G is inferred as { y: number }.
const recoverAnimation = a.sequence([
  a.ani({ to: { y: -15 }, duration: 0.3 }), // Overshoot stage
  a.ani({ to: { y: 0 }, duration: 0.5 }),   // Settle stage
]);
const myTimeline = a.dynamicTimeline(recoverAnimation);

// 2. On user interaction, play the animation with dynamic values.
myTimeline.play({
  from: { y: 200 }, // Dynamic start position
  keyframes: [
    { y: -30 }, // This becomes the 'to' for the first ani()
    { y: 0 },   // This becomes the 'to' for the second ani()
  ],
  repeat: 2, // Repeat the whole animation twice
  delay: 500, // Wait 500ms before starting
});
```

#### Lifecycle and guarantees

-   `status` is `IDLE`, `PLAYING`, `PAUSED` or `ENDED`. `ENDED` is emitted exactly once per run.
-   `pause()` only acts on `PLAYING`, `resume()` only on `PAUSED`.
-   `seek(time)` clamps to `[0, duration]`, **pauses** a playing or ended timeline at that time and notifies once. It does nothing before the first `play()`.
-   `reset()` returns to `IDLE`, clears the value and restores the base duration.
-   `dispose()` leaves the clock, drops all `onUpdate` callbacks and turns `play()` / `resume()` into no-ops. Idempotent.
-   `play()` **throws synchronously** for malformed configs (missing `from` key for an animated property, array/record mismatch, record `timing` missing a property, non-finite `from` / `to` / `velocity`, negative or non-finite `delay` / duration). The timeline stays untouched.
-   `play()` over a `PLAYING` timeline interrupts it and **inherits its velocity** unless `velocity` is given (pass `velocity: { x: 0 }` to start from rest).
-   `getCurrentValue()` returns a frozen snapshot (or `null`); `getCurrentVelocity()` returns per-property velocity (zeros unless `PLAYING`, `null` before the first advanced frame).
-   All `onUpdate` callbacks of one notification receive the **same** `state` object (read-only). Errors thrown by callbacks are rethrown asynchronously and do not affect other callbacks.
-   Same-property overlap: the most recently started segment produces the value (ties: later declaration); each segment's `from` is the value at its start.
-   Per-frame cost depends on the number of animated properties, not on the number of segments.

#### Best Practices

-   **Do** create one timeline per independent animation and share the node tree between timelines.
-   **Do** call `dispose()` for timelines you create when their owner goes away.
-   **Don't** create a new timeline inside a render loop or frequently. Create it once and store it.

### API Reference

#### Methods and members

| Member | Description |
| :--- | :--- |
| `play(config, [canBeIntercepted = true])` | Starts (or interrupts) the animation. |
| `pause()` | Pauses a `PLAYING` timeline. |
| `resume()` | Resumes a `PAUSED` timeline. |
| `reset([notify = true], [unsubscribeClock = true])` | Resets to `IDLE`. |
| `seek(time)` | Jumps to a time (seconds) and pauses. |
| `dispose()` | Stops for good and releases everything. |
| `onUpdate(cb)` | Registers a callback for state and status updates. Returns an unsubscribe function. |
| `getCurrentValue()` | Frozen snapshot of the latest value, or `null`. |
| `getCurrentVelocity()` | Per-property velocity, or `null`. |
| `status` | `'IDLE' \| 'PLAYING' \| 'PAUSED' \| 'ENDED'`. |
| `duration` | Total duration (seconds) of the current plan. |
| `currentConfig` | Config of the current run, or `null`. |

#### Type Definitions

```typescript
// Factory Function
function rafTimeline<G extends Groupable, Ctx = any>(rootNode: AnimationNode<G>, clock?: AnimationClockInterface): RafAniTimeline<G, Ctx>

// Main play configuration
interface RafTimelineConfig<G extends Groupable, Ctx = any> {
    from: AniGroup<G>;
    keyframes?: Array<G | 'keep'>;
    durations?: Array<number | 'keep'>;
    repeat?: number; // additional runs, e.g., Infinity
    delay?: number; // Delay in milliseconds before the animation starts
    velocity?: Partial<G>; // units per second, seeds dynamic springs
    context?: Ctx;
    propertyResolver?: G extends AnimePrimitive ? never : Resolver<G>;
}

type TimelineStatus = 'IDLE' | 'PLAYING' | 'PAUSED' | 'ENDED';

// onUpdate callback signature
type OnUpdateCallback<G extends Groupable> = (current: {
    state: AniGroup<G>; // shared by all callbacks of one notification
    status: TimelineStatus;
}) => void;

class RafAniTimeline<G extends Groupable, Ctx = any> {
  readonly status: TimelineStatus;
  readonly duration: number;
  readonly currentConfig: RafTimelineConfig<G, Ctx> | null;
  play(config: RafTimelineConfig<G, Ctx>, canBeIntercepted?: boolean): void;
  pause(): void;
  resume(): void;
  seek(time: number): void;
  reset(notify?: boolean, unsubscribeClock?: boolean): void;
  dispose(): void;
  onUpdate(callback: OnUpdateCallback<G>): () => void;
  getCurrentValue(): AniGroup<G> | null;
  getCurrentVelocity(): AniGroup<G> | null;
}
```

### Related Components

-   `ani` - The basic building block for animations controlled by a timeline.
-   `sequence` - A composition node to be passed to a timeline.
-   `parallel` - Another composition node to be passed to a timeline.

---

## `timeline` (`waapiTimeline` / `webTimeline`)

> **A high-performance, browser-native timeline powered by the Web Animations API (WAAPI).**

### Example

```typescript
import { a } from "@freestylejs/ani-core";

// 1. Define the animation structure.
const myAnimation = a.sequence([
  a.ani({ to: { x: 100 }, duration: 1 }),
  a.ani({ to: { y: 100 }, duration: 1 }),
]);

// 2. Create a web-native timeline.
const timeline = a.webTimeline(myAnimation);

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

`timeline` compiles your declarative animation tree into native browser Keyframes and plays them using `Element.animate()`. This runs animations off the main thread (where possible), resulting in silky smooth performance even when the JavaScript main thread is busy.

Unlike `dynamicTimeline`, `timeline` does not emit `onUpdate` events because the animation state is managed by the browser's native engine.

Compiled keyframes are cached per root node, `from` values and `propertyResolver` (plans with `keyframes` / `durations` overrides are not cached), so many elements sharing a tree compile once. One `timeline` drives one target: playing it on another element cancels the first animation. It needs the DOM (`KeyframeEffect`), so call it on the client only.

#### Best Practices

- **Do** use `timeline` for simple to moderately complex UI transitions that don't require per-frame JavaScript callbacks.
- **Do** use it when performance is critical (e.g., infinite loops, background animations).
- **Don't** use it if you need to sync non-CSS properties (like scroll position or canvas drawing) to the animation. Use `dynamicTimeline` for that.

### API Reference

#### Methods

| Method | Description |
| :--- | :--- |
| `play(target, config)` | Compiles and plays the animation on the target DOM element. |
| `pause()` | Pauses the native animation. |
| `resume()` | Resumes the native animation. |
| `cancel()` | Cancels the animation and removes effects. |
| `seek(time)` | Jumps to a specific time (in seconds). |

#### Type Definitions

```typescript
function timeline<G extends Groupable>(rootNode: AnimationNode<G>): WebAniTimeline<G>;

interface WebAniTimelineConfig<G extends Groupable> {
    from: G;
    repeat?: number;
    delay?: number; // milliseconds
    keyframes?: Array<G | 'keep'>;
    durations?: Array<number | 'keep'>;
    propertyResolver?: Resolver<G>;
    keyframeEffect?: Omit<KeyframeEffectOptions, 'duration' | 'iterations' | 'delay'>;
}

interface WebAniTimeline<G extends Groupable> {
    play(target: Element, config: WebAniTimelineConfig<G>): Animation | null;
    pause(): void;
    resume(): void;
    cancel(): void;
    seek(time: number): void;
    get nativeAnimation(): Animation | null;
}
```

### Related Components

-   `dynamicTimeline` - The standard JavaScript-based controller.

---

## `ani`

> **Defines a single animation segment from a start value to an end value over a duration.**

### Example

```typescript
import { a } from "@freestylejs/ani-core";

// 1. Define a simple animation that moves an object on the x-axis.
const moveRight = a.ani({ to: { x: 100 }, duration: 0.5 });

// 2. Create a timeline to control the animation.
// The data shape `{ x: number }` is inferred from the `ani` node.
const myTimeline = a.dynamicTimeline(moveRight);

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
| `props` | `SegmentNodeProps<G>` | An object containing the animation's properties. | — |
| `id` | `AnimationId` | (Optional) A unique identifier for the animation node. | `undefined` |

#### Type Definitions

```typescript
interface SegmentNodeProps<G extends Groupable> {
  readonly to: G;
  readonly duration: number;
  readonly timing?: SegmentTiming<G>;
}

function ani<G extends Groupable>(props: SegmentNodeProps<G>, id?: AnimationId): SegmentNode<G>;
```

### Related Components

-   `dynamicTimeline` - The controller required to run the animation.
-   `sequence` - To play multiple `ani` nodes one after another.
-   `parallel` - To play multiple `ani` nodes at the same time.

---

## `delay`

> **A node that introduces a pause in an animation sequence.**

### Example

```typescript
import { a } from "@freestylejs/ani-core";

// 1. Define an animation that fades in, waits, and then moves.
const myAnimation = a.sequence([
  a.ani({ to: { opacity: 1, x: 0 }, duration: 0.5 }),
  a.delay(1), // 2. Wait for 1 second.
  a.ani({ to: { opacity: 1, x: 100 }, duration: 1 }),
]);

// 3. Create and play the timeline.
const myTimeline = a.dynamicTimeline(myAnimation);
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
| `id` | `AnimationId` | (Optional) A unique identifier for the animation node. | `undefined` |

#### Type Definitions

```typescript
function delay(duration: number, id?: AnimationId): SegmentNode<PreserveRecord>;
```

### Related Components

-   `sequence` - The primary composition where `delay` is used.

---

## `sequence`

> **A composition node that plays its child animations one after another.**

### Example

```typescript
import { a } from "@freestylejs/ani-core";

// 1. Define two separate animation segments.
const fadeIn = a.ani({ to: { opacity: 1, x: 50 }, duration: 1 });
const moveRight = a.ani({ to: { opacity: 1, x: 100 }, duration: 2 });

// 2. Create a sequence. `moveRight` will start only after `fadeIn` completes.
// The data shape `{ opacity: number, x: number }` must be consistent across all children.
const myAnimation = a.sequence([fadeIn, moveRight]);

// 3. Create a timeline to run the sequence.
const myTimeline = a.dynamicTimeline(myAnimation);

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
| `timing` | `TimingFunction` | (Optional) An easing function to apply to the entire sequence's timeline. | `linear` |
| `id` | `AnimationId` | (Optional) A unique identifier for the animation node. | `undefined` |

#### Type Definitions

```typescript
function sequence<const Children extends readonly AnimationNode<Groupable>[]>(
  children: Children,
  timing?: TimingFunction,
  id?: AnimationId
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
import { a } from "@freestylejs/ani-core";

// 1. Define two animations with different durations.
const fadeIn = a.ani({ to: { opacity: 1, scale: 1.2 }, duration: 0.5 });
const move = a.ani({ to: { x: 100, y: 50 }, duration: 0.8 });

// 2. Create a parallel block. Both animations will start at the same time.
const popIn = a.parallel([fadeIn, move]);

// 3. Create a timeline. The total duration will be that of the longest child (0.8s).
const myTimeline = a.dynamicTimeline(popIn);

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
| `timing` | `TimingFunction` | (Optional) An easing function to apply to the entire block's timeline. | `linear` |
| `id` | `AnimationId` | (Optional) A unique identifier for the animation node. | `undefined` |

#### Type Definitions

```typescript
function parallel<const Children extends readonly AnimationNode<Groupable>[]>(
  children: Children,
  timing?: TimingFunction,
  id?: AnimationId
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
import { a } from "@freestylejs/ani-core";

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
  0.1
);

// 3. Create a timeline.
const myTimeline = a.dynamicTimeline(listEntrance);

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
| `offset` | `number` | Seconds between child starts, finite and `>= 0`. | — |
| `timing` | `TimingFunction` | (Optional) Inherited by child segments without their own timing. | `linear` |
| `id` | `AnimationId` | (Optional) A unique identifier for the animation node. | `undefined` |

#### Type Definitions

```typescript
function stagger<const Children extends readonly AnimationNode<Groupable>[]>(
  children: Children,
  offset: number,
  timing?: TimingFunction,
  id?: AnimationId
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
import { a } from "@freestylejs/ani-core";

// 1. Define an animation that pulses an element's scale.
const pulse = a.sequence([
    a.ani({ to: { scale: 1.2 }, duration: 0.5 }),
    a.ani({ to: { scale: 1 }, duration: 0.5 }),
]);

// 2. Create a loop to repeat the pulse animation 3 times.
const loopedPulse = a.loop(pulse, 3);

// 3. Create and play the timeline.
const myTimeline = a.dynamicTimeline(loopedPulse);
myTimeline.play({ from: { scale: 1 } });
```

### Usage & Concepts

#### Overview

`loop` is a composition node that takes a single child animation and repeats it a set number of times. The total duration of the `loop` node is the duration of its child multiplied by the loop count. This is a convenient alternative to manually creating a long `sequence` of identical animations.

#### Best Practices

-   **Do** use `loop` for simple, repetitive animations like pulsing or bouncing.
-   **Don't** use `loop` for endless animations. `loopCount` must be a finite integer `>= 0` (anything else throws a `RangeError`); use `repeat: Infinity` in `play()` instead.

### API Reference

#### Parameters

| Name | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `child` | `AnimationNode<G>` | The animation node to repeat. | — |
| `loopCount` | `number` | The number of times to repeat the child node. | — |
| `timing` | `TimingFunction` | (Optional) An easing function to apply to the entire loop's timeline. | `linear` |
| `id` | `AnimationId` | (Optional) A unique identifier for the node. | `undefined` |

#### Type Definitions

```typescript
function loop<G extends Groupable>(
    child: AnimationNode<G>,
    loopCount: number,
    timing?: TimingFunction,
    id?: AnimationId
): LoopNode<G>;
```

### Related Components

-   `dynamicTimeline` - The `play` method's `repeat` option provides an alternative way to loop.
-   `sequence` - Can be used to manually create loops, though `loop` is more concise.

---

## `a.timing`

> **A collection of functions that control the rate of change of an animation over time.**

Timing functions, often called "easing functions," are mathematical formulas that determine an animation's acceleration and deceleration. They are the key to making animations feel natural and lifelike. You can apply a timing function to any `ani` node or to an entire composition like `sequence` or `parallel`.

### Example

```typescript
import { a } from "@freestylejs/ani-core";

// Use a spring-like bounce effect for the animation.
const myAnimation = a.ani({
  to: { y: 100 },
  duration: 1,
  timing: a.timing.spring({ m: 1, k: 100, c: 10 }), // Mass, stiffness, damping
});

const myTimeline = a.dynamicTimeline(myAnimation);
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
import { a } from "@freestylejs/ani-core";

// 1. Define different animation structures for each state.
const animations = {
  inactive: a.ani({ to: { scale: 1, opacity: 0.5 }, duration: 0.5 }),
  active: a.ani({ to: { scale: 1.2, opacity: 1 }, duration: 0.3 }),
};

// 2. Create a state machine controller.
const myStates = a.createStates({
  initial: 'inactive',
  initialFrom: { scale: 1, opacity: 0.5 },
  states: animations,
});

// 3. Listen for updates from the currently active timeline.
myStates.timeline().onUpdate(({ state }) => {
    console.log(state.scale);
});

// 4. Transition to a new state. This will switch to the 'active' animation.
myStates.transitionTo('active');
```

### Usage & Concepts

#### Overview

`createStates` is a high-level utility for managing complex animation logic. It allows you to define a set of named animation trees and provides a simple API to transition between them. Each `transitionTo` creates a **new timeline** for the target state and plays it from the current value. This is ideal for UI components with multiple visual states (e.g., hover, active, disabled) or for character animations.

The new state's `from` is, in order: `timelineConfig.from`, the current timeline's value, the last value the machine showed (it survives `timeline().reset()`), then `initialFrom`. A **playing** timeline hands its velocity to the new one (override with `timelineConfig.velocity`).

#### Transition rules

-   **Atomic:** an unknown state name throws a `RangeError` before anything changes. An invalid `timelineConfig` is rolled back (previous state and timeline are kept) and the error is rethrown.
-   **`canBeIntercepted = false`:** if the current timeline is `PLAYING`, the transition is rejected and nothing changes.
-   **Replaced timelines are disposed.** Do not keep references across transitions; use `onTimelineChange`.

#### The Controller

| Member | Description |
| :--- | :--- |
| `timeline()` | The currently active timeline. |
| `state()` | The current state name. |
| `transitionTo(newState, [config], [canBeIntercepted])` | Switches state. `config` is `play()` options with an optional `from`. |
| `onTimelineChange(callback)` | Called with the new timeline right **before** it starts playing. Returns an unsubscribe function. Errors thrown by callbacks are rethrown asynchronously. |
| `dispose()` | Disposes the current timeline and clears `onTimelineChange` subscribers. Idempotent; afterwards `transitionTo` does nothing. |

The controller owns its timelines: call `dispose()` when the owner goes away.

### API Reference

#### Parameters

| Name | Type | Description |
| :--- | :--- | :--- |
| `config` | `StateProps` | The state machine configuration. |

#### Type Definitions

```typescript
// Configuration object
interface StateProps<AnimationStates extends AnimationStateShape> {
    initial: keyof AnimationStates;
    initialFrom: AniGroup<ExtractAnimationNode<AnimationStates[keyof AnimationStates]>>;
    states: AnimationStates;
    clock?: AnimationClockInterface;
}

// Returned controller
interface StateController<AnimationStates extends AnimationStateShape> {
    timeline: () => GetTimeline<AnimationStates>;
    transitionTo(
        newState: keyof AnimationStates,
        timelineConfig?: Partial<RafTimelineConfig<
            ExtractAnimationNode<AnimationStates[keyof AnimationStates]>,
            any
        >>,
        canBeIntercepted?: boolean
    ): void;
    state: () => keyof AnimationStates;
    dispose(): void;
    onTimelineChange(
        callback: (newTimeline: GetTimeline<AnimationStates>) => void
    ): () => void;
}

function createStates<AnimationStates extends AnimationStateShape>(
  config: StateProps<AnimationStates>
): StateController<AnimationStates>;
```

### Related Components

-   `dynamicTimeline` - The underlying controller for each state within the machine.

---

## `clock` (`createClock` / `AnimationClock`)

> **The frame loop that drives timelines.**

### Example

```typescript
import { a, createClock } from "@freestylejs/ani-core";

let now = 0;
let pending: ((t: number) => void) | null = null;
const clock = createClock({
  requestFrame: (cb) => { pending = cb; return 1; },
  cancelFrame: () => { pending = null; },
  now: () => now,
});

const timeline = a.dynamicTimeline(a.ani({ to: { x: 100 }, duration: 1 }), clock);
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
-   `subscribe` re-arms the loop if the environment dropped the pending frame (a pending frame older than 1 s is treated as lost).
-   Without a frame source (SSR, plain workers) `subscribe` is a silent no-op and nothing is retained.
-   Lag smoothing: a frame gap up to `lagThreshold` (default 0.5 s) advances animations by the real elapsed time (no slow motion under jank); a longer gap (hidden tab, debugger, sleep) advances by one ordinary frame. `lagThreshold: Infinity` follows the wall clock exactly. `maxDeltaTime` (unlimited by default) is an optional hard cap. Invalid values throw a `RangeError`.
-   Visibility (default on): a frame gap during which the page became hidden (`visibilitychange` fired while `hidden` was `true`) is a suspension **whatever its length**, so a tab hidden for less than `lagThreshold` no longer jumps on return. Only events suspend: a `hidden` value read at frame time does not. The listener exists only while the loop is armed (an idle clock holds none). `visibility: false` disables detection and attaches nothing, an object injects a `VisibilitySource` (tests, custom hosts), and without a usable `document` it is a silent no-op (SSR, workers). Invalid values throw a `TypeError`.

### API Reference

| Member | Description |
| :--- | :--- |
| `createClock(options?)` | Independent clock: `lagThreshold`, `maxDeltaTime`, `visibility`, `requestFrame`, `cancelFrame`, `now`, `onError`. Returns a clock with a read-only `size`. |
| `VisibilitySource` | `{ readonly hidden: boolean; addEventListener('visibilitychange', listener): void; removeEventListener('visibilitychange', listener): void }`. What `visibility: true` resolves to (`globalThis.document`); inject your own in tests. |
| `AnimationClock.create(maxDeltaTime?)` | The shared clock. A given `maxDeltaTime` applies to the existing clock. |
| `AnimationClock.configure(timing)` | Reconfigures the shared clock: a number sets `maxDeltaTime`, `{ lagThreshold?, maxDeltaTime? }` sets either atomically. |
| `AnimationClock.reset()` | Disposes the shared clock (test isolation, hot reload). |
| `clock.size` | Number of subscribed animatables. |
| `clock.read(fn)` | Runs `fn` once in the read phase of the next frame, before any subscriber's `read` / `update`. |
| `Animatable` | `{ read?(): void; update(dt: number): void; commit?(): void }`. |

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

## `createStyleSheet`, `applyStyleSheet`, `createTimelineController`

> **The helpers behind the framework bindings.**

-   `createStyleSheet(values, resolver?)` converts animation values to a style object: transform properties (`translateX`, `rotate`, `scale`, ...) are joined into one `transform`; length properties get `px`; anything else is passed through (`x` is **not** a transform shorthand, use `translateX`). A `propertyResolver` entry returns a custom `{ key, value }`.
-   `applyStyleSheet(element, style)` writes a style object: camelCase keys by property assignment, `--custom` and hyphenated keys via `style.setProperty`.
-   `createTimelineController(getTimeline, hooks?)` returns a stable facade that forwards every public member of the timeline to `getTimeline()` at call time (so it never goes stale when a state machine swaps timelines). `hooks.onPlay(config)` runs before each forwarded `play()`, `hooks.onReset()` after each `reset()`. `dispose()` is forwarded as is: bindings only call it on timelines they created.

```typescript
function createStyleSheet(values: Record<string, number>, resolver?: Resolver<Record<string, number>>): Record<string, any>;
function applyStyleSheet(element: HTMLElement, style: Record<string, unknown>): void;
function createTimelineController<G extends Groupable, Ctx = any>(
  getTimeline: () => RafAniTimeline<G, Ctx>,
  hooks?: { onPlay?: (config: RafTimelineConfig<G, Ctx>) => void; onReset?: () => void }
): RafAniTimeline<G, Ctx>;
```

---

## `EventManager`

> **A utility for managing DOM events and connecting them to an animation timeline.**

### Example

```typescript
import { a, EventManager } from "@freestylejs/ani-core";

// 1. Define an animation and timeline.
const myAnimation = a.ani({ to: { x: 500 }, duration: 1 });
const myTimeline = a.dynamicTimeline(myAnimation);

// 2. Define the events you want to listen for.
const supportedEvents = ["mousedown", "mouseup"] as const;
const eventManager = new EventManager(supportedEvents);

// 3. Bind the manager to a DOM element.
const myElement = document.getElementById("my-element");
if (myElement) {
  eventManager.bind(myElement);
}

// 4. Provide a "getter" so the manager can access the timeline.
eventManager.setAnimeGetter(() => myTimeline);

// 5. Attach event handlers.
eventManager.attach({
  onMousedown: (timeline, event) => {
    // The first argument is the timeline instance from the getter.
    timeline.play({ from: { x: event.clientX } });
  },
  onMouseup: (timeline, event) => {
    timeline.pause();
  },
});

// 6. Clean up when the component unmounts.
// eventManager.cleanupAll();
```

### Usage & Concepts

#### Overview

`EventManager` simplifies creating interactive animations that respond to user input. It acts as a bridge between the DOM event system and the animation system. By providing a "getter" for your animation context (like a `timeline`), your event handlers receive a direct, up-to-date reference to the animation controller, allowing you to `play`, `pause`, `seek`, etc., in response to events.

#### Best Practices

-   **Do** use `EventManager` to keep your event handling logic clean and co-located with your animation logic.
-   **Do** call `cleanupAll()` when your component or element is destroyed to prevent memory leaks.
-   **Don't** create multiple `EventManager` instances for the same element; one is sufficient.

### API Reference

#### Constructor

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `supportedEvents` | `readonly string[]` | An array of DOM event names to support (e.g., `['click', 'mousemove']`). |

#### Methods

| Method | Description |
| :--- | :--- |
| `bind(el)` | Binds the manager to a DOM element. |
| `setAnimeGetter(getter)` | Provides a function that returns the animation context (e.g., a timeline). |
| `add(name, listener, [options])` | Adds a listener for a specific event. Adding the same event again replaces the previous listener. |
| `attach(handlers)` | Attaches a map of `onEventName` handlers (keys must start with `on`). |
| `cleanupOne(name)` | Removes one listener (with the same capture flag it was added with). |
| `cleanupAll()` | Removes all registered event listeners from the element. |

### Related Components

-   `dynamicTimeline` - The typical animation context provided to the `EventManager`.
