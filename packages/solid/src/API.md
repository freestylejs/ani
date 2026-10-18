# Solid Animation Primitives API

These Solid primitives integrate the `@freestylejs/ani-core` animation engine with Solid. They offer two strategies: a reactive one that syncs animation values with the framework's reactivity, and a ref-based one that writes styles directly to the DOM (no render per frame).

**Ownership:** a binding disposes the state machine it creates (`createAniStates`) and only *detaches* from timelines you pass in. Call `timeline.dispose()` yourself for timelines you create. See the large-scale usage guide in the docs.

---

## `createAni`

> **A reactive primitive that syncs an animation's state with a SolidJS signal.**

This primitive subscribes to a `timeline`'s state and updates a SolidJS signal on each animation frame, making it ideal for animations that drive reactive computations.

### Example

```tsx
import { a } from "@freestylejs/ani-core";
import { createAni } from "@freestylejs/ani-solid";
import { createMemo } from "solid-js";

const Counter = () => {
  // 1. Define the animation and create a timeline instance within a memo.
  const myTimeline = createMemo(() =>
    a.dynamicTimeline(a.ani({ to: { count: 100 }, duration: 5 }))
  );

  // 2. Use the primitive to get the reactive value accessor and the controller.
  const [value, controller] = createAni(myTimeline, { count: 0 });

  // 3. The component reactively updates as the signal's value changes.
  return (
    <div>
      <h1>Counter: {Math.round(value().count)}</h1>
      <button onClick={() => controller.play({ from: { count: 0 } })}>
        Start
      </button>
    </div>
  );
};
```

### Usage & Concepts

#### Overview

The `createAni` primitive acts as a bridge between the `@freestylejs/ani-core` engine and Solid's reactivity system. It takes an accessor function that returns a `timeline` instance and an `initialValue`. It returns a signal accessor and the timeline's controller, allowing you to read the animation's state within Solid's reactive graph.

#### Behavior

-   The returned controller follows `timeline` accessor changes and forwards every timeline member.
-   When the accessor changes, the old timeline is unsubscribed and the new timeline's current value is applied immediately.
-   The subscription is removed when the owner is disposed. The timeline you pass is never disposed.

#### When to Use

-   **Do** use `createAni` when the animated values need to be part of Solid's reactive system.
-   **Do** use it for animations that affect text content, attributes, or props of other components.
-   **Don't** use `createAni` for high-frequency style updates. Use `createAniRef` for those cases to avoid performance overhead.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `timeline` | `() => RafAniTimeline<G>` | Accessor of the timeline to read. |
| `initialValue` | `AniGroup<G>` | Value before the timeline has one. |

Returns `readonly [value, controller]`: an accessor of the current `AniGroup<G>` and the timeline controller.

### Related Components

-   [`createAniRef`](/en/docs/solid/create-ani-ref) - For performance-critical animations that write directly to the DOM.
-   [`dynamicTimeline`](/en/docs/core-api/dynamic_timeline) - The core controller that this primitive subscribes to.

---

## `createAniRef`

> **A performant primitive that directly animates a DOM element via a ref, bypassing reactive updates.**

This primitive is designed for high-performance animations of CSS properties. It subscribes to a timeline and applies styles directly to an element's `style` property, avoiding Solid's reactive updates for the animated element.

### Example

```tsx
import { a } from "@freestylejs/ani-core";
import { createAniRef } from "@freestylejs/ani-solid";
import { createMemo } from "solid-js";

const InteractiveBox = () => {
  // 1. Define the animation and create a timeline.
  const myTimeline = createMemo(() =>
    a.dynamicTimeline(a.ani({ to: { translateX: 500, rotate: 360 }, duration: 2 }))
  );

  // 2. Use the primitive to get the ref callback and the controller.
  const [ref, controller] = createAniRef({
    timeline: myTimeline,
    initialValue: { translateX: 0, rotate: 0 },
  });

  // 3. The component only renders once. The animation is applied directly to the DOM.
  return (
    <>
      <button onClick={() => controller.play({ from: { translateX: 0, rotate: 0 } })}>
        Play
      </button>
      <div
        ref={ref}
        style={{ width: "100px", height: "100px", background: "blue" }}
      />
    </>
  );
};
```

### Usage & Concepts

#### Overview

The `createAniRef` primitive is the key to smooth, 60fps animations in Solid. It returns a `ref` callback and the timeline controller. On each animation update, it converts the values to CSS styles (see [styles](/en/docs/core-api/advanced/building-bindings)) and applies them directly to the element's style property. Custom properties (`--x`) returned by a `propertyResolver` are written with `setProperty`.

#### Lifecycle

-   **Late refs.** The element is tracked in a signal, so a ref that is attached later (for example inside `Show`) receives the initial style and event handlers when it is set.
-   **Never stale.** `timeline` is an accessor. When it changes, the old timeline is detached and the new one is bound. The returned controller always targets the **current** timeline and forwards every member, including `canBeIntercepted`.
-   **Cleanup.** When the owner is disposed, the subscription and all listeners are removed and the element reference is dropped.
-   **Ownership.** The primitive never disposes the timeline you pass. Call `timeline.dispose()` yourself if you created it.

