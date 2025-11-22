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
import { ref } from "vue";

// 1. Define the animations for each state.
const animations = {
  idle: a.ani({ to: { scale: 1, opacity: 0.7 }, duration: 0.5 }),
  hover: a.ani({ to: { scale: 1.1, opacity: 1 }, duration: 0.3 }),
};

// 2. Use the composable to create the state machine. It returns the template ref,
// reactive refs for state info, and a function to transition.
const [elementRef, { timeline }, transitionTo] = useAniStates({
  initial: "idle",
  initialFrom: { scale: 1, opacity: 0.7 },
  states: animations,
});
</script>

<template>
  <button
    :ref="elementRef"
    @mouseenter="transitionTo('hover')"
    @mouseleave="transitionTo('idle')"
    style="opacity: 0.7; scale: 1"
    class="rounded-md bg-blue-500 px-4 py-2 transition-all"
  >
    Hover Me
  </button>
</template>
```

### Usage & Concepts

#### Overview

The `useAniStates` composable simplifies stateful animation logic in Vue. It manages the active animation state and its corresponding timeline, automatically handling seamless transitions. When you call `transitionTo`, it uses the current animation's value as the starting point for the next animation, ensuring smooth, interruptible effects.

#### When to Use

-   **Do** use `useAniStates` for components with a finite number of visual states, such as buttons, interactive cards, or navigation items.
-   **Do** combine `useAniStates` with `useAniRef` for high-performance style animations that react to state changes.
-   **Don't** create the `states` object reactively, as this will create a new state machine on every change and lead to unexpected behavior.

### Related Components

-   [`createStates`](/en/docs/core-api/states) - The core function that this composable is built upon.
-   [`useAniRef`](/en/docs/vue/use-ani-ref) - To apply the stateful animations to the DOM.
-   [`useAni`](/en/docs/vue/use-ani) - To reactively read the animation values from the active timeline.