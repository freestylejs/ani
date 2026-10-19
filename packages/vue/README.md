# `@freestylejs/ani-vue`

Vue composables for the FreestyleJS animation library. Frames are written to the DOM by the core engine, without rendering the component.

## Install

```sh
npm install @freestylejs/ani-core @freestylejs/ani-vue
```

`vue` `>=3.0.0` is a peer dependency.

## Quick start

```vue
<script setup>
import * as a from '@freestylejs/ani-core'
import { useAniRef, useTimeline } from '@freestylejs/ani-vue'

// The component owns the timeline and disposes it with its scope.
const timeline = useTimeline(() =>
    a.rafTimeline(a.ani({ to: { translateX: 300 }, duration: 0.5 }))
)
// `style` is the initial inline style, rendered on the server too.
const { ref, style } = useAniRef(timeline, {
    initialValue: { translateX: 0 },
})
</script>

<template>
    <div
        :ref="ref"
        :style="style"
        @click="timeline.play({ from: { translateX: 0 } })"
    />
</template>
```

| Composable | Purpose |
| :--- | :--- |
| `useTimeline(factory)` | Create and dispose any object with `dispose()`. |
| `useAni(timeline, initialValue)` | Update a ref with the timeline value. |
| `useAniRef(timeline, options?)` | Animate one element, no renders. |
| `useAniGroup(group, options?)` | Animate many elements, one ref per index. |
| `useAniStates(config)` | Own a state machine and animate an element. |
| `useFollow(initial, options?)` | Own a spring follower and animate an element. |

## Documentation

Visit [ani](https://freestyle-ani.vercel.app/en/docs/vue/use-timeline) to read the documentation.

## Upgrading from 1.x

Run `npx @freestylejs/ani-codemod src` once on your 1.x code (commit before you do), read every warning, then follow the [migration guide](https://freestyle-ani.vercel.app/en/docs/guides/migration-v2). `useAniRef` and `useAniStates` changed their signatures and need manual updates.
