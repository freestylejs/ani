---
title: useAniStates
description: A composable for managing and transitioning between multiple animation states.
---

This composable is a Vue wrapper around the core `createStates` function. It is designed for components with multiple, distinct visual states (idle, hover, active) and binds the element through `machine.bind`, which follows every transition.

### Example

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

### Usage & Concepts

#### Lifecycle

-   **Owns its machine.** The composable creates the state machine and **disposes it with the component scope** (unmount), which stops any running timeline. Outside a scope, call `machine.dispose()` yourself.
-   **Config is read once**, at setup.
-   **Initial style.** `style` is `createStyleSheet(initialValue, resolver)`, rendered on the server. Nothing subscribes to a clock during SSR.
-   **Never misses a transition.** `transitionTo` also works inside `setup()`: the element shows the transition once it mounts.
-   **State.** `state` is a readonly ref that follows the machine, including transitions made on `machine` directly and rollbacks of failed ones. An unknown state throws a `RangeError` and nothing changes.
-   **Interruptions continue.** A transition started while another runs continues from the current value and velocity.

#### When to Use

-   **Do** use `useAniStates` for components with a finite number of visual states, such as buttons, cards or navigation items.
-   **Don't** use it for animations that are not state based. Use [`useAniRef`](/en/docs/vue/use-ani-ref) with your own timeline.

### API Reference

| Name | Type | Description |
| :--- | :--- | :--- |
| `config` | `StateProps` | `initial`, `initialValue`, `states` and optional `clock`. See [createStates](/en/docs/core-api/states). |
| `config.resolver` | `Resolver<Record<string, number>>` | (Optional) Custom style resolver. |

Returns `{ ref, style, state, transitionTo, machine }`.

| Member | Description |
| :--- | :--- |
| `ref` | Function ref for the element. |
| `style` | Computed initial inline style. |
| `state` | Readonly ref of the current state name. |
| `transitionTo(name, config?)` | Switches state. Resolves with how the run ended. |
| `machine` | The core state controller (`bind`, `onUpdate`, `value`, `dispose`, ...). |

### Related Components

-   [`createStates`](/en/docs/core-api/states) - The core function this composable is built upon.
-   [`useAniRef`](/en/docs/vue/use-ani-ref) - Bind an element to a timeline.
-   [`useAni`](/en/docs/vue/use-ani) - To reactively read animation values.
