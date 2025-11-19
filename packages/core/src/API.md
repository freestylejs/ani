# Core Animation API

This API provides a declarative, compositional system for building complex, high-performance animations. You define an animation's structure by creating a tree of "animation nodes." This tree is then passed to a `Timeline` controller to be played.

The core principle is the separation of an animation's **structure** from its **values**. You can define a complex animation structure once and reuse it with different start and end values at runtime.

A key feature of this API is its **end-to-end type safety**. The entire animation node hierarchy is generic, ensuring that all animations within a single tree operate on the same data shape. This prevents a large class of runtime errors at compile time.

---

## `timeline`

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
const myTimeline = a.timeline(myAnimation);

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

The `timeline` is the execution engine. It takes a static animation tree and brings it to life. It's responsible for calculating the animation's state at any given time, handling playback (play, pause, seek), and emitting update events. The key design principle is the separation of the animation's definition (the node tree) from its execution and values (the timeline). This makes animations reusable and dynamic.

#### Dynamic Animations

The `timeline.play()` method accepts a configuration object that allows you to provide dynamic values at runtime. This is the primary mechanism for creating interactive animations.

-   `keyframes`: An array of `to` values that override the ones defined in the `ani` nodes. The number of keyframes must match the number of `ani` nodes.
-   `durations`: An array of `duration` values (in seconds) that override the original durations.
-   `repeat`: A number indicating how many times the animation should repeat. Use `Infinity` for an endless loop.
-   `delay`: An initial delay in milliseconds before the animation starts.

```typescript
// 1. Define the structure. G is inferred as { y: number }.
const recoverAnimation = a.sequence([
  a.ani({ to: { y: -15 }, duration: 0.3 }), // Overshoot stage
  a.ani({ to: { y: 0 }, duration: 0.5 }),   // Settle stage
]);
const myTimeline = a.timeline(recoverAnimation);

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

#### Best Practices

-   **Do** create one timeline per independent animation.
-   **Do** reuse timelines when you need to play the same animation structure with different starting values.
-   **Don't** create a new timeline inside a render loop or frequently. Create it once and store it.

### API Reference

#### Methods

| Method | Description |
| :--- | :--- |
| `play(config, [canBeIntercepted])` | Starts the animation with a given configuration. |
| `pause()` | Pauses the animation at its current state. |
| `resume()` | Resumes a paused animation. |
| `reset()` | Resets the animation to its initial state. |
| `seek(time)` | Jumps to a specific time in the animation (in seconds). |
| `onUpdate(cb)` | Registers a callback for state and status updates. Returns an unsubscribe function. |

#### Type Definitions

```typescript
// Factory Function
function timeline<G extends Groupable, Ctx = any>(rootNode: AnimationNode<G>, clock?: AnimationClockInterface): Timeline<G, Ctx>

// Main play configuration
interface TimelineStartingConfig<G extends Groupable, Ctx = any> {
    from: AniGroup<G>;
    keyframes?: Array<G | 'keep'>;
    durations?: Array<number | 'keep'>;
    repeat?: number; // e.g., Infinity
    delay?: number; // Delay in milliseconds before the animation starts
    context?: Ctx;
    propertyResolver?: G extends AnimePrimitive ? never : Resolver<G>;
}

// onUpdate callback signature
type OnUpdateCallback<G extends Groupable> = (current: {
    state: AniGroup<G>;
    status: 'IDLE' | 'PLAYING' | 'PAUSED' | 'ENDED';
}) => void;

// Timeline Interface
interface TimelineController<G extends Groupable, Ctx = any> {
  play(config: TimelineStartingConfig<G, Ctx>, canBeIntercepted?: boolean): void;
  pause(): void;
  resume(): void;
  seek(time: number): void;
  reset(): void;
  onUpdate(callback: OnUpdateCallback<G>): () => void;
}
```

### Related Components

-   `ani` - The basic building block for animations controlled by a timeline.
-   `sequence` - A composition node to be passed to a timeline.
-   `parallel` - Another composition node to be passed to a timeline.

---

## `webTimeline`

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

`webTimeline` compiles your declarative animation tree into native browser Keyframes and plays them using `Element.animate()`. This runs animations off the main thread (where possible), resulting in silky smooth performance even when the JavaScript main thread is busy.

Unlike the standard `timeline`, `webTimeline` does not emit `onUpdate` events because the animation state is managed by the browser's native engine.

#### Best Practices

- **Do** use `webTimeline` for simple to moderately complex UI transitions that don't require per-frame JavaScript callbacks.
- **Do** use it when performance is critical (e.g., infinite loops, background animations).
- **Don't** use it if you need to sync non-CSS properties (like scroll position or canvas drawing) to the animation. Use the standard `timeline` for that.

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
function webTimeline<G extends Groupable>(rootNode: AnimationNode<G>): WebAniTimeline<G>;

interface WebAniTimelineConfig<G extends Groupable> {
    from: G;
    repeat?: number;
    delay?: number; // milliseconds
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

-   `timeline` - The standard JavaScript-based controller.

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
const myTimeline = a.timeline(moveRight);

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

#### Best Practices

-   **Do** use `ani` for any individual tween.
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

-   `timeline` - The controller required to run the animation.
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
const myTimeline = a.timeline(myAnimation);
myTimeline.play({ from: { opacity: 0, x: 0 } });
```

### Usage & Concepts

#### Overview

