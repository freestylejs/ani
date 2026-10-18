# Svelte Animation Primitives API

These Svelte utilities integrate the `@freestylejs/ani-core` animation engine with Svelte. They offer two strategies: a reactive one that syncs animation values with the framework's reactivity, and a ref-based one that writes styles directly to the DOM (no render per frame).

**Ownership:** a binding disposes the state machine it creates (`useAniStates`) and only *detaches* from timelines you pass in. Call `timeline.dispose()` yourself for timelines you create. See the large-scale usage guide in the docs.

---

## `useAni`

> **A Svelte utility that creates a reactive store to track the state of an animation timeline.**

This primitive subscribes to a `timeline`'s state and exposes it as a readable Svelte store. It's ideal when animated values need to be used within your component's markup or other reactive computations.

### Example

```svelte
<script>
  import { onMount } from 'svelte';
  import { a } from "@freestylejs/ani-core";
  import { useAni } from '@freestylejs/ani-svelte';

  // 1. Define the animation structure and create a timeline.
  const myTimeline = a.dynamicTimeline(
    a.ani({ to: { count: 100 }, duration: 5, timing: a.timing.linear() })
  );

  // 2. Use the utility to get the readable store and controller.
  const [value, controller] = useAni(myTimeline, { count: 0 });

  // 3. Play the animation on component mount.
  onMount(() => {
      controller.play({ from: { count: 0 } });
  })
</script>

<div>
  <!-- 4. The animated value is read from the store via auto-subscription. -->
  <h1>Counter: {Math.round($value.count)}</h1>
  <button on:click={() => controller.play({ from: { count: 0 } })}>
    Start
  </button>
</div>
```

### Usage & Concepts

#### Overview

The `useAni` primitive acts as a bridge between the `@freestylejs/ani-core` engine and Svelte's reactivity model. It takes a `timeline` instance and an `initialValue`, returning a readable Svelte store that updates on every animation frame, along with the timeline's controller. You can auto-subscribe to the store's value using the `$` prefix.

#### Behavior

-   `timeline` may be a timeline or a `Readable` of one. Swaps are followed while the store has subscribers.
-   The store subscribes to the timeline only while it has subscribers, so nothing is retained otherwise (also on the server).
-   The returned controller follows timeline swaps. The timeline you pass is never disposed.

#### When to Use

-   **Do** use `useAni` when you need the animated values to be part of Svelte's reactive system.
-   **Do** use it for animations that affect text content, attributes, or props.
-   **Don't** use `useAni` for high-frequency style updates on a single element. For that, `useAniRef` is a better choice.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `timeline` | `RafAniTimeline<G> \| Readable<RafAniTimeline<G>>` | The timeline to read. |
| `initialValue` | `AniGroup<G>` | Value before the timeline has one. |

Returns `readonly [store, controller]`: a `Readable<AniGroup<G>>` and the timeline controller.

### Related Components

-   [`useAniRef`](/en/docs/svelte/use-ani-ref) - For performance-critical animations that write directly to the DOM.
-   [`dynamicTimeline`](/en/docs/core-api/dynamic_timeline) - The core controller that this primitive subscribes to.

---

## `useAniRef`

> **A performant, event-driven Svelte action that binds animations directly to a DOM element.**

This primitive applies animation styles directly to a DOM element using the `use:` directive, bypassing Svelte's reactivity for high performance. It also includes a built-in event manager to simplify interactive animations.

### Example

```svelte
<script>
  import { a } from '@freestylejs/ani-core';
  import { useAniRef } from '@freestylejs/ani-svelte';

  // 1. Define the animation structure and timeline.
  const myTimeline = a.dynamicTimeline(
    a.sequence([
      a.ani({ to: { translateX: 500, rotate: 360 }, duration: 1 }),
      a.ani({ to: { translateX: 0, rotate: 0 }, duration: 1 }),
    ])
  );

  // 2. Use the utility to get the action and controller.
  const [refAction, controller] = useAniRef({
    timeline: myTimeline,
    initialValue: { translateX: 0, rotate: 0 },
    // 3. Add event handlers for interactivity.
    events: {
      onMousedown: (ctx, event) => {
        // `ctx` is the timeline controller plus `ctx.current`, the latest value.
        ctx.play({ from: ctx.current ?? { translateX: 0, rotate: 0 } });
      },
      onMouseup: (ctx) => {
        ctx.pause();
      },
    },
  });
</script>

<!-- 4. Bind the action to the element -->
<div use:refAction style="width: 100px; height: 100px; background: blue;" on:click={() => controller.play({ from: { translateX: 0, rotate: 0 } })} />
```

### Usage & Concepts

#### Overview

The `useAniRef` primitive is designed for performance. It takes a configuration object (`AniRefProps`) and returns a Svelte `Action` and the timeline controller. When the action is applied to an element, it directly manipulates its styles on each animation frame, avoiding Svelte's virtual DOM overhead.

Event handlers passed to the `events` property receive a context object: the timeline controller plus `current`, the latest animation value.

#### Lifecycle

