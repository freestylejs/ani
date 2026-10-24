# Can Ani build Motion.dev-level layout? Showcase and judgment, 2026-10-24

Branch `layout/showcase` (from `layout/final` `83572bd`).

## Verdict

**Yes, for layout animation. It can be built, it is tested frame by frame, and on the axes measured
here it is more exact and cheaper than Motion 14.6.** It is not a full Motion replacement. There is
no gesture or drag engine, no `layoutScroll`/`layoutRoot`, no box-shadow correction, no
`preserve-aspect`, and no per-element layout callbacks. Each gap is listed below with what it
costs.

The judgment rests on four kinds of evidence:

- the examples built;
- frame-level tests against an independent oracle;
- a head-to-head with Motion on identical scenes;
- visual filmstrips.

Each claim names its evidence.

## 1. What was built

The showcase now has 15 live examples in four sections. Nine are new and follow Motion's gallery;
six are the existing acceptance rows. The new ones are in
`packages/web/src/components/layout_examples.tsx` and wired up in `layout_showcase.tsx`.

| Motion gallery example | Ani showcase | API used |
|---|---|---|
| Layout animation (switch) | Switch | `useLayout()` on the knob |
| Tab select | Tabs | shared `layoutId` underline, panel under `AnimatePresence mode="wait"` |
| Smooth tabs | Smooth tabs | `layoutId` + `radius` pill following the pointer |
| Accordion | Accordion | card resizes by layout; header/body `layout: 'position'` |
| Reorder animation | Shuffle | reorder the array |
| Reorder (drag) | Drag to reorder | user land: own `transform` while dragging, `useLayoutGroup().update()` on release |
| To-do list | To-do list | `usePresence` + `useLayout`, `popLayout` |
| Family-style dialog | Family-style dialog | sheet resizes by layout, steps under `popLayout` |
| Toast: stacked notifications | Stacked notifications | collapsed stack ↔ list; text `layout: 'position'` |
| Notifications list | E5 Notifications | (existing) |
| iOS App Folder | E3 Folder | (existing) |
| iOS App Store | E4 Card to detail | (existing; now full width) |
| Layout Anchor | E1 Layout anchor | (existing) |
| Gallery: Grid/List/Detail | Gallery | (existing) |
| (shared-id morph) | E2 Create button | (existing) |

Each card has live controls and a **Code** disclosure with the pattern it uses. The page renders in
light and dark (filmstrips below).

## 2. Frame-level proof

### Browser module `showcase`

`tests/browser/cases/showcase.ts`, 9 cases, Chromium, Firefox and WebKit. For every element marked
`data-lk` it checks:

- **Change from rest.** Every frame is on the independent oracle (`__tests__/oracle.ts`, which
  shares no code with the solver), from the drawn box to the box it lands in, with the example's
  own motion.
- **Change mid-flight.** A chain of oracle tracks. At each change, B is the oracle's own drawn box,
  v is the oracle's analytic velocity, and A is the layout of a fresh render of the new state.
  Every frame is checked until rest. A moving key whose target did not move keeps its track.
- **Always:**
  - nothing jumps at a commit (for `'position'` nodes, the origin point);
  - crossfade pairs sum to opacity 1;
  - no snap (`onSnap`);
  - at rest, inline styles are byte-identical to a fresh render (presence's resting declarations
    excepted).

Results: 9/9 in every engine. Worst error: Chromium ≤ 0.001 px, Firefox ≤ 0.03 px (its 1/60 px
layout unit), WebKit ≤ 0.008 px.

The test is sensitive. With the carried velocity removed from the chain, 7/9 fail within one frame
(3–18 px). The drag case catches the user-land bug fixed below: on the old code, the row was 6 px
behind the pointer while a reorder was pending.

### Docs smoke test

`tests/browser/docs_showcase.mjs` runs against the built docs site with the real clock and real
mouse input: all 15 cards, a hover sweep, a mouse drag, and add, tick and remove on the to-do list.
It passes in three browsers with no console errors.

### Full suite at the end

| Gate | Result |
|---|---|
| vitest | 137 files, 1,616 tests |
| browser, Chromium | 147 passed |
| browser, Firefox | 145 passed, 2 Chromium-only skipped |
| browser, WebKit | 145 passed, 2 Chromium-only skipped |
| engine coverage (statements/branches/functions/lines) | 94.65 / 85.66 / 98.05 / 97.63 (floors 90/80/95/92) |
| WAAPI trace gate | passes |
| size gate | 8/8 |
| `ts:typecheck`, biome | clean (no new warnings) |

## 3. Head-to-head with Motion

### Setup

- Motion 14.6.0 (current) and Ani from this branch.
- React 19.2.1, production builds of both.
- Identical scenes: `~/ani-v2/motion-cmp` on june-wsl, outside the repo.
- Same curve: CSS `ease-out` (0, 0, 0.58, 1), 0.5 s.
- Spring variants for the retarget test: k 170, c 22.
- Headless Playwright browsers, real clock.
- Per-frame cost is the summed time of every `requestAnimationFrame` callback.
- Commit cost is the synchronous render plus the microtasks it queued.

### Cost (ms, median of 5 changes; frame p50 / p95)

