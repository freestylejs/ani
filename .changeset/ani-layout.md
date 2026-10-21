---
"@freestylejs/ani-layout": minor
"@freestylejs/ani-react": minor
---

Add `@freestylejs/ani-layout`, the optional layout and presence layer for ANI 2,
and the opt-in `@freestylejs/ani-react/layout` adapter.

- WAAPI approximate FLIP for interactive layout, with position/box modes,
  caps, step-downs, snapshot expiry and `layoutId` arbitration.
- View Transition helpers for discrete route/shared-element swaps, with
  unsupported-browser fallback and name lifecycle restoration.
- Declarative `LayoutGroup` boundary, `useLayout`, `useLayoutGroup`,
  `AnimatePresence`, `usePresence` and `usePresenceControl`.
- Presence uses core `createStates`, no mount style write, token-safe re-entry
  and a watchdog.
