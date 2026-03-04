# Vue Composables

This document details the API for Vue composables that integrate the `@freestylejs/ani-core` animation engine. These tools provide seamless integration with Vue 3's Composition API, offering both reactive and high-performance animation solutions.

---

## `useAni`

> **A Vue composable that creates a reactive `ref` to track the state of an animation timeline.**

This composable subscribes to a `timeline`'s state and updates a Vue `ref` on each animation frame. It's ideal when animated values need to be read within your component's template or other reactive computations.

### Example

```vue
<script setup>
import { useAni, timeline, a } from "@freestylejs/ani-vue";

// 1. Define the animation structure and create a timeline.
const myTimeline = timeline(
  a.ani({ to: { count: 100 }, duration: 5, timing: a.timing.linear() })
);

// 2. Use the composable to get the reactive ref and controller.
const [value, controller] = useAni(myTimeline, { count: 0 });

// 3. Play the animation.
function handlePlay() {
  controller.play({ from: { count: 0 } });
}
</script>

<template>
  <div>
    <!-- 4. The ref's value is automatically unwrapped in the template. -->
    <h1>Counter: {{ Math.round(value.count) }}</h1>
    <button @click="handlePlay">Start</button>
  </div>
</template>
```

### Usage & Concepts

#### Overview

The `useAni` composable acts as a bridge between the `@freestylejs/ani-core` engine and Vue's reactivity system. It takes a `timeline` instance and an `initialValue`, returning a reactive Vue `ref` that is updated with the latest animation value, alongside the timeline's controller. Vue's reactivity system automatically tracks this `ref` and updates the component whenever its value changes.

#### When to Use

**Do** use `useAni` when you need the animated values to be part of Vue's reactive system. It's ideal for animations that affect:
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

The composable returns a `readonly` tuple with the following structure:

| Index | Type                    | Description                                      |
| ----- | ----------------------- | ------------------------------------------------ |
| `[0]` | `Ref<AniGroup<G>>`      | A reactive Vue `ref` holding the animation state. |
| `[1]` | `TimelineController<G>` | The controller to play, pause, or stop the timeline. |

#### Type Definitions

```typescript
import { Groupable, Timeline, AniGroup, TimelineController } from '@freestylejs/ani-core';
import { Ref } from 'vue';

declare function useAni<G extends Groupable>(
  timeline: Timeline<G>, 
  initialValue: AniGroup<G>
): readonly [Ref<AniGroup<G>>, TimelineController<G>];
```

---

## `useAniRef`

> **A performant, event-driven Vue composable that binds animations directly to a template ref.**

This composable applies animation styles directly to a DOM element, bypassing Vue's virtual DOM for high performance. It also includes a built-in event manager to simplify interactive animations.

### Example

```vue
<script setup>
import { useAniRef, timeline, a } from "@freestylejs/ani-vue";

// 1. Define the animation structure and timeline.
const myTimeline = timeline(
  a.sequence([
    a.ani({ to: { x: 500, rotate: 360 }, duration: 1 }),
    a.ani({ to: { x: 0, rotate: 0 }, duration: 1 }),
  ])
);

// 2. Use the composable to get the template ref and controller.
const [elementRef, controller] = useAniRef({
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

<template>
  <!-- 4. Bind the template ref to the element -->
  <div
    :ref="elementRef"
    style="width: 100px; height: 100px; background: blue;"
  />
</template>
```

### Usage & Concepts

#### Overview

The `useAniRef` composable is designed for performance. It takes a configuration object (`AniRefProps`) and returns a template `ref` to be attached to a DOM element, along with the timeline controller. On each animation frame, it converts animation values to CSS styles and applies them directly to the element, avoiding Vue's VDOM overhead for the animated properties.

Event handlers passed to the `events` property receive a context object containing both the current animation value and the timeline controller, making it easy to build complex interactions.

#### When to Use

**Do** use `useAniRef` for high-performance animations of CSS properties, especially for:
- Smooth, 60fps animations.
- Complex, interactive animations driven by user input (e.g., mouse events).
- Situations where you want to avoid involving Vue's reactivity on every frame for the animated element.

**Don't** use `useAniRef` when you need to read the animated values within your component's template or other computed properties. Use `useAni` for that.

### API Reference

