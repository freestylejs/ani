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
| Smooth tabs | Smooth tabs | `layoutId` pill following the pointer; radius correction is the shared-element default |
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

`tests/browser/cases/showcase.ts`, 11 cases (Folder and Gallery joined in the follow-up of §7),
Chromium, Firefox and WebKit. For every element marked
`data-lk` it checks:

- **Change from rest.** Every frame is on the independent oracle (`__tests__/oracle.ts`, which
  shares no code with the solver), from the drawn box to the box it lands in, with the example's
  own motion.
- **Change mid-flight.** A chain of oracle tracks. At each change, B is the oracle's own drawn box,
  v is the oracle's analytic velocity, and A is the layout of a fresh render of the new state.
  Every frame is checked until rest. A moving key whose target did not move keeps its track.
- **Always:**
  - nothing jumps at a commit (for `'position'` nodes, the origin point);
  - crossfade pairs cover the box: source-over coverage `1 − (1 − a)(1 − b)` is 1 (§7);
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
| Border-radius correction | on by default with a `layoutId`; `radius: false` opts out; otherwise opt-in with `radius: true`; blends across a shared handoff (§7) | no option for shared elements; one option for non-shared elements |
| Spring physics | stateless timing + a momentum term (§5.1) | a continuity device, not physics |

## 6. Residual risks

- The capability probe adds one write and one read per document when the first scope is created.
- A removal that leaves nothing moving keeps the subscription until the end of the task's
  microtasks, not synchronously.
- The head-to-head ran on headless Linux browsers. The absolute numbers are not a device
  benchmark; the ratios are the claim.
- The filmstrips use the real clock and screenshot latency, so their timestamps are approximate.
  Frame exactness is the tests' job.
- A capture pays one computed-style read for each resting element with a `layoutId` whose radius
  correction is on (the default for `layoutId`; `radius: false` opts out). This is the price of an
  exact starting radius (§7); flushes and frames read nothing more than before.
- A direct `flush()` with no capture cannot see a radius changed by style alone while the element
  rested. The blend then starts from the last measured radius (ARCHITECTURE §12).

## 7. Follow-up: the user's review, 2026-10-24/25

The user reviewed the running showcase and reported two things:
- the radius animation looked awkward in Create button, Family-style dialog, Card to detail and
  Gallery;
- the Folder had a timing problem: frames where nothing showed.

