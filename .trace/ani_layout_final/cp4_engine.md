# CP4: engine and vanilla API, implementer's checkpoint review and the CP3 trial fix proof report

- Authority: `plan.md` CP4 (T4.1–T4.4, V4); `ARCHITECTURE.md` §3–§9, §11 cost gates; drift K1, K12–K15.
- Code (new):
  - `packages/layout/src/dom.ts`: every read; owned-style save/write/restore.
  - `scope.ts`: registry, capture epochs, the flush, runs, frames, lifecycle; `createLayoutGroup`.
  - `realize/raf.ts`: the one `Animatable`.
  - `presence_link.ts`: the presence registry and release holds.
- Code (changed): `types.ts`, `index.ts`, `presence.ts` (link + holds), `feature.ts`, `easing.ts`.
- Deleted (hard migration):
  - `layout_group.ts`, `projection/*`.
  - `__tests__/layout_group.test.ts`, `__tests__/cpc_oracle.test.ts`.
  - `tests/browser/cases/cpc.ts`, `cpc_harness.ts`.
  - `supportsFlip`.
  - The old `tests/browser/cases/layout.ts` is rewritten; its View Transition case is kept as `VT1`.
- Tests:
  - Vitest: `packages/layout/src/__tests__` → 8 files, 115/115.
  - Browser: `tests/browser/cases/layout.ts`, `--case 'layout:*'` → 15/15 in each of Chromium, Firefox and WebKit.
  - WebKit needs `source ~/ani-v2/sysroot/webkit-env.sh`.
- Typecheck:
  - `@freestylejs/ani-layout` and every package except `@freestylejs/ani-react` are clean.
  - `tests/browser` is clean except `react_layout.ts`. The React adapter's layout module still
    targets the deleted engine; CP5 replaces it (plan T4.2, V5).
- Lint: the CP4 trial found one formatter error in `tests/browser/cases/layout.ts` (J-024); after the fix,
  `npx biome check packages/layout packages/react tests/browser vitest.config.ts` → 0 errors (warnings only).
- Regressions: `--case 'spike:S*' --case 'react:*'` in Chromium all pass.

## Engine model, as implemented

### Flush

The flush runs in three phases. Every write comes after every read (T8 proves the order).

1. **Read.**
   - Every participant's rect.
   - Computed values only for active nodes. These are nodes with a driven node at or above them
     (their engine poses are divided out), plus what the plan animates and their ancestors.
   - `resolveGeometry` recovers, top-down: `L`, the origin `O`, `Q` (frozen authored values ×
     the presence matrix), `X = Q(L)`, the rest map and the visual `A` (§3.1).
2. **Plan.** The planner assumes a centred origin for nodes it has not measured. It re-plans
   only when a newly measured node breaks that assumption.
3. **Write.** Then the realizer subscribes.

### Frames

- A track's first update has `dt = 0`.
- Writes happen only in `commit` and only for changed values.
- A node settles when its track ended and no ancestor animates. It then restores its saved
  inline declarations in place (byte-identical `cssText`, T1/T9/T12).

### Crossfade

- The lead fades in on its own timeline.
- The follower is drawn at the lead and fades out.
- At the end the follower is held at opacity 0. Its presence exit is released only then (T5:
  release at 0.304 s for a 0.3 s crossfade with a 0.1 s exit).

### Detection

- **Non-participant ancestor scale/rotate.** The CSS box recovered from the rect must have the
  element's size. The rounded `offsetWidth`/`offsetHeight` decides; the exact computed box size
  is read only when that check is ambiguous.
- **CSS animations.** CSS animations/transitions of `translate`/`scale` are found with one
  `document.getAnimations()` scan per flush.
- **Configured transitions.** A configured transition on `translate`/`scale`/`all` snaps, with
  an actionable warning (§6, K15).

### K14 hand-off

The scope needs no hidden hook: the React adapter calls `capture()` right after `flush()` when
a participant rendered after the commit's last layout effect (§4.1, CP5). The S1 prototype's
in-flush hand-off is equivalent: same boxes, no extra read.

## Tasks

