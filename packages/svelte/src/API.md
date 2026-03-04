# Svelte Primitives

This document details the API for Svelte primitives that integrate the `@freestylejs/ani-core` animation engine. These tools provide seamless integration with Svelte, offering both reactive stores and high-performance actions.

---

## `useAni`

> **A Svelte utility that creates a reactive store to track the state of an animation timeline.**

This primitive subscribes to a `timeline`'s state and exposes it as a readable Svelte store. It's ideal when animated values need to be used within your component's markup or other reactive computations.

### Example

```svelte
<script>
  import { onMount } from 'svelte';
  import { useAni, timeline, a } from '@freestylejs/ani-svelte';

  // 1. Define the animation structure and create a timeline.
  const myTimeline = timeline(
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

#### When to Use

**Do** use `useAni` when you need the animated values to be part of Svelte's reactive system. It's ideal for animations that affect:
- Text content
- Component attributes or props
- Anything that requires a reactive update to reflect changes in the UI.

**Don't** use `useAni` for high-frequency style updates on a single element, as this can cause performance overhead. For that, `useAniRef` is a better choice.

### API Reference

#### Parameters

| Name           | Type             | Description                               | Default |
| -------------- | ---------------- | ----------------------------------------- | ------- |
| `timeline`     | `Timeline<G>`    | The animation timeline instance to track. | —       |
| `initialValue` | `AniGroup<G>`    | The initial value of the animation state. | —       |

#### Return Value

The primitive returns a `readonly` tuple with the following structure:

| Index | Type                    | Description                                      |
| ----- | ----------------------- | ------------------------------------------------ |
| `[0]` | `Readable<AniGroup<G>>` | A readable Svelte store holding the animation state. |
| `[1]` | `TimelineController<G>` | The controller to play, pause, or stop the timeline. |

#### Type Definitions

```typescript
import { Groupable, Timeline, AniGroup, TimelineController } from '@freestylejs/ani-core';
import { Readable } from 'svelte/store';

declare function useAni<G extends Groupable>(
  timeline: Timeline<G>, 
  initialValue: AniGroup<G>
): readonly [Readable<AniGroup<G>>, TimelineController<G>];
```

---

## `useAniRef`

> **A performant, event-driven Svelte action that binds animations directly to a DOM element.**

This primitive applies animation styles directly to a DOM element using the `use:` directive, bypassing Svelte's reactivity for high performance. It also includes a built-in event manager to simplify interactive animations.

### Example

```svelte
<script>
  import { useAniRef, timeline, a } from '@freestylejs/ani-svelte';

  // 1. Define the animation structure and timeline.
  const myTimeline = timeline(
    a.sequence([
      a.ani({ to: { x: 500, rotate: 360 }, duration: 1 }),
      a.ani({ to: { x: 0, rotate: 0 }, duration: 1 }),
    ])
  );

  // 2. Use the utility to get the action and controller.
  const [refAction, controller] = useAniRef({
    timeline: myTimeline,
    initialValue: { x: 0, rotate: 0 },
    // 3. Add event handlers for interactivity.
    events: {
      onMousedown: (ctx, event) => {
        // The context `ctx` contains the current animation value and the controller.
        ctx.play({ from: { x: ctx.x, rotate: ctx.rotate } });
      },
      onMouseup: (ctx) => {
        ctx.pause();
      },
    },
  });
</script>

<!-- 4. Bind the action to the element -->
<div use:refAction style="width: 100px; height: 100px; background: blue;" />
```

### Usage & Concepts

#### Overview

The `useAniRef` primitive is designed for performance. It takes a configuration object (`AniRefProps`) and returns a Svelte `Action` and the timeline controller. When the action is applied to an element, it directly manipulates its styles on each animation frame, avoiding Svelte's virtual DOM overhead.

Event handlers passed to the `events` property receive a context object containing both the current animation value and the timeline controller, making it easy to build complex interactions.

#### When to Use

**Do** use `useAniRef` for high-performance animations of CSS properties, especially for:
- Smooth, 60fps animations.
- Complex, interactive animations driven by user input (e.g., mouse events).
- Situations where you want to avoid involving Svelte's reactivity on every frame for the animated element.

**Don't** use `useAniRef` when you need to read the animated values elsewhere in your component. Use `useAni` for that.

### API Reference

#### Parameters

The `useAniRef` primitive accepts a single `props` object with the following properties:

| Name            | Type                                      | Description                                                              |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| `timeline`      | `Timeline<G>`                             | The animation timeline instance to run.                                  |
| `initialValue`  | `AniGroup<G>`                             | An optional initial state for the animation.                             |
| `events`        | `EventHandlerRegistration<...>`           | An optional map of event handlers for interactive animations.            |
| `cleanupEvents` | `boolean`                                 | If `true`, automatically removes event listeners on component unmount.   |

#### Return Value

The primitive returns a `readonly` tuple with the following structure:

| Index | Type                       | Description                                      |
| ----- | -------------------------- | ------------------------------------------------ |
| `[0]` | `Action<HTMLElement, any>` | A Svelte Action to apply to your target DOM element. |
| `[1]` | `TimelineController<G>`    | The controller to play, pause, or stop the timeline. |

#### Type Definitions

```typescript
import { Groupable, Timeline, TimelineController, AniRefProps } from '@freestylejs/ani-core';
import { Action } from 'svelte/action';

