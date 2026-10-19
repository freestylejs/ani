# React Animation Hooks API

These React hooks integrate the `@freestylejs/ani-core` animation engine with React. Element styling goes through the core (`bind`, `bindAt`, `machine.bind`, `follower.bind`), so frames are written to the DOM without rendering the component. DOM events are React's job: use `onClick` and friends and call the timeline from there.

**Ownership:** a primitive that receives a timeline, group or machine never disposes it. A primitive that creates one (`useTimeline`, `useAniStates`, `useFollow`) disposes it when the component unmounts, and re-creates it when React's StrictMode re-runs effects on the same instance.

**SSR:** `initialValue` becomes an initial inline `style` that is rendered on the server. Nothing subscribes to a clock or touches the DOM while rendering on the server.

| Hook | Purpose |
| :--- | :--- |
| `useTimeline(factory, deps?)` | Create and dispose any object with `dispose()`. |
| `useAni(timeline, initialValue)` | Re-render with the timeline value. |
| `useAniRef(timeline, options?)` | Animate one element, no renders. |
| `useAniGroup(group, options?)` | Animate many elements, one ref per index. |
| `useAniStates(config)` | Own a state machine and animate an element. |
| `useFollow(initial, options?)` | Own a spring follower and animate an element. |

---

## `useTimeline`

```ts
function useTimeline<T extends { dispose(): void }>(
    factory: () => T,
    deps?: DependencyList
): T
```

Creates the object on the first render, returns the same instance on every render, disposes it on unmount and when `deps` change (then creates a new one). Under StrictMode a disposed instance is re-created and the component renders again with it.

```tsx
const timeline = useTimeline(() =>
    a.rafTimeline(a.ani({ to: { x: 1 }, duration: 1 }))
)
```

---

## `useAni`

```ts
function useAni<G>(
    timeline: RafTimeline<G>,
    initialValue: AniGroup<G>
): readonly [AniGroup<G>, RafTimeline<G>]
```

Subscribes to `timeline` (with `useSyncExternalStore`) and re-renders on every update. `initialValue` is read on the first render only: it is the value shown until the timeline has one, and the value rendered on the server. The controller is stable per `timeline`. The hook never disposes the timeline. For high-frequency style updates use `useAniRef`.

```tsx
const timeline = useTimeline(() =>
    a.rafTimeline(a.ani({ to: { count: 100 }, duration: 5 }))
)
const [value, controller] = useAni(timeline, { count: 0 })
```

---

## `useAniRef`

```ts
function useAniRef<G>(
    timeline: RafTimeline<G>,
    options?: { initialValue?: AniGroup<G>; resolver?: Resolver<Record<string, number>> }
): { ref: (element: HTMLElement | null) => void; style: CSSProperties | undefined }
```

`ref` binds the element with `timeline.bind` and is stable per `timeline`. Attaching binds (and writes the current value), detaching or unmounting unbinds, a new `timeline` rebinds the current element. It works for elements rendered by child components and mounted later. `style` is the initial inline style from `initialValue` (`undefined` without it), stable across renders. The `resolver` is read when an element attaches.

```tsx
const { ref, style } = useAniRef(timeline, { initialValue: { opacity: 0 } })
return <div ref={ref} style={style} />
```

---

## `useAniGroup`

```ts
function useAniGroup<G>(
    group: RafGroup<G>,
    options?: { initialValue?: AniGroup<G>; resolver?: Resolver<Record<string, number>> }
): { ref: (index: number) => (element: HTMLElement | null) => void; style: CSSProperties | undefined }
```

`ref(index)` returns the same function per index (while `group` is the same) and binds with `group.bindAt(index, element)`. Removing an element unbinds only its index; a new `group` rebinds the current elements.

```tsx
const { ref, style } = useAniGroup(group, { initialValue: { opacity: 0 } })
return items.map((item, i) => <li key={item} ref={ref(i)} style={style} />)
```

---

## `useAniStates`

```ts
function useAniStates<const S extends AnimationStateShape>(
    config: StateProps<S> & { resolver?: Resolver<Record<string, number>> }
): {
    ref: (element: HTMLElement | null) => void
    style: CSSProperties | undefined
    state: keyof S
    transitionTo: StateController<S>['transitionTo']
    machine: StateController<S>
}
```

Owns the machine (`createStates`); `config` is read on the first render only. `ref` binds the element with `machine.bind`, so it follows every timeline of the machine. `state` re-renders on transitions, including transitions made on `machine` directly. `transitionTo` is stable and returns the run's promise (`'disposed'` after unmount).

```tsx
const { ref, style, state, transitionTo } = useAniStates({
    initial: 'idle',
    initialValue: { opacity: 0.7 },
    states: { idle: idleNode, hover: hoverNode },
})
```

---

## `useFollow`

```ts
function useFollow<G extends Record<string, number>>(
    initial: G,
    options?: FollowOptions & { resolver?: Resolver<Record<string, number>> }
): {
    ref: (element: HTMLElement | null) => void
    style: CSSProperties | undefined
    follower: Follower<G>
}
```

Owns the follower (`follow`); `initial` and `options` are read on the first render only. `ref` binds the element with `follower.bind`; `style` is built from `initial`. `follower` is stable (StrictMode re-creates it once in development) and disposed on unmount.

```tsx
const { ref, style, follower } = useFollow({ translateX: 0 })
// onPointerMove={(e) => follower.set({ translateX: e.clientX })}
```
