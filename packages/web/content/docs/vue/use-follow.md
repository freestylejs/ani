---
title: useFollow
description: A spring follower bound to an element, disposed with the component.
---

This composable creates a core `follow` value and binds an element to it. `follower.set(target)` springs the value toward the target, keeping the current velocity, so repeated input builds on where the motion is heading.

### Example

```vue
<script setup>
import { useFollow } from "@freestylejs/ani-vue";

const { ref, style, follower } = useFollow(
  { translateX: 0, translateY: 0 },
  { spring: { m: 1, k: 170, c: 26 } }
);

const onMove = (event) =>
  follower.set({ translateX: event.clientX, translateY: event.clientY });
</script>

<template>
  <div class="stage" @pointermove="onMove">
    <div :ref="ref" :style="style" class="dot" />
  </div>
</template>
```

### Usage & Concepts

-   **Ownership.** The composable creates the follower and disposes it with its scope. Outside a component scope, call `follower.dispose()` yourself.
-   **Initial style.** `style` is `createStyleSheet(initial, resolver)`, rendered on the server. Nothing subscribes to a clock until `set` is called.
-   **Function ref.** Same rules as [`useAniRef`](/en/docs/vue/use-ani-ref): a component resolves to its `$el`, `null` unbinds, repeating an element adds no binding.
-   **`jump`.** `follower.jump(value)` writes the element synchronously, with velocity 0.
-   **Loud misuse.** An invalid initial value (for example `NaN`) throws a `TypeError` synchronously.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `initial` | `G extends Record<string, number>` | Initial value; its keys are fixed. |
| `options.spring` | `{ m, k, c }` | (Optional) Spring constants. |
| `options.clock` | `AnimationClockInterface` | (Optional) Custom clock. |
| `options.resolver` | `Resolver<Record<string, number>>` | (Optional) Custom style resolver. |

Returns `{ ref, style, follower }`.

### Related Components

-   [`useAniRef`](/en/docs/vue/use-ani-ref) - Bind an element to a timeline.
