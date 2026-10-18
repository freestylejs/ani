# Vue Animation Composables API

These Vue composables integrate the `@freestylejs/ani-core` animation engine with Vue. `useAni` syncs animation values with the framework's reactivity; the others hand an element to the core engine, which writes its styles (no render per frame). DOM events are Vue's job (`@click`, ...).

**Ownership:** a primitive that is given a timeline or group only *binds* to it and never disposes it. The primitives that create something (`useTimeline`, `useAniStates`, `useFollow`) dispose it with the component scope (`onScopeDispose`). Outside a component scope they still work, but you dispose the result yourself.

**Function refs:** `ref` values are used as `<div :ref="ref" :style="style">`. A component instance resolves to its `$el`. `style` is the initial inline style (`createStyleSheet(initialValue, resolver)`), rendered on the server; nothing subscribes to a clock or touches the DOM during server rendering.

---

## `useTimeline`

> **Creates an object and disposes it with the component.**

```ts
function useTimeline<T extends { dispose(): void }>(factory: () => T): T
```

```vue
<script setup>
import { a, rafTimeline } from "@freestylejs/ani-core";
import { useTimeline } from "@freestylejs/ani-vue";

const timeline = useTimeline(() =>
  rafTimeline(a.ani({ to: { opacity: 1 }, duration: 1 }))
);
</script>
```

-   `factory` runs once; the result is disposed in `onScopeDispose` (also works in a plain `effectScope`).
-   Works for timelines, groups and followers: anything with `dispose()`.
-   Outside a scope it does not warn and the caller disposes. A throwing factory throws synchronously.

---

## `useAni`

> **A reactive composable that updates a Vue ref on each animation frame.**

This composable subscribes to a `timeline`'s state and updates a Vue `ref` on each animation frame. It's ideal when animated values need to be read within your component's template or other reactive computations.

### Example

```vue
<script setup>
import { a, rafTimeline } from "@freestylejs/ani-core";
import { useAni } from "@freestylejs/ani-vue";

// 1. Define the animation structure and create a timeline.
const myTimeline = rafTimeline(
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

### Behavior

-   `timeline` may be a timeline or a `Ref` of one; swaps are followed.
-   The value is a `shallowRef`: each frame replaces it as a whole, nothing is deeply proxied. Do not mutate it.
-   The composable subscribes on mount and unsubscribes before unmount, so server rendering retains nothing.
-   The returned controller follows timeline swaps. The timeline you pass is never disposed.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `timeline` | `RafAniTimeline<G> \| Ref<RafAniTimeline<G>>` | The timeline to read. |
| `initialValue` | `AniGroup<G>` | Value before the timeline has one. |

Returns `readonly [value, controller]`: a `Ref<AniGroup<G>>` and the timeline controller.

---

## `useAniRef`

> **A function ref and an initial style that bind an element to a timeline.**

```ts
function useAniRef<G>(
  timeline: RafTimeline<G> | Ref<RafTimeline<G>>,
  options?: { initialValue?: AniGroup<G>; resolver?: Resolver<Record<string, number>> }
): {
  ref: (element: Element | ComponentPublicInstance | null) => void
  style: ComputedRef<StyleValue | undefined>
}
```

```vue
<script setup>
import { a, rafTimeline } from "@freestylejs/ani-core";
import { useAniRef, useTimeline } from "@freestylejs/ani-vue";

const timeline = useTimeline(() =>
  rafTimeline(a.ani({ to: { translateX: 500 }, duration: 1 }))
);
const { ref, style } = useAniRef(timeline, { initialValue: { translateX: 0 } });
</script>

<template>
  <div :ref="ref" :style="style" @click="timeline.play({ from: { translateX: 0 } })" />
</template>
```

-   The element is written through `timeline.bind` only (commit phase, changed declarations only).
-   `style` is `undefined` without an `initialValue`. It is a stable object, so a re-render never resets an animated style.
-   Setting the same element again adds no binding; `ref(null)` and unmount unbind. The timeline stays alive.
-   A `Ref` timeline is followed: on change the element is rebound to the new one.
-   `resolver` shapes both the initial style and the frames.

---

## `useAniGroup`

> **Function refs that bind a list of elements to one group, one ref per index.**

```ts
function useAniGroup<G>(
  group: RafGroup<G> | Ref<RafGroup<G>>,
  options?: { initialValue?: AniGroup<G>; resolver?: Resolver<Record<string, number>> }
): {
  ref: (index: number) => (element: Element | ComponentPublicInstance | null) => void
  style: ComputedRef<StyleValue | undefined>
}
```

```vue
<template>
  <li v-for="(item, i) in items" :key="item" :ref="ref(i)" :style="style" />
</template>
```

-   `ref(index)` returns the same function for the same index and binds the element with `group.bindAt(index, ...)`.
-   A removed item unbinds itself; an item that mounts later is bound to its index.
-   A `Ref` group is followed: on change every element is rebound. The group is never disposed.

---

## `useAniStates`

> **A composable for managing and transitioning between multiple animation states.**

```ts
function useAniStates<const S extends AnimationStateShape>(
  config: StateProps<S> & { resolver?: Resolver<Record<string, number>> }
): {
  ref: (element: Element | ComponentPublicInstance | null) => void
  style: ComputedRef<StyleValue | undefined>
  state: Readonly<Ref<keyof S>>
  transitionTo: StateController<S>["transitionTo"]
  machine: StateController<S>
}
```

```vue
<script setup>
import { a } from "@freestylejs/ani-core";
import { useAniStates } from "@freestylejs/ani-vue";

const { ref, style, state, transitionTo } = useAniStates({
  initial: "idle",
  initialValue: { scale: 1, opacity: 0.7 },
  states: {
    idle: a.ani({ to: { scale: 1, opacity: 0.7 }, duration: 0.5 }),
    hover: a.ani({ to: { scale: 1.1, opacity: 1 }, duration: 0.3 }),
  },
});
</script>

<template>
  <button
    :ref="ref"
    :style="style"
    :data-state="state"
    @mouseenter="transitionTo('hover')"
    @mouseleave="transitionTo('idle')"
  >
    Hover Me
  </button>
</template>
```

-   **Owns its machine** and disposes it with the component scope, which stops any running timeline. Outside a scope, call `machine.dispose()`.
-   Config is read once, at setup. The element is written through `machine.bind`, which follows every transition, so `transitionTo` also works inside `setup()`.
-   `state` is readonly and follows the machine, including transitions made on `machine` directly and rollbacks of failed ones.
-   Interrupting a transition continues from the current value and velocity.

---

## `useFollow`

> **A spring follower bound to an element, disposed with the component.**

```ts
function useFollow<G extends Record<string, number>>(
  initial: G,
  options?: FollowOptions & { resolver?: Resolver<Record<string, number>> }
): {
  ref: (element: Element | ComponentPublicInstance | null) => void
  style: ComputedRef<StyleValue | undefined>
  follower: Follower<G>
}
```

```vue
<script setup>
import { useFollow } from "@freestylejs/ani-vue";

const { ref, style, follower } = useFollow({ translateX: 0 });
</script>

<template>
  <div :ref="ref" :style="style" @pointermove="follower.set({ translateX: $event.clientX })" />
</template>
```

-   Owns the follower and disposes it with the component scope. Outside a scope, call `follower.dispose()`.
-   `style` is `createStyleSheet(initial, resolver)`. `follower.jump(value)` writes the element synchronously.
-   An invalid initial value (for example `NaN`) throws a `TypeError` synchronously.
