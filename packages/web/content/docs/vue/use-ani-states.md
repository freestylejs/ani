---
title: useAniStates
description: A reactive composable for managing and transitioning between multiple animation states.
---

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