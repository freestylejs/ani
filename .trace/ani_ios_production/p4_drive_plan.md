# P4 Drive — phase plan and review checklist

Authority: `packages/layout/ARCHITECTURE.md` §5.10 in full, §7.3 (`useLayoutDrive`), §8 (gesture
contract), §9.4 (release under reduced motion), §11.2 L-DRIVE-1..6. Plan: `00_plan.md` P4.

## Boundary

Layout owns the drive seam only: `take`, `move`, `release`, `cancel`, the held state machine, the
held read, descendant residuals and `h(t)`, release velocity, invalidation and the React dispatcher.
The gesture layer owns pointer capture, `pointerId`, `touch-action`, velocity estimation, keyboard
operation and announcements. The drive seam is not proof of a complete pointer subsystem.

## Checklist

| # | Requirement | Evidence to demand | Review question |
|---|---|---|---|
| D1 | Public `LayoutDriveVector`/`LayoutDriveState`/`LayoutDriveHandle`/`LayoutDrive` | exports; API docs; structural port example | Is the gesture layer free of layout types? |
| D2 | `take` preconditions and errors | unit + browser tests for unregistered/disconnected/foreign document/waapi/held ancestor/held descendant/unsupported | Is every throw before any state change? |
| D3 | `take` under runtime `'snap'` | handle `invalidated`, diagnostic `runtime-disabled`, no movement | Does it fail closed without a throw? |
| D4 | Held origin fixed at `take point + offset` | L-DRIVE-1/2; frame read; scroll and ancestor scale cases | Is the drawn origin exact under current parent maps? |
| D5 | Held read counted, no extra reads | stats; read-before-write ordering | Is the read in the clock's read phase? |
| D6 | Descendant residual + common `h(t)` | L-DRIVE-6: parent 0.5 s spring, child 0.1 s timing, size child, already-moving child | Does a child detach? Is release velocity counted once? |
| D7 | Re-render/layoutKey/removal/document/dispose/finish/kill switch/failed support | L-DRIVE-4 state machine | Does every terminal transition invalidate and stop reads? |
| D8 | Reduced motion | L-DRIVE-5: at take, toggled while held, three release policies | Does the hold stay 1:1 and only release obey the policy? |
| D9 | React `useLayoutDrive`, StrictMode same-task detach/re-attach | adapter tests | Does the hold survive a ref replay? |
| D10 | Rows L-DRIVE-1..6 | Chromium + WebKit green, empty knownFailures; Firefox advisory | Is every frame/velocity claim on the independent oracle? |

## Gate

- Unit, typecheck, biome 0 errors.
- Chromium and WebKit: `layout_drive` (new module), `layout`, `layout_meas`, `layout_spring`,
  `layout_ops`, `react_layout`, `react_layout_r18`, `waapi`, `showcase`, `regressions`.
- Logs under `logs/p4/`.
- No tolerance weakening; no legacy path; styles byte-identical after release/cancel/invalidation.

## Checkpoint

1. `p4_drive.md` self-judgment with the row matrix and release-velocity/descendant evidence.
2. Commit/push; P4 tribunal (Chief Justice).
3. P5a harness starts in parallel.

## Exit

L-DRIVE-1..6 green in Chromium and WebKit; the hand-off is 1:1 while held and velocity-continuous on
release; descendants never detach; every terminal state restores authored styles and leaves no
reader/subscriber behind.
