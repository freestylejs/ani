# `@freestylejs/ani-solid`

Solid primitives for the FreestyleJS animation library. Frames are written to the DOM by the core engine, without re-running components.

## Install

```sh
npm install @freestylejs/ani-core @freestylejs/ani-solid
```

`solid-js` `>=1.8.0` is a peer dependency.

## Quick start

```tsx
import * as a from '@freestylejs/ani-core'
import { createAniRef, createTimeline } from '@freestylejs/ani-solid'

export function Box() {
    // The owner disposes the timeline on cleanup.
    const timeline = createTimeline(() =>
        a.rafTimeline(a.ani({ to: { translateX: 300 }, duration: 0.5 }))
    )
    // `style()` is the initial inline style, rendered on the server too.
    const { ref, style } = createAniRef(timeline, {
        initialValue: { translateX: 0 },
    })

    return (
        <div
            ref={ref}
            style={style()}
            onClick={() => timeline.play({ from: { translateX: 0 } })}
        />
    )
}
```

| Primitive | Purpose |
| :--- | :--- |
| `createTimeline(factory)` | Create and dispose any object with `dispose()`. |
| `createAni(timeline, initialValue)` | Sync the timeline value with a signal. |
| `createAniRef(timeline, options?)` | Animate one element, no re-renders. |
| `createAniGroup(group, options?)` | Animate many elements, one ref per index. |
| `createAniStates(config)` | Own a state machine and animate an element. |
| `createFollow(initial, options?)` | Own a spring follower and animate an element. |

## Documentation

Visit [ani](https://freestyle-ani.vercel.app/en/docs/solid/create-timeline) to read the documentation.

## Upgrading from 1.x

Run `npx @freestylejs/ani-codemod src` once on your 1.x code (commit before you do), read every warning, then follow the [migration guide](https://freestyle-ani.vercel.app/en/docs/guides/migration-v2). `createAniRef` and `createAniStates` changed their signatures and need manual updates.
