---
'@freestylejs/ani-vue': minor
---

Lifecycle and robustness hardening of the Vue bindings.

- `useAniStates` disposes its state controller with the component scope (unmount stops running timelines) and subscribes to timeline changes synchronously, so a `transitionTo` issued in `setup()` or by a child's `onMounted` is no longer missed. State is mirrored from the controller after the (atomic) transition.
- `useAni` accepts a timeline or a `Ref` of one and follows swaps; its value is a `shallowRef` (no per-frame deep proxying). It still subscribes on mount only (SSR retains nothing).
- `useAniRef` binds timeline swaps synchronously, unwraps deep `ref(timeline)` proxies to the raw instance, forwards `canBeIntercepted`, `status`, `dispose` and `getCurrentVelocity` from its controller, and applies custom properties / hyphenated keys with `setProperty`.
- Bindings never dispose a timeline they were given; they only detach.
- Controllers and style writing now come from `@freestylejs/ani-core` (`createTimelineController`, `applyStyleSheet`); this release needs the matching `@freestylejs/ani-core` version.
