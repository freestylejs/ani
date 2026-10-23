---
'@freestylejs/ani-react': minor
---

New opt-in entry `@freestylejs/ani-react/layout`, the React adapter for `@freestylejs/ani-layout` 0.2.0 (an optional peer dependency, `^0.2.0`).

- **`useLayout(options?)`** returns a ref callback that marks an element. The element animates on every commit that moves or resizes it; there is nothing to call. Options: `layout`, `layoutId`, `layoutAnchor`, `layoutCrossfade`, `layoutDependency`, `radius`, `motion` (seconds) and `ref` to forward the element. Options are compared by value, so inline objects and inline timings do not restart anything.
- **`LayoutGroup`** renders no DOM. The outermost group owns the group options (`clock`, `reducedMotion`, `threshold`, `maxNodes`, `retain`, `onSnap`); nested groups namespace `layoutId`s with `id` and supply `motion` defaults. Without a `LayoutGroup`, participants join an implicit root group per clock and document.
- **Trigger contract.** A commit animates when it renders a participant, a `LayoutGroup` or an `AnimatePresence`: that render captures the boxes, and one microtask per group flushes after the commit's layout effects, before paint. For a change that renders none of them (memoized children), `useLayoutGroup().update(fn)` captures, runs `fn` in `flushSync` and flushes; a development warning names both fixes.
- **`AnimatePresence`, `usePresence`, `usePresenceControl`.** An exiting child takes part in `layoutId` handoffs and crossfades. Under `mode="popLayout"` the exiting child is measured against its real containing block in the render that removes it, so its siblings move from the first frame. `usePresence().style` keeps `initial` until the enter has finished.
- Works under `StrictMode`, transitions, deferred values and Suspense: a render that React restarts in a later task captures again. Tested on React 19 and 18.3, plain and compiled by the React Compiler.
