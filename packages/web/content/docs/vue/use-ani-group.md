---
title: useAniGroup
description: Function refs that bind a list of elements to one group, one ref per index.
---

This composable binds a list of elements to a `rafGroup`. Element `i` is written with target `i` through `group.bindAt`, so one clock subscription drives the whole list.

### Example

```vue
<script setup>
import { a, rafGroup } from "@freestylejs/ani-core";
import { useAniGroup, useTimeline } from "@freestylejs/ani-vue";

const group = useTimeline(() =>
  rafGroup(a.ani({ to: { opacity: 1 }, duration: 0.5 }), { stagger: 0.1 })
);
const { ref, style } = useAniGroup(group, { initialValue: { opacity: 0 } });
const items = ["a", "b", "c"];
</script>

<template>
  <button @click="group.play({ from: { opacity: 0 }, count: items.length })">
    Play
  </button>
  <ul>
    <li v-for="(item, i) in items" :key="item" :ref="ref(i)" :style="style">
      {{ item }}
    </li>
  </ul>
</template>
```

### Usage & Concepts

-   **One ref per index.** `ref(index)` returns the same function for the same index. A removed item unbinds itself; one that mounts later is bound to its index and shows the group's current value.
-   **Initial style.** `style` is `createStyleSheet(initialValue, resolver)` (or `undefined`), the same object for every item, rendered on the server.
-   **Group may be reactive.** `group` can be a group or a `Ref` of one; on change every element is rebound.
-   **Ownership.** The composable never disposes the group you pass. Create it with [`useTimeline`](/en/docs/vue/use-timeline) to dispose it with the component. On unmount all elements are unbound.
-   **Loud misuse.** An invalid index throws a `TypeError` synchronously.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `group` | `RafGroup<G> \| Ref<RafGroup<G>>` | The group to bind. |
| `options.initialValue` | `AniGroup<G>` | (Optional) Rendered as the initial inline style. |
| `options.resolver` | `Resolver<Record<string, number>>` | (Optional) Custom style resolver. |

Returns `{ ref, style }`: `ref` is `(index: number) => (element: Element | ComponentPublicInstance | null) => void`.

### Related Components

-   [`useAniRef`](/en/docs/vue/use-ani-ref) - The same for a single element.
-   [`useTimeline`](/en/docs/vue/use-timeline) - Create a group owned by the component.
