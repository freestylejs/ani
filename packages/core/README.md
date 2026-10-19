# `@freestylejs/ani-core`

Core engine for the FreestyleJS animation library: immutable animation trees, the `rafTimeline` and `waapiTimeline` engines, groups, followers and the clock.

## Install

```sh
npm install @freestylejs/ani-core
```

## Quick start

```ts
import * as a from '@freestylejs/ani-core'

// Describe the animation once. Every duration is in seconds.
const slideIn = a.sequence([
    a.ani({ to: { translateX: 120 }, duration: 0.4 }),
    a.ani({ to: { translateX: 100 }, duration: 0.2 }),
])

// Play it on an element with the browser's native engine...
const box = document.createElement('div')
a.waapiTimeline(slideIn).play(box, { from: { translateX: 0 } })

// ...or compute it frame by frame and write the styles.
const timeline = a.rafTimeline(slideIn)
const unbind = timeline.bind(box)
timeline.play({ from: { translateX: 0 } })

// When the owner goes away:
unbind()
timeline.dispose()
```

Animations honor `prefers-reduced-motion` by default. See the documentation for the reduced motion policies, `rafGroup`, `follow`, `createStates` and testing with `@freestylejs/ani-core/testing`.

## Documentation

Visit [ani](https://freestyle-ani.vercel.app/en) to read the documentation.

## Upgrading from 1.x

Run `npx @freestylejs/ani-codemod src` once on your 1.x code (commit before you do), read every warning, then follow the [migration guide](https://freestyle-ani.vercel.app/en/docs/guides/migration-v2).
