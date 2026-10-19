# Svelte Animation Primitives API

These Svelte utilities integrate the `@freestylejs/ani-core` animation engine with Svelte (4 and 5: actions and stores). Elements are styled by core (`bind` / `bindAt`), so no render happens per frame. Use them as `<div use:action {style}>`: `style` is a CSS declaration string (`"transform: translateX(0px); opacity: 0"`) that is rendered on the server. Nothing touches the DOM or a clock during server rendering.

**Ownership:** whoever creates an object disposes it. `useTimeline`, `useAniStates` and `useFollow` dispose what they create in `onDestroy`; `useAni`, `useAniRef` and `useAniGroup` only *detach* from timelines and groups you pass in.

**Events:** DOM events are Svelte's job (`on:click`, ...). There is no `events` option.

---

## `useTimeline`

> **Owner primitive: creates a timeline, group or any object with `dispose()` and disposes it in `onDestroy`.**

```svelte
<script>
  import * as a from '@freestylejs/ani-core';
  import { rafTimeline } from '@freestylejs/ani-core';
  import { useTimeline } from '@freestylejs/ani-svelte';

  const timeline = useTimeline(() =>
    rafTimeline(a.ani({ to: { opacity: 1 }, duration: 1 }))
  );
</script>
```

-   The factory runs once, synchronously; its result is returned as is.
-   Misuse throws synchronously: a factory that is not a function, or one that returns something without `dispose()`. An error thrown by the factory propagates and nothing is registered.

| Name | Type | Description |
| :--- | :--- | :--- |
| `factory` | `() => T` | Creates the object. `T extends { dispose(): void }`. |

---

## `useAni`

> **A reactive store that tracks the state of a timeline.**

```svelte
<script>
  const [value, timeline] = useAni(myTimeline, { count: 0 });
</script>

<h1>{Math.round($value.count)}</h1>
```

-   `timeline` may be a timeline or a `Readable` of one. Swaps are followed while the store has subscribers.
-   The store subscribes only while it has subscribers, so nothing is retained otherwise (also on the server).
-   The timeline you pass is never disposed. Returns the timeline itself (the current one for a store).

| Name | Type | Description |
| :--- | :--- | :--- |
| `timeline` | `RafTimeline<G> \| Readable<RafTimeline<G>>` | The timeline to read. |
| `initialValue` | `AniGroup<G>` | Value before the timeline has one. |

Returns `readonly [Readable<AniGroup<G>>, RafTimeline<G>]`.

---

## `useAniRef`

> **A Svelte action that binds a timeline to a DOM element, with a server-rendered initial style.**

```svelte
<script>
  const { action, style } = useAniRef(timeline, {
    initialValue: { translateX: 0, opacity: 0 },
  });
</script>

<div use:action {style} />
```

-   Binds on mount (`timeline.bind(node)`: a timeline that already has a value is written at once), unbinds on destroy (written styles are kept).
-   `timeline` may be a store: a swap rebinds every mounted node to the new timeline.
-   One action may be applied to several nodes; each keeps its own binding.
-   `style` is `undefined` without `initialValue`.

| Name | Type | Description |
| :--- | :--- | :--- |
| `timeline` | `RafTimeline<G> \| Readable<RafTimeline<G>>` | The timeline to bind. |
| `options.initialValue` | `AniGroup<G>` | (Optional) Rendered as the initial `style` string. |
| `options.resolver` | `Resolver<Record<string, number>>` | (Optional) Maps values to style declarations (custom properties included). |

Returns `{ action: Action<HTMLElement>, style: string | undefined }`.

---

## `useAniGroup`

> **A Svelte action that binds each element of a list to its own target of a group.**

```svelte
<script>
  const group = useTimeline(() => rafGroup(node, { stagger: 0.1 }));
  const { action, style } = useAniGroup(group, { initialValue: { opacity: 0 } });
</script>

{#each items as item, index}
  <li use:action={index} {style}>{item}</li>
{/each}
```

-   `use:action={index}` calls `group.bindAt(index, node)`. When the index changes, the node is rebound (`update`) and nothing stays bound at the old index. Destroy unbinds.
-   `group` may be a store: a swap rebinds every mounted node at its index.
-   The group you pass is never disposed.

| Name | Type | Description |
| :--- | :--- | :--- |
| `group` | `RafGroup<G> \| Readable<RafGroup<G>>` | The group to bind. |
| `options.initialValue` | `AniGroup<G>` | (Optional) Rendered as the initial `style` string. |
| `options.resolver` | `Resolver<Record<string, number>>` | (Optional) Maps values to style declarations. |

Returns `{ action: Action<HTMLElement, number>, style: string | undefined }`.

---

## `useAniStates`

> **A state machine for an element: declare the states, then `transitionTo`.**

```svelte
<script>
  const { action, style, state, transitionTo } = useAniStates({
    initial: 'idle',
    initialValue: { scale: 1 },
    states: {
      idle: a.ani({ to: { scale: 1 }, duration: 0.5 }),
      hover: a.ani({ to: { scale: 1.1 }, duration: 0.3 }),
    },
  });
</script>

<button use:action {style} on:mouseenter={() => transitionTo('hover')} data-state={$state} />
```

-   The machine (`createStates`) is owned: disposed in `onDestroy`. Afterwards `transitionTo` resolves `'disposed'`.
-   The action binds the machine (`machine.bind`), so it follows every timeline swap; destroy unbinds only.
-   `style` is the CSS declaration string of `initialValue`.
-   `state` is a store that mirrors the machine, also for a direct `machine.transitionTo`.
-   `transitionTo` is atomic: an unknown state throws a `RangeError` and changes nothing.

| Name | Type | Description |
| :--- | :--- | :--- |
| `config` | `StateProps<S> & { resolver? }` | `initial`, `initialValue`, `states`, optional `clock` and `resolver`. |

Returns `{ action, style, state, transitionTo, machine }`.

---

## `useFollow`

> **A Svelte action for an element that chases a target with a spring, keeping its velocity.**

```svelte
<script>
  const { action, style, follower } = useFollow({ translateX: 0, translateY: 0 });
</script>

<svelte:window on:pointermove={(e) => follower.set({ translateX: e.clientX, translateY: e.clientY })} />
<div use:action {style} />
```

-   The follower (`follow`) is owned: disposed in `onDestroy`; a pending `set` settles `'disposed'`.
-   The action binds the follower (`follower.bind`): the current value is written at once, then every frame. Destroy unbinds only.
-   `style` is the CSS declaration string of `initial`.

| Name | Type | Description |
| :--- | :--- | :--- |
| `initial` | `G extends Record<string, number>` | Initial value; its keys are fixed. |
| `options.spring` | `{ m, k, c, tolerance? }` | (Optional) Spring constants. |
| `options.clock` | `AnimationClockInterface` | (Optional) Clock that drives the follower. |
| `options.resolver` | `Resolver<Record<string, number>>` | (Optional) Maps values to style declarations. |

Returns `{ action, style, follower }`.