| Task | Evidence |
|---|---|
| T4.1 `dom.ts`, `presence_link.ts`, `realize/raf.ts`, `scope.ts` | Browser T1–T13, COST; vitest `ssr.test.ts` (no DOM: `flush` → `'no-change'`, zero reads). |
| T4.2 public API, deletions, typecheck | `index.ts` exports `createLayoutGroup` from `scope.ts`; `types.ts` defines `LayoutGroupOptions`, `LayoutReport`, `LayoutGroup` per §7.1; deletions listed above; typecheck as above. |
| T4.3 browser module `layout` (manual clock) | See the table below. |
| T4.4 cost | COST: reads per commit at 1,000 participants, frame at 300 nested movers. |

| T4.3 requirement | Case | Chromium / Firefox / WebKit |
|---|---|---|
| Flat move, every frame on the oracle, exact settle, byte-identical style, no subscriber | T1 | max error 0.0001 / 0.0000 / 0.0001 px |
| Nested depth 3, mixed modes (`true` / `'position'` / `'size'`), linear / easeOut / spring, delay | T2 | 0.0002 / 0.0079 / 0.0002 px |
| Anchor (E1): centre on the parent's centre every frame, size holds until 0.8 s | T3 | centre ≤ 0.0000 / 0.0083 / 0.0000 px; size starts at 0.816 s (0.8 s + one frame) |
| Interruption with velocity: old run `'interrupted'`, retarget continuous in position and velocity | T4 | 0.0000 / 0.0080 / 0.0000 px; first step within 5 % of the oracle |
| `layoutId` handoff + crossfade with presence; release waits for the crossfade; follower held at 0, lead restored | T5 | opacity sum ±0.0000; 0.0001 / 0.0000 / 0.0001 px |
| Constant ancestor scale and a delayed child on a different timeline (CP2 trial J-001 DOM) | T6 | child x = 40.000 px at the parent-halfway frame in all three browsers |
| Animating presence transform on a participant ancestor (visual layer) | T7 | 0.0000 / 0.0067 / 0.0000 px against the track seen through the changing scale |
| A running retarget reads before any write; reads per commit; zero reads per frame | T8 | capture 8 rects (2 driven skipped); flush 10 rects + 3 styles, all before the writes; 0 reads in 5 frames; `stats.reads` matches |
| Byte-identical restore over authored `translate`/`scale`, radius correction | T9 | 0.0000 px; on-screen radius exact |
| Every snap reason, `onSnap`, development warnings | T10 | `culled`, `capped`, `unsupported` (rotate subtree, scaled non-participant ancestor, transition on translate), `stale` |
| Reduced motion | T11 | `jump`: 0 writes, 0 subscribers, `'reduced'`; `maxDuration`: 8 frames; `ignore`: plays; toggle mid-run finishes the active run at the next flush |
| `finish`, `dispose`, throwing `mutate` | T12 | `'ended'` + restored; `'disposed'` + restored; `update` rethrows, capture discarded |
| An unrelated re-render restarts nothing (inside the delay too) | T13 | a flush every 3rd frame: run `'ended'`, never interrupted, on the oracle |
| View Transitions kept | VT1 | finished / unsupported (Firefox has no VT) / finished |

| T4.4 / §11 cost gate | Chromium | Firefox | WebKit |
|---|---|---|---|
| Commit reads at 1,000 participants, 300 moving (gate ≤ 4 ms) | 2.30 ms | 2.00 ms | 2.00 ms |
| Whole commit, same (reads + plan + t = 0 writes; not gated) | 4.50 ms | 5.00 ms | 4.00 ms |
| All 1,000 moving: reads / whole commit | 3.30 / 9.70 ms | 6.00 / 13.00 ms | 5.00 / 9.00 ms |
| Steady frame at 300 nested movers, p95 (gate ≤ 2 ms) | 0.64 ms | 0.95 ms | 0.85 ms |

How the cost was measured:

- **Reads.** The case times every read the engine makes (rect, computed values, offsets,
  scroll, animations) through wrappers: an upper bound. Firefox and WebKit timers are coarse;
  the sum of many quantized intervals is still an unbiased estimate.
- **Frames.** Frames are timed in batches of 20.

## Fix proof report for the CP3 trial (`cp3_pure_core_trial_result.md`, frozen `6485ad8`)

The trial resolved J-001 and J-008. Each new defect is fixed at its root and has a regression
test.

