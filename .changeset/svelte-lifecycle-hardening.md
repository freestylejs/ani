---
'@freestylejs/ani-svelte': minor
---

Lifecycle and robustness hardening of the Svelte bindings.

- `useAniStates` disposes its state controller when the last node using its action is destroyed (stopping running timelines) and unsubscribes its timeline listener; applying the action to a new node afterwards starts from a fresh controller in `initial`. Transitions are atomic and the exposed stores mirror the controller state.
- `useAniRef`'s action can be applied to several nodes: each node keeps its own subscription and listeners, `reset()` restyles all live nodes and destroying one no longer disables the others.
- `useAni` accepts a timeline or a store of timelines, follows swaps while subscribed and returns a controller that follows them.
- Controllers forward `canBeIntercepted`, `status`, `dispose` and `getCurrentVelocity`; custom properties / hyphenated style keys are applied with `setProperty`.
- Bindings never dispose a timeline they were given; they only detach.
- Controllers and style writing now come from `@freestylejs/ani-core` (`createTimelineController`, `applyStyleSheet`); this release needs the matching `@freestylejs/ani-core` version.
