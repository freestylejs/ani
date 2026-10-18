# Vue Animation Composables API

These Vue composables integrate the `@freestylejs/ani-core` animation engine with Vue. They offer two strategies: a reactive one that syncs animation values with the framework's reactivity, and a ref-based one that writes styles directly to the DOM (no render per frame).

**Ownership:** a binding disposes the state machine it creates (`useAniStates`) and only *detaches* from timelines you pass in. Call `timeline.dispose()` yourself for timelines you create. See the large-scale usage guide in the docs.

---

## `useAni`

> **A reactive composable that updates a Vue ref on each animation frame.**

This composable subscribes to a `timeline`'s state and updates a Vue `ref` on each animation frame. It's ideal when animated values need to be read within your component's template or other reactive computations.

### Example

```vue
<script setup>
import { a } from "@freestylejs/ani-core";
import { useAni } from "@freestylejs/ani-vue";

// 1. Define the animation structure and create a timeline.
const myTimeline = a.dynamicTimeline(
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

#### Behavior

-   `timeline` may be a timeline or a `Ref` of one; swaps are followed.
-   The value is a `shallowRef`: each frame replaces it as a whole, nothing is deeply proxied. Do not mutate it.
-   The composable subscribes on mount and unsubscribes before unmount, so server rendering retains nothing. See [SSR](/en/docs/guides/ssr).
-   The returned controller follows timeline swaps. The timeline you pass is never disposed.

#### When to Use

-   **Do** use `useAni` when you need the animated values to be part of Vue's reactive system.
-   **Do** use it for animations that affect text content, attributes, or props.
-   **Don't** use `useAni` for high-frequency style updates on a single element. For that, `useAniRef` is a better choice.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `timeline` | `RafAniTimeline<G> \| Ref<RafAniTimeline<G>>` | The timeline to read. |
| `initialValue` | `AniGroup<G>` | Value before the timeline has one. |

Returns `readonly [value, controller]`: a `Ref<AniGroup<G>>` and the timeline controller.

### Related Components

-   [`useAniRef`](/en/docs/vue/use-ani-ref) - For performance-critical animations that write directly to the DOM.
-   [`dynamicTimeline`](/en/docs/core-api/dynamic_timeline) - The core controller that this composable subscribes to.

---

## `useAniRef`

> **A performant, event-driven Vue composable that binds animations directly to a template ref.**

This composable applies animation styles directly to a DOM element, bypassing Vue's virtual DOM for high performance. It also includes a built-in event manager to simplify interactive animations.

### Example

```vue
<script setup>
import { a } from "@freestylejs/ani-core";
import { useAniRef } from "@freestylejs/ani-vue";

// 1. Define the animation structure and timeline.
const myTimeline = a.dynamicTimeline(
  a.sequence([
    a.ani({ to: { translateX: 500, rotate: 360 }, duration: 1 }),
    a.ani({ to: { translateX: 0, rotate: 0 }, duration: 1 }),
  ])
);