| Defect | Correction | Proof |
|---|---|---|
| J-009 follower order | `drawnBoxes` / `drawnVelocities` resolve each node by memoized dependency (a follower → its lead; an anchored node → its parent), independent of order. Projection stays parents-first. | `solve.test.ts` "J-009": `[follower, lead]` and `[lead, follower]` give equal boxes and velocities; the lead is at (105, 240) with velocity (190, 320) per the trial's numbers. |
| J-010 anchor movement | An anchor applies only with a participant parent; otherwise it is ignored. `moved` measures an anchored node by size and by its offset from the parent's anchor point. Keep compares the size target and the offset target (`targetMoved`). | `plan.test.ts` "J-010" ×3: root anchor → position track (x = 50 at 0.5 s); offset change under a stationary parent → track; running anchored track: unchanged target → keep, changed offset target → retarget. |
| J-011 anchored momentum | `AnchorRule` gains `kx`/`ky` = relative anchor-point velocity × D + (from − to)·e′(0). The offset follows the channel equation; its analytic velocity includes the term. | `plan.test.ts` "J-011": the trial's retarget (x = 50, v = 100, to x = 200, width 20 → 40) gives x = 50, analytic v = 100, finite difference 100. The `solve.test.ts` random trees put momentum on anchored nodes (oracle with `kx`/`ky`); the finite-difference check covers it. |
| J-012 handoff to a registered lead | Handoff happens on a lead change when the previous lead departs (exiting or removed); the new lead's own capture no longer blocks it. A still-live previous lead (duplicate id) keeps its own motion. | `plan.test.ts` "J-012": an existing card becomes lead, starts at the exiting detail's box (200, 300) with a crossfade (`fadeLead`, follower `follow start`). The duplicate-id test still passes. §5.6 is amended. |
| J-013 cull before cap | Culling applies to every node, also under a moving ancestor. There it becomes `static` (counter-projected) and is not counted. | `plan.test.ts` "J-013": the trial's numbers give status `'run'`, `[track, static]`, snapped `[1: culled]`. §9 is amended. |
| J-014 infinite initial slope | `curveOf` keeps an exact infinite `e′(0)` (no secant). For a custom timing, `convergedSlope0` returns `Infinity` when forward differences diverge. `validateMotion` rejects a non-finite slope with `ANI_INVALID_OPTIONS`. | `motion.test.ts`: the trial's bezier `p2 (0, 1), p3 (1, 1)` and a custom √τ timing throw `ANI_INVALID_OPTIONS`. Defaults and the valid core timings are accepted. §5.1 is amended. |
| J-015 size floor | The authority states the floor: one pixel, or the smaller endpoint when it is below one pixel (endpoints are exact). | `solve.test.ts` "J-015": B = 10, A = 0.5, v = −100 → the path never drops below 0.5 and ends exactly at 0.5. §5.1 and K15 are amended. |

Residual risks:

- The whole commit (plan + writes) at 1,000 movers is 9–13 ms. That is not gated; the reads are
  gated and pass.
- A non-participant ancestor scale within 0.5 px of the rounded size (a near-1 scale on a small
  box) escapes detection.
- An authored transition on `translate`/`scale`/`all` snaps the node, by design (§6).

## Verdict

PASS (implementer review): T4.1–T4.4 and V4 are met in three browsers, and the CP3 trial's
J-009–J-015 are corrected with proof. CP5 starts; CP4 goes to the Chief Justice together with the
re-judgment of J-009–J-015.

## Fix proof report for the CP4 trial (`cp4_engine_trial_result.md`, frozen `5c9f57c`)

The trial resolved J-009–J-015 and found J-016–J-025. Each is fixed at its root and reproduced by
a browser regression case named after it (`tests/browser/cases/layout.ts`, `layout:J16`–`J25`),
with the trial's own numbers where it gave them. Every case passes in Chromium, Firefox and WebKit.

