# Solid Animation Primitives API

These Solid primitives integrate the `@freestylejs/ani-core` animation engine with Solid. Element styling goes through core (`bind`, `bindAt`, `machine.bind`, `follower.bind`); the bindings only manage ownership and refs.

**Ownership:** whoever creates an object disposes it. `createTimeline`, `createAniStates` and `createFollow` create an object and dispose it with the current owner (`onCleanup`). `createAni`, `createAniRef` and `createAniGroup` only *detach* from what you pass in.

**SSR:** `style()` is the inline style of the initial value (plain data, kebab-case keys). Nothing subscribes to a clock or touches the DOM while rendering on the server.

**Events:** DOM events are the framework's job (`onClick`, ...). There is no `events` option.

Element primitives are used as `<div ref={ref} style={style()}>`.

---

## `createTimeline`

```ts
function createTimeline<T extends { dispose(): void }>(factory: () => T): T
```

Calls `factory` once, synchronously, and disposes the result with the owner. Works with `rafTimeline`, `rafGroup`, `follow`, `createStates`. A throwing factory throws.

---

## `createAni`

```ts
function createAni<G>(
  timeline: RafTimeline<G> | Accessor<RafTimeline<G>>,
  initialValue: AniGroup<G>
): readonly [Accessor<AniGroup<G>>, RafTimeline<G>]
```

Syncs the timeline's value with a signal. The returned controller follows accessor swaps. The subscription is removed with the owner; the timeline is never disposed.

---

## `createAniRef`

```ts
function createAniRef<G>(
  timeline: RafTimeline<G> | Accessor<RafTimeline<G>>,
  options?: { initialValue?: AniGroup<G>; resolver?: Resolver<Record<string, number>> }
): { ref: (element: HTMLElement) => void; style: Accessor<JSX.CSSProperties | undefined> }
```

`ref(element)` calls `timeline.bind(element, { resolver })` (the element is written with the current value at once). An accessor change rebinds the element. The binding is released with `onCleanup` of the owner that called `ref`. `style()` is the inline style of `initialValue`, or `undefined`.

---

## `createAniGroup`

```ts
function createAniGroup<G>(
  group: RafGroup<G> | Accessor<RafGroup<G>>,
  options?: { initialValue?: AniGroup<G>; resolver?: Resolver<Record<string, number>> }
): { ref: (index: number) => (element: HTMLElement) => void; style: Accessor<JSX.CSSProperties | undefined> }
```

`ref(index)(element)` calls `group.bindAt(index, element, { resolver })`. An invalid index throws a `TypeError`. An accessor change rebinds every element.

---

## `createAniStates`

```ts
function createAniStates<const S extends AnimationStateShape>(
  config: StateProps<S> & { resolver?: Resolver<Record<string, number>> }
): {
  ref: (element: HTMLElement) => void
  style: Accessor<JSX.CSSProperties | undefined>
  state: Accessor<keyof S>
  transitionTo: StateController<S>['transitionTo']
  machine: StateController<S>
}
```

Creates the state machine (read once, disposed with the owner). `ref` calls `machine.bind`, so the element follows every timeline swap. `state()` mirrors the machine through `onTransition`.

---

## `createFollow`

```ts
function createFollow<G extends Record<string, number>>(
  initial: G,
  options?: FollowOptions & { resolver?: Resolver<Record<string, number>> }
): {
  ref: (element: HTMLElement) => void
  style: Accessor<JSX.CSSProperties | undefined>
  follower: Follower<G>
}
```

Creates a spring follower (disposed with the owner). `ref` calls `follower.bind`. An invalid `initial` throws synchronously.
