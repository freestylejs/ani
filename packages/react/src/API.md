# React Animation Hooks API

This API provides a set of React hooks to integrate the `@freestylejs/ani-core` animation engine with your components. These hooks offer two different strategies for applying animations: a reactive approach that syncs with component state, and a ref-based approach that directly manipulates the DOM for higher performance.

---

## `useAni`

> **A reactive hook that syncs an animation's state with a component's render cycle.**

### Example

```tsx
import { a } from "@freestylejs/ani-core";
import { useAni } from "@freestylejs/ani-react";
import { useMemo } from "react";

const Counter = () => {
  // 1. Define the animation and create a timeline instance.
  const myTimeline = useMemo(
    () => a.timeline(a.ani({ to: { count: 100 }, duration: 5 })),
    []
  );

  // 2. Use the hook to get the reactive value and the controller.
  const [value, controller] = useAni(myTimeline, { count: 0 });

  // 3. The component re-renders on each frame, updating the display.
  return (
    <div>
      <h1>Counter: {Math.round(value.count)}</h1>
      <button onClick={() => controller.play({ from: { count: 0 } })}>
        Start
      </button>
    </div>
  );
};
```

### Usage & Concepts

#### Overview

The `useAni` hook subscribes to a `timeline`'s state and triggers a component re-render on each animation frame. It uses React's `useSyncExternalStore` internally to ensure an efficient and correct subscription to the external animation state. The hook returns a tuple containing the current animation value and the timeline's controller.

#### Best Practices

-   **Do** use `useAni` when the animated values need to be part of React's state and render flow.
-   **Do** use it for animations that affect content, attributes, or props of other components, where a re-render is necessary to reflect the changes.
-   **Don't** use `useAni` for high-frequency style updates (like `transform` or `opacity`) where performance is critical. Use `useAniRef` for those cases.

### API Reference

#### Parameters

| Name | Type | Description |
| :--- | :--- | :--- |
| `timeline` | `Timeline<G>` | The timeline instance to subscribe to. |
| `initialValue` | `AniGroup<G>` | The value to use before the animation starts. |

#### Return Value

A tuple `[value, controller]` where:

| Index | Type | Description |
| :--- | :--- | :--- |
| `0` | `AniGroup<G>` | The current, reactive state of the animation. |
| `1` | `TimelineController<G>` | The controller object for the timeline (`play`, `pause`, etc.). |

#### Type Definitions

```typescript
import { Groupable, Timeline, AniGroup, TimelineController } from '@freestylejs/ani-core';

function useAni<G extends Groupable>(
  timeline: Timeline<G>,
  initialValue: AniGroup<G>
): readonly [AniGroup<G>, TimelineController<G>];
```

### Related Components