/**
 * Event-based non-reactive(ref) ani animation action for Svelte.
 *
 * @param props - Configuration including the timeline and event handlers.
 *
 * @returns A tuple containing the Svelte Action and the timeline controller.
 */
declare function useAniRef<G extends Groupable>(
  { timeline, initialValue, events, cleanupEvents }: AniRefProps<G>
): readonly [Action<HTMLElement, any>, TimelineController<G>];
```

---

## `useAniStates`

> **A reactive primitive for managing and transitioning between multiple animation states.**

### Example

```svelte
<script>
  import { a } from "@freestylejs/ani-core";
  import { useAniRef, useAniStates } from "@freestylejs/ani-svelte";

  // 1. Define the animations for each state.
  const animations = {
    idle: a.ani({ to: { scale: 1, opacity: 0.7 }, duration: 0.5 }),
    hover: a.ani({ to: { scale: 1.1, opacity: 1 }, duration: 0.3 }),
  };

  // 2. Use the primitive to create the state machine.
  const [{ timeline }, transitionTo] = useAniStates({
    initial: "idle",
    initialFrom: { scale: 1, opacity: 0.7 },
    states: animations,
  });

  // 3. Connect the active timeline to the DOM element.
  const [refAction] = useAniRef({ timeline: $timeline });
</script>

<button
  use:refAction
  on:mouseenter={() => transitionTo("hover")}
  on:mouseleave={() => transitionTo("idle")}
>
  Hover Me
</button>
```

### Usage & Concepts

#### Overview

The `useAniStates` primitive is a Svelte-specific wrapper around the core `createStates` function. It's designed for components with multiple, distinct visual states. The primitive manages the active state and the corresponding timeline, providing reactive stores for both.

#### Best Practices

-   **Do** use `useAniStates` for components with a finite number of visual states.
-   **Do** combine `useAniStates` with `useAniRef` for high-performance style animations based on state.
-   **Don't** create the `states` object inside a reactive computation without memoization, as this can lead to unexpected behavior.

### API Reference

#### Parameters

| Name    | Type                          | Description                                  | Default |
| :------ | :---------------------------- | :------------------------------------------- | ------- |
| `props` | `StateProps<AnimationStates>` | The configuration object for the state machine. | —       |

#### Return Value

The primitive returns a `readonly` tuple with the following structure:

| Index | Type       | Description                                                                              |
| ----- | ---------- | ---------------------------------------------------------------------------------------- |
| `[0]` | `object`   | An object containing readable stores for the current `state` name and active `timeline`. |
| `[1]` | `function` | The `transitionTo` function to switch between animation states.                          |

#### Type Definitions

```typescript
import { AnimationStateShape, StateProps, GetTimeline, StateController } from '@freestylejs/ani-core';
import { Readable } from 'svelte/store';

declare function useAniStates<const AnimationStates extends AnimationStateShape>(
  props: StateProps<AnimationStates>
): readonly [
    {
        state: Readable<keyof AnimationStates>;
        timeline: Readable<GetTimeline<AnimationStates>>;
    },
    StateController<AnimationStates>["transitionTo"]
];
```

### Related Components

-   [`createStates`](/docs/core-api/states) - The core function that this primitive is built upon.
-   [`useAniRef`](/docs/svelte/use-ani-ref) - To apply the stateful animations to the DOM.
-   [`useAni`](/docs/svelte/use-ani) - To reactively read the animation values from the active timeline.