`delay` is a simple utility node that does nothing for a specified `duration`. Its primary purpose is to insert pauses within a `sequence` composition. It is a "leaf" node, similar to `ani`, but it does not affect any values.

#### Best Practices

-   **Do** use `delay` inside a `sequence` to create a pause between two animations.
-   **Don't** use `delay` inside a `parallel` block, as it will have no effect on other parallel animations. It will simply extend the total duration of the `parallel` block if it is the longest item.

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
const myTimeline = a.timeline(myAnimation);

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
const myTimeline = a.timeline(popIn);

// 4. Play the animation.
myTimeline.play({ from: { opacity: 0, scale: 1, x: 0, y: 0 } });
```

### Usage & Concepts

#### Overview

`parallel` is a "branch" composition node that groups animations to run concurrently. This is useful for creating effects where multiple properties change at once, like an element fading in while scaling up. The total duration of a `parallel` block is determined by the duration of its longest child animation.

#### Type Safety

Like `sequence`, `parallel` enforces that all children operate on a compatible data shape `G`.

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

> **A composition node that plays child animations sequentially with a fixed delay between them.**

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
  { offset: 0.1 }
);

// 3. Create a timeline.
const myTimeline = a.timeline(listEntrance);

// 4. Play the animation.
// Note: The `from` value applies to all three conceptual items.
myTimeline.play({ from: { opacity: 0, y: 20 } });
```

### Usage & Concepts

#### Overview

`stagger` is a specialized composition node for creating cascading or "domino" effects, typically used for lists of elements. It runs its child animations in order, but delays the start of each subsequent animation by a fixed `offset` time. It's essentially a `sequence` with a built-in, regular delay.

#### Best Practices

-   **Do** use `stagger` for animating lists of items into or out of view.
-   **Don't** use `stagger` if you need variable delays between animations; build a custom `sequence` with `delay` nodes instead.

### API Reference

#### Parameters

| Name | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `children` | `readonly AnimationNode<Groupable>[]` | An array of animation nodes to play. | — |
| `props` | `StaggerNodeProps` | An object containing the stagger configuration. | — |
| `id` | `AnimationId` | (Optional) A unique identifier for the animation node. | `undefined` |

#### Type Definitions

```typescript
interface StaggerNodeProps {
  offset: number;
  timing?: TimingFunction;
};

function stagger<const Children extends readonly AnimationNode<Groupable>[]>(
  children: Children,
  props: StaggerNodeProps,
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
const myTimeline = a.timeline(loopedPulse);
myTimeline.play({ from: { scale: 1 } });
```

### Usage & Concepts

#### Overview

`loop` is a composition node that takes a single child animation and repeats it a set number of times. The total duration of the `loop` node is the duration of its child multiplied by the loop count. This is a convenient alternative to manually creating a long `sequence` of identical animations.

#### Best Practices

-   **Do** use `loop` for simple, repetitive animations like pulsing or bouncing.
-   **Don't** use `loop` for the main application loop. For continuous animations, use the `repeat: Infinity` option in the `timeline.play()` method, which is more efficient.

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

-   `timeline` - The `play` method's `repeat` option provides an alternative way to loop.
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

const myTimeline = a.timeline(myAnimation);
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

#### `dynamicSpring(opt)`

A more advanced spring simulation that is frame-rate independent and often produces more stable results, especially for interactive animations. It uses the same options as `spring`.

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
  m: number; // Mass
  k: number; // Spring constant
  c: number; // Damping constant
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

`createStates` is a high-level utility for managing complex animation logic. It allows you to define a set of named animation trees and provides a simple API to transition between them. When you call `transitionTo`, it gracefully handles switching from the current animation timeline to the new one. This is ideal for UI components with multiple visual states (e.g., hover, active, disabled) or for character animations.

#### The Controller

The `createStates` function returns a controller object with three main methods:
-   `timeline()`: Returns the currently active timeline instance. You can use this to subscribe to updates or control playback manually.
-   `transitionTo(newState, [config], [canBeIntercepted])`: Switches to a different animation state. You can optionally provide a timeline configuration object (similar to `play`) to customize the transition.
-   `onTimelineChange(callback)`: Registers a callback that fires whenever the active timeline changes (i.e., after a transition).

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
        timelineConfig?: TimelineStartingConfig<
            ExtractAnimationNode<AnimationStates[keyof AnimationStates]>,
            any
        >,
        canBeIntercepted?: boolean
    ): void;
    onTimelineChange(
        callback: (newTimeline: GetTimeline<AnimationStates>) => void
    ): () => void;
}

function createStates<AnimationStates extends AnimationStateShape>(
  config: StateProps<AnimationStates>
): StateController<AnimationStates>;
```

### Related Components

-   `timeline` - The underlying controller for each state within the machine.

---

## `EventManager`

> **A utility for managing DOM events and connecting them to an animation timeline.**

### Example

```typescript
import { a, EventManager } from "@freestylejs/ani-core";

// 1. Define an animation and timeline.
const myAnimation = a.ani({ to: { x: 500 }, duration: 1 });
const myTimeline = a.timeline(myAnimation);

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
| `add(name, listener)` | Adds a listener for a specific event. |
| `attach(handlers)` | Attaches a map of `onEventName` handlers. |
| `cleanupAll()` | Removes all registered event listeners from the element. |

### Related Components

-   `timeline` - The typical animation context provided to the `EventManager`.