| Defect | Root cause | Correction | Proof (all three browsers) |
|---|---|---|---|
| J-016 | `add`/`set` flagged every call as an option change | `sameTrackOptions` (`motion.ts`): mode, anchor, radius and motion by value (a timing by class + `opt`). Only a difference flags `changed`. `layoutId`, `layoutCrossfade` and `layoutDependency` never restart a track. | `J16`: 23 flushes with `set(e, {})`, `set(e, {layout: true})` and an equivalent delayed motion (inside the delay too). The run is never interrupted; both nodes stay on the original oracle (max error 0.0000 px). |
| J-017 | A same-lead retarget dropped the lead's fade | The lead keeps its fade (`keptFade`). Fades gate their first update on their own `started` flag, so the pair stays in step after the track restarts. Opacity is written only while a fade is owned, so the lead gives its opacity back at the fade's end. | `J17`: retarget at 0.48 s of a 1 s crossfade. Opacity sum stays within 0.0000. The pair is on the velocity oracle (≤ 0.0083 px). Presence release and the lead's opacity restore both land at 1.008 s (the fade's end); the follower is held at 0; the lead's style is restored. |
| J-018 | `settle`, `restoreOpacity` and remove wrote immediately | Restores are queued (`queueRestore`) and written with the other writes: after every flush read, and in the clock's commit (`raf.ts` unsubscribes after the commit of the last frame). | `J18`: a flush with one node disconnected and another retargeted logs 3 reads before 3 writes. A phase marker subscribed before the scope records all 14 frame writes, including the 2 settle removals, in `commit`. |
| J-019 | Kept tracks ignored a reduced-motion mode change | Each drive records the mode it was planned under; a different mode marks the node changed, so it is re-planned from its drawn box and velocity with the current clamp. | `J19`: `maxDuration: 0.1`, toggled at 0.19 s with an unchanged A. The first run resolves `'interrupted'`. The active and the delayed track end within 8 frames (≤ 0.1 s). Styles are restored; 0 subscribers. |
| J-020 | Retention kept the box but not the velocity | `retained` stores `{box, velocity, until}`; `IdHistory.retainedVelocity` seeds the handoff. The velocity is kept only for a moving, non-holding own track. | `plan.test.ts` J-020: x(0.02) = 44.12672; the derivative at 0 is 200 for h = 1e-5…1e-7. `J20`: the new lead is on the velocity oracle every frame; after `retain` has expired there is no handoff. |
| J-021 | Corners owned mid-run were never saved | `startDrive` (existing drive) saves the radius properties when `radius` turns on, and gives them back at once when it turns off. A radius change is a track-option change. | `J21`: radius turned on at 0.19 s is owned (`!important`); the inline style is byte-identical after settle, `finish()` and `dispose()`. |
| J-022 | The original snapshot overwrote a later authored inline value | `adoptAuthored` (`dom.ts`) recognises an author's inline write by its priority: layout's writes are `!important`, React's are not. It takes the write into `saved` at each flush and before each restore, and drops the written-value cache so the pose is re-asserted. | `J22`: translate 4px → 20px and scale 1 → 1.5 set inline mid-run. After settle, `finish()` and `dispose()` the author's values (normal priority) apply: box (220, 0, 60 × 60) within 0.01 px. |
| J-023 | Unregister resolved the run `'ended'` and left the scheduler running | `cancelRunNode`: a run left with no node resolves `'disposed'`. Removal drops pending writes for the element, restores at once, recounts `stats.tracks` and stops the realizer when nothing live is left. A node gone from the document is cancelled the same way at the next flush. | `J23`: sole removal → `'disposed'`, 0 subscribers, 0 tracks, restored at once. Partial removal → the rest stays on the oracle and reports `'ended'` once. A disconnected node → `'disposed'` and restored. |
| J-024 | Formatter error in `layout.ts` | Formatted. | `npx biome check packages/layout packages/react tests/browser vitest.config.ts`: 0 errors. |
| J-025 | B of a driven node ignored a presence matrix changed since the last flush | `reconcileLayers` maps the engine's current poses through the presence matrices read at this flush (stored per geometry as `matrix`). This needs no extra read and no write before the reads. The velocity is scaled by the same change. | `J25`: parent scale 0.8 → 1 between flushes. B = (138.4, w 40) at the new t = 0, the first frame is continuous, every frame is on the velocity oracle (≤ 0.0083 px), and the settle is the identity. The same defect made the React E5 toast stack jump; `react_layout:E5` now passes. |

Re-run after the fixes (remote mirror, frozen tree of the CP5 commit):