Frame-exact traces (Playwright's paused clock, one 16.67 ms step per frame) separated engine
defects from example defects.

| Finding | Kind | Measured on `5632f65` | Fix |
|---|---|---|---|
| A. Radius re-read during a run | engine bug | layout read back its own `!important` corner write at the next flush, so the correction compounded. E2 open drew 42.6/71.1 px for an 18 px corner; the Dialog sheet drew 24.6 px for 28 | A corner layout owns keeps its authored length across flushes. A plain author replacement becomes the source (ARCHITECTURE §5.7, §6) |
| B. Crossfade coverage | engine design | complementary opacities `w`, `1 − w` cover only 0.75 of a pair at mid-fade, and 0.44 for E4's nested image and title | Motion's curves: the lead fades in over the first half (`circOut`), the follower fades out after it, so coverage is exactly 1. A reversal starts both layers from their current opacities (§5.6) |
| C. No radius blend across a shared handoff | engine gap | the new element showed its own radius from the first frame | When both elements set `radius: true`, the on-screen corner goes from the departing radius to the new one on the lead's curve. The resting departing radius is read at capture (user-approved: accuracy over a cached value, so a `:hover` radius change is included) (§4.1, §5.7) |
| D. Gallery without `radius: true` | example bug | tile corners reached 52 px on close | `radius: true` on tile and detail |
| E. Folder backgrounds | example bug | the panel's opaque, non-participating background covered the moving tiles; two empty frames on open; the panel popped at f0, and the icon vanished at once on close | The icon and panel are one shared `'folder'` surface with `radius: true`, and the staggered items are `layout: 'position'` |

Found on the way and fixed:
- reduced motion switched on during a crossfade gave the exiting element its opacity back (it was
  there on `5632f65`; §9);
- an over-strict Folder test counted two shared tiles crossing each other as an occluder, and an
  early fix had tuned one tile's spring to dodge it. The test was corrected, and every tile uses
  the group spring.

**Process.** There were three fix packets with independent judges, each run until it passed:
- P1 `6da0b66`, radius read-back: PASS in round 1;
- P2 `403fcd3`, crossfade and radius blend: PASS in round 3, after an extra flush read and the
  reduced-motion fade were sent back;
- P3 `331c131`, examples: PASS in round 2, after the spring fitting was sent back.

The reports are kept outside the repository, in `ani-fx-brief/reports`.

**Evidence on the integrated build.** Traces of 41 frames per demo, 10 demos, in Chromium, Firefox
and WebKit:
- source-over coverage is 1.000 at every frame of E2, E3, E4 and Gallery, opening and closing;
- the two layers' on-screen radii agree within 0.10 px;
- no radius moves at settle;
- the E4 card goes 18.00 → 18.24 → 18.82 → … → 26 px, with the same series in every browser;
- the Dialog sheet holds 28.00 px;
- the Folder surface stays ≥ 0.99 covered and morphs 80×80 ↔ 340×260;
- no shared tile is missing in any frame.

**Final gate (merge `2142a9c` plus the docs):**

| Gate | Result |
|---|---|
| vitest | 137 files, 1,617 tests |
| browser, Chromium | 162 passed |
| browser, Firefox | 160 passed, 2 Chromium-only skipped |
| browser, WebKit | 160 passed, 2 Chromium-only skipped |
| engine coverage (statements/branches/functions/lines) | 95.04 / 85.62 / 98.19 / 97.83 |
| commit reads at 1,000 participants | 2–3 ms (gate 4 ms); steady frame p95 0.75–0.85 ms (gate 2 ms) |
| WAAPI trace gate, size gate | pass; 8/8, unchanged bytes |
| `ts:typecheck`, biome | clean (10 warnings, the existing baseline) |
| docs smoke | 3 browsers, no errors |

## 8. Follow-up: radius default and WAAPI requirements, 2026-10-25

The user approved two follow-ups: a participant with a `layoutId` corrects radius by default
(`radius: false` opts out; a participant without a `layoutId` remains opt-in), and the WAAPI
engine's limits must be stated exactly in the architecture, public docs and JSDoc. The behavior
landed in `4b3d4c8`; the first documentation pass was `a4191c6`. This cleanup adds `f51aafc`
(WAAPI nesting validation and browser coverage), `52d6d89` (layout/React JSDoc and package docs),
`7acf251` (web guide/showcase copy and Code disclosures), and `f96d352` (the expected-warning test
annotation needed to preserve the 10-warning Biome baseline).

The drift sweep found one behavior defect behind otherwise-correct prose: the WAAPI engine rejected
a nested participant from `add()` but not from `set()`. A browser regression failed on `a4191c6`
with `nested set: expected "ANI_INVALID_OPTIONS", received "no error"`; `set()` now runs the same
nesting validator as `add()`. The same case covers a nesting introduced later in the DOM snapping
`'unsupported'` and missing CSS `linear()` support snapping `'unsupported'`. A separate case proves
that an Ani clock with `timeScale = 0` does not stop the document-timeline animation. Existing
cases cover position-only/options rejection, no-velocity retargeting, reduced motion and no inline
style. The jank step-back is a stated consequence of sampling `Animation.currentTime` on the main
thread while the compositor keeps advancing; it has mechanism coverage plus the compositor trace,
but no direct frame oracle because JavaScript cannot sample compositor-only frames while the main
thread is blocked.

User-facing shared-element examples no longer teach redundant `radius: true`; runtime fixtures were
left explicit where they already were. The package README, guide, changesets and React `engine` prop
now distinguish the default clock-driven RAF engine from WAAPI's document timeline and state the
same WAAPI requirements and differences as the implementation. Historical decision/source traces
were not rewritten.

**Final gate (`f96d352`, before this trace-only update):**

| Gate | Result |
|---|---|
| vitest | 137 files, 1,618 tests |
| browser, Chromium | 164 passed |
| browser, Firefox | 162 passed, 2 Chromium-only skipped |
| browser, WebKit | 162 passed, 2 Chromium-only skipped |
| engine coverage (statements/branches/functions/lines) | 95.20 / 85.52 / 98.20 / 98.01 (floors 90/80/95/92) |
| commit reads at 1,000 participants | 2.30 ms (gate 4 ms); steady frame p95 at 300 nested movers 0.725 ms (gate 2 ms) |
| WAAPI trace gate, size gate | pass; 8/8 |
| `ts:typecheck`, biome | clean; 11/11 typecheck tasks, 10 warnings (existing baseline) |
| docs smoke | Chromium, Firefox and WebKit pass against the built site on port 3114; no errors |
