# React Animation Hooks API

These React hooks integrate the `@freestylejs/ani-core` animation engine with React. Element styling goes through the core (`bind`, `bindAt`, `machine.bind`, `follower.bind`), so frames are written to the DOM without rendering the component. DOM events are React's job: use `onClick` and friends and call the timeline from there.

**Ownership:** a primitive that receives a timeline, group or machine never disposes it. A creating primitive (`useTimeline`, `useAniStates`, `useFollow`) owns its **committed** object and disposes it when the component unmounts or a replacement commits. Speculative renders cannot replace the committed owner. StrictMode effect reconnection re-creates a disposed object.

**Pure construction:** factories run during render and must be pure, discard-safe constructors. Return an inert Ani timeline/group/follower/clock (or an equivalently inert object); do not start playback, subscribe, attach listeners, allocate external resources, or mutate the DOM in the factory. Start that work in a ref callback, effect, or event handler after commit. React may discard an uncommitted construction without calling `dispose()`, including Suspense, abandoned updates, StrictMode render replay, and SSR. Such constructions must therefore require no external cleanup. No compatibility mode permits resource acquisition during render.

**SSR:** `initialValue` becomes an initial inline `style` that is rendered on the server. Nothing subscribes to a clock or touches the DOM while rendering on the server.

| Hook | Purpose |
| :--- | :--- |
| `useTimeline(factory, deps?)` | Construct a discard-safe inert object; own and dispose its committed instance. |
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

Constructs an inert candidate on the first render. For unchanged committed dependencies, returns the same committed instance with its progress intact, even if an intervening speculative dependency change suspends and is abandoned. A changed dependency creates a render candidate; only a successful commit retires the preceding object. Disposes committed objects on unmount or replacement. Under StrictMode effect replay, a disposed instance is re-created and the component renders again with it. The pure-construction rule above applies to all candidates; `dispose()` is not a render-abort callback.

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