| Check | Result |
|---|---|
| `pnpm vitest run` (all packages) | 135 files, 1,577 / 1,577 |
| `layout:*` × Chromium / Firefox / WebKit | 24 / 24 each (T1–T13, J16–J25, VT1, COST) |
| `test:browser --browser chromium` (every module) | 80 / 80 |
| COST: commit reads at 1,000 participants / 300 moving (gate ≤ 4 ms) | 2.40 / 3.00 / 2.00 ms |
| COST: frame p95 at 300 nested movers (gate ≤ 2 ms) | 0.63 / 0.85 / 0.65 ms |
| `tsc` for layout, react, core, vue, solid, svelte and `tests/browser` | clean |

`packages/web` (the docs site) still fails `tsc`: its Next route types are not generated and
`@freestylejs/ani-react` is not built in the mirror. CP6 rewrites that site (T6.4).

Residual risks: an author's inline write with `!important` to `translate`/`scale` is not
recognised as authored (React cannot produce one). The presence velocity itself is not part
of a reconciled B's velocity, only the change of scale.

## Fix proof report for the CP5 trial, engine defects (`cp5_react_trial_result.md`, frozen `8211c7c`)

The React adapter defects (J-026–J-029, J-031, the adapter half of J-016 and the React half of
J-030) are proved in `cp5_react.md`. This section covers the engine.

| Defect | Root cause | Correction | Files and tests |
|---|---|---|---|
| J-016 | `sameTrackOptions` compared the unresolved option objects: `{}` vs `{ motion: { duration: 1 } }` under a group duration of 1, and spring parameters in another key order, read as changes | Motion is compared after merging the group's motion and the defaults (`mergeMotion`, also the base of `resolveMotion`); timings compare by class plus `opt` by structural, key-order-free equality (`sameData`); a timing without `opt` (linear) compares its own fields | `motion.ts`, `scope.ts` (`add`/`set` pass the group motion). `motion.test.ts` "track option equality (J-016)": defaults, inherited fields, spring key order, bezier, and genuine changes in every field. Browser `J16`: a third node with a spring; every 4th frame a flush with a rotating set of equivalent options (`{}`, `{ layout: true }`, `{ motion: { duration: 1 } }`, `{ motion: { delay: 0 } }`, `{ motion: { timing: timing.linear() } }`, `{ radius: false }`) and the spring in another key order |
| J-020 | A removed lead's retained box and velocity came from the frozen geometry; a parent layer changed before the removal was not applied | The retained entry keeps the participant it was drawn under; the next flush measures that parent and carries the box and velocity through its current layers with the same machinery as J-025 (`Retained.parent`, `carriers` in the measured set) | `scope.ts`. Browser `J20`, new part: parent at x 100 with `scale(0.8)`, child left 0 → 200 and width 40 → 100; at 0.192 s the parent goes to scale 1, the child is removed and its id added at x 400. The handoff starts at (138.4, w 51.52) with 200 / 60 px/s, every frame on the oracle. `plan.test.ts` "J-030: the retained size velocity is handed off too" |
| J-025 | `reconcileLayers` scaled the whole velocity by the size ratio of the old and new drawn box, so a child's own scale change scaled its parent's translation | Each frame node's full map is recovered *with its rate* from its drawn box and velocity (`movingOnto`); the pose and its rate follow (`parent⁻¹ ∘ full ∘ inner⁻¹`) and are recomposed through the current maps (`composeMoving`, exact product rule). `MovingMap`, `composeMoving`, `invertMoving`, `movingOnto` and `carry` are in `geometry.ts` | `geometry.ts`, `scope.ts`. `geometry.test.ts` "moving maps" against central differences. Browser `J25`, new part: parent left 0 → 200; child `scale(0.8)` → 1 and left 0 → 100 at 0.192 s; B = (38.4, w 40) with vx 200 and every frame on the oracle |
| J-030 (engine) | Missing frame proof | `J19`: the clamped re-plan of the moving node (1 s → 0.1 s from x 38.4 at 200 px/s) and of the node in its delay (0.5 + 1 s → 1/30 + 1/15 s) is on the oracle every frame. `J21`: per-frame rects and drawn corners (8 px within 0.0010 px) after `radius` turns on. `J22`: the run keeps its frozen composition every frame, then the authored box applies at release | `tests/browser/cases/layout.ts` |

Before / after (Chromium; the counterexamples of the trial):

