# `@freestylejs/ani-svelte`

Svelte actions and stores for the FreestyleJS animation library. Frames are written to the DOM by the core engine, without Svelte updates per frame.

## Install

```sh
npm install @freestylejs/ani-core @freestylejs/ani-svelte
```

`svelte` `>=4.0.0` is a peer dependency.

## Quick start

```svelte
<script>
  import * as a from '@freestylejs/ani-core'
  import { useAniRef, useTimeline } from '@freestylejs/ani-svelte'

  // The component owns the timeline and disposes it in onDestroy.
  const timeline = useTimeline(() =>
    a.rafTimeline(a.ani({ to: { translateX: 300 }, duration: 0.5 }))
  )
  // `style` is the initial inline style, rendered on the server too.
  const { action, style } = useAniRef(timeline, {
    initialValue: { translateX: 0 },
  })
</script>

<div
  use:action
  {style}
  on:click={() => timeline.play({ from: { translateX: 0 } })}
/>
```

| Utility | Purpose |
| :--- | :--- |
| `useTimeline(factory)` | Create and dispose any object with `dispose()`. |
| `useAni(timeline, initialValue)` | A store with the timeline value. |
| `useAniRef(timeline, options?)` | Animate one element with an action. |
| `useAniGroup(group, options?)` | Animate many elements, one action per index. |
| `useAniStates(config)` | Own a state machine and animate an element. |
| `useFollow(initial, options?)` | Own a spring follower and animate an element. |

## Documentation

Visit [ani](https://freestyle-ani.vercel.app/en/docs/svelte/use-timeline) to read the documentation.

## Upgrading from 1.x

Run `npx @freestylejs/ani-codemod src` once on your 1.x code (commit before you do), read every warning, then follow the [migration guide](https://freestyle-ani.vercel.app/en/docs/guides/migration-v2). `useAniRef` and `useAniStates` changed their signatures and need manual updates.
