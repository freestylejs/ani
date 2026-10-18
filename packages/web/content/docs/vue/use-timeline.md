---
title: useTimeline
description: Creates a timeline, group or follower and disposes it with the component.
---

The owner primitive. It runs a factory once and disposes whatever the factory returned (anything with `dispose()`) when the scope goes away.

### Example

```vue
<script setup>
import { a, rafTimeline } from "@freestylejs/ani-core";
import { useAniRef, useTimeline } from "@freestylejs/ani-vue";

// Created once, disposed when the component unmounts.
const timeline = useTimeline(() =>
  rafTimeline(a.ani({ to: { opacity: 1 }, duration: 1 }))
);
const { ref, style } = useAniRef(timeline, { initialValue: { opacity: 0 } });
</script>

<template>
  <div :ref="ref" :style="style" @click="timeline.play({ from: { opacity: 0 } })" />
</template>
```

### Usage & Concepts

-   **Ownership.** The object is disposed in `onScopeDispose`, so it also works in a plain `effectScope`. Outside any scope it still works, but you call `dispose()` yourself.
-   **Other primitives never dispose what they are given.** `useAni`, `useAniRef` and `useAniGroup` only read or bind the timeline or group you pass; `useTimeline` is how you hand its lifetime to the component.
-   **Loud misuse.** A throwing factory throws synchronously from `useTimeline`.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `factory` | `() => T` where `T extends { dispose(): void }` | Creates the object. Called once. |

Returns the created object.

### Related Components

-   [`useAniRef`](/en/docs/vue/use-ani-ref) - Bind an element to a timeline.
-   [`useAniGroup`](/en/docs/vue/use-ani-group) - Bind a list of elements to a group.