| Case | Before (frozen `8211c7c` engine) | After |
|---|---|---|
| J16 equivalent options | `never interrupted: expected "ended", received "interrupted"` | ended, max error 0.0003 px |
| J20 handoff through a changed parent layer | first frame at (130.72, w 41.216, h 32): 10.304 px off | (138.4, w 51.52, h 40), 0.0000 px |
| J25 own layer under a moving parent | 0.775 px off at the first frame (velocity 250) | 0.0000 px every frame (velocity 200) |

The new browser cases were run against the frozen engine sources to show they fail there.

| Case | Chromium / Firefox / WebKit, max error per frame |
|---|---|
| J16 | 0.0003 / 0.0146 / 0.0000 px |
| J19 | 0.0000 / 0.0069 / 0.0000 px |
| J20 | 0.0000 / 0.0084 / 0.0000 px |
| J21 | 0.0000 / 0.0149 / 0.0001 px; corners 0.0000 / 0.0010 / 0.0000 px |
| J22 | 0.0000 / 0.0000 / 0.0000 px |
| J25 | 0.0000 / 0.0083 / 0.0000 px |

Residual risk: the removed element's own presence layer is taken as last measured (it is
gone and cannot be read).

## Fix proof report for the CP6 trial, engine defects (J-016, J-032)

Trial: `cp6_acceptance_trial_result.md`. Clarification K22.

### J-016: omitted timing vs explicit default

- **Root cause.** `mergeMotion` left an omitted timing `undefined`; `resolveMotion` drew it with
  `timing.easeOut()`, but `sameTrackOptions` compared `undefined` with an explicit
  `timing.easeOut()` and found a change, so the run restarted.
- **Fix.** `packages/layout/src/motion.ts`: the merge fills the default timing once; resolution
  and equality read the same merged value.
- **Proof.**
  - `motion.test.ts` "an omitted timing is the default ease-out": omitted ↔ explicit under no
    group motion, a group duration and a group delay; a group timing, `easeIn`, `linear` and a
    spring still differ.
  - `layout:J16` default-timing leg (the trial's case): a group without a timing, x 0 → 200, the
    participant toggled between `{}` and `{ motion: { timing: timing.easeOut() } }` every fourth
    frame (16 toggles); every frame on the oracle's ease-out track, run `ended`; a control group
    where `easeIn()` is set reports `interrupted`.
    Chromium 0.0000 px, Firefox 0.0080 px, WebKit 0.0000 px. With the old `motion.ts` the leg
    fails: "default timing kept: expected "ended", received "interrupted"".

### J-032: a child retargeted under a kept parent whose layer changed

- **Root cause.** E-1 kept an ancestor's frozen geometry (inner map under the old presence
  matrix) while a child planned now was measured, and its B carried, through the ancestor's
  current layer. The solver composed the child under the frozen matrix, so the change applied
  twice (trial: w 40 → 50, 23.7 px off).
- **Fix.** A track lives in the visual space of the flush that planned it (§3.1, §11 oracle):
  - `FrameNode.ancestry` records the participant ancestors' presence matrices at that flush (a
    kept node keeps its own, a new one takes the current ones);
  - `epochInners` turns it into the ancestors' inner maps per node, `null` when they are the
    ones its parent's map already uses (the common case: no allocation, computed once per frame
    array);
  - `solve` composes such a node's parent map from the ancestors' solved poses and those inner
    maps (`SolveNode.inners`);
  - `reconcileLayers` recovers each pose against that same parent map and also detects a change
    of an ancestor since a node's flush; `plannedBoxes` judges keep vs retarget under the node's
    own epoch.
  The kept ancestor's own track still keeps its frozen matrix: a layer changed since its flush
  stays a visual layer over it.
