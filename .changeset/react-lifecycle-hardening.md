---
'@freestylejs/ani-react': minor
---

Lifecycle and robustness hardening of the React bindings.

- `useAniStates` now owns and disposes its state controller: unmounting stops a running (even `repeat: Infinity`) timeline instead of leaving it on the global clock forever. It no longer misses a timeline swap when `transitionTo` is called before its subscription existed (e.g. from a child's mount effect). `transitionTo` is referentially stable, validates before updating React state, and `props` are read on the first render only (documented).
- `useAniRef` binds the initial style and event handlers when `ref.current` appears later (conditional rendering), independent of the identity of `events` / `initialValue`. Handlers are resolved at event time, so inline `events` objects no longer re-attach listeners every render. The initial style is applied in a layout effect (SSR-safe, before paint). The returned controller is stable per `timeline` and now forwards `canBeIntercepted`, `status`, `dispose` and `getCurrentVelocity`.
- Styles are applied with `setProperty` for custom properties / hyphenated keys (e.g. a `propertyResolver` returning `--x`).
- `useAni` keeps `initialValue` from the first render and returns a controller that follows timeline changes.
- Bindings never dispose a timeline they were given; they only detach.
- Controllers and style writing now come from `@freestylejs/ani-core` (`createTimelineController`, `applyStyleSheet`); this release needs the matching `@freestylejs/ani-core` version.
