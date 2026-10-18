# React Animation Hooks API

These React hooks integrate the `@freestylejs/ani-core` animation engine with React. They offer two strategies: a reactive one that syncs animation values with the framework's reactivity, and a ref-based one that writes styles directly to the DOM (no render per frame).

**Ownership:** a binding disposes the state machine it creates (`useAniStates`) and only *detaches* from timelines you pass in. Call `timeline.dispose()` yourself for timelines you create. See the large-scale usage guide in the docs.

---

## `useAni`

> **A reactive hook that syncs an animation's state with a component's render cycle.**

This hook subscribes to a `timeline`'s state and triggers a component re-render on each animation frame, making it ideal for animations that drive UI content.

### Example

```tsx
import { a } from "@freestylejs/ani-core";
import { useAni } from "@freestylejs/ani-react";
import { useMemo } from "react";

const Counter = () => {
  // 1. Define the animation and create a timeline instance.
  const myTimeline = useMemo(
    () => a.dynamicTimeline(a.ani({ to: { count: 100 }, duration: 5 })),
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

The `useAni` hook acts as a bridge between the `@freestylejs/ani-core` engine and React's render cycle. It uses React's `useSyncExternalStore` internally to efficiently subscribe to the external animation state. On each frame, it provides the updated animation value, triggering a re-render.

#### Behavior

-   `initialValue` is read on the **first render only**. It is the value shown until the timeline produces one, and the value rendered on the server.
-   The hook follows `timeline` identity changes: it unsubscribes from the old timeline and shows the new timeline's current value.
-   The returned controller is stable per `timeline`.
-   It subscribes after mount, so server rendering retains nothing. See [SSR](/en/docs/guides/ssr).
-   It never disposes the timeline you pass.

#### When to Use

-   **Do** use `useAni` when the animated values need to be part of React's state and render flow.
-   **Do** use it for animations that affect text content, attributes, or props of other components.
-   **Don't** use `useAni` for high-frequency style updates (like `transform` or `opacity`). Use `useAniRef` for those cases to avoid performance overhead.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `timeline` | `RafAniTimeline<G>` | The timeline to read. |
| `initialValue` | `AniGroup<G>` | Value before the timeline has one (first render only). |

Returns `readonly [value, controller]`: the current `AniGroup<G>` and a stable `RafAniTimeline<G>` controller.

### Related Components

-   [`useAniRef`](/en/docs/react/use-ani-ref) - For performance-critical animations that write directly to the DOM.
-   [`dynamicTimeline`](/en/docs/core-api/dynamic_timeline) - The core controller that this hook subscribes to.

---

## `useAniRef`

> **A performant hook that directly animates a DOM element via a ref, bypassing React renders.**

This hook is designed for high-performance animations of CSS properties. It subscribes to a timeline and applies styles directly to an element's `style` property, avoiding the overhead of re-rendering the component on every frame.

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
    () => a.dynamicTimeline(a.ani({ to: { translateX: 500, rotate: 360 }, duration: 2 })),
    []
  );

  // 3. Use the hook to get the controller and bind the animation to the ref.
  const controller = useAniRef(ref, {
    timeline: myTimeline,
    initialValue: { translateX: 0, rotate: 0 },
  });

  // 4. The component only renders once. The animation is applied directly to the DOM.
  return (
    <>
      <button onClick={() => controller.play({ from: { translateX: 0, rotate: 0 } })}>
        Play
      </button>
      <div ref={ref} style={{ width: 100, height: 100, background: "blue" }} />
    </>
  );
};
```

### Usage & Concepts

#### Overview

The `useAniRef` hook is the key to smooth, 60fps animations. It takes a React `ref` and an animation configuration. On each frame, it converts the animation values to CSS styles (e.g., `{ translateX: 100 }` becomes `transform: translateX(100px)`, see [styles](/en/docs/core-api/advanced/building-bindings)) and writes them directly to the DOM element. Custom properties (`--x`) returned by a `propertyResolver` are written with `setProperty`.

#### Lifecycle

-   **Binding.** The element is bound in a layout effect after every render of the component that owns the ref. An element that appears later (conditional rendering) receives the initial style and event handlers as soon as the owner renders again. The initial style is applied before paint.
-   **Stable controller.** The returned controller keeps its identity while `timeline` is the same. It forwards every timeline member, including `canBeIntercepted`.
-   **Inline objects are fine.** `events` and `initialValue` can be new objects on every render: handlers are read when the event fires, and listeners are not re-attached. The set of event names is read on each render; adding or removing a handler key rebinds.
-   **Timeline changes.** When the `timeline` prop changes, the old one is detached and the new one's current value is applied immediately.
-   **Unmount and StrictMode.** Unmounting removes the subscription and all listeners. Double-mounting in `StrictMode` leaves exactly one of each.
-   **Ownership.** The hook never disposes the timeline you pass. Call `timeline.dispose()` yourself when you created it and are done with it.

#### Example: Interactivity

For interactive animations, you can pass an `events` object. This uses a built-in `EventManager` to attach listeners to the element. Event handlers receive the timeline controller, allowing you to `play`, `pause`, etc., in response to user input.

