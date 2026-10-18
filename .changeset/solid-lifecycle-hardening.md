---
'@freestylejs/ani-solid': minor
---

Lifecycle and robustness hardening of the Solid bindings.

- `solid-js` is now a peer dependency (`>=1.8.0`) instead of a hard dependency, so apps can no longer end up with two Solid copies. Install `solid-js` in your app (you already do).
- `createAniRef` / `createAni` return a controller that always targets the current timeline of the `timeline` accessor (it was evaluated once and went stale after a swap) and forwards `canBeIntercepted`, `status`, `dispose` and `getCurrentVelocity`.
- `createAniStates` disposes its state controller with its owner (stopping running timelines), mirrors state from the controller after an atomic transition, and drops the element reference on cleanup.
- Custom properties / hyphenated style keys are applied with `setProperty`.
- Bindings never dispose a timeline they were given; they only detach.
- Controllers and style writing now come from `@freestylejs/ani-core` (`createTimelineController`, `applyStyleSheet`); this release needs the matching `@freestylejs/ani-core` version.