- **Proof.**
  - `solve.test.ts` "a node composes its ancestors at its own flush": 200 random trees with
    `inners` equal to the ancestors' own give identical poses; the trial's geometry in the pure
    solver draws the child at its track through the current layer (and at w 50 without
    `inners`).
  - `layout:J32` (the trial's repro: parent 200×100 under scaleX(0.8) moving 0 → 200, at 0.2 s
    the layer goes to 1, the child retargets to left 100): at the flush B = (40, w 40); every
    frame on the child's own track with vx 200 (expected 44.04752 at 0.02 s); at frame 10 the
    layer returns to 0.8 and the child shows exactly that change since its flush (0.8 about the
    parent's drawn left, w 32) while the parent shows none (w 160); a no-op flush at frame 20
    keeps both tracks (`no-change`); identity settle.
    Child / parent max error: Chromium 0.0000 / 0.0000 px, Firefox 0.0083 / 0.0000 px, WebKit
    0.0000 / 0.0000 px. Before the fix: "B is what the user saw (x 40, w 40): drawn … w 50".
  - Unchanged: `layout:PRESENCE_LAYER` (the original E-1), `J20`, `J25`, `react_layout:E5`, and
    every layout, React, acceptance, regression and WAAPI module in Chromium (97 / 97);
    `layout:COST` frame p95 at 300 nested movers 0.665 ms (was 0.68).
- **Residual risk.** An anchored node (`layoutAnchor`) is still placed relative to its parent's
  drawn track box, not through the parent's layer, as before.

## Fix proof report for the CP8 trial (J-032, J-035, J-036)

Trial: `cp8_final_trial_result.md` (frozen `1a244e3`). Clarification K23; ARCHITECTURE §3.1,
§5.3, §5.4. Commits `4eeed91` (engine and tests), `74da464` (authority).

**J-032: a kept track took its CSS box from its plan.**

- *Root cause.* The frame node of a kept track kept its whole frozen `Geometry`, including the
  CSS box `X = Q(L)` and origin of its plan. What K20b/K22 need frozen is only the presence
  matrices. A parent retargeted after its layer changed moved the child's CSS box (left
  100 → −25 under a parent left 200 → 300) while the child's A, in its own flush's space,
  stayed (280, w 32). So the pose was solved for a box the browser no longer had: 60 → 35 px.
- *Change.* `scope.ts` `keptGeometry`: a kept frame node takes the current CSS box and origin,
  with the inner map rebuilt from the frozen presence matrix. It rests on the planned A, which
  is already computed from the current CSS box (`plannedBoxes`).
- *Regression.* `layout:J32B` is the trial's exact case. At the flush the child stays where the
  user saw it, (60, w 40). It is then checked every frame against the independent path: the
  parent `R(t)` (B 40 → A 300, vx 200), the kept child track `C = 280·min(1, 0.2 + DT + t)`
  drawn through the parent's layer, `x = R + 1.25·(C − R)`, w 40. A no-op flush at frame 20
  gives `no-change`; the child settles at (275, w 40) with identity styles.

**J-035: an anchored child used its parent's box in the parent's space.**

- *Root cause.* `drawnBoxes`/`drawnVelocities` placed an anchored node on its parent's drawn
  box, which lives in the parent's flush space (scaleX 0.8: w 160). A child planned after the
  layer changed lives in its own flush's space (scaleX 1: w 200), so its anchor point was 20 px
  left of the parent's visual centre. The keep test (`targetMoved`) mixed the same two spaces:
  the child's A in its own space against the parent's A in the parent's. That made a kept
  anchored child retarget at every flush.
- *Change.* `solve.ts` `drawnMotion`: an anchored node with layers (its own or its parent's)
  takes its parent's box and velocity through `corrᵢ ∘ corr_parent⁻¹` (moving maps, so the
  velocity is exact). `scope.ts` `plannedBoxes` also returns the parent's A through the same
  ancestors (`PlanNode.parentPlanned`), and `plan.ts` `targetMoved` compares with it.
- *Regressions.* `layout:J35` is the trial's case: parent 0.8 → 1, centred child 40 → 60. B is
  (120, w 40) and every frame is on `R + 100 − W/2`, with `R = 200·min(1, 0.2 + DT + t)` and
  `W = 40 + 20t − 20t(1 − t)²`. A no-op flush gives `no-change`; the child settles at (270,
  w 60), identity. `layout:J35B` is the same at depth 2: the layer is the grandparent's, and
  a kept participant sits between.

**J-036: each mixed-epoch node recomposed its whole ancestor chain.**

- *Change.* `solve.ts` `epochs`: every full map `Mₐ` is the map carrying `Lₐ` onto the drawn
  box, which needs no chain. With `Ωₐ = corrₐ⁻¹ ∘ Mₐ` (a's full map under every ancestor's own
  inner map), a node with layers `Γₐ = Qₐ⁻¹ ∘ Qₐ′` sees its parent through
  `corr ∘ Ω_parent`, with `corr = Π Ωₐ∘Γₐ∘Ωₐ⁻¹` root first. This is the product rule for
  substituting inner maps inside a chain of 1-D affine maps. It is exact, not an
  approximation, and the random-tree oracle below checks it against the browser chain.
  `reconcileLayers` uses the same recurrence over moving maps (`movingParents`).
  `SolveNode.inners` is replaced by `layers`.