#### Example: Interactivity

For interactive animations, you can pass an `events` object. This uses a built-in `EventManager` to attach listeners to the element. Event handlers receive the timeline controller, allowing you to `play`, `pause`, etc., in response to user input.

```tsx
// ... inside a component
const [ref, controller] = createAniRef({
  timeline: myTimeline,
  events: {
    onMousedown: (ctx, event) => {
      // `ctx` is the timeline controller plus `ctx.current`, the latest value.
      ctx.play({ from: { translateX: event.clientX } });
    },
    onMouseup: (ctx) => {
      ctx.pause();
    },
  },
});
```

#### When to Use

-   **Do** use `createAniRef` for animating CSS properties like `transform` and `opacity`.
-   **Do** use it for complex, interactive animations that need to respond to user input at 60fps.
-   **Don't** use `createAniRef` if you need the animated value to render text content or pass to another component's props. Use `createAni` for that.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `props.timeline` | `() => RafAniTimeline<G>` | Accessor of the timeline to bind. |
| `props.initialValue` | `AniGroup<G>` | (Optional) Style applied before the timeline has a value, and restored by `reset()`. |
| `props.events` | `EventHandlerRegistration` | (Optional) `onClick`-style handlers. Receive `(ctx, event)`. |
| `props.cleanupEvents` | `boolean` | (Optional, default `true`) Remove listeners on cleanup. |

Returns `readonly [ref, controller]`: a ref callback for the element and the timeline controller.

### Related Components

-   [`createAni`](/en/docs/solid/create-ani) - For reactive animations that integrate with Solid's signal system.
-   [`EventManager`](/en/docs/core-api/advanced/event-management) - The underlying utility used by the `events` property.

---

## `createAniStates`

> **A reactive primitive for managing and transitioning between multiple animation states.**

This primitive is a Solid-specific wrapper around the core `createStates` function. It's designed for components with multiple, distinct visual states (e.g., idle, hover, active) and provides a simple, reactive API to manage transitions between them.

### Example

```tsx
import { a } from "@freestylejs/ani-core";
import { createAniStates } from "@freestylejs/ani-solid";

const StateButton = () => {
  // Use the primitive to create the state machine. It returns the ref callback,
  // reactive accessors for state info, and a function to transition.
  const [animationRef, { state }, transitionTo] = createAniStates({
    initial: "idle",
    initialFrom: { scale: 1, opacity: 0.7 },
    states: {
      idle: a.ani({ to: { scale: 1, opacity: 0.7 }, duration: 0.5 }),
      hover: a.ani({ to: { scale: 1.1, opacity: 1 }, duration: 0.3 }),
    },
  });

  return (
    <button
      ref={animationRef}
      onMouseEnter={() => transitionTo("hover")}
      onMouseLeave={() => transitionTo("idle")}
      data-state={state()}
      class="rounded-md bg-blue-500 px-4 py-2 transition-all"
    >
      Hover Me
    </button>
  );
};
```

### Usage & Concepts

#### Overview

The `createAniStates` primitive simplifies stateful animation logic in Solid. It manages the active animation state and its corresponding timeline, automatically handling seamless transitions. When you call `transitionTo`, it uses the current animation's value as the starting point for the next animation, ensuring smooth, interruptible effects.

#### Lifecycle

-   **Owns its controller.** The primitive creates the state machine and **disposes it when its owner is disposed**, which stops any running timeline (even `repeat: Infinity`).
-   **Props are read once**, at setup. `states`, `initial`, `initialFrom` and `clock` are not tracked.
-   **Atomic transitions.** `transitionTo` validates first (an unknown state throws a `RangeError` and nothing changes). The `state` accessor reflects what the machine actually did, including a transition rejected because `canBeIntercepted` is `false`.
-   **Never misses a swap.** The primitive subscribes to timeline changes at setup, and `createAniRef` follows the `timeline` accessor.

#### When to Use

-   **Do** use `createAniStates` for components with a finite number of visual states, such as buttons, interactive cards, or navigation items.
-   **Don't** use it for animations that are not state based. Use [`createAniRef`](/en/docs/solid/create-ani-ref) with your own timeline.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `props` | `StateProps` | `initial`, `initialFrom`, `states` and optional `clock`. See [createStates](/en/docs/core-api/states). |

Returns `readonly [ref, { state, timeline }, transitionTo]`.

| Member | Description |
| :--- | :--- |
| `ref` | Ref callback to attach to the element. |
| `state()` | Accessor of the current state name. |
| `timeline()` | Accessor of the active timeline. It changes on every transition. |
| `transitionTo(name, config?, canBeIntercepted?)` | Switches state. |

### Related Components

-   [`createStates`](/en/docs/core-api/states) - The core function that this primitive is built upon.
-   [`createAniRef`](/en/docs/solid/create-ani-ref) - To apply the stateful animations to the DOM.
-   [`createAni`](/en/docs/solid/create-ani) - To reactively read the animation values from the active timeline.
