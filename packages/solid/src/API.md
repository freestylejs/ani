# Solid Animation Primitives API

This document details the API for SolidJS primitives to integrate the `@freestylejs/ani-core` animation engine with your components. These primitives are designed to work seamlessly within Solid's reactive system, offering both a signal-based approach for reactive updates and a ref-based approach for high-performance, direct DOM manipulation.

---

## `createAni`

> **A reactive primitive that syncs an animation's state with a SolidJS signal.**

### Example

```tsx
import { a } from "@freestylejs/ani-core";
import { createAni } from "@freestylejs/ani-solid";
import { createMemo } from "solid-js";

const Counter = () => {
  // 1. Define the animation and create a timeline instance within a memo.
  const myTimeline = createMemo(() =>
    a.timeline(a.ani({ to: { count: 100 }, duration: 5 }))
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

The `createAni` primitive subscribes to a `timeline`'s state and updates a SolidJS signal on each animation frame. It is designed for situations where the animated values need to be read within Solid's reactive system. The primitive takes an accessor function that returns a `timeline` instance and an `initialValue`.

#### Best Practices

-   **Do** use `createAni` when the animated values need to be part of Solid's reactive system.
-   **Do** use it for animations that affect text content, attributes, or props of other components.
-   **Don't** use `createAni` for high-frequency style updates where performance is critical. Use `createAniRef` for those cases.

### API Reference

#### Parameters

| Name | Type | Description |
| :--- | :--- | :--- |
| `timeline` | `() => Timeline<G>` | An accessor function that returns the timeline instance. |
| `initialValue` | `AniGroup<G>` | The value for the signal before the animation starts. |

#### Return Value

A tuple `[accessor, controller]` where:

| Index | Type | Description |
| :--- | :--- | :--- |
| `0` | `() => AniGroup<G>` | A SolidJS signal accessor for the current animation state. |
| `1` | `TimelineController<G>` | The controller object for the timeline (`play`, `pause`, etc.). |

#### Type Definitions

```typescript
import { Groupable, Timeline, AniGroup, TimelineController } from '@freestylejs/ani-core';

function createAni<G extends Groupable>(
  timeline: () => Timeline<G>,
  initialValue: AniGroup<G>
): readonly [() => AniGroup<G>, TimelineController<G>];
```

### Related Components

-   [`createAniRef`](#createAniRef) - For performance-critical animations that write directly to the DOM.
-   [`timeline`](/docs/core-api/timeline) - The core controller that this primitive subscribes to.

---

## `createAniRef`

> **A performant primitive that directly animates a DOM element via a ref, bypassing reactive updates.**

### Example

```tsx
import { a } from "@freestylejs/ani-core";
import { createAniRef } from "@freestylejs/ani-solid";
import { createMemo } from "solid-js";