```tsx
// ... inside a component
const controller = useAniRef(ref, {
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

-   **Do** use `useAniRef` for animating CSS properties like `transform` and `opacity`.
-   **Do** use it for complex, interactive animations that need to respond to user input at 60fps.
-   **Don't** use `useAniRef` if you need the animated value to render text content or pass to a child component's props. Use `useAni` for that.

### API Reference

#### Parameters

| Name | Type | Description |
| :--- | :--- | :--- |
| `ref` | `RefObject<E \| null>` | Ref of the element to animate. |
| `props.timeline` | `RafAniTimeline<G>` | The timeline to bind. |
| `props.initialValue` | `AniGroup<G>` | (Optional) Style applied before the timeline has a value, and restored by `reset()`. |
| `props.events` | `EventHandlerRegistration` | (Optional) `onClick`-style handlers. Receive `(ctx, event)`. |
| `props.cleanupEvents` | `boolean` | (Optional, default `true`) Remove listeners on unmount. |

#### Return value

The timeline controller (`RafAniTimeline<G>`), stable per `timeline`.

### Related Components

-   [`useAni`](/en/docs/react/use-ani) - For reactive animations that integrate with the component render cycle.
-   [`EventManager`](/en/docs/core-api/advanced/event-management) - The underlying utility used by the `events` property.

---

## `useAniStates`

> **A reactive hook for managing and transitioning between multiple animation states.**

This hook is a React-specific wrapper around the core `createStates` function. It's designed for components with multiple, distinct visual states (e.g., idle, hover, active) and provides a simple, reactive API to manage transitions between them.

### Example

```tsx
import { a } from "@freestylejs/ani-core";
import { useAniStates } from "@freestylejs/ani-react";
import { useRef } from "react";

const StateButton = () => {
    const ref = useRef<HTMLButtonElement>(null)

    // 1. Use the hook to create the state machine, passing the ref directly.
    // It returns the current state info and a function to transition.
    const [{ state }, transitionTo] = useAniStates(ref, {
        initial: 'idle',
        initialFrom: { opacity: 0.7, scale: 1 },
        states: {
            idle: a.ani({
                to: { scale: 1, opacity: 0.7 },
                duration: 0.5,
                timing: a.timing.linear(),
            }),
            hover: a.ani({
                to: { scale: 1.25, opacity: 1 },
                duration: 0.4,
                timing: a.timing.linear(),
            }),
        },
    })

    return (
        <button
            ref={ref}
            data-state={state}
            onMouseEnter={() => transitionTo('hover')}
            onMouseLeave={() => transitionTo('idle')}
            className="rounded-md bg-blue-500 px-4 py-2"
        >
            Hover Me
        </button>
    )
}
```

### Usage & Concepts

#### Overview

The `useAniStates` hook simplifies stateful animation logic in React. It manages the active animation state and its corresponding timeline, automatically handling seamless transitions between states. When you call `transitionTo`, it uses the current animation's value as the starting point for the next animation, ensuring smooth, interruptible effects.

#### Lifecycle

-   **Owns its controller.** The hook creates the state machine and **disposes it on unmount**, which stops any running timeline (even `repeat: Infinity`). In `StrictMode` the machine is recreated for the second mount.
-   **Props are read once.** `states`, `initial`, `initialFrom` and `clock` are read on the first render only (like the initial value of `useState`). You do not need to memoize `states`. To start from different props, remount the component with a `key`.
-   **Never misses a transition.** A transition issued before the hook subscribed (for example from a child component's mount effect) is picked up when it subscribes.
-   **Stable `transitionTo`.** It keeps its identity across renders, so it is safe in dependency arrays. It validates first (an unknown state throws a `RangeError` and nothing changes), and `state` reflects what the machine actually did, including a rejected transition when `canBeIntercepted` is `false`. After unmount it does nothing.
-   **Rendering.** `state` and `timeline` are React state, so changing state renders the component once per transition, not once per frame. The element is animated through `useAniRef`.

#### When to Use

-   **Do** use `useAniStates` for components with a finite number of visual states, such as buttons, interactive cards, or navigation items.
-   **Don't** use it for animations that are not state based. Use [`useAniRef`](/en/docs/react/use-ani-ref) with your own timeline.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `ref` | `RefObject<E \| null>` | Ref of the element to animate. |
| `props` | `StateProps` | `initial`, `initialFrom`, `states` and optional `clock`. See [createStates](/en/docs/core-api/states). |

Returns `readonly [{ state, timeline }, transitionTo]`.

| Member | Description |
| :--- | :--- |
| `state` | The current state name. |
| `timeline` | The active timeline. It changes on every transition. |
| `transitionTo(name, config?, canBeIntercepted?)` | Switches state. |

### Related Components

-   [`createStates`](/en/docs/core-api/states) - The core function that this hook is built upon.
-   [`useAniRef`](/en/docs/react/use-ani-ref) - To apply the stateful animations to the DOM without re-renders.
-   [`useAni`](/en/docs/react/use-ani) - To reactively read the animation values from the active timeline.