-   **Timeline may be a store.** `timeline` can be a timeline or a `Readable` of one. Swaps are followed: the old timeline is detached and the new one's current value is applied at once.
-   **One action, many nodes.** The returned action can be applied to several nodes. Each node keeps its own subscription and listeners; `controller.reset()` restyles all live nodes; destroying one node leaves the others bound.
-   **Controller.** It always targets the current timeline and forwards every member, including `canBeIntercepted`.
-   **Cleanup.** `destroy()` removes the node's subscription and listeners.
-   **Styles.** Custom properties (`--x`) from a `propertyResolver` are written with `setProperty` (see [styles](/en/docs/core-api/advanced/building-bindings)).
-   **Ownership.** The action never disposes the timeline you pass. Call `timeline.dispose()` yourself if you created it.

#### When to Use

-   **Do** use `useAniRef` for high-performance animations of CSS properties like `transform` and `opacity`.
-   **Do** use it for complex, interactive animations driven by user input at 60fps.
-   **Don't** use `useAniRef` when you need to read the animated values elsewhere in your component. Use `useAni` for that.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `timeline` | `RafAniTimeline<G> \| Readable<RafAniTimeline<G>>` | The timeline to bind. |
| `initialValue` | `AniGroup<G>` | (Optional) Style applied before the timeline has a value, and restored by `reset()`. |
| `events` | `EventHandlerRegistration` | (Optional) `onClick`-style handlers. Receive `(ctx, event)`. |
| `cleanupEvents` | `boolean` | (Optional, default `true`) Remove listeners on destroy. |

Returns `readonly [action, controller]`.

### Related Components

-   [`useAni`](/en/docs/svelte/use-ani) - For reactive animations that integrate with Svelte stores.
-   [`EventManager`](/en/docs/core-api/advanced/event-management) - The underlying utility used by the `events` property.

---

## `useAniStates`

> **A reactive primitive for managing and transitioning between multiple animation states.**

This primitive is a Svelte-specific wrapper around the core `createStates` function. It's designed for components with multiple, distinct visual states (e.g., idle, hover, active) and provides a simple, reactive API to manage transitions between them.

### Example

```svelte
<script>
  import { a } from "@freestylejs/ani-core";
  import { useAniStates } from "@freestylejs/ani-svelte";

  // Use the primitive to create the state machine. It returns the action,
  // reactive stores for state info, and a function to transition.
  const [refAction, { state }, transitionTo] = useAniStates({
    initial: "idle",
    initialFrom: { scale: 1, opacity: 0.7 },
    states: {
      idle: a.ani({ to: { scale: 1, opacity: 0.7 }, duration: 0.5 }),
      hover: a.ani({ to: { scale: 1.1, opacity: 1 }, duration: 0.3 }),
    },
  });
</script>

<button
  use:refAction
  on:mouseenter={() => transitionTo("hover")}
  on:mouseleave={() => transitionTo("idle")}
  data-state={$state}
  class="rounded-md bg-blue-500 px-4 py-2 transition-all"
>
  Hover Me
</button>
```

### Usage & Concepts

#### Overview

The `useAniStates` primitive simplifies stateful animation logic in Svelte. It manages the active animation state and its corresponding timeline, automatically handling seamless transitions. When you call `transitionTo`, it uses the current animation's value as the starting point for the next animation, ensuring smooth, interruptible effects.

#### Lifecycle

-   **Ownership follows the action.** The primitive creates the state machine. When the **last node** using the action is destroyed, the machine is **disposed**, which stops any running timeline (even `repeat: Infinity`). Applying the action to a new node afterwards starts from a fresh machine in `initial`. After disposal `transitionTo` does nothing.
-   **Props are read once**, when the function is called.
-   **Atomic.** `transitionTo` validates first (an unknown state throws a `RangeError` and nothing changes). The `state` store reflects what the machine actually did, including a transition rejected because `canBeIntercepted` is `false`.
-   **Never misses a swap.** The primitive subscribes to timeline changes immediately, and the action follows the `timeline` store.

#### When to Use

-   **Do** use `useAniStates` for components with a finite number of visual states, such as buttons, interactive cards, or navigation items.
-   **Don't** use it for animations that are not state based. Use [`useAniRef`](/en/docs/svelte/use-ani-ref) with your own timeline.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `props` | `StateProps` | `initial`, `initialFrom`, `states` and optional `clock`. See [createStates](/en/docs/core-api/states). |

Returns `readonly [action, { state, timeline }, transitionTo]`.

| Member | Description |
| :--- | :--- |
| `action` | Svelte action to put on the element (`use:action`). |
| `state` | Readable store of the current state name. |
| `timeline` | Readable store of the active timeline. It changes on every transition. |
| `transitionTo(name, config?, canBeIntercepted?)` | Switches state. |

### Related Components

-   [`createStates`](/en/docs/core-api/states) - The core function that this primitive is built upon.
-   [`useAniRef`](/en/docs/svelte/use-ani-ref) - To apply the stateful animations to the DOM.
-   [`useAni`](/en/docs/svelte/use-ani) - To reactively read the animation values from the active timeline.