-   [`useAniRef`](#useaniref) - For performance-critical animations that write directly to the DOM.
-   [`timeline`](/docs/core-api/timeline) - The core controller that this hook subscribes to.

---

## `useAniRef`

> **A performant hook that directly animates a DOM element via a ref, bypassing React renders.**

### Example

```tsx
import { a } from "@freestylejs/ani-core";
import { useAniRef } from "@freestylejs/ani-react";
import { useMemo, useRef } from "react";

const InteractiveBox = () => {
  // 1. Create a ref to attach to the DOM element.
  const ref = useRef<HTMLDivElement>(null);

  // 2. Define the animation and create a timeline.
  const myTimeline = useMemo(
    () => a.timeline(a.ani({ to: { x: 500, rotate: 360 }, duration: 2 })),
    []
  );

  // 3. Use the hook to get the controller and bind the animation to the ref.
  const controller = useAniRef(ref, {
    timeline: myTimeline,
    initialValue: { x: 0, rotate: 0 },
  });

  // 4. The component only renders once. The animation is applied directly to the DOM.
  return (
    <>
      <button onClick={() => controller.play({ from: { x: 0, rotate: 0 } })}>
        Play
      </button>
      <div ref={ref} style={{ width: 100, height: 100, background: "blue" }} />
    </>
  );
};
```

### Usage & Concepts

#### Overview

The `useAniRef` hook is designed for high-performance animations of CSS properties. It subscribes to a timeline and, on each update, converts the animation values to CSS styles (e.g., `{ x: 100 }` becomes `transform: translateX(100px)`) and applies them directly to the `ref.current` element's style property. This avoids the overhead of re-rendering the component on every frame, resulting in smoother animations.

#### Interactivity with Events

For creating interactive animations, you can pass an `events` object. This uses a built-in `EventManager` to attach listeners to the element. Event handlers receive the timeline controller, allowing you to `play`, `pause`, etc., in response to user input.

```tsx
// ... inside a component
const controller = useAniRef(ref, {
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

-   **Do** use `useAniRef` for animating CSS properties like `transform` and `opacity`.
-   **Do** use it for complex, interactive animations that need to respond to user input at 60fps.
-   **Don't** use `useAniRef` if you need the animated value to render text content or pass to a child component's props. Use `useAni` for that.

### API Reference

#### Parameters

| Name | Type | Description |
| :--- | :--- | :--- |
| `ref` | `RefObject<E>` | The React ref attached to the DOM element to be animated. |
| `props` | `AniRefProps<G>` | The configuration object for the animation. |

#### `AniRefProps` Object

| Name | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `timeline` | `Timeline<G>` | The timeline instance to run. | — |
| `initialValue` | `AniGroup<G>` | (Optional) The initial style of the element. | — |
| `events` | `EventHandlerRegistration` | (Optional) A map of event handlers for interactivity. | `undefined` |
| `cleanupEvents` | `boolean` | (Optional) Whether to automatically clean up events on unmount. | `true` |

#### Return Value

Returns the `TimelineController<G>` instance, which you can use to control the animation's playback.

#### Type Definitions

```typescript
import { Groupable, Timeline, TimelineController, AniRefProps } from '@freestylejs/ani-core';
import { RefObject } from 'react';

function useAniRef<G extends Groupable, E extends HTMLElement = HTMLElement>(
  ref: RefObject<E | null>,
  props: AniRefProps<G>
): TimelineController<G>;
```

### Related Components

-   [`useAni`](#useani) - For reactive animations that integrate with the component render cycle.
-   [`EventManager`](/docs/core-api/advanced/event-management) - The underlying utility used by the `events` property.

---

## `useAniStates`

> **A reactive hook for managing and transitioning between multiple animation states.**

### Example

```tsx
import { a } from "@freestylejs/ani-core";
import { useAniRef, useAniStates } from "@freestylejs/ani-react";
import { useMemo, useRef } from "react";

const StateButton = () => {
  const ref = useRef<HTMLButtonElement>(null);

  // 1. Define the animations for each state.
  const animations = useMemo(
    () => ({
      idle: a.ani({ to: { scale: 1, opacity: 0.7 }, duration: 0.5 }),
      hover: a.ani({ to: { scale: 1.1, opacity: 1 }, duration: 0.3 }),
    }),
    []
  );

  // 2. Use the hook to create the state machine.
  const [{ timeline }, transitionTo] = useAniStates({
    initial: "idle",
    states: animations,
  });

  // 3. Connect the active timeline to the DOM element.
  useAniRef(ref, { timeline });

  return (
    <button
      ref={ref}
      onMouseEnter={() => transitionTo("hover")}
      onMouseLeave={() => transitionTo("idle")}
      style={{ opacity: 0.7 }}
    >
      Hover Me
    </button>
  );
};
```

### Usage & Concepts

#### Overview

The `useAniStates` hook is a React-specific wrapper around the core `createStates` function. It's designed for components with multiple, distinct visual states (e.g., idle, hover, active). The hook manages the active state and the corresponding timeline, triggering re-renders when the state or timeline changes.

#### Best Practices

-   **Do** use `useAniStates` for components with a finite number of visual states.
-   **Do** combine `useAniStates` with `useAniRef` for high-performance style animations based on state.
-   **Don't** create the `states` object inside the render function without memoization, as this will create a new state machine on every render.

### API Reference

#### Parameters

| Name | Type | Description |
| :--- | :--- | :--- |
| `props` | `StateProps<AnimationStates>` | The configuration object for the state machine. |

#### Return Value

A tuple `[stateInfo, transitionTo]` where:

| Index | Type | Description |
| :--- | :--- | :--- |
| `0` | `object` | An object containing the current `state` name and the active `timeline` instance. |
| `1` | `function` | The `transitionTo` function to switch between states. |

#### Type Definitions

```typescript
import { AnimationStateShape, StateProps, GetTimeline, StateController } from '@freestylejs/ani-core';

declare function useAniStates<const AnimationStates extends AnimationStateShape>(
  props: StateProps<AnimationStates>
): readonly [
    {
        state: keyof AnimationStates;
        timeline: GetTimeline<AnimationStates>;
    },
    StateController<AnimationStates>['transitionTo']
];
```

### Related Components

-   [`createStates`](/docs/core-api/states) - The core function that this hook is built upon.
-   [`useAniRef`](#useaniref) - To apply the stateful animations to the DOM.