| Scene | Ani commit | Motion commit | Ani frame | Motion frame |
|---|---|---|---|---|
| Grid 300, Chromium 1× | 9.7 | 15.8 | 0.7 / 0.9 | 2.0 / 2.4 |
| Grid 1,000, Chromium 1× | 26.8 | 43.5 | 2.4 / 3.3 | 7.2 / 9.1 |
| 60 nested cards, Chromium 1× | 7.5 | 11.0 | 0.7 / 0.9 | 1.6 / 2.0 |
| Grid 300, Chromium 4× CPU | 37.9 | 70.0 | 3.3 / 4.7 | 10.2 / 12.7 |
| Grid 1,000, Chromium 4× CPU | 115 | 226 | 11.4 / 16.8 | 32.4 / 42.6 |
| 60 nested cards, Chromium 4× CPU | 29.4 | 44.6 | 3.0 / 3.8 | 6.7 / 8.5 |
| Grid 1,000, WebKit 1× (1 ms timer) | 34 | 57 | 3 / 4 | 10 / 11 |

Ani's per-frame JS is about 2.5–3× lower and its commit about 1.5–2× lower. Layout API weight is
36.4 KB gzip for Ani (core + layout + React adapter) against 48.2 KB for Motion (`motion`,
`AnimatePresence`, `LayoutGroup`). Motion's figure includes gestures and drag, which Ani lacks.

### Fidelity

A tab underline (shared `layoutId`) is retargeted 5 times, 50 ms apart. A fractional box
(70.19 × 20.3) grows.

| | Ani | Motion |
|---|---|---|
| First painted frame vs. the box before (tab / box) | **0 / 0 px**, all engines | 1.0–4.9 / 1.5–5.2 px: time-based start, first frame already advanced |
| Velocity at a retarget (step before → first step after, px/frame) | carried: −11.2 → −10.2, −6.3 → −5.2, −4.4 → −3.5 | reversed or dropped in 4/5 (tween −11.5 → +0.4; spring −12.2 → 0.03 → +2.5) |
| Final box | exact | exact |

Motion's springs carry velocity within one element, but a `layoutId` handoff to a new element
starts fresh. Ani hands the velocity over (§5.6).

## 4. Defects found by this work, and fixed

1. **WebKit reference box (engine).** WebKit applies a percentage `transform-origin` to the border
   box snapped to device pixels, `round(w·dpr)/dpr`. This was probed at DPR 1, 2 and 3, for `%`,
   lengths and `calc()`. Projecting about the computed origin was off by `|s − 1|·δ` (0.28 px in
   the dialog, up to px at large scales).
   - **Fix.** A capability probe once per document, when a scope is created, outside every flush.
     Where it finds snapping, the origin's percentage is read from the Typed OM and applied to the
     snapped box (`geometry.usedOrigin`).
   - **Proof.** `layout:REFBOX` is within 0.05 px in every engine, and fails on the old engine in
     WebKit by 0.121 px. `layout:ORIGINPCT` covers the parser, and 7 unit tests use the probed
     values. ARCHITECTURE §4 and §5.3 are updated.
2. **One held frame per retarget (approved amendment of §4.3, 2026-10-24).** A moving node's new
   track now continues the last painted frame's time. A track from rest still shows B on its first
   frame. Twenty-one oracle tests that encoded the hold were updated through one rule
   (`since(track, t)`), and the old rule fails them by 5–16 px.
3. **Held frame on a `layoutId` handoff (real browsers only).**
   - **Cause.** Removing the departing lead stopped the scope's subscription. The handoff flush in
     the same task re-subscribed it, and the clock gives a re-joining subscriber only the time
     since it joined, so the first frame was 0 or short. The manual clock hid this, because its
     `now` equals the last frame between frames.
   - **Fix.** After a removal, the scope unsubscribes at the end of the task's microtasks (still
     before any frame), unless a flush there started a run. §9 is updated.
   - **Proof.** `layout:JOIN` reproduces the real timing with `mc.advance(10)` and failed by
     2.07 px before the fix. J23 and OPTIONS now check "before the next frame". On the real clock,
     the instrumented page shows the first frame after the handoff advancing a full step
     (25.98 → 38.55 px).
4. **Example and showcase defects, found in the filmstrips:**
   - the smooth-tabs pill painted over labels;
   - a fast drag left the row behind the pointer until React committed;
   - the dialog's old and new steps overlapped;
   - filled controls lacked contrast in dark mode;
   - E4 was cut off, and small stages were empty.

   All are fixed and re-filmed in light and dark.

## 5. Gaps against Motion (not built; what each costs)

| Motion capability | Ani | Cost of the gap |
|---|---|---|
| Gestures and drag (`drag`, `Reorder`) | none; drag-to-reorder is ~100 lines of user land (shown) | no release momentum: the drop animates from rest; no axis locking or constraints |
| `layoutScroll`, `layoutRoot` | out of scope (§2); an inner scroll between capture and flush snaps `'stale'` | layout inside scrolled containers or fixed roots needs care |
| Box-shadow correction | none | shadows stretch slightly under scale |
| `layout="preserve-aspect"` | none | — |
| Per-element `onLayoutAnimationStart/Complete` | per-run reports (`flush()` / `update()` promises) | no per-element hooks |
| Rotate, skew, SVG, inline elements | snap with a typed reason (§9) | no layout animation for them |
| Border-radius correction | `radius: true`, opt-in | one option to set |
| Spring physics | stateless timing + a momentum term (§5.1) | a continuity device, not physics |

## 6. Residual risks

- The capability probe adds one write and one read per document when the first scope is created.
- A removal that leaves nothing moving keeps the subscription until the end of the task's
  microtasks, not synchronously.
- The head-to-head ran on headless Linux browsers. The absolute numbers are not a device
  benchmark; the ratios are the claim.
- The filmstrips use the real clock and screenshot latency, so their timestamps are approximate.
  Frame exactness is the tests' job.