#### Parameters

The `useAniRef` composable accepts a single `props` object with the following properties:

| Name            | Type                                      | Description                                                              | Default |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------ | ------- |
| `timeline`      | `Timeline<G>`                             | The animation timeline instance to run.                                  | —       |
| `initialValue`  | `AniGroup<G>`                             | An optional initial state for the animation.                             | —       |
| `events`        | `EventHandlerRegistration<...>`           | An optional map of event handlers for interactive animations.            | —       |
| `cleanupEvents` | `boolean`                                 | If `true`, automatically removes event listeners on component unmount.   | `true`  |

#### Return Value

The composable returns a `readonly` tuple with the following structure:

| Index | Type                       | Description                                      |
| ----- | -------------------------- | ------------------------------------------------ |
| `[0]` | `Ref<HTMLElement \| null>` | A template ref to attach to your target DOM element. |
| `[1]` | `TimelineController<G>`    | The controller to play, pause, or stop the timeline. |

#### Type Definitions

```typescript
import { Groupable, Timeline, TimelineController, AniRefProps } from '@freestylejs/ani-core';
import { Ref } from 'vue';

/**
 * Event-based non-reactive(ref) ani animation composable for Vue.
 *
 * @param props - Configuration including the timeline and event handlers.
 *
 * @returns A tuple containing the template ref and the timeline controller.
 */
declare function useAniRef<G extends Groupable>(
  { timeline, initialValue, events, cleanupEvents }: AniRefProps<G>
): readonly [Ref<HTMLElement | null>, TimelineController<G>];
```

---

## `useAniStates`

> **A reactive composable for managing and transitioning between multiple animation states.**

### Example

```vue
<script setup>
import { a, useAniRef, useAniStates } from "@freestylejs/ani-vue";

const ref = ref(null);

// 1. Define the animations for each state.
const animations = {
  idle: a.ani({ to: { scale: 1, opacity: 0.7 }, duration: 0.5 }),
  hover: a.ani({ to: { scale: 1.1, opacity: 1 }, duration: 0.3 }),
};

// 2. Use the composable to create the state machine.
const [{ timeline }, transitionTo] = useAniStates({
  initial: "idle",
  initialFrom: { scale: 1, opacity: 0.7 },
  states: animations,
});

// 3. Connect the active timeline to the DOM element.
const [elementRef] = useAniRef({ timeline: timeline.value });
</script>

<template>
  <button
    :ref="elementRef"
    @mouseenter="transitionTo('hover')"
    @mouseleave="transitionTo('idle')"
  >
    Hover Me
  </button>
</template>
```

### Usage & Concepts

#### Overview

The `useAniStates` composable is a Vue-specific wrapper around the core `createStates` function. It's designed for components with multiple, distinct visual states. The composable manages the active state and the corresponding timeline, providing reactive `ref`s for both.

#### Best Practices

-   **Do** use `useAniStates` for components with a finite number of visual states.
-   **Do** combine `useAniStates` with `useAniRef` for high-performance style animations based on state.
-   **Don't** create the `states` object reactively, as this will create a new state machine on every change.

### API Reference

#### Parameters

| Name | Type | Description |
| :--- | :--- | :--- |
| `props` | `StateProps<AnimationStates>` | The configuration object for the state machine. |

#### Return Value

A tuple `[stateInfo, transitionTo]` where:

| Index | Type | Description |
| :--- | :--- | :--- |
| `0` | `object` | An object containing readonly `ref`s for the current `state` name and the active `timeline` instance. |
| `1` | `function` | The `transitionTo` function to switch between states. |

#### Type Definitions

```typescript
import { AnimationStateShape, StateProps, GetTimeline, StateController } from '@freestylejs/ani-core';
import { Ref } from 'vue';

declare function useAniStates<const AnimationStates extends AnimationStateShape>(
  props: StateProps<AnimationStates>
): readonly [
    {
        readonly state: Ref<keyof AnimationStates>;
        readonly timeline: Ref<GetTimeline<AnimationStates>>;
    },
    StateController<AnimationStates>['transitionTo']
];
```

### Related Components

-   [`createStates`](/docs/core-api/states) - The core function that this composable is built upon.
-   [`useAniRef`](#useaniref) - To apply the stateful animations to the DOM.