// 2. Use the composable to get the template ref and controller.
const [elementRef, controller] = useAniRef({
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

<template>
  <!-- 4. Bind the template ref to the element -->
  <div
    :ref="elementRef"
    style="width: 100px; height: 100px; background: blue;"
    @click="controller.play({ from: { translateX: 0, rotate: 0 } })"
  />
</template>
```

### Usage & Concepts

#### Overview

The `useAniRef` composable is designed for performance. It takes a configuration object (`AniRefProps`) and returns a template `ref` to be attached to a DOM element, along with the timeline controller. On each animation frame, it converts animation values to CSS styles and applies them directly to the element, avoiding Vue's VDOM overhead for the animated properties.

Event handlers passed to the `events` property receive a context object: the timeline controller plus `current`, the latest animation value.

#### Lifecycle

-   **Timeline may be reactive.** `timeline` can be a timeline or a `Ref` of one. Swaps are followed synchronously: the old timeline is detached and the new one's current value is applied at once. A deep `ref(timeline)` is unwrapped to the raw instance, but prefer `shallowRef`.
-   **Template ref.** The binding starts when the element is set (also for `v-if`) and stops when it is removed or the component unmounts.
-   **Controller.** It always targets the current timeline and forwards every member, including `canBeIntercepted`.
-   **Styles.** Custom properties (`--x`) from a `propertyResolver` are written with `setProperty` (see [styles](/en/docs/core-api/advanced/building-bindings)).
-   **Ownership.** The composable never disposes the timeline you pass. Call `timeline.dispose()` yourself if you created it.

#### When to Use

-   **Do** use `useAniRef` for high-performance animations of CSS properties like `transform` and `opacity`.
-   **Do** use it for complex, interactive animations driven by user input at 60fps.
-   **Don't** use `useAniRef` when you need to read the animated values within your component's template or other computed properties. Use `useAni` for that.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `timeline` | `RafAniTimeline<G> \| Ref<RafAniTimeline<G>>` | The timeline to bind. |
| `initialValue` | `AniGroup<G>` | (Optional) Style applied before the timeline has a value, and restored by `reset()`. |
| `events` | `EventHandlerRegistration` | (Optional) `onClick`-style handlers. Receive `(ctx, event)`. |
| `cleanupEvents` | `boolean` | (Optional, default `true`) Remove listeners on unmount. |

Returns `readonly [elementRef, controller]`.

### Related Components

-   [`useAni`](/en/docs/vue/use-ani) - For reactive animations that integrate with Vue's Composition API.
-   [`EventManager`](/en/docs/core-api/advanced/event-management) - The underlying utility used by the `events` property.

---

## `useAniStates`

> **A reactive composable for managing and transitioning between multiple animation states.**

This composable is a Vue-specific wrapper around the core `createStates` function. It's designed for components with multiple, distinct visual states (e.g., idle, hover, active) and provides a simple, reactive API to manage transitions between them.

### Example

```vue
<script setup>
import { a } from "@freestylejs/ani-core";
import { useAniStates } from "@freestylejs/ani-vue";

// Use the composable to create the state machine. It returns the template ref,
// reactive refs for state info, and a function to transition.
const [elementRef, { state }, transitionTo] = useAniStates({
  initial: "idle",
  initialFrom: { scale: 1, opacity: 0.7 },
  states: {
    idle: a.ani({ to: { scale: 1, opacity: 0.7 }, duration: 0.5 }),
    hover: a.ani({ to: { scale: 1.1, opacity: 1 }, duration: 0.3 }),
  },
});
</script>

<template>
  <button
    :ref="elementRef"
    @mouseenter="transitionTo('hover')"
    @mouseleave="transitionTo('idle')"
    :data-state="state"
    class="rounded-md bg-blue-500 px-4 py-2 transition-all"
  >
    Hover Me
  </button>
</template>
```

### Usage & Concepts

#### Overview

The `useAniStates` composable simplifies stateful animation logic in Vue. It manages the active animation state and its corresponding timeline, automatically handling seamless transitions. When you call `transitionTo`, it uses the current animation's value as the starting point for the next animation, ensuring smooth, interruptible effects.

#### Lifecycle

-   **Owns its controller.** The composable creates the state machine and **disposes it with the component scope** (unmount), which stops any running timeline (even `repeat: Infinity`).
-   **Props are read once**, at setup. `states`, `initial`, `initialFrom` and `clock` are not tracked.
-   **Never misses a transition.** It subscribes to timeline changes synchronously, so `transitionTo` also works inside `setup()` and from a child's `onMounted`.
-   **Atomic.** `transitionTo` validates first (an unknown state throws a `RangeError` and nothing changes). The `state` ref reflects what the machine actually did, including a transition rejected because `canBeIntercepted` is `false`.
-   **`timeline` is a `shallowRef`.** It is not wrapped in a deep proxy, so identity and internal mutation keep working.

#### When to Use

-   **Do** use `useAniStates` for components with a finite number of visual states, such as buttons, interactive cards, or navigation items.
-   **Don't** use it for animations that are not state based. Use [`useAniRef`](/en/docs/vue/use-ani-ref) with your own timeline.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `props` | `StateProps` | `initial`, `initialFrom`, `states` and optional `clock`. See [createStates](/en/docs/core-api/states). |

Returns `readonly [elementRef, { state, timeline }, transitionTo]`.

| Member | Description |
| :--- | :--- |
| `elementRef` | Template ref to attach to the element. |
| `state` | Readonly ref of the current state name. |
| `timeline` | Readonly ref of the active timeline. It changes on every transition. |
| `transitionTo(name, config?, canBeIntercepted?)` | Switches state. |

### Related Components

-   [`createStates`](/en/docs/core-api/states) - The core function that this composable is built upon.
-   [`useAniRef`](/en/docs/vue/use-ani-ref) - To apply the stateful animations to the DOM.
-   [`useAni`](/en/docs/vue/use-ani) - To reactively read the animation values from the active timeline.