const InteractiveBox = () => {
  // 1. Define the animation and create a timeline.
  const myTimeline = createMemo(() =>
    a.timeline(a.ani({ to: { x: 500, rotate: 360 }, duration: 2 }))
  );

  // 2. Use the primitive to get the ref callback and the controller.
  const [ref, controller] = createAniRef({
    timeline: myTimeline,
    initialValue: { x: 0, rotate: 0 },
  });

  // 3. The component only renders once. The animation is applied directly to the DOM.
  return (
    <>
      <button onClick={() => controller.play({ from: { x: 0, rotate: 0 } })}>
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

The `createAniRef` primitive is designed for high-performance animations of CSS properties. It returns a `ref` callback and the timeline controller. On each animation update, it converts the values to CSS styles and applies them directly to the element's style property. This avoids involving Solid's reactive system for the animated element, resulting in smoother animations.

#### Interactivity with Events

For creating interactive animations, you can pass an `events` object. This uses a built-in `EventManager` to attach listeners to the element. Event handlers receive the timeline controller, allowing you to `play`, `pause`, etc., in response to user input.

```tsx
// ... inside a component
const [ref, controller] = createAniRef({
  timeline: myTimeline,
  events: {
    onMouseDown: (ctx, event) => {
      // The context `ctx` is the timeline controller.
      ctx.play({ from: { x: event.clientX } });
    },
    onMouseUp: (ctx) => {
      ctx.pause();
    },
  },
});
```

#### Best Practices

-   **Do** use `createAniRef` for animating CSS properties like `transform` and `opacity`.
-   **Do** use it for complex, interactive animations that need to respond to user input at 60fps.
-   **Don't** use `createAniRef` if you need the animated value to render text content or pass to another component's props. Use `createAni` for that.

### API Reference

#### Parameters

| Name | Type | Description |
| :--- | :--- | :--- |
| `props` | `AniRefProps<G, true>` | The configuration object for the animation. |

#### `AniRefProps` Object

| Name | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `timeline` | `() => Timeline<G>` | An accessor function that returns the timeline instance. | — |
| `initialValue` | `AniGroup<G>` | (Optional) The initial style of the element. | — |
| `events` | `EventHandlerRegistration` | (Optional) A map of event handlers for interactivity. | `undefined` |
| `cleanupEvents` | `boolean` | (Optional) Whether to automatically clean up events on unmount. | `true` |

#### Return Value

A tuple `[ref, controller]` where:

| Index | Type | Description |
| :--- | :--- | :--- |
| `0` | `(el: E) => void` | The ref callback to be passed to an element's `ref` attribute. |
| `1` | `TimelineController<G>` | The controller object for the timeline (`play`, `pause`, etc.). |

#### Type Definitions

```typescript
import { Groupable, Timeline, TimelineController, AniRefProps } from '@freestylejs/ani-core';

function createAniRef<G extends Groupable, E extends HTMLElement = HTMLElement>(
  props: AniRefProps<G, true>
): readonly [(el: E) => void, TimelineController<G>];
```

### Related Components

-   [`createAni`](#createAni) - For reactive animations that integrate with Solid's signal system.
-   [`EventManager`](/docs/core-api/advanced/event-management) - The underlying utility used by the `events` property.

---

## `createAniStates`

> **A reactive primitive for managing and transitioning between multiple animation states.**

### Example

```tsx
import { a } from "@freestylejs/ani-core";
import { createAniStates, createAniRef } from "@freestylejs/ani-solid";

const StateButton = () => {
  let ref;

  // 1. Define the animations for each state.
  const animations = {
    idle: a.ani({ to: { scale: 1, opacity: 0.7 }, duration: 0.5 }),
    hover: a.ani({ to: { scale: 1.1, opacity: 1 }, duration: 0.3 }),
  };

  // 2. Use the primitive to create the state machine.
  const [{ timeline }, transitionTo] = createAniStates({
    initial: "idle",
    initialFrom: { scale: 1, opacity: 0.7 },
    states: animations,
  });

  // 3. Connect the active timeline to the DOM element.
  const [animationRef] = createAniRef({ timeline });

  return (
    <button
      ref={animationRef}
      onMouseEnter={() => transitionTo("hover")}
      onMouseLeave={() => transitionTo("idle")}
    >
      Hover Me
    </button>
  );
};
```

### Usage & Concepts

#### Overview

The `createAniStates` primitive is a Solid-specific wrapper around the core `createStates` function. It's designed for components with multiple, distinct visual states. The primitive manages the active state and the corresponding timeline, providing reactive signals for both.

#### Best Practices

-   **Do** use `createAniStates` for components with a finite number of visual states.
-   **Do** combine `createAniStates` with `createAniRef` for high-performance style animations based on state.
-   **Don't** create the `states` object inside a reactive computation without memoization.

### API Reference

#### Parameters

| Name | Type | Description |
| :--- | :--- | :--- |
| `props` | `StateProps<AnimationStates>` | The configuration object for the state machine. |

#### Return Value

A tuple `[stateInfo, transitionTo]` where:

| Index | Type | Description |
| :--- | :--- | :--- |
| `0` | `object` | An object containing signal accessors for the current `state` name and the active `timeline` instance. |
| `1` | `function` | The `transitionTo` function to switch between states. |

#### Type Definitions

```typescript
import { AnimationStateShape, StateProps, GetTimeline, StateController } from '@freestylejs/ani-core';

declare function createAniStates<const AnimationStates extends AnimationStateShape>(
  props: StateProps<AnimationStates>
): readonly [
    {
        state: () => keyof AnimationStates;
        timeline: () => GetTimeline<AnimationStates>;
    },
    StateController<AnimationStates>['transitionTo']
];
```

### Related Components

-   [`createStates`](/docs/core-api/states) - The core function that this primitive is built upon.
-   [`createAniRef`](#createAniRef) - To apply the stateful animations to the DOM.