- *Accounting.* Per frame, each node costs one map from its drawn box and one inverse to
  solve its pose. A node with layers adds 2 compositions per layer, plus one for `corr ∘ Ω` and
  one for `Ω`. Total: O(N) plus a constant per layer. `solve_cost.test.ts` counts `compose`
  calls on the trial's chain (N nested participants, each planned at its own flush under a
  different root layer): exactly **4(N−1)−1** for N = 25, 50, 100, 200, i.e. 95, 195, 395,
  795. The trial measured 300, 1,225 and 4,950 for N = 25, 50, 100 with the old code. A frame
  without layers composes nothing. Layers are computed once per frame array, at the flush.
- *Authority.* Strict O(N) for every input is impossible under K22. If every ancestor's
  presence matrix changes between every two flushes, the N parent maps are independent
  products. The user approved the §5.3 statement "O(N) map arithmetic per frame, plus a
  constant per layer" on 2026-10-24 (the amendment route of the disposition). A layer exists
  only for a (node, ancestor) pair whose presence transform changed between their flushes.

**Pure tests** (`solve.test.ts`, describe "a node composes its ancestors at its own flush"):

- Over 300 random trees with random layers (> 500 layered nodes), every node's drawn box
  equals the independent browser chain recomposed with its own layers' inner transforms,
  relative error < 1e-9.
- Over 400 random trees, every anchored node is shifted by exactly the difference between the
  parent's anchor point as its layers draw it (browser chain) and as drawn without layers.
- Over 200 random trees with layers, anchored velocities match finite differences, < 1e-3
  relative, with corner instants skipped by a two-step check.
- Layers that restore the ancestors' own inner maps change nothing (200 trees).
- The J-035 case closed-form, at t = 0, 0.1, 0.5, 0.9 and 1.

**Sensitivity.** With `scope.ts`, `solve.ts` and `plan.ts` from `0c20425` substituted on the
mirror, Chromium and Firefox give:

- J32B: `drawn x 35 … differs from x 60 by 25.000 px` (the trial's 60 → 35).
- J35 and J35B: `drawn x 100 … differs from x 120 by 20.000 px` (the trial's 120 → 100).
- J32 still passes.

The current sources were then restored.

**Results** (current sources, max error per frame):

| Case | Chromium | Firefox | WebKit |
|---|---|---|---|
| J32 | 0.0000 | 0.0000 | 0.0000 px |
| J32B | 0.0001 | 0.0124 | 0.0000 px |
| J35 | 0.0001 | 0.0179 | 0.0001 px |
| J35B | 0.0001 | 0.0179 | 0.0001 px |

Other runs:

- `pnpm vitest run`: 137 files, 1,607 tests.
- `pnpm test:browser --coverage` (Chromium, all modules): 128 passed. Engine coverage
  94.69 / 85.84 / 98.01 / 97.53 against floors 90 / 80 / 95 / 92.
- Firefox and WebKit: 126 passed, 2 skipped by design, 0 failed.
- `pnpm test:waapi-trace`: passed (WAAPI draws 5 / RAF 0 during the 120 ms block).
- `layout:COST`, 300 nested movers frame p95: 0.640 / 0.900 / 0.650 ms (C/F/W). Reads at
  1,000 participants: 2.5 / 3.0 / 3.0 ms.
- tsc `--noUnusedLocals --noUnusedParameters` is clean; `pnpm check` is clean.

**Authority mapping.**

- §3.3 invariants 1 and 4 (first frame is B; continuous in position and velocity) and 5 (no
  retarget without a moved A): J32B, J35 and J35B, each with a no-op flush.
- §3.1 (track space; kept tracks): J-032.
- §5.3 (projection, cost): J-036.
- §5.4 (anchor placement in the node's space; keep test): J-035.
- T3.3/V3 (pure solver), T4.1/T4.3/V4 (engine, regressions).

**Residual risks.**

- A crossfade follower is drawn at its lead's box in the lead's flush space. If their flushes
  saw different presence layers, the follower is drawn without that difference.
- Layers are found by walking each frame node's ancestor chain once per flush, as before.
