# P5 scene specification — the §11.6 iOS-native-grade scene set

**Status: specification only.** No scene described here is implemented by this document, and no
scene, metric, cost gate, engine row or checkpoint is claimed to pass. The document defines the
screen, the DOM, the participant channels, the motion, the scripted sequence, the expected oracle,
the deciding gates, the negative control and the public-API feasibility for each of the 11 §11.6
scenes. A scene may be called iOS-native-grade only from a green P5 report on the pinned instrument,
in Chromium and WebKit, per §11.5/§11.6.

**Authority.** `packages/layout/ARCHITECTURE.md` §11.6 (scene table and frame scoring), §11.5
(harness, cost gates, certification instrument, floor, measurement, aggregation), §11.1 (oracle and
layers), §3 (model), §5 (solver), §7 (public API), §10 (WAAPI); `.trace/ani_ios_production/00_plan.md`
(Teleology, D5/D8/D9, P5 gate); `.trace/ani_ios_production/briefs/h14.md` (harness contract). The
authority wins over every sentence in this document. Where this document chooses a geometry or a
script time, that choice is a scene contribution, not a change to an engine rule or a tolerance.

**No weakened tolerance.** Every gate value in this document is copied from §11.6 or §11.5. Where the
authority is silent, the sentence is quoted in §3 and the strictest reading is taken. No scene may
pass by construction, and no metric may be dropped because a scene makes it inconvenient.

**Worktree and dependency note.** This specification was written in the worktree detached at
`3f25ec8` (P0/P1/P2 closed; P3 and P4 not yet in the tree). `createLayoutGroup` exists; the P3
runtime/status/diagnostics surface and the P4 `take`/`move`/`release`/`cancel` surface described by
§5.10, §7.1 and §7.3 do not yet exist in that tree. The P2 scenes are specified against the
authority and become runnable when P3 lands; S-REORDER, S-SHEET and the S-BULK held cost shape are
blocked on P4. This is a build-order dependency, not an ambiguity in the scene design.

---

## 1. Common scene harness contract

This section is normative for all 11 scenes. A scene's own section adds only what differs.

### 1.1 What the harness is

The harness is the judge of the native-grade claim. It is a Playwright runner that serves each
scene page by request interception under a cross-origin-isolated origin (COOP `same-origin`, COEP
`require-corp`), on one pinned browser process per measured run. It runs each scene on a manual clock
for frame scoring and on a real clock for cost. It writes one report per run containing the
instrument fingerprint, every per-run statistic, every median, the clock granularity `g`, and the
worst frame and participant for every metric. `--check` exits non-zero after writing the report if
any gate fails. A harness that cannot fail a deliberately wrong frame is not evidence.

The independent oracle shares no solver, `physics`, `plan`, `solve` or production timing code with
the engine. Timing curves and the spring are re-derived from §11.1/§5.2/§5.3, and the spring oracle
is a closed-form or high-order numerical solution that is unit-tested against hand-computed values
and against a 0.01 ms reference integration to better than 1e-6 px. The scene script supplies the
expected track of every participant; the oracle never calls production code to compute an expected
frame.

### 1.2 Page, viewport, device scale factor, fonts and assets

| Item | iOS interaction scenes (S-CARD, S-PHOTO, S-SEG, S-ACC, S-STACK, S-ISLAND, S-INSERT, S-DELETE, S-REORDER, S-SHEET) | S-BULK |
|---|---|---|
| Viewport (CSS px) | 390 × 844 | 1280 × 720 |
| Device scale factor | 2 (primary); a reported DPR 1 and DPR 3 sweep is run for the fractional-box scenes S-CARD, S-PHOTO, S-ACC | 1 |
| `document.documentElement` | `width: 100%; height: 100%; overflow: hidden;` | same |
| Stage | `position: fixed; inset: 0; width: 390px; height: 844px; overflow: hidden;` | `position: fixed; inset: 0; 1280×720; overflow: hidden;` |
| Safe areas | top 47 px (status bar), bottom 34 px (home indicator); content inset 16 px | none |
| Color scheme | light (`color-scheme: light`), white surfaces on `#F2F2F7` | dark (`color-scheme: dark`) |
| Font | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif` | same stack; labels 8/10 |
| Font loading | await `document.fonts.ready` before the first capture; no network font | same |
| Images | inline SVG data URIs only; every `<img>` is `decode()`-awaited before the first capture; a deterministic 1600×1200 (4:3) SVG source is reused with 12 color variants | none (CSS fills and initials) |
| Icons | inline SVG, currentColor, no sprite/network | inline SVG |
| Extensions | none; the scene uses the public `@freestylejs/ani-layout` and, where marked R, `@freestylejs/ani-react/layout` plus core presence/`ani` for author layers | vanilla |
| Engine | `engine: 'raf'` (explicit or default). WAAPI is not usable for these scenes: §10 rejects springs, nested participants, `layoutId`, `radius: true` and `take`. | `engine: 'raf'` |

The font stack resolves to the same SF Pro faces in both required engines on the pinned macOS
instrument. The harness records the computed font string of every text-bearing participant so a
fallback is visible in the report; a different computed font between engines is a scene failure,
not a tolerance.

The DPR 1/2/3 sweep exists because §5.5 makes the projection follow WebKit's device-pixel-snapped
reference box where the §4 probe says the browser snaps percentages. S-PHOTO's fractional cell
`128.6667 px` and S-ACC's `0.5 px` separators are the deliberate fractional/degenerate boxes. The
sweep is reported separately; the §11.6 frame gates apply to each sweep run.

### 1.3 Design tokens

The scenes use one token set so a native iOS look is reproducible and a visual drift is visible.

**Typography.** SF Pro, `font-optical-sizing: auto`, antialiased. Tracking is part of the token.

| Token | Size / line-height | Weight | Tracking |
|---|---|---|---|
| Large title | 34 / 41 | 700 | +0.40 px |
| Title 2 | 22 / 28 | 700 | +0.35 px |
| Headline | 17 / 22 | 600 | −0.41 px |
| Body | 17 / 22 | 400 | −0.41 px |
| Callout | 16 / 21 | 400 | −0.32 px |
| Subhead | 15 / 20 | 400 | −0.24 px |
| Footnote | 13 / 18 | 400 | −0.08 px |
| Caption 1 | 12 / 16 | 400 | 0 |
| Caption 2 | 11 / 13 | 400 | +0.07 px |

**Colors (exact).** `#F2F2F7` page; `#FFFFFF` surface; `#000000` primary label;
`rgba(60,60,67,0.60)` secondary label; `rgba(60,60,67,0.30)` tertiary label;
`rgba(60,60,67,0.29)` separator; `rgba(118,118,128,0.12)` fill; `rgba(118,118,128,0.16)` fill-2;
`#007AFF` blue; `#FF3B30` red; `#34C759` green; `#FF9500` orange; `#FF2D55` pink; `#AF52DE` purple;
`#5AC8FA` teal; `#FFCC00` yellow; `#1C1C1E` dark surface; `#000000` island; `#0B0B0F` bulk stage.
No color is sampled from the environment; every value is explicit.

**Radii.** Card 20; sheet 0 (full) / 10 top (detent sheet); row 10; settings group 12; segmented
track 9, pill 7; island pill 18.5, island card 40; notification card 16; badge circle 11; bulk tile
4.

**Shadows (exact).** Card `0 8px 30px rgba(0,0,0,0.12)`; sheet `0 20px 60px rgba(0,0,0,0.25)`;
row `0 1px 2px rgba(0,0,0,0.04)`; segmented pill `0 3px 8px rgba(0,0,0,0.12), 0 3px 1px
rgba(0,0,0,0.04)`; notification `0 6px 20px rgba(0,0,0,0.12)`; island `0 10px 30px
rgba(0,0,0,0.35)`; dragged row `0 12px 28px rgba(0,0,0,0.18)`.

**Spring tokens.** The physical spring kind (`motion: { type: 'spring', duration: D, bounce: b }`).
`D` is the perceptual duration of §5.3; the settle is computed by the engine (and independently by
the oracle) from `D`, `b`, the displacement and the incoming velocity.

| Token | D (s) | b | Used by |
|---|---|---|---|
| `CARD` | 0.55 | 0.05 | S-CARD card/sheet/image/title |
| `PHOTO` | 0.45 | 0.00 | S-PHOTO frame/image, and the back |
| `SEG` | 0.35 | 0.12 | S-SEG pill |
| `ACC` | 0.50 | 0.06 | S-ACC rows/headers/bodies/separators |
| `STACK` | 0.55 | 0.08 | S-STACK cards |
| `ISLAND` | 0.50 | 0.10 | S-ISLAND pill/card |
| `INSERT` | 0.50 | 0.05 | S-INSERT visible rows |
| `DELETE` | 0.45 | 0.08 | S-DELETE siblings |
| `REORDER` | 0.45 | 0.10 | S-REORDER siblings and the release |
| `SHEET` | 0.45 | 0.08 | S-SHEET release |
| `BULK` | 0.40 | 0.10 | S-BULK shuffle |

**Author-layer tokens.** Presence and content fades use core timing curves with exact coefficients:
`EASE_OUT = cubic-bezier(0,0,0.58,1)`, `EASE_IN = cubic-bezier(0.42,0,1,1)`, `LINEAR`. A presence
record on a crossfade node must not name `opacity` (§5.8); the crossfade scenes use a no-op presence
(`present: { translateY: 0 }`, exit identity over 0.01 s, linear).

### 1.4 Time base and the manual clock

`createManualClock()` from `@freestylejs/ani-core/testing`; its `clock` is passed to the layout
group and to every presence/animation on the scene. Time starts at 1000 ms. `mc.frame(dt)` advances
by `dt` and runs exactly one frame; `mc.advance` is never used to deliver a frame. The scene may use
`mc.frame(dt)` with a scene-specific `dt`; the default is 16 ms, S-DELETE uses 10 ms, S-SHEET uses
16 ms/20 ms, S-ISLAND uses 10 ms, S-BULK uses 16 ms.

The commit is the pair `capture()` + `flush()` (vanilla `group.update(fn)`; React
`useLayoutGroup().update(fn)`), executed in a task **between** frames. A commit at wall time `T`
occurs after the frame at or before `T`; it reads that frame's presented state. The scene script
places every event at an exact multiple of its frame step.

The frame indices in the scene tables are:

- **Flush frame `f = 0`**: the commit's own write, `t = 0`. The first-frame continuity measurement
  is taken here, after the flush returns and before any `mc.frame`.
- **`f = 1`**: the first `mc.frame(dt)` after the commit. For a track **from rest**, this frame is
  forced to `dt = 0` (§4.5): the drawn box is still the track's `B`. For a track planned for a
  **moving** node (a retarget, a reversal, a release), this frame advances by `dt`.
- **`f = n`**: the `n`-th `mc.frame(dt)` after the commit, wall time `n·dt`.
- A from-rest track's oracle elapsed at frame `n` is `max(0, n−1)·dt`. A moving retarget's oracle
  elapsed at frame `n` is `(n − c)·dt`, where `c` is the commit frame. A release's first update has
  `dt = 0` (§5.10), so a released node's oracle elapsed at frame `n` is `max(0, n−1)·dt` for the
  post-release track.
- A commit "at 40 % of the flight" or "at 30 %" is placed at the first frame whose **oracle elapsed**
  reaches the stated fraction; the exact time is written in the scene table. The wall time and the
  oracle elapsed differ by one frame for from-rest tracks; the tables state both where it matters.

Every scene starts at rest (`mc.clock.size === 0`, `group.stats.tracks === 0`), with the manual
clock's pending frame count 0. No scene starts inside a rendering callback. The harness never calls
`capture()` or `update()` from a `requestAnimationFrame`/`ResizeObserver` callback (§4.1); all
commits begin in an ordinary task.

### 1.5 Participant registration and scoring keys

Every scored element is registered with the group (vanilla `group.add`; React `useLayout`) and
carries a stable `data-p` key. `data-p` is unique per element; it is not a `layoutId`. A shared id
uses `layoutId`; the harness records both. The harness scores every **connected registered
participant** on every frame, including nested participants and including participants whose own box
does not move (their expected box is their `A`).

A participant is not scored after it is removed from the DOM. Its removal frame is scored (the
first-frame continuity and the presence layer), then the key is retired. A participant that mounts
during a commit is scored from the commit's `t = 0`.

Each scene section lists its participants with: key, DOM parent, `layout` mode (`true`, `'position'`,
`'size'`), `layoutId` (if any), `radius`, the `B` box at the first commit, the `A` box after each
commit, and the motion. For list-like scenes the boxes are formulas with an index; the harness
evaluates them exactly. The channel column names `true` (origin and size animate), `'position'`
(origin animates, size pinned) or `'size'` (size animates, origin pinned). No scene in this set uses
`'size'`; it is exercised by the existing §11.2 rows. The scene page exposes a read-only
`window.__scene` descriptor with the index-to-box mapping so the harness and the oracle share the
**geometry data** but not the solver. The descriptor is data, not code; it is not used to compute a
trajectory.

### 1.6 The independent oracle: what it expects every frame

For each commit `c` and participant `p`:

1. **B** is the last presented visual box of `p` before the commit (the frame at or before the
   commit), in view space. It includes every authored `translate`/`scale`, presence `transform` and
   ancestor map. It is read by the harness, not by the engine.
2. **A** is the participant's rest visual box in the post-commit layout, in the same view space,
   with only the engine's last-written poses divided out. The harness obtains `A` from a
   **layout probe**: a fresh, engine-free render of the same post-commit state at the same scroll
   offset and device scale. The probe is data; it has no layout group and no animation.
3. **Motion** is the scene's declared motion for `p` (the table in the scene section), merged per
   §5.1. The oracle validates the merge and the parameters independently.
4. **Track**:
   - a node from rest: `A + (B − A)·(1 − e(τ)) + k·τ·(1−τ)²` for a timing motion, with `k = 0`
     at rest; for a spring, the §5.3 closed form with `v₀ = 0`;
   - a moving retarget/reversal/release: the same form with `v₀` = the analytic derivative of the
     previous oracle track at the commit instant; the first update has the §4.5/§5.10 `dt` rule;
   - a node whose `A` equals its `B` within 0.01 px and whose parent does not change its drawn box:
     no track; expected box `A`;
   - a node under a moving parent whose own layout box did not move: expected box `A`, drawn by
     counter-projection (§5.5). Its `A` is the probe box; it is constant for the run.
5. **Crossfade pair** (§5.8): when the lead changes and the previous lead is exiting, both layers
   draw at the **lead's** track. The lead's `B` is the departing lead's presented box, its `A` is
   the new lead's own rest box. Opacities are `L = from_L + (1−from_L)·circOut(min(1,p/0.5))` and
   `F = from_F·(1−clamp((p−0.5)/0.45,0,1))`, with `p` the lead's perceptual timeline (§5.3) and
   `from_L = 0`, `from_F = 1` for a new pair, or the current opacities for a reversal. Coverage is
   `1 − (1−L)(1−F) = 1`. Both layers draw the same `ρ(p)` radius.
6. **Presence layer** (§3.2/§11.1): an author `transform`/`opacity` on a node or ancestor that
   animates during the run is applied on top of the layout track; the expected rect is the track
   with the presence matrix applied about the element's origin. Presence records and curves are
   declared by the scene; the oracle evaluates the cubic bezier/linear curve independently.
7. **Held node** (§5.10): expected drawn origin = the take point + the supplied offset, in current
   view space; expected size = the layout size (or its size track). A descendant participant is
   expected at its own residual box plus the held node's inherited displacement `h(t)`; after
   release, `h` is the held node's origin track and each descendant's own residual is its track.
   The first release update has `dt = 0`.
8. **Culled/snapped node**: expected box `A` (no track); `report.snapped` and `onSnap` carry the
   authority's reason. A culled node is silent (no development warning) but is still a snapped node
   in the report (§9.1/§9.3); the strict reading is used (see A-14).
9. **Radius**: a participant with `radius` on draws the authored `A` corner radius at every frame,
   converted by `r·A_w/V_w`/`r·A_h/V_h`; a crossfade pair draws `ρ(p) = ρ_B + (ρ_A−ρ_B)·p` on both
   layers. The on-screen radius check is a scene visual assertion, not one of the seven §11.6 frame
   gates; it is reported and used by the scene's visual negative control.

The harness checks the drawn `getBoundingClientRect()` of every participant against the oracle on
every frame, every edge. It also checks the computed opacity of every presence/crossfade layer and
the on-screen radius where the scene declares one. The oracle's frame time is the manual clock's
frame time; the harness never reads between the engine's `update` and `commit` inside a frame.

### 1.7 Frame-scoring gates — exact values

The seven §11.6 frame-scoring rows are quoted verbatim below. They are decided per participant per
frame on the manual clock, in Chromium and WebKit; Firefox is advisory.

| ID | Metric | Gate | Measurement |
|---|---|---|---|
| **G1** | Oracle error: drawn rect against the §11.1 oracle | **≤ 0.05 px on every edge** | Every participant, every frame, all four edges; worst edge reported with frame/participant. |
| **G2** | First-frame continuity: the first frame after each change against the last presented frame | **≤ 0.05 px**; **≤ 0.5 px** for an aged capture in a React time slice | The commit's `t = 0` write, measured after the flush and before the next `mc.frame`; the aged allowance applies only when the diagnostic `capture-aged` is present. |
| **G3** | Velocity continuity: at each retarget, the presented edge velocity after against before | **≤ 1 % of the larger speed + 1 px/s** | At each retarget instant: the analytic edge velocity of the new scene track after vs the previous scene track before. The engine's actual continuity is additionally established by G1 at the retarget frame and the next frame; the harness reports the finite-difference velocity of the presented rects as supporting evidence (see A-11). |
| **G4** | Spring fidelity: the drawn edge against the independent spring oracle of §11.1 | **≤ 0.05 px** | Every spring track, every frame; a subset of G1 reported separately with the spring oracle. |
| **G5** | Settle exactness: after settle, the rect against the layout box, and the pose | **≤ 0.01 px**; **no pose declaration left** | Final frame: rect vs the probe `A`; inline `translate`/`scale` absent or the authored value; no `!important` layout declaration. |
| **G6** | Restoration: every owned inline declaration after settle | **byte for byte the authored one** | `translate`, `scale`, `border-radius`, `overflow-anchor` (when written) and the `inert` attribute, compared to the mount snapshot. |
| **G7** | Reports: `status` and `snapped` | **exactly as the scene script expects** | Every `flush()`/`update()` report; every `layoutRuntime` diagnostic; every `onSnap` call; the expected status/snapped set is in each scene table. |

The §11.5 cost gates that §11.6 references:

| ID | Metric | Gate | Measurement |
|---|---|---|---|
| **G8** | Real-clock frame | **script cost p95 within the §11.5 steady-frame gate (≤ 2 ms)**; **no long frame (script over 8 ms) after the commit frame** | Real-clock twin; per-frame `performance.now()` around the clock's `update`+`commit`; the commit frame is excluded from the long-frame rule. |
| **G9** | Real-clock commit | **≤ 2× the measured required-work floor**, at **1,000 participants**, unscrolled and scrolled by 1.5 viewports; **median of the 5 per-run ratios ≤ 2** | Engine and floor fixtures in the same process, same warm-up (5 discarded), 30 samples; floor audited against §4.1/§4.3; median of 5 fresh-process runs. |
| **G10** | Steady frame | **p95 ≤ 2 ms at 300 nested movers** | p95 of 600 frame samples. |
| **G11** | Sustained commits | **60 Hz commits with 300 moving participants, 5 s; p95 of every frame sample in the window ≤ 2 ms** | Real clock; 300 moving; commits at 60 Hz. |
| **G12** | Held frame | **≤ 0.1 ms per held element**, at **1 and 10 held** | p95 of 600 frame samples divided by the held count; held read allowed before writes. |
| **G13** | Exact reads | a commit reads **≤ 2N rects and 2N layout-size pairs**, plus the computed values of §4.1/§4.3; **steady frames read zero**; `stats` counts every read | `group.stats` delta per commit/frame; N = connected participants. Held frames add exactly one rect per held element. |
| **G14** | Fingerprint | Cost gates are **pinned**; a mismatch anywhere makes the cost result **advisory** and the report says so; frame gates still decide | §11.5 fingerprint: host, OS, CPU, cores, memory, Node, pnpm, Playwright, browser build directories, 1-minute load. |

**Aggregation.** One warm-up run is discarded; 5 runs are measured, each in a fresh browser process.
A gate's value is the median of the 5 per-run statistics (for G9, the median of the 5 per-run
engine/floor median ratios). Percentiles are nearest-rank. `g` is measured over 1,000 consecutive
`performance.now()` reads; if `g > 0.05 ms`, a frame sample is the mean of 20 consecutive frames
timed as one interval. A single run's pass is not a checkpoint pass; the final report must carry the
aggregate (see A-15).

**Which scene owns which gate.** Every scene is scored on G1–G8 and G13. G9 is reported at the
scene's own N and decided by S-BULK's 1,000-participant shape (A-12). G10, G11 and G12 are the
S-BULK cost shapes; G12 is also owned by S-REORDER and S-SHEET (one held element each). G14 is
recorded for every report. A scene's gate table lists the gates whose target it adds; the common
values are not reduced and no scene may drop a gate it owns.

### 1.8 The cost fixture and the required-work floor

For S-BULK (and for any scene whose commit ratio is reported), the harness builds the **same
participant DOM twice**: the engine fixture and the floor fixture. The floor fixture performs
exactly the reads of §4.1 item 1 (one rect and one `offsetWidth`/`offsetHeight` pair per
participant) and the writes of §4.3 steps 2 and 4 (the t = 0 pose write per engine node), in the
same order and count, with plain DOM calls and no engine state. It is measured immediately before or
after the engine fixture, in the same process, with the same warm-up, discard and sample count. The
run statistic is `median(engine commit) / median(floor commit)`.

The harness audits the floor's read and write counts against the authority **before it may use the
floor**: N rects and N layout-size pairs in capture, N rects and N pairs in flush, the computed
values actually required by §4.1/§4.3, and the pose writes. An over-counting or under-counting floor
is a harness failure, not a slower/faster engine. The engine fixture and the floor fixture must have
the same participant count and the same written properties.

The measured commit is `capture()` start to `flush()` return, around `group.update(fn)` (vanilla)
or `useLayoutGroup().update(fn)` (React). The real-clock frame measures the clock's `update` and
`commit` phases with `performance.now()`; the scorer's rect reads are not part of the measured
script. The manual-clock scoring run and the real-clock cost run are separate runs over the same
scene script.

**Commit gate applicability at fewer than 1,000 participants.** §11.5 defines G9 at 1,000
participants. For a scene with N < 1,000, the harness reports the same engine/floor ratio at its own
N as evidence, and also runs the 1,000-participant shape of S-BULK; the named G9 gate is decided by
the 1,000-participant shape. This is the strict reading of "Per commit, the §11.5 commit gate"
(§11.6) together with §11.5's fixed 1,000-participant shape; see A-12.

### 1.9 Real-clock twin

Each scene is replayed on the real clock with the same DOM, the same state transitions and the same
relative event times (the manual clock's `dt` becomes the real elapsed time; the script schedules the
next event from the previous event's timestamp, not from a timer that can drift). The real-clock
twin measures G8 and, where the scene owns the §11.5 shape, G9–G13. It does **not** score frames
against the oracle; the manual-clock run does. The real-clock twin uses a fresh page and browser
process; no manual-clock subscriber exists.

The twin's commit frame is the frame in which the commit's first pose is painted. The long-frame
rule excludes that frame and fails on any later frame whose script exceeds 8 ms. A scene with a
one-frame commit spike is allowed by the authority; a scene with a sustained post-commit spike is
not.

### 1.10 Reduced-motion variants

The primary scene sets `reducedMotion: 'ignore'` on its group so the motion path is exercised; the
clock's reduced-motion preference is false. Each scene is also run with:

1. `reducedMotion: 'jump'` (the §7.1 default): no tracks; the target `A` immediately; active tracks
   finish at once; no clock subscription; the report is `'reduced'` when no track ran; styles and
   `inert` restored. A crossfade finished by `'jump'` ends as a completed fade: the lead gets its
   opacity back, the exiting follower is held at opacity 0 and inert until presence unmounts it
   (§9.4).
2. `reducedMotion: { maxDuration: 0.2 }`: the §9.4 grid search (timing: delay and duration scaled;
   spring: bounce clamped to ≤0; the largest factor from `{1,0.85,0.7,0.55,0.4,0.3,0.2,0.1}` whose
   `delay·f + T_s(D·f, x₀, v₀) ≤ 0.2`, exact evaluation; at most 16 evaluations). The oracle
   re-derives the chosen factor and the resulting track. The scene's presence/author layers are set
   to zero duration in this variant so the variant is a clean layout-only reduced path.
3. The kill-switch variant (P3 `layoutRuntime.setMode('snap')`) is run on S-CARD and S-REORDER only:
   live tracks finish at identity, holds invalidate, the report is `'disabled'`, styles restore
   byte-identically. The other scenes rely on L-OPS-1 for the engine behavior.

A held phase is never ended by a policy change; S-REORDER and S-SHEET hold through the policy
toggle and apply the policy at release (§5.10). `'jump'` lands at `A` with no motion;
`{maxDuration}` clamps; `'ignore'` plays the full release. This is the scene's primary reduced
variant for the two P4 scenes.

### 1.11 Reports, diagnostics and degradation

Each commit's report is collected. The scene tables give the expected `status` and `snapped` set for
every commit. The harness also subscribes to `layoutRuntime.onDiagnostic` for the whole run and
fails on an unexpected code, an unexpected count, or a missing expected code. Expected diagnostics
in the primary runs are **none** except where a scene explicitly declares a normal degradation
(S-INSERT's culled new rows). A development warning for `'unsupported'`, `'capped'` or `'stale'` is a
failure in every primary scene.

`status` precedence is §9.3: `'failed'`, `'disposed'`, `'disabled'`, `'capped'`, `'interrupted'`,
`'ended'`, `'reduced'`, `'stale'`, `'no-change'`. A mixed run resolves by its tracks and lists the
snapped nodes. A run whose track is replaced by a later flush resolves `'interrupted'` at that
moment; its untouched tracks keep running. The scene tables use this rule; the overlapping-run
statuses are marked in the ambiguity register (A-13).

### 1.12 Restoration, teardown, freshness

At mount, the harness records for every participant: the full inline `style` attribute, the authored
`translate`, `scale`, `border-radius` and `overflow-anchor` declarations (including the
`!important` priority), and the `inert` attribute (present/absent and value). At the final settle it
compares the owned declarations byte for byte. A participant removed during the run is checked at
its last connected frame and, for a crossfade follower, at its re-entry (S-CARD's reversal is the
restoration proof for the follower's `inert`).

At the end of a scene:

- every report has resolved; `group.stats.tracks === 0` and `holds === 0`; the manual clock's
  `pending === 0` and `clock.size === 0`;
- every owned declaration and `inert` attribute is restored; every presence release hold is
  released; every WAAPI animation (none in these scenes) is cancelled;
- `layoutRuntime.setMode('animate')` is restored; the reduced-motion preference and the group
  options are restored;
- the React root is unmounted, the stage is removed, and the page is left with no children, no
  scroll listeners, no frame marker and no timer; the next run uses a fresh browser process and a
  fresh page.

The harness asserts freshness before the first capture of every run: no previous scene's DOM,
scroll offset, inline style or diagnostic listener survives.

### 1.13 Scene-to-engine-row map

The "engine rows" are the §11.2 acceptance rows whose behavior the scene depends on. They are not a
substitute for the §11.6 gates; they are the existing evidence the scene must not contradict.

| Scene | Level | API | Primary §11.2 rows | Cost shapes owned |
|---|---|---|---|---|
| S-CARD | P2 | vanilla | E4; L-HAND-1; L-SPRING-2; L-MEAS-7; L-MEAS-9; L-A11Y-1 | per-frame, per-commit at N=7 (reported); no §11.5 shape |
| S-PHOTO | P2 | vanilla | E3; L-HAND-1; L-MEAS-4; L-MEAS-7; L-SPRING-1 | per-frame, per-commit at N=301 (reported) |
| S-SEG | P2 | vanilla | L-SPRING-1; L-SPRING-3; L-SPRING-4 (reduced variants) | per-frame, per-commit at N=1 (reported) |
| S-ACC | P2 | React | E5; L-MEAS-2; L-MEAS-3; L-MEAS-4; L-MEAS-7; L-SPRING-1; L-MEAS-5 (React) | per-frame, per-commit at N=43 (reported) |
| S-STACK | P2 | vanilla | E5; L-SPRING-2 (presence release); L-MEAS-9; L-A11Y-1 (presence) | per-frame, per-commit at N=12 (reported) |
| S-ISLAND | P2 | vanilla | L-HAND-1; L-SPRING-2; L-MEAS-9; L-SPRING-3 | per-frame, per-commit at N=4 (reported) |
| S-INSERT | P2 | React | E5; L-MEAS-1; L-MEAS-14(a/b); L-MEAS-5; L-SPRING-2 | per-frame, per-commit at N=16 (reported) |
| S-DELETE | P2 | React | E5; L-MEAS-1; L-MEAS-14(c); L-MEAS-5; L-SPRING-2; L-A11Y-1 | per-frame, per-commit at N=9 (reported) |
| S-REORDER | P4 | vanilla | L-DRIVE-1; L-DRIVE-2; L-DRIVE-6; L-DRIVE-4; L-A11Y-1 | per-frame, per-commit at N=14; **G12** (1 held) |
| S-SHEET | P4 | vanilla | L-DRIVE-1; L-DRIVE-3; L-DRIVE-5; L-MEAS-8; L-DRIVE-4 | per-frame, per-commit at N=1; **G12** (1 held) |
| S-BULK | P2 (+P4 for held) | vanilla | L-SPRING-1; L-MEAS-11; L-MEAS-14(a/b); L-DRIVE-4 (held) | **G9, G10, G11, G12, G13**; 1,000 participants; unscrolled and scrolled 1.5 viewports |

### 1.14 Negative-control rule

Every scene has at least one deliberately broken variant that must fail a named gate without
changing any gate value. The broken variant is built by the harness, not by weakening the engine;
the gate is the same. The scene section names the mutation and the metric it must fail. In addition,
the harness has one negative control per **metric** (a 0.1 px offset, a velocity jump, a leftover
declaration, a wrong status, a wrong stale/culled set, a floor with an extra read), per the P5
brief. A harness that cannot fail is a harness failure.

---

## 2. Scene specifications

Each scene has the same eight parts: (1) iOS reference and user-visible intent; (2) geometry, DOM,
participants and channels; (3) visual-quality spec; (4) motion spec; (5) scripted sequence and the
oracle's expectation; (6) gates and scene-specific expected values; (7) negative control; (8)
public-API feasibility and P4 dependency. No scene is claimed to pass.

Scene index:

| Scene | Level | API | Participants (primary) | Movers | Motion | Sequence in one line |
|---|---|---|---|---|---|---|
| S-CARD | P2 | vanilla | 7 | 6 | `CARD` D 0.55 b 0.05 | open, close, reverse at 40 % of the close |
| S-PHOTO | P2 | vanilla | 301 | 2 | `PHOTO` D 0.45 b 0 | open/back in a 300-cell grid at 1.5 viewport scroll |
| S-SEG | P2 | vanilla | 1 | 1 | `SEG` D 0.35 b 0.12 | four taps 80 ms apart, 1→2→3→0 |
| S-ACC | P2 | React | 43 | 34 | `ACC` D 0.50 b 0.06 | row 2, row 6 mid-flight, row 2 collapses |
| S-STACK | P2 | vanilla | 12 | 12 | `STACK` D 0.55 b 0.08 | 6-card fan-out, badge presence, collapse |
| S-ISLAND | P2 | vanilla | 4 | 2 | `ISLAND` D 0.50 b 0.10 | pill→card, radius 18.5→40, reverse at 30 % |
| S-INSERT | P2 | React | 16 | 13 + 3 presence | `INSERT` D 0.50 b 0.05 | 3 rows enter at the top while scrolled 1.5 viewports |
| S-DELETE | P2 | React | 9 | 6 + 2 presence | `DELETE` D 0.45 b 0.08 | delete, then a second delete 100 ms later |
| S-REORDER | P4 | vanilla | 14 | 14 | `REORDER` D 0.45 b 0.10 | drag 3 slots, release 900 px/s |
| S-SHEET | P4 | vanilla | 1 | 1 | `SHEET` D 0.45 b 0.08 | medium→large, then flick to dismiss |
| S-BULK | P2 (+P4 held) | vanilla | 1,000 | 300 | `BULK` D 0.40 b 0.10 | 150-tile shuffle; §11.5 cost shapes |

### 2.1 S-CARD — App Store Today card (vanilla, P2)

**1. iOS reference and intent.** The Today card expands into a full-screen story sheet: the card's
surface, hero image and title move as one continuous object, the corner radius relaxes from 20 px to
0, and the content is revealed rather than scaled. Closing reverses the flight; a second tap during
the close re-opens the story while the surface is still moving. This is the canonical shared-element
morph: one `layoutId` pair for the surface, one for the image, one for the title, all nested.

**2. Geometry, DOM, participants, channels.**

Viewport 390 × 844, DPR 2, page `#F2F2F7`. Chrome: status bar 0–47; large-title header "Today" at
`y = 117` (34/41, 700); date "MONDAY, OCTOBER 28" at `y = 99` (13/18, 600, secondary, uppercase,
tracking +0.8 px). The feed below has the hero card at `C0 = (16, 176, 358, 440)` and two
non-participant cards at `(16, 632, 358, 180)` and `(16, 828, 358, 180)` (the second is clipped by the
viewport). The sheet is `D1 = (0, 0, 390, 844)`.

DOM (simplified; every participant is a direct child of the stage or of a pair surface):

- stage
  - status/header/feed (non-participants)
  - `button[data-p="card"]` — feed card, `layoutId="today-card"`, `radius: true`, `layout: true`;
    contains `img[data-p="card-image"]` (`layoutId="today-image"`, `layout: true`, `radius:
    false`) and `div[data-p="card-title"]` (`layoutId="today-title"`, `layout: 'position'`,
    `radius: false`).
  - `div[data-p="sheet"]` — sheet, `layoutId="today-card"`, `radius: true`, `layout: true`;
    contains `img[data-p="sheet-image"]` (`layoutId="today-image"`, `layout: true`, `radius:
    false`), `div[data-p="sheet-title"]` (`layoutId="today-title"`, `layout: 'position'`,
    `radius: false`), and `div[data-p="sheet-content"]` (`layout: 'position'`, `radius: false`)
    with the non-participant subtitle/body/read-more and close button.

The card and sheet are two nodes with the **same** `layoutId`; the image and the title are two
nested pairs with their own ids. At any instant at most one layer of each pair is the lead and at
most one is the follower (§5.8). The pair surfaces are `overflow: hidden`, so the image and title are
clipped by the surface's current silhouette. In the participant table below, the `A` column of a
pair is the **lead's** target box; both layers draw the lead's track while the pair is crossfading.
The follower's own rest box (the feed card's feed slot, or the sheet's full-screen slot) is not
drawn while it is a follower; it is used only if the follower becomes the lead again (the reversal).

Participant table (B = the first commit's before box; A = the open target; the close swaps them):

| Key | Pair id | Mode | Radius | B (open) | A (open) | Notes |
|---|---|---|---|---|---|---|
| `card` | `today-card` | true | 20 | `C0` | `D1` | follower on open; inert; `HOLD` presence |
| `sheet` | `today-card` | true | 0 | `C0` (handoff) | `D1` | lead on open; `HOLD` presence |
| `card-image` | `today-image` | true | false | `I0 = (16,176,358,300)` | `I1 = (0,0,390,500)` | nested pair; follower/lead as the surface |
| `sheet-image` | `today-image` | true | false | `I0` (handoff) | `I1` | nested pair |
| `card-title` | `today-title` | position | false | `T0 = (36,492,300,56)` | `T1 = (20,528,300,56)` | two lines; glyph size pinned |
| `sheet-title` | `today-title` | position | false | `T0` (handoff) | `T1` | two lines; same computed font |
| `sheet-content` | — | position | false | — (new; no track) | `(0, 0, 390, 844)` | author opacity/visibility gate; children are non-participants |

N = 7 while open (3 per layer + the sheet-content wrapper). The two extra feed cards are
non-participants. `maxNodes` default 300; `maxParticipants` default 2,000; `threshold` 1 px;
`retain` 1 s (the reversal is within 1 s). `layoutId` turns radius on for the surface pair;
`radius: false` opts the image, title and content wrapper out, so the only radius reads are the two
surfaces. No `layoutAnchor`, no `layoutKey`.

**3. Visual-quality spec.**

- Card: `#FFFFFF`, radius 20, shadow `0 8px 30px rgba(0,0,0,0.12)`; sheet: `#FFFFFF`, radius 0,
  shadow `0 20px 60px rgba(0,0,0,0.25)`. The sheet is the same surface, not a new white rectangle:
  both layers are opaque `#FFFFFF`, so source-over coverage of the pair is 1 at every frame.
- Image: the 4:3 SVG source, `object-fit: cover`, `object-position: 50% 40%` in the card and
  `50% 35%` in the sheet; the image participant's box changes aspect 358×300 (1.193) → 390×500
  (0.78), so the visible crop changes but the image never distorts. The image is clipped by the
  surface; no inner transform.
- Title: the two-line string "The new wave of indie games", 22/28, 700, `#000`, tracking +0.35 px,
  `-webkit-font-smoothing: antialiased`. The box is 300×56 in both states; `layout: 'position'`
  pins the size and the glyphs are never scaled. The feed card is a `<button>`: it resets
  `font: inherit; letter-spacing: inherit; word-spacing: inherit; text-transform: inherit;` so the
  title's computed font is identical in the button and the div (the E4 J-033 lesson). The harness
  records the title's computed font string on both layers and requires equality.
- Sheet content: the secondary content (subtitle at `(20, 596, 350, 44)` 15/20 secondary; body at
  `(20, 652, 350, 96)` 15/20 `rgba(60,60,67,0.60)`; a "Read more" button at `(20, 768, 160, 44)`
  blue `#007AFF` 17/22 600; the close button at `(342, 56, 32, 32)`, circle
  `rgba(118,118,128,0.16)`, 14 px × 14 px X of 2 px strokes `#3C3C43`) lives inside one
  `sheet-content` **position participant** whose box is `(0, 0, 390, 844)`. Its own pose
  counter-projects the sheet's non-uniform scale, so the children keep their authored size; the
  sheet's `overflow: hidden` reveals them as the sheet grows. The participant's author
  opacity/visibility is 0 until the sheet's perceptual progress reaches 0.5, then fades to 1 over
  0.15 s; the close is not focusable while hidden. The children are non-participants; the
  participant's own box is scored, so the content can never be stretched by the surface's pose.
- Background: the feed behind the pair stays visible at the edges during the card state and is
  covered by the sheet at the end. z-order: feed 0, pair 10, sheet content 11, close 12, status 20.
  The follower and the lead are both z 10; the lead is later in DOM order and paints above the
  follower, so the source-over composite is correct.
- No text is scaled during the run: the title and the `sheet-content` wrapper are position
  participants; the subtitle/body/close are children of the wrapper at the wrapper's authored size.
  The surface's shadow is the only element that grows; both layers' shadows are drawn during the
  crossfade, which is accepted as a soft edge, not a geometry error.

**4. Motion spec.** `CARD` spring: `type: 'spring'`, `duration: 0.55`, `bounce: 0.05`, delay 0,
`transform-origin: 50% 50%` on both surfaces and on the image/title. The pair's timeline is the lead
surface's spring. Radius blend: `ρ(p) = 20 + (0 − 20)·p` on the pair's perceptual `p`; both layers
convert `ρ` by their own `A_w/V_w`, `A_h/V_h`, so their on-screen silhouettes are identical. The
surface's `layout: true` animates origin and size; the title's `layout: 'position'` animates origin
only; the image's `layout: true` animates both; the `sheet-content` wrapper is `layout: 'position'`
and has no layout track beyond its `A` (its opacity/visibility is an author timeline, not layout).
The `HOLD` presence (no opacity, no transform) is
required so presence does not hand off without a crossfade. The follower is `inert` from the first
crossfade frame and restored byte-identically on reversal. The author's opacity is never touched by
presence; the crossfade owns it.

Focus: before every presence flip the script focuses the always-mounted header button "Today" (a
real `<button>` in the nav) so the follower never contains `document.activeElement`; the sheet's
close button remains reachable by Tab. This avoids `focus-in-follower`, which would skip the
crossfade (§8). The harness checks `document.activeElement` and the diagnostic stream.

Reduced motion: `'jump'` lands at the target with no track; the crossfade ends as a completed fade
(lead opacity 1, follower 0 and inert until presence unmounts); `{maxDuration: 0.2}` uses the §9.4
spring clamp; `'ignore'` is the primary.

**5. Script and oracle.**

| Frame / time | Action | Expected report | Oracle expectation |
|---|---|---|---|
| rest | feed card at `C0`; image `I0`; title `T0` | — | three participants at `A`; no tracks |
| `f = 0` | tap the card; focus header; commit open | `'ended'` at the open settle | The sheet/image/title/sheet-content mount with `B = C0/I0/T0` for the pairs; the sheet-content has no track (`A = (0,0,390,844)`, opacity 0); the card/image/title exit as followers. Crossfade pair: both layers at the lead track; `L(0)=0`, `F(0)=1`, coverage 1; radius `ρ(0)=20`. G2 on the six pair layers; the content wrapper is at its `A`. |
| `f = 1 …` | frames of `dt = 16` ms until the pair settles | — | Every layer of each pair draws the lead's spring track; the opacity/radius follow `p`; the title's box is `T0→T1` in view space with pinned size; the image's box is `I0→I1`; the sheet-content wrapper is at `A` and fades in from p = 0.5; G1/G3/G4 every frame. |
| settle | open settles (D 0.55, b 0.05; the oracle computes the exact `T_s`, about 0.9 s) | `'ended'` | The card follower unmounts; the sheet/image/title/sheet-content are leads; styles restored; G5/G6 on the sheet and the content wrapper. |
| `f = 0` (close) | focus header; tap close; commit close | `'ended'` at the close settle, unless interrupted | The sheet/image/title/sheet-content exit; the card/image/title mount as new leads with `B = D1/I1/T1`, `A = C0/I0/T0`; `L(0)=0`, `F(0)=1`; radius `ρ(0)=0` (the departing sheet's on-screen radius is 0); both layers at the close lead's track. |
| close frame 15 (elapsed 224 ms = 40.7 % of D) | focus header; tap close again; commit reverse | close run `'interrupted'`; reverse run `'ended'` at settle | The sheet/image/title/sheet-content re-enter as the followers and become the new leads; the card/image/title exit. The new lead `B` is the current common box at 224 ms; `A = D1/I1/T1`; the opacities are the current `L`/`F` (not reset); the radius blend continues from the current `ρ` to 0. Coverage never decreases. G2/G3 at the reverse; G1 every frame. |
| reverse settle | — | `'ended'` | The card follower is inert and unmounts; the sheet is the final lead; styles and `inert` restored; final state open. |

The "40 %" is the close's perceptual flight; the script uses the first frame at or after 40 %:
frame 15 of a 16 ms step is elapsed 224 ms, 40.7 % of 0.55 s. The open and close are separated by
the open's physical settle; the close starts on the first task after `tracks === 0`. The reverse
starts at 224 ms, inside the 1 s retain window.

Every frame, each of the seven connected participants is checked against its pair's lead track (or
its `A` if its own track is identity). The harness also checks coverage `1 ± 1e-5`, the two layers'
on-screen radius difference ≤ 0.03 px, and the title's computed font equality across layers.

**6. Gates.**

| Gate | Value | Scene target |
|---|---|---|
| G1 | ≤ 0.05 px every edge | 7 participants × every frame; worst edge reported |
| G2 | ≤ 0.05 px; aged React ≤ 0.5 px | commits: open, close, reverse; the six pair layers; the primary path must be fresh (no `capture-aged`) |
| G3 | ≤ 1 % larger speed + 1 px/s | the reverse retarget only; the open and close are from rest |
| G4 | ≤ 0.05 px | the surface/image/title pair tracks (3 on open, 3 on close/reverse); the content wrapper has no track |
| G5 | ≤ 0.01 px; no pose | sheet and content wrapper at open settle; sheet at final settle |
| G6 | byte for byte | `translate`/`scale`/`border-radius`/`overflow-anchor`/`inert`; the reversal restores the follower's `inert` |
| G7 | exact status/snapped | `ended`, `interrupted`, `ended`; snapped `[]`; diagnostics none; `onSnap` none |
| G8 | p95 ≤ 2 ms; no >8 ms after commit | 7 participants, 6 layout movers; measured |
| G9 | ≤ 2× floor | N = 7 reported; the named gate is S-BULK's 1,000 shape (A-12) |
| G10–G12 | not owned | report only if the harness runs the S-BULK shapes in the same process |
| G13 | exact reads | capture 7 rects + 7 pairs; flush 7 + 7; 2 radius reads per capture (two surfaces); the harness audits the exact count from §4.1/§4.3 |
| G14 | fingerprint | cost result advisory if mismatched |

**7. Negative control.** Remove the image pair's shared id (make the sheet image a fresh
**participant** with no `layoutId` at `I1`). At the open commit the image is at its `A` (the full
sheet crop) instead of `I0`; G1 fails on the sheet image at `f = 0` (the expected box is `I0`, the
actual is `I1`). A second control removes `inert` from the follower; G6/the
`focus-in-follower`/inert check fails at the first crossfade frame.

**8. Feasibility / P4.** Vanilla `createLayoutGroup({ clock, motion: CARD, reducedMotion: 'ignore',
retain: 1 })`; `group.add` on the seven participants; `group.update` around each DOM mutation (the
sheet append/remove and the focus move). `AnimatePresence` is not available in vanilla; the scene
uses `createPresence` with `HOLD` for the card/sheet and the nested image/title pairs, with the same
manual clock. The `sheet-content` wrapper is a position participant; its opacity/visibility is
author-owned. The crossfade is entirely §5.8. No P4 dependency. The only P3 dependency is the report
status and diagnostics stream (G7); the geometry is P2.

### 2.2 S-PHOTO — Photos grid to detail (vanilla, P2)

**1. iOS reference and intent.** A thumbnail in a 300-item Photos grid opens into the aspect-fit
detail: the square cell grows into a 4:3 photo frame, the frame's aspect changes while the image
inside is counter-scaled so the photo is never stretched, and the visible crop zooms out from the
cell's center crop to the full 4:3 image. Back returns to the same cell while the grid is scrolled
1.5 viewports. The scene is the scroll + nested counter-scale + shared-handoff case.

**2. Geometry, DOM, participants, channels.**

Viewport 390 × 844, DPR 2. Grid page `#FFFFFF`; nav 47–91 "Library" 17/22 600 centered, "Select"
17/22 `#007AFF` at the right; scroll container `(0, 91, 390, 718)`; 3 columns, gap 2 px, cell
`128.6667 × 128.6667` (100 rows, content 13,064.7 px). `scrollTop = 1077` (1.5 × 718) is set in a
separate task before the open; the harness awaits `scrollend` so the scroller is not active. The
selected cell is index 37 (row 12, col 1): content top 1568, view top 582, `x = 130.6667`; its
square frame `F0 = (130.6667, 582, 128.6667, 128.6667)`. The 4:3 image inside the square cell is
`I0 = (109.22, 582, 171.56, 128.6667)` (centered, clipped by the square). The detail overlay is
`(0, 0, 390, 844)`, `#000`; the aspect-fit frame is `F1 = (0, 275.75, 390, 292.5)` (4:3 centered:
`(844−292.5)/2`), and the image `I1 = F1`.

DOM: the grid is 300 `div[data-p="cell-N"]` frames (`layout: true`, `radius: false`, no id except
the selected `cell-37`, which has `layoutId="photo-37-frame"`); only cell 37 contains an
`img[data-p="cell-37-image"]` (`layoutId="photo-37-img"`, `layout: true`, `radius: false`). The
detail contains `div[data-p="detail-frame"]` (`layoutId="photo-37-frame"`, `layout: true`,
`radius: false`) and `img[data-p="detail-image"]` (`layoutId="photo-37-img"`, `layout: true`,
`radius: false`). The detail frame is `overflow: hidden`; the image is the 4:3 source and is clipped
by the frame at the cell state.

Participant table:

| Key | Pair id | Mode | B | A | Notes |
|---|---|---|---|---|---|
| `cell-N` (299 static) | — | true | cell box | same | no track; expected `A` every frame |
| `cell-37` | `photo-37-frame` | true | `F0` | `F1` | handoff out of the grid; square → 4:3 |
| `cell-37-image` | `photo-37-img` | true | `I0` | `I1` | nested; 4:3 at both ends; counter-scaled under the frame |
| `detail-frame` | `photo-37-frame` | true | `F0` (handoff) | `F1` | lead on open |
| `detail-image` | `photo-37-img` | true | `I0` (handoff) | `I1` | nested; uniform scale 2.273 |

N = 301 (300 cell frames + one image). On open, the selected `cell-37` and its image leave the
scope; the detail frame/image enter with the same ids and take the departing presented boxes as
`B`. On back the direction reverses. The 299 static cells have no track; they are still registered
and captured (the 300-item grid is real). `maxNodes` 300 (movers ≤ 2); `maxParticipants` 2,000;
`radius: false` on all photo nodes (no radius read); no crossfade (the frames are opaque and the
handoff covers the cell exactly at `t = 0`).

Scroll/shadow: the scroller is `overflow-y: auto; scrollbar-width: none; overscroll-behavior:
contain;` and has a real 13,064.7 px content height. The cell 37 placeholder after the open is a
non-participant `#E5E5EA` square; the detail overlay covers the grid. The overlay's black background
is a non-participant with its own opacity timeline (below); it does not clip the frame.

**3. Visual-quality spec.**

- Grid: 3 columns, 2 px gaps, no cell radius; the selected cell's image is `object-fit: cover`
  centered, so the visible crop is the center 75 % width of the 4:3 source. The cell background
  `#E5E5EA`; the image source is the 1600×1200 SVG.
- Detail: `#000` background; the 4:3 photo at `(0, 275.75, 390, 292.5)`; no radius; top bar with
  a white back chevron at `(16, 56, 44, 44)`, "37 of 300" 13/18 white 60 % centered at `y = 62`,
  share/heart at the right; bottom metadata "Photo 37" 17/22 600 white at `(16, 600)`, "Today
  9:41" 13/18 white 60 % at `(16, 626)`; a 50 px toolbar at the bottom. All chrome is
  non-participant. The detail chrome is above the image; the image is above the overlay.
- Image aspect/counter-scale: the frame's box changes 1:1 → 4:3 (non-uniform scale 3.03 × 2.27);
  the image's box stays 4:3 and changes only by a uniform 2.273. The frame's `overflow: hidden`
  clips the image; at `t = 0` the image is 171.56 wide inside a 128.6667 frame, i.e. the center 75 %
  crop; at `t = 1` the image and frame coincide. This is the nested counter-scale: the image's own
  tracked box is uniform while the parent's pose is non-uniform. No `object-fit` is used on the
  detail image (the box is already 4:3); `width: 100%; height: 100%; display: block`.
- z-order: grid 0, overlay 5, frame/image 10, top/bottom chrome 20. The overlay opacity is 0 at
  open start, 1 by 0.25 s (EASE_OUT), and back to 0 over 0.2 s (EASE_IN) on close; the frame/image
  are not affected by the overlay opacity.
- The status bar style switches from dark (grid) to light (detail) at the open commit; it is an
  author style, not a participant.

**4. Motion spec.** `PHOTO` spring D 0.45, b 0.00, delay 0, `transform-origin: 50% 50%` on the
frame and image. The frame and image are both `layout: true`. The image's incoming velocity at the
back is its analytic 4:3 scale velocity; the frame's is its non-uniform velocity. No crossfade, no
radius, no presence on the frame/image. The detail overlay's opacity and the chrome fades are author
timelines on the same clock; they are not scored. Reduced motion: `'jump'` lands at `F1`/`I1`; the
overlay jumps to 1; `{maxDuration: 0.2}` clamps the spring; `'ignore'` primary.

**5. Script and oracle.**

| Frame / time | Action | Expected report | Oracle expectation |
|---|---|---|---|
| setup | set `scrollTop = 1077`; await `scroll` and `scrollend`; settle | — | 300 cell frames at their `scrollTop` boxes; cell 37 `F0`, image `I0`; no tracks |
| `f = 0` | tap cell 37; focus the detail back button after mount; commit open | `'ended'` at the spring settle | `cell-37` leaves the scope; `detail-frame` enters with `B = F0`, `A = F1`; `cell-37-image` leaves; `detail-image` enters with `B = I0`, `A = I1`. The image's `A` is 4:3; the frame's `A` is 4:3. G2 on both; the 299 static cells are at their `A`. |
| `f = 1 …` | 16 ms frames until settle | — | The frame's box interpolates non-uniformly `F0→F1`; the image's box interpolates uniformly `I0→I1` with the same spring; the image is clipped by the frame; G1/G4 every frame. The 299 cells are constant. |
| settle + 0.5 s | tap back; focus cell 37 (a button) before the commit; commit back | `'ended'` | `detail-frame`/`detail-image` leave; `cell-37`/image enter with `B = F1`/`I1`, `A = F0`/`I0`; the overlay fades out. G2 at the back; G1 every frame. |
| settle | — | `'ended'` | The grid cell and image are at `F0`/`I0`; the placeholder is removed; styles restored; final state the scrolled grid. |

The scroller is at the same `scrollTop = 1077` at the back; it is not scrolled during the flight.
The back's departing node (the detail) is outside the scroller and the new lead (cell 37) is inside;
the active-scroller rule of §5.8 does not apply to this direction. The open's departing node is
inside the scroller and the new lead outside; the scroller must be inactive (scrollend) or the
handoff degrades to `enter` with `handoff-scroll-active`. The harness asserts `scrollend` before the
open and records the scroll offset before/after every commit; the offset must not change.

Every frame: the 299 static cells at `A`; the selected pair at its own track; the image's track is
uniform and the frame's is not; the image's four edges are inside the frame's clip at `t > 0` (the
visual check), but the frame's box is the authority for G1.

**6. Gates.**

| Gate | Value | Scene target |
|---|---|---|
| G1 | ≤ 0.05 px every edge | 301 participants × every frame; the image's own uniform track is the critical row |
| G2 | ≤ 0.05 px; aged React ≤ 0.5 px | open and back; no aged capture (vanilla) |
| G3 | ≤ 1 % larger speed + 1 px/s | n/a: the open and back both start from rest (a moving-back variant would test the retarget) |
| G4 | ≤ 0.05 px | frame and image spring tracks |
| G5 | ≤ 0.01 px; no pose | grid at the back settle; detail frame/image at the open settle |
| G6 | byte for byte | `translate`/`scale`/`overflow-anchor`; no radius; no `inert` |
| G7 | exact | open `'ended'`, back `'ended'`; snapped `[]`; diagnostics none; `onSnap` none; no `handoff-scroll-active` |
| G8 | p95 ≤ 2 ms; no >8 ms after commit | 2 movers, 301 participants; measured |
| G9 | ≤ 2× floor | N = 301 reported; the named gate is S-BULK's 1,000 shape (A-12) |
| G13 | exact reads | capture 301 rects + 301 pairs; flush 301 + 301; no radius reads (`radius: false` on all 301); the image/frame active computed values only |
| G14 | fingerprint | advisory on mismatch |

**7. Negative control.** Open while the scroller is still active (set `scrollTop` and commit in the
same task without `scrollend`). The expected behavior is `handoff-scroll-active` and a presence
enter at `A`; the primary scene expects no diagnostic and a handoff from `F0`. The broken variant
must fail G2 (the detail appears at `F1`, not `F0`) and G7 (unexpected diagnostic/enter). A second
control removes the image's counter-scale (the image gets `width:100%; height:100%` inside the
frame, so its box is the frame's non-uniform box): G1 fails on the image at the first open frame
(the expected 4:3 box vs the square frame's box).

**8. Feasibility / P4.** Vanilla group; `group.update` around the open/back DOM swaps; `createPresence`
is not needed on the frame/image (opaque handoff), only on the overlay's author fade (core `ani`).
The scroller is a normal document element; the harness sets `scrollTop`, awaits `scrollend`, and
records it. No P4. P3 supplies G7's diagnostics/reports. The 300 static cells are registered but
have no tracks; the capture cost is 301 rects. The scene uses `layoutId` handoff without crossfade;
the retained-box/retain window is not needed because the departing lead is in the flush's capture.

### 2.3 S-SEG — Segmented control (vanilla, P2)

**1. iOS reference and intent.** The white selection pill slides under the four labels. Four taps
80 ms apart retarget the running spring each time, so the pill never restarts from rest and never
loses velocity. This is the smallest possible retarget/velocity-continuity scene.

**2. Geometry, DOM, participants, channels.**

Viewport 390 × 844, page `#F2F2F7`. Nav "Controls" 34/41 700 at `(16, 100)`. The segmented control
is at `(16, 160, 358, 32)`, radius 9, fill `rgba(118,118,128,0.12)`, padding 2. The inner track is
`(18, 162, 354, 28)`; four segments each `88.5 × 28` at `x = 18 + 88.5·i`; labels 13/18 600, selected
`#000`, unselected `rgba(60,60,67,0.60)`; the labels are static buttons (non-participants) with
`touch-action: manipulation`. The pill is `(19 + 88.5·i, 163, 86.5, 26)`, radius 7, `#FFFFFF`, the
pill shadow, `z-index: 1`; labels `z-index: 2`.

DOM: `div[role="tablist"]` with four `button[role="tab"]` and one `div[data-p="pill"]`
(`layoutId="seg-pill"`, `layout: true`, `radius: true`, `motion: SEG`). The pill is the only
participant. The buttons update a `selected` index and call `group.update`; the pill's `A` is the
selected segment's pill box.

| Key | Pair id | Mode | B (i = 0) | A (i = 1/2/3/0) | Notes |
|---|---|---|---|---|---|
| `pill` | `seg-pill` | true | `(19, 163, 86.5, 26)` | `(19+88.5i, 163, 86.5, 26)` | size constant; origin x only; y constant |

N = 1. `layoutId` turns radius on; radius 7; no blend (single node, no handoff). `maxNodes` 300;
`maxParticipants` 2,000; `threshold` 1 px (each move is 88.5 px). **Nested participants: none** —
the pill is the only participant; the four labels are static author DOM.

**3. Visual-quality spec.** Track fill `rgba(118,118,128,0.12)`, radius 9; pill `#FFFFFF`, radius 7,
shadow `0 3px 8px rgba(0,0,0,0.12), 0 3px 1px rgba(0,0,0,0.04)`; labels 13/18 600; selected `#000`,
unselected `rgba(60,60,67,0.60)`; no separators. The selected label's color switches at the tap
(author style) while the pill is still moving, as on iOS. The pill's on-screen radius stays 7.0 px
(±0.01) because it only translates; the harness reports it as a visual assertion. Background
`#F2F2F7`; the control's shadow is the only elevation.

**4. Motion spec.** `SEG` spring D 0.35, b 0.12, delay 0, `transform-origin: 50% 50%`. The pill's
size channels are constant; the origin channels x (and nominally y). The first tap is from rest;
the next three taps are moving retargets: each new track starts at the presented box with the
analytic velocity of the previous track (`§5.1`, `§5.3` superposition). The four taps are at wall
80/160/240 ms; with a 16 ms step they are after frames 5/10/15 (the from-rest track's elapsed is
64/144/224 ms at those commits). `{maxDuration: 0.2}` clamps the spring; `'jump'` selects
instantly; `'ignore'` primary. No presence, no radius blend, no crossfade.

**5. Script and oracle.**

| Frame / time | Action | Expected report | Oracle expectation |
|---|---|---|---|
| rest | pill at segment 0 | — | `A = (19,163,86.5,26)` |
| `f = 0` | tap segment 1 at its center; commit | `'ended'` at settle, unless interrupted | Track from rest `A0→A1` (88.5 px), `v₀ = 0`; G2 at `t=0`; G4 every frame |
| after 5 frames (wall 80 ms; elapsed 64 ms) | tap segment 2; commit | run 1 `'interrupted'`; run 2 `'ended'` or interrupted | Track `B=(presented at 64 ms)`, `v = analytic`; `A2`; G3 at the retarget; the pill does not move at the commit (G2) |
| after 5 more (wall 160; elapsed 144) | tap segment 3 | run 2 `'interrupted'`; run 3 | same |
| after 5 more (wall 240; elapsed 224) | tap segment 0 | run 3 `'interrupted'`; run 4 `'ended'` at settle | same; the final flight returns to A0 |
| settle | — | `'ended'` | pill at `(19,163,86.5,26)`; pose restored; radius 7; no leftover |

The oracle's chain keeps each track's `v(t)` at the retarget and applies the new spring from the
presented `B`; the geometry, not a finite-difference estimate, proves the continuity. The harness
also records the finite-difference velocity across the retarget as supporting evidence; it is not
allowed to replace G3's analytic pair (A-11).

**6. Gates.**

| Gate | Value | Scene target |
|---|---|---|
| G1 | ≤ 0.05 px every edge | one participant × every frame; worst error reported |
| G2 | ≤ 0.05 px; aged ≤ 0.5 px | four taps; all fresh |
| G3 | ≤ 1 % larger speed + 1 px/s | three moving retargets (taps 2–4); the critical scene |
| G4 | ≤ 0.05 px | four spring tracks |
| G5 | ≤ 0.01 px; no pose | final segment 0; `translate`/`scale` restored |
| G6 | byte for byte | `translate`/`scale`/`border-radius`; radius 7 |
| G7 | exact | `interrupted, interrupted, interrupted, ended`; snapped `[]`; no diagnostics |
| G8 | p95 ≤ 2 ms; no >8 ms | one mover |
| G9 | ≤ 2× floor | N = 1 reported; named gate S-BULK |
| G13 | exact reads | capture 1 rect + 1 pair; flush 1 + 1; 1 radius read per capture |
| G14 | fingerprint | advisory on mismatch |

**7. Negative control.** At tap 2, start the new track from rest (omit the analytic velocity). The
pill's position at the first frame after the tap is wrong by `v·dt` (several px); G1 and G3 fail at
that frame. A second control starts the new track from `A1` instead of the presented box; G2 fails
at the commit (the pill jumps 22 px). A third control leaves the pill's `border-radius: 7px
!important` after settle; G5/G6 fail.

**8. Feasibility / P4.** Vanilla group; four buttons; `group.update` on each tap. The pill is a
single participant with a `layoutId`; the native control has one pill, so there is no second node
to crossfade. The authority's "shared `layoutId`" is read as a stable id used by the one pill
(A-2). No P4. P3 supplies the reports/diagnostics.

### 2.4 S-ACC — Settings disclosure (React, P2)

**1. iOS reference and intent.** A Settings group row expands to reveal its body; the rows below
move down and the scroller content grows. A second row expands while the first is still moving;
then the first collapses. The header and body stay crisp while the row's height is animated: the
row scales, the content is counter-projected. This is the nested position-mode + sibling retarget +
scroller-content case in React.

**2. Geometry, DOM, participants, channels.**

Viewport 390 × 844, page `#F2F2F7`. Nav 47–91 "Settings" 17/22 600 centered. The scroller is
`(0, 91, 390, 753)`. The settings group is `(16, 107, 358, H)` with radius 12, `#FFFFFF`; 11 rows,
each 48 px collapsed, separator 0.5 px after each row except the last; row `i` top is
`107 + i·48.5`; expanded row height 168 (= 48 header + 120 body). The group's `H` is the sum
(11·48 + 10·0.5 = 533 collapsed; 773 after two expansions). The scroller's content is 773 after
both expansions; its viewport is 753, so the scroll range is 20 px; the scroll offset stays 0.
Rows 0–10; row 2 is the first expansion, row 6 the second.

DOM: `div[data-scroller]` > `div[data-group]` (non-participant, radius 12, overflow hidden) > for
each row: `div[data-p="row-i"]` (`layout: true`, radius false, `overflow: hidden`) containing
`button[data-p="header-i"]` (`layout: 'position'`, radius false), `div[data-p="body-i"]`
(`layout: 'position'`, radius false, 358×120 at local y=48, always mounted, clipped by the row), and
a sibling `div[data-p="sep-i"]` (`layout: 'position'`, radius false, 358×0.5). The header contains a
29×29 colored icon (non-participant) and a 17/22 title; the body contains 15/20 secondary text. The
chevron is a non-participant SVG with a CSS `rotate` transition (0.2 s) — `rotate`, not
`translate`/`scale`, and not an ancestor of a participant.

Participant table (N = 11 rows + 11 headers + 11 bodies + 10 separators = 43):

| Key | Mode | B (collapsed) | A (row 2 / row 6 expanded) | Notes |
|---|---|---|---|---|
| Key | Mode | B (collapsed) | A (phase-dependent; see below) | Notes |
|---|---|---|---|---|
| `row-i` | true | `(16, 107+48.5i, 358, 48)` | height 48 or 168; top shifts by +120 for every expanded row above it | row 2 expands first; row 6 expands at 192 ms; row 2 collapses at 288 ms |
| `header-i` | position | `(16, 107+48.5i, 358, 48)` | follows `row-i`'s top; size pinned 358×48 | counter-projected under the row's pose |
| `body-i` | position | `(16, 107+48.5i+48, 358, 120)` | follows `row-i`'s top; size pinned 358×120 | clipped by the row; revealed as the row grows |
| `sep-i` | position | `(32, 107+48.5i+48, 342, 0.5)` | follows `row-i`'s bottom; 342×0.5 | degenerate axis; exact-size support check |

The `A` boxes are phase-dependent. **A1** (row 2 open): row 2 height 168; rows 3–10 top +120;
row 6 top 518. **A2** (row 6 also open): row 6 height 168; rows 7–10 top +240 (a further +120);
row 6 top 518. **A3** (row 2 closed, row 6 open): row 2 height 48; row 6 top 398, height 168;
rows 7–10 top +120; rows 3–5 back to their original tops. The final state is A3. The separators
follow the row bottoms: the separator after row 2 is at 252, the separator after row 6 at 566, and
the rows 7–10 start at 566.5. The 0.5 px separators retain 0.5 px on screen.

When row 2 expands, rows 3–10 and their headers/bodies/separators move down 120. When row 6
expands, rows 7–10 and their children move down 120. When row 2 collapses, rows 3–10 and their
children move up 120; row 6 stays expanded. The headers/bodies of the moving rows have their own
`B→A` tracks because their view positions change; the header/body of the expanding row itself has
no own position change but is counter-projected under the row's scale. The separators move and have
their own tracks; their size is 0.5 px.

N = 43; movers at a commit ≤ 34; `maxNodes` 300; `maxParticipants` 2,000; all participants within the
viewport ±10 % (the group bottom is 880 at A2, 36 px below the viewport, inside the ±10 % bound
of 84.4 px). `radius: false` on rows/headers/
bodies/separators; the group's radius 12 is a non-participant.

**3. Visual-quality spec.** Group `#FFFFFF`, radius 12, no shadow (grouped list); row `#FFFFFF`,
no radius; separators 0.5 px `rgba(60,60,67,0.29)`, inset 16 px left (the separator is
`(32, rowBottom, 342, 0.5)`).
Header title 17/22 400 `#000`; body 15/20 400 `rgba(60,60,67,0.60)`; icon 29×29 radius 7 with the
row's color (airplane `#FF9500`, wifi `#007AFF`, bluetooth `#007AFF`, cellular `#34C759`, hotspot
`#007AFF`, notifications `#FF3B30`, sounds `#FF2D55`, focus `#5E5CE6`, screen time `#5E5CE6`,
general `#8E8E93`, privacy `#007AFF`); chevron 8×13 stroke `#C7C7CC` 2 px, rotated 90° when open.
The 0.5 px separator is the deliberate fractional/degenerate box; it must render 0.5 px on screen
at DPR 2 (the harness checks the rect height and the computed border box). The body text is never
scaled: it is a position participant. The row's `overflow: hidden` and the group's radius 12 clip
the first/last row corners.

**4. Motion spec.** `ACC` spring D 0.50, b 0.06, delay 0; `transform-origin: 50% 0%` on rows,
headers, bodies, separators (the row grows downward). The row's `layout: true` animates height;
headers/bodies/separators use `layout: 'position'`. The header/body of the expanding row are
counter-projected by §5.5 and draw their `A` at constant size; the body's clip reveals it. The
siblings retarget from their presented `B` and velocity at each commit. The second expansion at
192 ms and the first collapse at 288 ms are moving retargets; the oracle chain carries `v` at each.
No presence, no crossfade, no radius. Reduced motion: `'jump'` lands at the final heights; the
`{maxDuration: 0.2}` clamp is applied to each row's spring; `'ignore'` primary. The chevron's CSS
rotate transition is an author visual; it is disabled under `'jump'`.

**5. Script and oracle (React `update`).**

| Frame / time | Action | Expected report | Oracle expectation |
|---|---|---|---|
| rest | 11 rows collapsed; row 2 and row 6 closed | — | all participants at their `A`; no tracks |
| `f = 0` | tap row 2 header; `update(() => setOpen(2))` | run 1 `'ended'` unless interrupted | row 2 `B→A` height 48→168; rows 3–10 and their headers/bodies/separators `B→A` down 120; row2 header/body are counter-projected at their `A`; G2 at `t=0`; G1 every frame |
| frame 12 (wall 192 ms; elapsed 176 ms) | tap row 6 header; `update(() => setOpen(6))` | run 1 `'interrupted'`; run 2 | row 6 `B→A` height 48→168; rows 7–10 down 120; rows 3–5 keep their run-1 tracks (their `A` unchanged); row 2 stays expanded; G3 at the retarget(s) |
| frame 18 (wall 288; elapsed 272) | tap row 2 header; `update(() => setOpen(null))` | run 2 `'interrupted'`; run 3 `'ended'` at settle | row 2 `B→A` 168→48; rows 3–10 up 120; row 6's slot moves up 120 while its own height stays 168; the row 6 track and the rows 7–10 tracks retarget from their presented `B`/`v`; G3 |
| settle | — | `'ended'` | final: row 2 collapsed, row 6 expanded; rows 3–5 at their original slots; rows 7–10 +120; all 0.5 px separators at 0.5 px; styles restored |

The overlapping-run statuses follow §9.3/§7.1: a run whose track is replaced by a later flush is
`'interrupted'` at that moment; untouched tracks keep running. The scene expects
`interrupted, interrupted, ended`. The React adapter's `update(fn)` is used so every scripted commit
has an observable report; it captures before `flushSync(fn)` and flushes after, exactly the
`useLayoutGroup().update` contract. The harness awaits the adapter's flush microtask before the
`t = 0` measurement and asserts no clock frame occurred.

Every frame: the row heights, the header/body/separator boxes, and the body clip are checked against
the chain. The header/body of the expanding row are expected at constant size; a non-participant
body would scale with the row and fail G1 at the first frame (the negative control).

**6. Gates.**

| Gate | Value | Scene target |
|---|---|---|
| G1 | ≤ 0.05 px every edge | 43 participants × every frame; the 0.5 px separators and the counter-projected body are the critical rows |
| G2 | ≤ 0.05 px; aged React ≤ 0.5 px | three commits; the primary path fresh; a separate time-sliced variant may use the 0.5 px allowance only with `capture-aged` |
| G3 | ≤ 1 % + 1 px/s | the row 6 expand and row 2 collapse retargets |
| G4 | ≤ 0.05 px | all row/sibling springs |
| G5 | ≤ 0.01 px; no pose | final row heights/positions; separators 0.5 |
| G6 | byte for byte | `translate`/`scale`/`overflow-anchor`; no radius; no `inert` |
| G7 | exact | `interrupted, interrupted, ended`; snapped `[]`; no diagnostics |
| G8 | p95 ≤ 2 ms; no >8 ms | up to 33 movers |
| G9 | ≤ 2× floor | N = 43 reported; named gate S-BULK |
| G13 | exact reads | capture 43 rects + 43 pairs; flush 43 + 43; radius reads 0 (all radius false); active computed values for the movers; the separators' exact-size reads are counted per §4.2 |
| G14 | fingerprint | advisory on mismatch |

**7. Negative control.** Make `body-2` a non-participant child of `row-2` (it scales with the row).
At the first expand frame the body's drawn height is 120·(row scale) instead of 120; G1 fails on
the body's edges. A second control starts the row 6 expansion from rest (drop the velocity of the
already-moving rows 7–10); G3/G1 fail at the retarget. A third control makes the separator 1 px
instead of 0.5; G1 fails on the separator's height.

**8. Feasibility / P4.** React `<LayoutGroup clock motion={{type:'spring',duration:0.5,bounce:0.06}}
reducedMotion:'ignore'>` with `<SettingsGroup>`; each row/header/body/separator uses `useLayout`.
The state change is wrapped in `useLayoutGroup().update(fn)` from the click handler. The 0.5 px
separator is a real participant; the §4.2 support check reads its exact size on the degenerate axis
(the S1 path) and must pass. No P4. P3 supplies G7.

### 2.5 S-STACK — Notification stack (vanilla, P2)

**1. iOS reference and intent.** Six notifications rest as a bottom stack: the newest card is full
size in front, the older cards peek above and behind it, scaled down. Tapping fans them into a
vertical list; the per-card count badges enter under presence. Tapping again collapses the list
back into the stack and the badges exit. The cards are nested participants; the count badges are
nested participants with a presence transform.

**2. Geometry, DOM, participants, channels.**

Viewport 390 × 844; dark wallpaper `linear-gradient(160deg,#1A2340,#0B1020 60%,#05070C)`; a large
"9:41" 76/80 700 white at `(28, 56)`, "Monday, October 28" 17/22 400 white 60 % at `(28, 142)`.
The stack area is `(16, 318, 358, 482)` for the expanded list; the collapsed stack's front card is
at `(16, 738, 358, 72)`. Card `i` (0 = newest) has the expanded box
`(16, 318 + 82·i, 358, 72)`; the collapsed visual box is the same layout box with the authored
`translateY(420 − 90·i) scale(0.96^i)` about `transform-origin: 50% 0%`, which places card i at
`(16 + 358·(1−s)/2, 738 − 8·i, 358·s, 72·s)` with `s = 0.96^i`. The stack's top is 698
(card 5); the front card is 738–810. The expanded list is cards at 318, 400, 482, 564, 646, 728;
bottom 800. All fit above the home indicator.

DOM: `div[data-stack]` > six `div[data-p="card-i"]` (`layout: true`, `radius: true`,
`layoutId` none) each containing a 20×20 app icon (non-participant), title 15/20 600, body 13/18
secondary, and a `div[data-p="badge-i"]` (`layout: 'position'`, `radius: true`, 22×22 circle,
`id` none) with presence. The badge's layout box is the card's local `(322, 12, 22, 22)`, i.e. view
`(16+322, cardTop+12, 22, 22)` in the card's layout frame. The badge's presence `scale` is an inner
map; the badge's own layout track moves it with the card.

| Key | Mode | B (collapsed) | A (expanded) | Presence |
|---|---|---|---|---|
| `card-i` | true | stack visual box (authored translate/scale) | `(16, 318+82i, 358, 72)` | none |
| `badge-i` | position | stack badge box (under the card's authored map) | `(338, 330+82i, 22, 22)` | badge 0: none; badges 1–5: `scale 0.8→1`, opacity 0→1 on expand; reverse on collapse |

N = 12. `maxNodes` 300; `maxParticipants` 2,000. `radius: true` on cards (16) and badges (11); the
cards have no `layoutId`, so no radius handoff; the radius is constant. The count texts are
`6,5,4,3,2,1` for badges 0–5; badge 0 is visible in both states, badges 1–5 are hidden at collapsed
(opacity 0, scale 0.8) and enter on expand. The z-order is card 0 (z 60) on top, card 5 (z 55)
behind.

**3. Visual-quality spec.** Cards `rgba(255,255,255,0.96)` (not translucent enough to need
backdrop-filter), radius 16, shadow `0 6px 20px rgba(0,0,0,0.12)`, padding 16; title 15/20 600
`#000`; body 13/18 400 `rgba(60,60,67,0.60)`; app icon 20×20 radius 5 with a colored gradient.
Badges 22×22 circle `#FF3B30`, text 11/13 700 white, centered; shadow none. Clock/copy white with
the stated opacities. The cards' text is non-participant and scales with the card's authored scale
(0.96^i) in the stack; the front card is scale 1 and crisp, the behind cards are occluded. The
badges are nested position participants, so their size is pinned while the card's pose scales; the
presence scale is on top. The card's `overflow: hidden` clips the badge and text at the corners.

**4. Motion spec.** `STACK` spring D 0.55, b 0.08, delay 0, `transform-origin: 50% 0%`. The
cards' `layout: true`; the badges' `layout: 'position'`. On expand, the authored
`translateY(420−90i) scale(0.96^i)` is removed and the layout boxes are the fan; on collapse it is
reapplied. The card's `A` on expand is the fan box; `B` is the stack visual box; the track includes
the scale change (the authored map is frozen in `B`, the new identity in `A`). The badge's `A` is
the fan badge box; `B` is the stack badge box; the badge's own track plus the presence scale. The
badge presence on expand: `scale 0.8→1`, `opacity 0→1`, 0.25 s EASE_OUT; on collapse:
`scale 1→0.8`, `opacity 1→0`, 0.15 s EASE_IN. Badge 0 has no presence animation. No crossfade, no
radius blend. Reduced motion: `'jump'` lands at the final boxes; badges jump to their final
opacity/scale; `{maxDuration: 0.2}` clamps the cards and sets the presence to zero duration;
`'ignore'` primary.

**5. Script and oracle.**

| Frame / time | Action | Expected report | Oracle expectation |
|---|---|---|---|
| rest | collapsed; cards at the stack; badges 1–5 opacity 0/scale 0.8 | — | cards at their `B`; badges at their `B` with presence scale 0.8; badge 0 at full |
| `f = 0` | tap the front card; commit expand | `'ended'` at the card settle; presence ends at 0.25 s | cards `B→A` fan; badges 1–5 `B→A` with `scale 0.8→1`; badge 0 `B→A`; G2 at `t=0`; G1 every frame |
| `f = 1 …` | 16 ms frames; wait for the cards and the badges | — | card tracks, badge position tracks, badge presence scale; G4; the badge's expected rect is its layout track scaled about its center by `s(t)` |
| frame 60 (wall 960 ms; after settle) | tap the front card; commit collapse | `'ended'` at the collapse settle | cards `B→A` stack; badges 1–5 `scale 1→0.8`, opacity →0; G2/G3; the final stack |
| settle | — | `'ended'` | stack positions; badges 1–5 opacity 0/scale 0.8; card 0 full; styles restored |

The expand's cards start from rest (the stack is at rest); the collapse also starts from rest
(the expanded list has settled). The oracle evaluates the badge's presence cubic independently;
the badge's layout box is the 22×22 circle, scaled about its center.

Every frame: 12 participants; the cards' `B→A` tracks; the badges' `B→A` position tracks; the
badges' presence scale; the z-order is static.

**6. Gates.**

| Gate | Value | Scene target |
|---|---|---|
| G1 | ≤ 0.05 px every edge | 12 participants × every frame; badges 1–5 at the presence scale |
| G2 | ≤ 0.05 px | expand and collapse; no aged (vanilla) |
| G3 | ≤ 1 % + 1 px/s | none (both runs from rest); report "n/a" |
| G4 | ≤ 0.05 px | 12 card/badge position springs |
| G5 | ≤ 0.01 px; no pose | final stack; badges 1–5 opacity 0/scale 0.8; no leftover |
| G6 | byte for byte | `translate`/`scale`/`border-radius`; the badge presence `transform`/`opacity` are presence-owned and excluded from layout's restoration, but their final presence values are the authored ones |
| G7 | exact | `ended`, `ended`; snapped `[]`; no diagnostics |
| G8 | p95 ≤ 2 ms; no >8 ms | 12 movers |
| G9 | ≤ 2× floor | N = 12 reported |
| G13 | exact reads | capture 12 rects + 12 pairs; flush 12 + 12; radius reads 12 per capture (cards and badges have radius on) |
| G14 | fingerprint | advisory on mismatch |

**7. Negative control.** Remove the badges' presence animation (badges jump from scale 0.8 to 1
at the expand commit). At the first expand frame the expected badge box is 17.6×17.6 centered;
the actual is 22×22; G1 fails on all four badge edges. A second control makes the badges
non-participants (they scale with the card's authored map); G1 fails on the badge boxes in the
stack.

**8. Feasibility / P4.** Vanilla group; `createPresence` on the badges with the manual clock;
`group.update` on the expand/collapse. The card's authored translate/scale is outside the engine's
ownership (§6); the engine composes it in `Q` and freezes it. No P4. P3 supplies G7.

### 2.6 S-ISLAND — Live activity morph (vanilla, P2)

**1. iOS reference and intent.** A black pill at the top of the screen morphs into a live-activity
card. The surface grows from 126×37 to 358×158, its corner radius relaxes from 18.5 to 40, and the
compact content crossfades to the expanded content. A tap at 30 % of the expansion reverses the
morph; the surface retargets from its presented box and velocity, and the radius continues from the
current on-screen value, without a jump.

**2. Geometry, DOM, participants, channels.**

Viewport 390 × 844; wallpaper `linear-gradient(160deg,#0A1224,#101B33 45%,#05070C)`; status time
"9:41" 15/20 600 white at `(28, 14)`; the island's pill `P0 = (132, 11, 126, 37)`, radius 18.5;
the card `C1 = (16, 11, 358, 158)`, radius 40; both black `#000`, shadow
`0 10px 30px rgba(0,0,0,0.35)`, `transform-origin: 50% 0%` (the top stays at y = 11; the surface
grows symmetrically about x = 195). The pill content: mini album art 20×20 radius 4 at `(144, 19)`,
"2:14" 12/16 600 white at `(170, 20)`, a 3-bar waveform. The card content: album art 64×64 radius
8 at `(32, 27)`, title "Now Playing" 15/20 600 white at `(112, 28)`, subtitle "Ambient · 12 tracks"
13/18 white 60 % at `(112, 50)`, a progress bar `(112, 74, 214, 4)` radius 2 with a 40 % green
`#30D158` fill, times "1:03" / "2:14" 11/13 white 60 % at `(112, 84)`, and three transport icons at
the bottom right. The content is split into two nested **position wrappers**: `pill-content` at
`P0` and `card-content` at `C1`; their children are non-participant author DOM at the coordinates
above, so the wrappers' own poses counter-project the surface's non-uniform scale and the text is
never stretched. The wrappers' opacity is an author layer (below).

DOM: `div[data-p="pill"]` (`layoutId="island"`, `layout: true`, `radius: true`, `HOLD` presence)
and `div[data-p="card"]` (`layoutId="island"`, `layout: true`, `radius: true`, `HOLD` presence).
Both are top-level siblings on the stage; the pill exists when collapsed, the card when expanded;
`AnimatePresence`/`createPresence` keeps the exiting one as the follower. The two surfaces are
opaque black and share the crossfade; each contains its nested content wrapper, clipped by the
surface's `overflow: hidden`.

| Key | Pair id | Mode | B | A | Notes |
|---|---|---|---|---|---|
| `pill` | `island` | true | `P0` | `P0` (collapse target) | lead when collapsed; follower during expansion |
| `card` | `island` | true | `P0` (handoff) | `C1` | lead when expanded |
| `pill-content` | — | position | `P0` | `P0` | nested wrapper; opacity 1→0 over 0.12 s |
| `card-content` | — | position | — (new) | `C1` | nested wrapper; opacity 0 until p ≥ 0.5, then 1 over 0.18 s |

N = 4. `maxNodes` 300; `maxParticipants` 2,000. `radius: true` on the two surfaces only; the
wrappers use `radius: false`. The radius blend is
`ρ(p) = 18.5 + (40−18.5)·p` on expand, and the reverse on collapse from the current `ρ`. The
follower is inert; no focusable element is inside either surface, so focus never triggers
`focus-in-follower`. The status bar is non-participant. **Nested participants: two** — the
`pill-content` and `card-content` position wrappers; their children are non-participant author
layers, and the wrappers' own boxes are scored.

**3. Visual-quality spec.** Both surfaces `#000`; shadow as above; the card radius 40 and the pill
radius 18.5 are the authored ends; during the crossfade both layers draw the same `ρ(p)` with
`r·A_w/V_w`, `r·A_h/V_h`, so their silhouettes coincide. The pill's 37 px height and 18.5 radius
are a pill; the card's 158 px height and 40 radius are a card. Content: the title 15/20 600 white,
subtitle 13/18 white 60 %, times 11/13 white 60 %, artwork gradients (blue/orange). The wrappers'
own boxes are `P0`/`C1`; their children are at the authored coordinates, and the wrapper's pose
counter-projects the surface, so no glyph is stretched. The content crossfade: `pill-content`
opacity 1→0 over 0.12 s EASE_OUT; `card-content` 0→1 over 0.18 s EASE_OUT from p ≥ 0.5 (not from
t = 0); on collapse, reverse; on the 30 % reversal, both content timelines retarget from their
current opacity over 0.12 s. The content is a visual assertion: `pill-content` is 0 by 0.12 s;
`card-content` is 0 until p ≥ 0.5; neither content is visible outside the surface's silhouette.
The surface's shadow is the same on both layers to avoid a double-dark edge. z-order: wallpaper 0,
surfaces 10, content wrappers 11, status 20.

**4. Motion spec.** `ISLAND` spring D 0.50, b 0.10, delay 0. The surfaces' `layout: true`; the
content wrappers are `layout: 'position'` with no layout track beyond their `A` (their own pose
counter-projects the surface's scale; their opacity is author-owned). Radius blend from the departing
on-screen radius to the new lead's authored radius on the lead's `p`: `ρ(p) = ρ_B + (ρ_A −
ρ_B)·p`; on a live crossfade both layers draw the same `ρ(p)`. On the 30 % reversal the new lead is
the follower of the running crossfade: `from_L` and `from_F` are the current opacities, the pair
keeps crossfading, and the radius starts from the current `ρ` (no jump). `HOLD` presence (no
opacity/transform) so presence does not hand off without a crossfade. Focus: the island has no
focusable content; the page's focus stays on the wallpaper/header outside the pair. Reduced motion:
`'jump'` lands at the target; the crossfade ends as a completed fade (lead opacity 1, follower
0/inert until unmount); radius at `A`; `{maxDuration: 0.2}` clamps the spring; `'ignore'` primary.

**5. Script and oracle.**

| Frame / time | Action | Expected report | Oracle expectation |
|---|---|---|---|
| rest | pill at `P0`; card absent | — | pill at `A`; no card |
| `f = 0` | tap the pill; commit expand | `'ended'` at the expand settle, unless interrupted | card enters with `B = P0`, `A = C1`; pill exits as follower; both layers at the lead track; `L(0)=0`, `F(0)=1`; radius `ρ(0)=18.5`; `pill-content` opacity 1, `card-content` 0; G2 on the surfaces; the wrappers are at their `A` |
| `f = 1 …` | 10 ms frames until 30 % | — | lead spring `P0→C1`; both surfaces at the lead box; radius `ρ(p)`; the wrappers' boxes `P0`/`C1`; `card-content` fades in from p = 0.5; G1/G4 every frame |
| frame 16 (wall 160 ms; elapsed 150 ms = 30.0 % of D) | tap the card; commit reverse | expand run `'interrupted'`; reverse run `'ended'` | pill re-enters as the new lead; card exits; new lead `B` = current common box at 150 ms; `A = P0`; opacities continue; radius from the current `ρ` to 18.5; G2/G3 at the reverse |
| settle | — | `'ended'` | pill at `P0`; card follower unmounts; content opacity pill 1/card 0; styles/inert restored |

Every frame: 4 participants (2 surfaces + 2 content wrappers); both surfaces at the lead's box;
the wrappers at their own `A`; the on-screen radius equals `ρ(p)` within 0.03 px (visual
assertion); coverage 1.

**6. Gates.**

| Gate | Value | Scene target |
|---|---|---|
| G1 | ≤ 0.05 px every edge | 4 participants × every frame; the 2 surfaces at the lead box, the 2 wrappers at their `A` |
| G2 | ≤ 0.05 px | expand and reverse; no aged (vanilla) |
| G3 | ≤ 1 % + 1 px/s | the 30 % reverse; the critical row |
| G4 | ≤ 0.05 px | the expand/reverse spring |
| G5 | ≤ 0.01 px; no pose | final pill; card unmounted; styles restored |
| G6 | byte for byte | `translate`/`scale`/`border-radius`/`inert`; the follower's inert restored on reversal |
| G7 | exact | expand `'interrupted'`, reverse `'ended'`; snapped `[]`; no diagnostics |
| G8 | p95 ≤ 2 ms; no >8 ms | 4 participants (2 surfaces + 2 wrappers); 2 surface movers |
| G9 | ≤ 2× floor | N = 4 reported |
| G13 | exact reads | capture 4 rects + 4 pairs; flush 4 + 4; 2 radius reads per capture (surfaces only) |
| G14 | fingerprint | advisory on mismatch |

**7. Negative control.** At the 30 % reversal, snap the surface to the pill's `A` instead of
retargeting from the presented box/velocity. The first frame after the reverse jumps from the
mid-flight box to `P0`; G2 fails (and G3 if the harness compares the track). A second control
skips the radius blend (each layer writes its own `A` radius): the on-screen radius jumps from
~25 to 18.5 at the reverse; the radius visual assertion fails, and the silhouette check
(two layers' radii differ by >0.03) fails.

**8. Feasibility / P4.** Vanilla group; `createPresence` with `HOLD` on both surfaces; `group.update`
on expand/close/reverse. The content wrappers are position participants; their opacity is a core
`ani` timeline on the same clock. No P4. P3 supplies G7.

### 2.7 S-INSERT — Mail, new message on top (React, P2)

**1. iOS reference and intent.** The inbox is scrolled 1.5 viewports down. Three new messages are
inserted at the top of the list under presence: the rows that are visible move down by the inserted
height, while the new rows enter above the viewport. The scene proves the commit's list shift with
only driven rows visible, the presence enter on the new rows, and the culled-row report.

**2. Geometry, DOM, participants, channels.**

Viewport 390 × 844; Mail. Status 0–47; nav 47–91 "Inbox" 17/22 600 centered; "‹ Mailboxes"
17/22 `#007AFF` at `(16, 58)`; "Edit" 17/22 `#007AFF` at `(342, 58)`. Search
`(16, 99, 358, 36)` radius 10 fill `rgba(118,118,128,0.12)`; "Search" 17/22 secondary at `(44,
108)`. List scroller `(0, 143, 390, 667)` (bottom 810); 24 rows × 78 px = 1872 content;
`scrollTop = 1000` (1.499 × 667). Visible band rows 12.8–21.3; the driven rows 9–21 plus the 3 new
rows. The pre-existing rows 9–21 and the new rows 0–2 are participants; the pre-existing rows 0–8
and 22–23 are non-participants. The new rows 0–2 are participants (mounted at the insert) and are
above the viewport.

Row: `(0, 143 + rowIndex·78 − scrollTop, 390, 78)`; separator 0.5 px at the bottom inset 16;
unread dot 8×8 `#007AFF` at x=8; sender 17/22 600 at x=36; date 13/18 secondary at the right;
subject 15/20 400; preview 15/20 secondary ellipsis. The rows are `layout: 'position'` (height
fixed; only the origin moves); the row content is non-participant. The new rows are also
`layout: 'position'`; their `A` is the top-of-content box, above the viewport.

DOM: `div[data-scroller]` > 24 row `div[data-p="row-i"]`; at the insert, three
`div[data-p="new-i"]` are prepended and the row indices shift. The new rows are in an
`AnimatePresence`? They are entering; their presence `initial`/`enter` is used. The existing rows
are not in presence. The list is a React tree; the insert is `update(() => setMessages([...new,
...old]))`. The new rows' presence motion: `opacity 0→1`, `translateY -24→0`, `scale 0.98→1`,
0.30 s EASE_OUT; no exit in this scene.

| Key | Mode | B (before insert) | A (after insert) | Notes |
|---|---|---|---|---|
| `row-9 … row-21` | position | `(0, 143 + i·78 − 1000, 390, 78)` | `(0, 143 + (i+3)·78 − 1000, 390, 78)` | down 234; spring `INSERT` |
| `new-0 … new-2` | position | absent | `(0, 143 + i·78 − 1000, 390, 78)` = `−857`, `−779`, `−701` | above viewport; culled; presence enter |

N = 16. `maxNodes` 300 (16 movers max); `maxParticipants` 2,000; `radius: false` (list rows, no
cards); `threshold` 1 px (234 px move). **Nested participants: none** — each row is one position
participant; the row's text is non-participant author DOM. The scroller's `scrollTop` stays 1000; the visible rows are
all driven, so the §12 behavior is the uncompensated presented shift; the harness records the
scroll offset before/after and requires it unchanged.

**3. Visual-quality spec.** List `#FFFFFF`, rows `#FFFFFF` with 0.5 px separators
`rgba(60,60,67,0.29)` inset 16; unread dot `#007AFF`; sender 17/22 600 `#000`; date 13/18
secondary; subject 15/20 400 `#000`; preview 15/20 400 secondary, single line, ellipsis. The nav is
`rgba(249,249,249,0.94)` with a 0.5 px bottom separator; the page `#F2F2F7`. The new rows use the
same row chrome; their presence translate/scale is authored, so the text is not distorted at the
end (scale 1). The new rows are offscreen at the top; the user sees the visible rows shift down by
234 px, revealing the rows that were above and pushing the bottom rows out. The scene's visual
intent is the list shift, not the visibility of the new rows; the presence is scored offscreen.

**4. Motion spec.** `INSERT` spring D 0.50, b 0.05, delay 0, `transform-origin: 50% 0%` on rows.
The existing rows' `A` moves down 234; they retarget from rest (the list is at rest before the
insert), so their first update has `dt = 0` and they start from `B`. The new rows have no layout
`B`; they are culled (no track) and appear at `A`; their presence is `opacity 0→1`,
`translateY -24→0`, `scale 0.98→1` over 0.30 s EASE_OUT. The culled new rows' layout report is
`culled`; their presence still runs. No radius, no crossfade. Reduced motion: `'jump'` places the
rows at `A` and the new rows at their presence end (opacity 1, identity); `{maxDuration: 0.2}`
clamps the rows and zeroes the presence; `'ignore'` primary.

**5. Script and oracle (React `update`).**

| Frame / time | Action | Expected report | Oracle expectation |
|---|---|---|---|
| rest | 24 rows; `scrollTop = 1000`; rows 9–21 at their `B` | — | 13 rows at `A`; no tracks |
| `f = 0` | tap "New mail" (or the scripted insert trigger); `update(() => prepend 3)` | insert run `'ended'` at the spring settle | new rows mount with `A` above the viewport; they are culled (layout `A`, no track); rows 9–21 `B→A` down 234; presence `opacity/translateY/scale` on the new rows; G2 on the 13 driven rows; G1 every frame |
| `f = 1 …` | 16 ms frames until the rows settle | — | rows 9–21 spring down 234; new rows at `A` + presence; the `snapped` set is the 3 new rows (`culled`); G4 on the rows |
| settle | — | `'ended'` | rows at `A`; new rows at `A` with presence end; the scroller `scrollTop` unchanged; styles restored |

The culled new rows are the only expected `snapped` entries; they are silent
(`'culled'`). The existing rows' union `B/A` intersects the viewport, so they are not culled. The
new rows' presence is checked offscreen; their `translateY`/`scale` are visible in the rect even
outside the viewport.

**6. Gates.**

| Gate | Value | Scene target |
|---|---|---|
| G1 | ≤ 0.05 px every edge | 16 participants × every frame; the 13 driven rows and the 3 presence rows |
| G2 | ≤ 0.05 px; aged React ≤ 0.5 px | the insert; the primary path fresh; no `capture-aged` |
| G3 | ≤ 1 % + 1 px/s | none (from rest); report "n/a"; the presence is author |
| G4 | ≤ 0.05 px | 13 row springs |
| G5 | ≤ 0.01 px; no pose | final rows; new rows' presence ends at opacity 1/identity; styles restored |
| G6 | byte for byte | `translate`/`scale`/`overflow-anchor`; no radius; no `inert` |
| G7 | exact | `'ended'`; snapped exactly the 3 new rows (`culled`); no diagnostics; `onSnap` 3 |
| G8 | p95 ≤ 2 ms; no >8 ms | 13 movers + 3 presence; measured |
| G9 | ≤ 2× floor | N = 16 reported |
| G13 | exact reads | capture 16 rects + 16 pairs; flush 16 + 16; no radius reads; active computed values for the 13 movers |
| G14 | fingerprint | advisory on mismatch |

**7. Negative control.** Make the 13 driven rows non-participants (plain DOM rows). The insert
still moves the DOM, but the oracle expects each row's `B→A` track; the actual rows snap to `A`
(or the engine does not animate them); G1 fails at the first frame (the expected down-234 box vs
the actual). A second control removes the culled report (the new rows animate instead of jumping);
G7 fails on `snapped` and G2 at the new rows' first frame.

**8. Feasibility / P4.** React `<LayoutGroup clock motion={{type:'spring',duration:0.5,bounce:0.05}}
reducedMotion:'ignore'>`; each row uses `useLayout`; the new rows use `usePresence` with `INSERT`
and `useLayout`. The insert is `useLayoutGroup().update(fn)`. The new rows are above the viewport;
the engine culls them and reports `culled`. The scroller is a normal element; the harness sets
`scrollTop` before the scene starts and does not scroll during the insert. No P4. P3 supplies G7.
The literal "top of a list scrolled by 1.5 viewports" is read as the top of the list content at
that offset (A-4); the visible evidence is the sibling shift.

### 2.8 S-DELETE — Reminders delete (React, P2)

**1. iOS reference and intent.** A reminder is swiped left to reveal Delete; tapping Delete lifts
the row at its presented box and slides it out under presence while the rows below close the gap.
A second delete follows 100 ms later, while the first gap is still closing; the second row is
already moving when it is lifted. The scene proves the popLayout lift at the presented box, the
presence exit, the mid-flight second lift, and the sibling retarget.

**2. Geometry, DOM, participants, channels.**

Viewport 390 × 844; Reminders. Large title "Reminders" 34/41 700 at `(16, 100)`; a blue "+" 28/28
700 at `(342, 56)`; section "Today" 13/18 600 uppercase secondary at `(16, 168)`. List
`(0, 190, 390, 620)`; 9 rows, `56 × 358` at `x = 16`, pitch 64 (8 px gap); row i top
`190 + 64·i`; content 568, fits. Row: `#FFFFFF`, radius 10, shadow `0 1px 2px rgba(0,0,0,0.04)`;
checkbox 22×22 circle at `(32, top+17)`, stroke `#C7C7CC` 1.5, checked `#007AFF`; title 17/22
400 `#000` at `(66, top+10)`; due 13/18 secondary at `(66, top+31)`; a trailing 8×13 chevron
`#C7C7CC` at `(350, top+22)`. The red Delete button is 80×56 at `(294, top, 80, 56)`, radius 10,
`#FF3B30`, white "Delete" 15/20 600, behind the row (z 0; the row z 1).

DOM: `div[data-list]` > nine row `div[data-p="row-i"]` (`layout: 'position'`, radius true) each
with non-participant content and a sibling `button[data-delete-i]`. The rows are in an
`AnimatePresence mode="popLayout"`; the deleting row keeps its element during the exit. The row's
swipe is an authored `transform: translateX(-80px)` (an inner map, not layout); the delete exit is
presence `transform: translateX(0→−390px)` linear 0.25 s and `opacity 1→0` linear 0.2 s. The
siblings' springs are `DELETE` D 0.45, b 0.08.

| Key | Mode | B | A | Notes |
|---|---|---|---|---|
| `row-0,1,3,4,6,7,8` | position | `(16, 190+64i, 358, 56)` | shifts up 64 for each deleted row above | after both deletes, 7 rows |
| `row-2` | position | `(16, 318, 358, 56)` | removed | first delete; exiting row lifted at its presented box (with the -80 swipe) |
| `row-5` | position | `(16, 510, 358, 56)` then mid-flight | removed | second delete at 100 ms; lifted at its presented mid-flight box |
| `row-3,4` | position | shift up 64 at delete 1 | no further shift | |
| `row-6,7,8` | position | shift up 64 at delete 1 | shift up another 64 at delete 2 | retarget mid-flight |

N = 9. `maxNodes` 300; `maxParticipants` 2,000; all within the viewport; no scroll; radius true
(10) on the rows; no shared ids; no crossfade. **Nested participants: none** — each row is one
position participant; its content is non-participant author DOM.

**3. Visual-quality spec.** Page `#F2F2F7`; rows `#FFFFFF`, radius 10, row shadow; red Delete
`#FF3B30` behind the row; white "Delete" 15/20 600. Titles 17/22 400 `#000`; due dates 13/18
`rgba(60,60,67,0.60)`; checkbox circle 22 px, 1.5 px stroke; checked fill `#007AFF` with a white
check. The row's `overflow: hidden` and radius 10 clip the content; the swipe reveals the red
button at the right. The row's title does not scale (the row only translates). The exiting row's
presence translate is linear; the row is clipped by the list's `overflow: hidden` at x = 0. The
list background `#FFFFFF`? The rows are cards on `#F2F2F7`; the list has no background; the gaps
show `#F2F2F7`. The red button is only visible during the swipe/exit.

**4. Motion spec.** Siblings `DELETE` spring D 0.45, b 0.08; `transform-origin: 50% 0%`. The
exiting row: popLayout measures its CSS box relative to the containing block at the exit render,
divides out its own transform (J-027), and lifts it to `position: absolute` at that box **before**
the flush; its layout track ends. The presence `translateX(0→−390)` linear 0.25 s and
`opacity 1→0` linear 0.2 s start at the lifted box. The second row is mid-flight from the first
gap; its lifted box is its **presented** box, not its layout slot; the presence starts there. The
siblings' `A` moves up 64 at each delete; at the second delete the rows 6–8 retarget from their
presented `B`/`v`. The first delete's run is `'interrupted'` at the second; the second is `'ended'`.
Reduced motion: `'jump'` removes the rows and places the siblings at `A`; the presence exits are
zero duration; `{maxDuration: 0.2}` clamps the sibling springs; `'ignore'` primary.

**5. Script and oracle (React `update`; 10 ms frames).**

| Frame / time | Action | Expected report | Oracle expectation |
|---|---|---|---|
| frames 0–8 (0–80 ms) | swipe row 2 left 10 px/frame to −80; no layout commit | — | row 2's rect = layout box + authored `translateX(−10k)`; G1 on the authored transform (scene visual) |
| frame 8 | tap Delete on row 2; focus row 3; `update(() => remove(2))` | run 1 `'ended'` unless interrupted | row 2 lifted at its presented box `(16−80, 318, 358, 56)`; presence slide/opacity; rows 3–8 `B→A` up 64; G2 on the siblings; G1 every frame |
| frame 18 (wall 180 ms; 100 ms after frame 8) | tap Delete on row 5 (no swipe; a toolbar delete); `update(() => remove(5))` | run 1 `'interrupted'`; run 2 `'ended'` | row 5 is mid-flight up 64; popLayout lifts it at its **presented** box; presence slide/opacity; rows 6–8 `B→A` up 64 from their presented `B`/`v`; G2/G3 at the lift and retarget; G1 every frame |
| settle | — | `'ended'` | 7 rows, gaps closed; exiting rows unmounted; styles restored |

The first exiting row is still on screen at the second delete (`0.25 s` exit; 100 ms elapsed); the
second row's exit starts at its mid-flight box. The harness checks the first-frame continuity of
both lifts (the row does not jump to its layout slot). The exiting rows' presence opacity/translate
are checked every frame; the layout reports exclude them.

**6. Gates.**

| Gate | Value | Scene target |
|---|---|---|
| G1 | ≤ 0.05 px every edge | 9 participants (7 after) × every frame; the lifted rows and the mid-flight row 5 |
| G2 | ≤ 0.05 px; aged React ≤ 0.5 px | delete 1, delete 2; the second lift is the critical row |
| G3 | ≤ 1 % + 1 px/s | the rows 6–8 retarget at delete 2; the row 5 lift is a presence start, not a layout retarget |
| G4 | ≤ 0.05 px | the sibling springs |
| G5 | ≤ 0.01 px; no pose | final 7 rows; exits unmounted; styles restored |
| G6 | byte for byte | `translate`/`scale`/`border-radius`; no `inert` (no crossfade) |
| G7 | exact | `interrupted`, `ended`; snapped `[]`; no diagnostics |
| G8 | p95 ≤ 2 ms; no >8 ms | 9 movers + 2 presence exits |
| G9 | ≤ 2× floor | N = 9 reported |
| G13 | exact reads | capture 9 rects + 9 pairs; flush 9 + 9; 9 radius reads per capture (rows radius on; exiting rows too) |
| G14 | fingerprint | advisory on mismatch |

**7. Negative control.** Do not lift the second row at its presented box (leave it at its layout
slot). At frame 18 the row jumps up by the distance it had already moved; G2 fails at the delete-2
commit (and G1 on the first post-delete frame). A second control leaves the gap open (siblings do
not move to `A`); G1 fails on rows 3–4 at the first post-delete frame. A third control leaves the
exiting row's `translate` declaration after unmount; the restoration/freshness check fails.

**8. Feasibility / P4.** React `<LayoutGroup clock motion={{type:'spring',duration:0.45,bounce:0.08}}
reducedMotion:'ignore'>`; rows use `useLayout({layout:'position', ref: presence.ref})`;
`AnimatePresence mode="popLayout"` supplies the lift; the delete is
`useLayoutGroup().update(fn)`. The popLayout lift uses `getBoundingClientRect` and divides out the
row's own transform (J-027); the row is absolute before the flush. No P4. P3 supplies G7. The
authored swipe is not a layout animation; it is a scene gesture layer.

### 2.9 S-REORDER — Reminders drag reorder (vanilla, P4)

**1. iOS reference and intent.** A reminder is pressed and dragged down three slots. The row stays
under the finger while the list reorders beneath it; on release the row continues with the flick's
velocity and springs into its slot. The held row's origin is the user's finger; its descendants
ride one inherited displacement; the release velocity enters exactly once. This is the P4 drive
seam in its canonical reorder form.

**2. Geometry, DOM, participants, channels.**

Viewport 390 × 844; Reminders; same chrome as S-DELETE. Seven rows, 52 px high, gap 8, x=16,
row i top `190 + 60·i`; content 412; fits. Each row contains a 22×22 checkbox, a title participant
`div[data-p="title-i"]` (`layout: 'position'`, 17/22 400, at local `(66, 10)`, size `(270, 22)`),
and a due label. The row is `layout: 'position'` (size 358×52). The dragged row is row 1; its take
point is its center `(195, 276)`.

DOM: `div[data-list]` > seven row `div[data-p="row-i"]` + seven nested `div[data-p="title-i"]`.
The row and title are participants; the title is a descendant of the row. `maxNodes` 300;
`maxParticipants` 2,000; `radius: true` (10) on the rows; no shared ids; no presence.

| Key | Mode | B | A | Notes |
|---|---|---|---|---|
| `row-0,2…6` | position | `(16, 190+60i, 358, 52)` | shifts by ±60 as the dragged row crosses | spring `REORDER` |
| `row-1` | position | `(16, 250, 358, 52)` | slot 4: `(16, 430, 358, 52)` | held; origin frozen at take; A updates at each reorder |
| `title-i` | position | row + `(66,10,270,22)` | row's new slot + same local box | descendant; rides `h` when its row is held |

N = 14. The held row and its title are the only P4-relevant pair; the other rows/titles animate by
layout.

**3. Visual-quality spec.** Same Reminders chrome; dragged row `#FFFFFF`, radius 10, shadow
`0 12px 28px rgba(0,0,0,0.18)`, z-index 10; other rows `0 1px 2px rgba(0,0,0,0.04)`, z-index 1.
Title 17/22 400 `#000`; due 13/18 secondary; checkbox 22 px. `touch-action: none; user-select:
none; cursor: grabbing` on the dragged row. The list background `#F2F2F7`; no scroll. The dragged
row's title is crisp (position mode; no size change). The reorder is visible as the rows swapping
slots; the dragged row stays under the finger.

**4. Motion spec.** `REORDER` spring D 0.45, b 0.10, delay 0, `transform-origin: 50% 50%` on the
rows (a pure translation; the origin is nominal). The held phase: `take(row1)` at the pointerdown;
the presented origin is frozen; each `move({x:0,y})` sets the drawn origin to the take point +
offset at the next frame. The descendants (the title) ride one inherited displacement `h`; the
title's residual is its `A`; the held row's size channels keep their track (none). Each reorder is
a `group.update` that changes the DOM order and the row/title `A`s; the held row's `A` changes
under the finger; the held point is fixed, so it does not jump. `release({x:0,y:900})` at 200 ms:
the release track starts from the presented origin with the incoming velocity, the first update
`dt = 0`; the spring carries the velocity and settles at the current `A`. The release velocity
enters exactly once; descendants receive none. Reduced motion: the hold stays 1:1; at release
`'jump'` lands at `A` with no motion; `{maxDuration: 0.2}` clamps; `'ignore'` primary.

**5. Script and oracle (vanilla; 20 ms drag frames).**

| Frame / time | Action | Expected report | Oracle expectation |
|---|---|---|---|
| rest | row 1 at `(16,250,358,52)`; title at `(82,260,270,22)` | — | no tracks |
| `f = 0` | pointerdown at `(195,276)`; `take(row1)` | — | held; drawn origin = take point; `velocity = 0`; size 358×52 |
| 10 pointer moves, 20 ms apart | `move({x:0,y:18k})`, k=1…10; reorder at offsets 36, 90, 162 (k=2,5,9) | reorder 1 `'interrupted'` at reorder 2; reorder 2 `'interrupted'` at reorder 3; reorder 3 `'ended'` | drawn origin y = 276+18k every frame; the list reorders under it; the held row's `A` changes but the drawn origin does not jump; siblings `B→A`; titles ride; G1/G2 every frame |
| frame 10 (200 ms) | pointerup; `release({x:0,y:900})` | release run `'ended'` at settle | B = presented origin y 456; A = slot 4 center 456; `v₀ = 900`; first update `dt = 0`; the spring overshoots down and returns; G3 at the release; G4 |
| settle | — | `'ended'` | row 1 at slot 4; siblings final; titles final; styles restored |

The reorder boundary rule is the row's center crossing the midpoint of the next slot (30 px, 90 px,
150 px offsets; sampled at 36/90/162 because the moves are 18 px). The final slot is 4. The
release at the slot center with downward velocity is a valid flick with no target change: the
spring overshoots and returns; the oracle expects it. The held frame reads one rect per frame; the
`stats.reads` delta is 1 on held frames (allowed by §5.10; see G13).

Every frame: the held row's drawn origin = take point + offset (≤0.05 px); the title = its `A` +
`h`; the siblings/titles = their tracks; the reorder commits are checked at the first frame after
each.

**6. Gates.**

| Gate | Value | Scene target |
|---|---|---|
| G1 | ≤ 0.05 px every edge | 14 participants; the held row and its title are the critical rows |
| G2 | ≤ 0.05 px | take, each reorder, release; the held row must not jump at a reorder |
| G3 | ≤ 1 % + 1 px/s | the release (900 px/s); the reorder retargets of the siblings |
| G4 | ≤ 0.05 px | sibling springs and the release |
| G5 | ≤ 0.01 px; no pose | final 7 rows/titles; no leftover |
| G6 | byte for byte | `translate`/`scale`/`border-radius`; the held row's styles restored |
| G7 | exact | reorder 1 `'interrupted'`, reorder 2 `'interrupted'`, reorder 3 `'ended'`, release `'ended'`; snapped `[]`; no diagnostics |
| G8 | p95 ≤ 2 ms; no >8 ms | 1 held + siblings; the held read |
| G9 | ≤ 2× floor | N = 14 reported |
| G12 | ≤ 0.1 ms per held element | **1 held**: p95 of 600 held frames / 1 ≤ 0.1 ms |
| G13 | exact reads | held frames: exactly 1 rect read per held element before any write; commit reads 14 + 14; 7 radius reads per capture (rows radius true; titles radius false) |
| G14 | fingerprint | advisory on mismatch |

**7. Negative control.** Do not rebase the held point when the reorder changes the row's `A` (keep
the old offset). At the first reorder the held row jumps 60 px; G2 fails at the reorder commit and
G1 on the next frame. A second control releases with `dt ≠ 0` (advance one frame before the first
release update) or with `v = 0`; G3/G4 fail. A third control drops the title's `h` (the title
stays at its rest origin); G1 fails on the title during the hold.

**8. Feasibility / P4.** This scene requires the P4 public surface: `createLayoutGroup` returns a
`LayoutDrive`, and `group.take(row1)` / `handle.move` / `handle.release` are specified by §5.10 and
§7.1. The worktree at `3f25ec8` does not implement them; H13 is the P4 contract. The scene is
vanilla (no React); `useLayoutDrive` is not used. The gesture layer owns pointer capture,
`pointerId`, `touch-action`, velocity estimation and keyboard operation; the scene supplies exact
offsets and the exact release vector `{x:0,y:900}`. The held frame cost and the held read are P4
gates, not P2. P3 supplies G7.

### 2.10 S-SHEET — Sheet detents (vanilla, P4)

**1. iOS reference and intent.** A bottom sheet rests at the medium detent. The user drags the
grabber up; the sheet follows the finger 1:1. On release with an upward flick it springs to the
large detent; a second drag down with a fast downward flick dismisses it off the bottom. The sheet
is the participant; the drive seam supplies the offsets and the release velocity; the scene chooses
the detent from the projected position.

**2. Geometry, DOM, participants, channels.**

Viewport 390 × 844; a light background list/map (non-participant) and a black scrim
`rgba(0,0,0,1)` at opacity 0.20 (medium) / 0.35 (large) / 0 (dismissed). The sheet is
`(0, top, 390, 720)`, top = 422 medium, 124 large, 844 dismissed; `#FFFFFF`, top corners 10,
shadow `0 -8px 40px rgba(0,0,0,0.20)`; `overflow: hidden`. Grabber 36×5 radius 2.5 `#C7C7CC` at
`(177, top+10)`; title "Filters" 22/28 700 at `(24, top+36)`; five filter rows 44 px; "Done"
button `(16, top+656, 358, 50)` radius 12 `#007AFF` white 17/22 600. At medium the sheet's bottom is
offscreen; the Done button is visible only at large. The sheet is `layout: 'position'` (size
390×720; origin only), `radius: true` (top 10; bottom 0). The background/scrim are
non-participants.

DOM: `div[data-scrim]` (non-participant) and `div[data-p="sheet"]` (`layout: 'position'`,
`radius: true`) with non-participant content. N = 1. `maxNodes` 300; `maxParticipants` 2,000.

| Key | Mode | B (start) | A (first release / second) | Notes |
|---|---|---|---|---|
| `sheet` | position | `(0,422,390,720)` | `(0,124,390,720)` (large) | first release -1200 px/s; second release `(0,844,390,720)` (dismiss) |

**Nested participants: none** — the sheet's grabber, title, filter rows and Done button are
non-participant author DOM; the sheet is one position participant. The scrim is a non-participant
author layer; there is no sheet content that needs counter-scaling (the sheet only translates).

**3. Visual-quality spec.** Sheet `#FFFFFF`, top corners 10, shadow; grabber; title 22/28 700;
rows 17/22 400 with 0.5 px separators; Done `#007AFF` radius 12. The scrim black at the stated
opacities; the background is a simple list, not a photo. The sheet's content is clipped by the
sheet and the viewport; at medium the bottom is offscreen, which is the point of a detent. The
sheet's on-screen radius stays 10 (the sheet only translates). z-order: background 0, scrim 5,
sheet 10.

**4. Motion spec.** `SHEET` spring D 0.45, b 0.08, delay 0; `transform-origin: 50% 0%`. The held
phase: `take(sheet)` at the grabber; each `move({x:0,y})` sets the top to `takeTop + y` at the next
frame; the sheet's size is fixed; the scrim opacity is updated from the top (author style, not a
layout participant). The release target is chosen by the scene:
`projected = top_release + v_y·0.20 s`; candidates `{large:124, medium:422, dismissed:844}`; the
nearest by absolute distance wins; ties go to the smaller |distance| (none in this script). The
scene sets the sheet's layout `top` to the chosen detent **before** `release`, so the engine's
release springs from the presented top to the new `A` with the supplied velocity; the first update
`dt = 0`. The scrim animates to the detent's opacity over 0.30 s EASE_OUT (author).
Reduced motion: the hold stays 1:1; `'jump'` lands at `A` with no motion; `{maxDuration: 0.2}`
clamps; `'ignore'` primary.

**5. Script and oracle (vanilla; 16 ms/20 ms frames).**

| Frame / time | Action | Expected report | Oracle expectation |
|---|---|---|---|
| rest | medium top 422; scrim 0.20 | — | sheet at `A`; no track |
| `f = 0` | pointerdown at grabber `(195,434)`; `take(sheet)` | — | held; drawn top 422; no jump |
| 12 moves, 16 ms apart | `move({x:0,y:−15k})`, k=1…12; top 242 | — | drawn top = 422−15k every frame; G1; the sheet under the finger |
| at 192 ms | set top 124; `release({x:0,y:−1200})` | run 1 `'ended'` | projected `242−240=2` → large 124; B=242, A=124, v=−1200; first update dt=0; the spring overshoots up and settles at 124; G3/G4 |
| after settle (≥ 1 s) | pointerdown at grabber `(195,136)`; take; 10 moves down 30 px/20 ms to top 424 | — | held; drawn top 424 |
| at 200 ms | set top 844; `release({x:0,y:+1600})` | run 2 `'ended'` | projected `424+320=744`; nearest is dismissed 844 (100) vs medium 422 (322); B=424, A=844, v=+1600; the spring slides offscreen; unmount at settle; G3/G4 |
| settle | — | `'ended'` | sheet unmounted; scrim 0; background; styles restored |

The detent rule is scene policy, not authority (A-10). The held read is one rect per frame; G12.
The first release's `A` is set before `release` so the release uses the latest `A` (§5.10).

**6. Gates.**

| Gate | Value | Scene target |
|---|---|---|
| G1 | ≤ 0.05 px every edge | 1 participant; every frame; the held top and the release |
| G2 | ≤ 0.05 px | take, first release, second take, second release; the first frame of each |
| G3 | ≤ 1 % + 1 px/s | the two releases (−1200, +1600) |
| G4 | ≤ 0.05 px | the two release springs |
| G5 | ≤ 0.01 px; no pose | first settle at 124; final unmount; no leftover |
| G6 | byte for byte | `translate`/`scale`/`border-radius`; the sheet's styles are checked at the settle before unmount, then the element is removed |
| G7 | exact | first `'ended'`, second `'ended'`; snapped `[]`; no diagnostics |
| G8 | p95 ≤ 2 ms; no >8 ms | 1 held/1 mover |
| G9 | ≤ 2× floor | N = 1 reported |
| G12 | ≤ 0.1 ms per held element | 1 held, two holds; p95/1 ≤ 0.1 ms |
| G13 | exact reads | held frames 1 rect before writes; commit 1 + 1; 1 radius read per capture |
| G14 | fingerprint | advisory on mismatch |

**7. Negative control.** On the first release, choose the medium detent (422) instead of large
(124). The sheet settles at 422; G5 fails (final rect vs the probe `A` 124 by 298 px). A second
control releases with `dt ≠ 0` (advance a frame before the first release update); G2/G3 fail at the
release. A third control sets the detent `top` after `release` (the release uses the old `A`); the
sheet lands at the wrong detent or retargets; G5/G7 fail.

**8. Feasibility / P4.** `group.take(sheet)`, `handle.move`, `handle.release` per §5.10/§7.1; the
worktree at `3f25ec8` does not implement them. The scene is vanilla. The gesture layer owns pointer
capture, the velocity estimate, keyboard operation and announcements; the scene supplies exact
offsets and release vectors. The detent selection is scene policy, not layout. P3 supplies G7; P4
supplies the drive. The `L-DRIVE-3` scroll-under-scale row is not exercised by this scene; the
`L-DRIVE-5` reduced-motion release is.

### 2.11 S-BULK — Large list shuffle (vanilla, P2 + P4 held shape)

**1. iOS reference and intent.** A dense board of 1,000 items shuffles: 300 of them move at once,
the rest stay, and the frame remains a native 60 Hz surface. This is the §11.5 cost shape made
visual: a real 1,000-participant DOM, a real 300-mover shuffle, a real nested mover for every moving
tile, and the exact-read/cost/held shapes on the pinned instrument.

**2. Geometry, DOM, participants, channels.**

Viewport 1280 × 720, DPR 1; stage `#0B0B0F`. Grid: 32 columns × 27 rows, tile `36 × 18`, gap 3,
pitch 39 × 21, origin `(17.5, 25.5)`; 850 tile slots (32 × 27 = 864; 14 empty at the end). 850
tile participants + 150 nested label participants = **1,000 participants**. The first 150 slots
(rows 0–3 plus 22 slots of row 4) are the **moving set**: 150 tiles, each with a nested label.
The other 700 tiles are static. The 300 movers = 150 tiles + 150 labels. The 700 static tiles make
the 1,000-participant capture real. All 1,000 are within the 1280×720 viewport (the grid is
564 px high), so no participant is culled in the frame fixture.

DOM: `div[data-grid]` > 850 `div[data-p="tile-k"]` (`layout: true`, `radius: false`); 150 of them
contain `div[data-p="label-k"]` (`layout: 'position'`, `radius: false`, 34×16 inset 1, radius 2,
8/10 600 white). Tiles are 36×18, radius 4, fill from a 12-color palette
(`#5B5BD6`, `#E5484D`, `#30A46C`, `#F76B15`, `#0090FF`, `#D6409F`, `#FFC53D`, `#12A594`, `#FF9500`,
`#AF52DE`, `#FF2D55`, `#5AC8FA`), with a 1 px light border `rgba(255,255,255,0.08)` and a 2-letter
initial. The label is a 34×16 translucent plate `rgba(255,255,255,0.12)`; the tile fill is visible
around it.

The shuffle is a fixed 150-cycle permutation of the moving tile IDs among the 150 slots (no fixed
points). The 700 static tiles keep their slots. The moving tiles' `A` is the new slot; their labels'
`A` is the new slot's inset. The 150 tiles move; their 150 labels move because their own layout
boxes move under the parent; the 700 static tiles (no labels on static) stay. The nested
labels are position participants; their size is pinned 34×16; they are counter-projected under the
tile's pose (the tile's size is constant, so this is a pure translation).

N = 1,000; movers = 300; `maxNodes` 300 (exactly 300 is not "exceed", §9.1), `maxParticipants`
2,000; `radius: false` on all tiles/labels (no radius reads); `threshold` 1 px; `engine: 'raf'`.

**3. Visual-quality spec.** Dark stage `#0B0B0F`; tile palette as above; tile radius 4; tile border
`rgba(255,255,255,0.08)`; label plate `rgba(255,255,255,0.12)`, radius 2, 8/10 600 white. No
shadow, no text scaling (the label is position-pinned; the tile size is constant). The shuffle is
a real reorder of the tile elements; the grid is not a canvas, an image or a CSS-only fake. The
screen is readable at 1280×720; the labels are legible at 8 px. The 300 movers are all visible in
the frame fixture, so the frame-scoring is meaningful.

**4. Motion spec.** `BULK` spring D 0.40, b 0.10, delay 0, `transform-origin: 50% 50%` on tiles and
labels. The shuffle is one commit: 150 tile tracks (old slot → new slot) and 150 label tracks (old
inset → new inset); 700 static participants at `A`. No presence, no crossfade, no radius. The
sustained shape repeats the shuffle every 16.667 ms for 5 s (300 movers, 60 Hz commits). The
steady-frame shape is the same 300 nested movers during the shuffle. The held shape uses P4: hold 1
and 10 tiles, move them, release; the held read is one rect per held element per frame. Reduced
motion: `'jump'` places the shuffle at the new slots; `{maxDuration: 0.2}` clamps the spring;
`'ignore'` primary. The frame-scoring run is the single shuffle; the sustained/held shapes are
real-clock cost runs.

**5. Script and oracle.**

| Frame / time | Action | Expected report | Oracle expectation |
|---|---|---|---|
| rest | 1,000 participants at their slots; no tracks | — | all at `A` |
| `f = 0` | commit the fixed 150-cycle shuffle | `'ended'` at the spring settle | 150 tile tracks + 150 label tracks; 700 static at `A`; G2 for the movers; G1 every frame; G4 |
| `f = 1 …` | 16 ms frames until settle | — | every tile/label at its track; the labels are 34×16 pinned; the 300 movers are visible |
| settle | — | `'ended'` | new slots; styles restored; no tracks/holds; G5/G6 |
| cost run A | 1,000 participants, unscrolled; 30 commits, 5 discarded | — | G9 ratio engine/floor |
| cost run B | the cost fixture (16×54 grid), scrolled 1.5 viewports (1,080 px) | — | G9 ratio; G13 reads |
| steady | 300 nested movers; 600 frame samples | — | G10 p95 ≤ 2 ms |
| sustained | 60 Hz commits, 300 moving, 5 s | — | G11 p95 ≤ 2 ms |
| held 1 / held 10 | P4 holds; 600 frames each | — | G12 p95/held ≤ 0.1 ms |

The cost fixture lays the same 1,000 participants in a 16 × 54 grid (tile 60×32, gap 4; content
1,940 px) inside a 1280×720 scroller; `scrollTop = 1080` (1.5 viewports). The floor fixture is the
plain-DOM twin of that cost DOM. The 150 labels stay nested in the 150 moving tiles; the 300 movers
and the 700 static tiles are unchanged in count. The floor audit
counts 1,000 rects + 1,000 pairs in capture, 1,000 + 1,000 in flush, the active computed values,
and the t = 0 pose writes. The engine's `stats` per commit is compared to that count.

**6. Gates.**

| Gate | Value | Scene target |
|---|---|---|
| G1 | ≤ 0.05 px every edge | 1,000 participants × every frame; the 300 movers and 700 static |
| G2 | ≤ 0.05 px | the shuffle; no aged (vanilla) |
| G3 | ≤ 1 % + 1 px/s | none (from rest); report "n/a"; the shuffle is a single from-rest commit |
| G4 | ≤ 0.05 px | 300 spring tracks |
| G5 | ≤ 0.01 px; no pose | final slots; no leftover |
| G6 | byte for byte | `translate`/`scale`/`overflow-anchor`; no radius; no `inert` |
| G7 | exact | `'ended'`; snapped `[]`; no diagnostics; no capped |
| G8 | p95 ≤ 2 ms; no >8 ms | 300 movers |
| G9 | ≤ 2× floor; 1,000 participants; unscrolled and 1.5 viewport scrolled; median of 5 ratios | **owns the named gate** |
| G10 | p95 ≤ 2 ms at 300 nested movers | **owns the named gate** |
| G11 | 60 Hz, 300 moving, 5 s, p95 ≤ 2 ms | **owns the named gate** |
| G12 | ≤ 0.1 ms per held element; 1 and 10 held | **owns the named gate** (P4) |
| G13 | exact reads; steady zero; stats | **owns the named gate** |
| G14 | fingerprint | **owns the fingerprint record** |

**7. Negative control.** Move one tile's target by 1 px (a typo in the permutation). G1 fails on
that tile's edges at the first post-commit frame (the engine is exact, the scene target is wrong).
For the cost gate, add one extra rect read to the floor fixture; the floor audit fails (an
over-counting floor is a harness failure) and G9 must not be used. A third control holds 10 tiles
but reads 11 rects per frame; G12/G13 fail.

**8. Feasibility / P4.** Vanilla group; 1,000 `add` calls; the shuffle is a DOM order change inside
`group.update`. The 150 labels are nested participants; the 300 movers exactly hit `maxNodes`, so
the scene must not add a 301st visible mover. The cost fixture is a separate page instance with
the same DOM and a scroller; the floor fixture is plain DOM. The held shape requires P4 (`take` on
1 and 10 tiles); until P4 lands, the S-BULK frame scene is P2 and the held shape is reported
`pending: P4`, not a pass. P3 supplies G7; the frame scene's reports are simple.

---

## 3. Authority ambiguity register

Each entry quotes the authority sentence, states the readings, and records the strict reading this
specification uses. None of these readings changes a gate value; if an engine behavior conflicts
with a reading, the engine or the scene is fixed, not the tolerance.

**A-1 — S-CARD, "40 % of the flight".**
> "A card expands to a full-screen sheet (shared `layoutId`, radius 20 → 0, nested title and image),
> collapses; reversed at 40% of the flight"

Readings: (a) 40 % of the collapse's perceptual duration `D`; (b) 40 % of the physical settle
`T_s` (1.67 D +); (c) 40 % of the expand. Strict reading: the **collapse's** perceptual flight, at
the first 16 ms frame whose oracle elapsed reaches 40 % (frame 15 = 224 ms = 40.7 % of 0.55 s).
The close starts after the open's physical settle, so the collapse is a separate from-rest track.
If the authority intended `T_s`, the script's frame is earlier in the track than 40 % of `T_s`;
that would be a different scene timing, not a tolerance. The scene's exact time is declared so the
harness is deterministic.

**A-2 — S-SEG, "shared `layoutId`" with one pill.**
> "The selection pill moves between 4 segments (shared `layoutId`); four taps 80 ms apart, each
> retargeting the running spring"

Readings: (a) the pill is one participant with a stable `layoutId`; (b) each segment owns a pill
and the id handoffs between them (a crossfade). The native iOS control has **one** pill that slides;
a crossfade of two pills is not the reference. Strict reading: one pill, one stable `layoutId`; the
id is used for identity/radius, not for a second node. The four taps select 1, 2, 3, 0 (the first
tap must move; tapping the already-selected segment would not retarget).

**A-3 — S-PHOTO, "back while scrolled 1.5 viewports".**
> "A thumbnail opens to the aspect-fit detail (aspect change, nested image counter-scale), back
> while scrolled 1.5 viewports, in a grid of 300"

Readings: (a) the grid is at a 1.5-viewport scroll offset when the back commit happens; (b) the grid
is scrolled by another 1.5 viewports while the detail is open, then back. Strict reading: (a) — the
scroller is at `scrollTop = 1077` at the open and at the back; it is not scrolled during the
flight. The open is a handoff out of the scroller, so the scroller must be inactive (`scrollend`)
before the open; the back's departing node is outside the scroller, so the active-scroller rule
does not apply. A variant that scrolls the grid while the detail is open is not the primary script;
it would add a camera translation to the target and is reported separately if run.

**A-4 — S-INSERT, "top of a list scrolled by 1.5 viewports".**
> "Three items enter at the top of a list scrolled by 1.5 viewports, under presence, with the
> siblings moving"

Readings: (a) the top of the list **content** while the scroller is at 1.5 viewports (the new rows
are above the viewport); (b) the top of the **visible** list (the new rows appear at the viewport
top); (c) the list is scrolled to 1.5 viewports during/after the insertion. Strict reading: (a) —
the three rows are prepended to the content at `scrollTop = 1000`; the visible driven rows move down
234 px; the new rows are above the viewport and are culled by layout but still enter under
presence. The visible evidence is the sibling shift, not the new rows. This is the literal reading
of "top of a list" and it exercises the §12 uncompensated-shift condition with only driven rows
visible. If the authority intended (b), the scene would need a different scroll position; that is a
scene variant, not a gate change.

**A-5 — S-ACC, "the scroller content move".**
> "A row expands, its siblings and the scroller content move; a second row expands mid-flight; the
> first collapses"

Readings: (a) the scroller's content height grows and the rows below move (the scroll offset stays
0); (b) the scroller itself scrolls (a camera move) to keep the row in view. Strict reading: (a) —
the content height grows from 533 to 773, the scroll range becomes 20 px, the offset stays 0, and
the siblings move. The scene's `scrollTop` is recorded before/after and must not change. A scroll
camera would make the participants' `A` include the scroll translation; it is not the primary
script.

**A-6 — S-STACK, "presence on the counts".**
> "A stack of 6 cards fans out to a list (nested participants, presence on the counts), collapses"

Readings: (a) the per-card count badges are the presence-animated elements; (b) the number of
visible cards is presence-driven (the back cards enter/exit); (c) the count text changes under
presence. Strict reading: (a) + (b) are both satisfied by the chosen scene: six cards are always
mounted, badges 1–5 enter/exit under presence, and the front badge's count is "6" (the stack count).
The card count does not change; no card enters/exits. If the authority intended (b) as card
presence, that would add card enter/exit motions not in the row's sequence.

**A-7 — S-ISLAND, "interrupted back at 30 %".**
> "A pill morphs to an expanded card (size, radius, crossfade of contents), interrupted back at
> 30%"

Readings: (a) 30 % of the perceptual duration `D`; (b) 30 % of the physical settle `T_s`; (c) 30 %
of the wall time to the next event. Strict reading: (a). With D = 0.50 s and a 10 ms step, 30 % is
150 ms; the from-rest track's elapsed reaches 150 ms at frame 16 (wall 160 ms). The script commits
the reverse immediately after frame 16. The exact frame is declared; if `T_s` was intended, the
reversal would be earlier in the perceptual track.

**A-8 — S-DELETE, "a second delete 100 ms later".**
> "An item exits under presence, siblings close the gap; a second delete 100 ms later"

Readings: (a) 100 ms after the first delete's commit; (b) 100 ms after the first exit's presence
settle. Strict reading: (a) — 100 ms wall time after the first delete commit, at frame 18 of a
10 ms step (the first delete is at frame 8, the second at frame 18). The second row is deliberately
mid-flight from the first gap closure, which is the point of the scene. If (b) were intended, the
second row would be at rest and the popLayout mid-flight case would not be tested.

**A-9 — S-REORDER, "release with velocity".**
> "A drag through the drive seam with the list reordering under it; release with velocity"

Readings: (a) the release velocity is supplied by the gesture layer and the row springs toward its
current `A`; (b) the release velocity also selects a new slot/target. Strict reading: (a) — the
list reorders during the drag; at release the row's `A` is slot 4, the release vector is
`{x:0,y:900}`, and the spring overshoots and returns. The authority's §5.10 release rule ("the
next frame starts the origin track from the presented origin toward the current A with incoming
v") is exactly this. If (b) were intended, the scene would need a target-selection policy not in
the authority.

**A-10 — S-SHEET, "released with velocity; flick to dismiss".**
> "A sheet dragged between detents through the drive seam; released with velocity; flick to
> dismiss"

Readings: the authority does not define the detent-selection or dismiss threshold. Strict reading:
the scene defines `projected = top + v·0.20 s` and the nearest of `{large 124, medium 422,
dismissed 844}`; this is scene policy, not an engine rule. The engine's obligation is only that the
release starts from the presented origin with the supplied velocity and lands exactly on the
scene's `A`. A different policy would be a different scene, not a different tolerance.

**A-11 — Velocity continuity is instantaneous; presented rects are samples.**
> "Velocity continuity: at each retarget, the presented edge velocity after against before |
> ≤ 1% of the larger speed + 1 px/s"

A finite difference over a 16 ms frame measures the average velocity over the interval, not the
instant; a spring's acceleration can make the average differ by hundreds of px/s at a retarget.
Strict reading: the gate is evaluated on the **analytic edge velocity of the declared track
chain** at the retarget instant (before: the previous track's derivative; after: the new track's
derivative). The engine's actual continuity is established by G1 at the retarget frame and the next
frame, and the harness reports a finite-difference velocity as supporting evidence only. The gate
value is unchanged; the measurement is the only coherent instantaneous reading.

**A-12 — G9 at fewer than 1,000 participants.**
> "Per commit, the §11.5 commit gate." (§11.6)
> "Commit (capture + flush) ≤ 2× the measured floor ... at 1,000 participants, unscrolled and
> scrolled by 1.5 viewports." (§11.5)

Readings: (a) the ratio gate applies at each scene's own N (same DOM/floor); (b) the named gate is
defined only at 1,000 participants, so only S-BULK decides it and other scenes report their ratio.
Strict reading: (b) for the named gate, plus (a) as reported evidence at the scene's N. The
harness must not claim G9 for a 6-participant scene as if it were the §11.5 gate; it may report the
ratio and must still run S-BULK's 1,000 shape.

**A-13 — Status of overlapping runs.**
> "A mixed run (some nodes animate, some snap) resolves by its tracks, and lists the snapped nodes
> with their reasons." (§9.3)
> "A run whose track is replaced by a later flush resolves `'interrupted'` at that moment; its
> untouched tracks keep running under the engine." (§7.1)

Readings: a run with some tracks replaced and some kept may be `'interrupted'` or `'ended'`; the
authority says a replaced track interrupts the run, while untouched tracks keep running. Strict
reading: any replaced track makes the run `'interrupted'` at the replacing flush; the untouched
tracks still run and are scored. S-ACC, S-DELETE, S-SEG and S-REORDER use this reading. The scene
tables give the expected sequence; if the engine implements a per-track report instead, that is an
authority/engine defect to resolve, not a scene tolerance.

**A-14 — Culled nodes in `report.snapped`.**
> "Both boxes outside the viewport ± 10 % ... that node jumps, uncounted toward `maxNodes` ... |
> `'culled'` (silent)" (§9.1)
> "Snapped nodes are listed in `report.snapped` and passed to `onSnap`. ... `'culled'` and
> `'reduced'` are normal operation and stay silent." (§9.1)

"Silent" is ambiguous between "no development warning" and "not in the report". Strict reading:
culled is a `SnapReason`, so it is listed in `report.snapped` and passed to `onSnap`; "silent" means
no development warning. S-INSERT expects exactly the three new rows as `culled`. If the engine omits
culled from `snapped`, the S-INSERT report gate fails and the engine is fixed, not the scene.

**A-15 — "one report" vs five runs.**
> "P5 closes when one report on the pinned environment passes every scene in both engines."
> (§11.6)
> "one warm-up run is discarded, then 5 runs are measured, each in a fresh browser process ... a
> gate's value is the median of the 5 per-run statistics" (§11.5)

Strict reading: the closing report is the aggregate of the 5 measured runs (and the discarded
warm-up), not a single run's PASS. A report that contains one run's numbers is a per-run report,
not the checkpoint report. The harness writes one report document containing every per-run
statistic, the medians, `g` and the fingerprint.

**A-16 — Aged React allowance.**
> "First-frame continuity: the first frame after each change against the last presented frame |
> ≤ 0.05 px (≤ 0.5 px for an aged capture in a React time slice)"

Readings: the 0.5 px allowance applies per participant when the diagnostic `capture-aged` is
present, or per scene if any participant is aged. Strict reading: per participant, and only when
the scope emitted `capture-aged`; a fresh React commit still gets 0.05 px. The primary S-ACC/S-
INSERT/S-DELETE scripts must be fresh; the time-sliced variant is a separate run and must carry the
diagnostic, not silently use the looser bound.

**A-17 — Viewport/DPR/fonts are not specified.**
> "A scene is a scripted sequence on the manual clock, with optional interruptions at fixed
> frames." (§11.6)

The authority does not fix the viewport, DPR, font or image assets. This specification chooses
390×844 @ 2 for the interaction scenes, 1280×720 @ 1 for S-BULK, the system SF Pro stack, and
inline SVG data URIs. These are scene contributions. A different viewport is a scene variant; it
does not change a gate. The DPR 1/2/3 sweep is a reported support run for the fractional/degenerate
boxes, not a hidden tolerance.

**A-18 — WAAPI is not applicable.**
> "Top-level `layout: 'position'` participants only, with a timing motion, without `layoutAnchor`,
> `layoutId` or `radius: true`; an effective spring motion (on `add`/`set`, or the group's own
> `motion`), a nested participant, or `take` throws `ANI_INVALID_OPTIONS`, never degrades." (§10)

All 11 scenes need at least one of springs, nesting, `layoutId` or radius; none can run on
WAAPI. Strict reading: the P5 scene set is `engine: 'raf'` only. WAAPI's W1/W3 gates and the
`waapi` trace are separate §10 evidence, not P5 scenes. A scene that tried WAAPI would throw, not
degrade.

**A-19 — S-BULK's "300 nested movers" and `maxNodes`.**
> "Steady frame p95 ≤ 2 ms at 300 nested movers." (§11.5)
> "Visible movers exceed `maxNodes` ... the whole flush snaps" (§9.1)

The 300 movers are 150 tiles + 150 nested labels; the 700 static tiles are participants but not
movers. `maxNodes` is 300, so 300 is not "exceed". If the engine counts a nested label as an
additional mover (it is one), the count is exactly 300; a 301st would cap. The scene must not add a
label to a static tile or a 151st moving tile. If the engine's "nested movers" means 300 **parents**
under a moving ancestor (not 300 total participants), the shape would be different; strict reading:
300 participants whose boxes move, with 150 of them nested under the other 150. The scene's 300 is
this shape.

---

## 4. P3/P4 feasibility and public-API dependencies

### 4.1 What exists at `3f25ec8`

`packages/layout/src` has `createLayoutGroup`, `add`/`set`/`capture`/`flush`/`update`/`finish`/
`dispose`, the measured-presentation plan/solve, presence links and the RAF realizer. It has no
`LayoutDrive`/`take` surface, no `layoutRuntime`/diagnostics stream, no `'failed'`/`'disabled'`
status implementation and no `maxParticipants`/`maxNodes` runtime cap surface beyond the options
described by the authority. P3 (H11b/H12) and P4 (H13) are future work in this tree. The P5 scenes
that need only P2 geometry can be built as pages now; their G7 reports/diagnostics and the P4 scenes
become runnable at P3/P4.

### 4.2 Public API each scene uses

| Scene | Group | Participants | Author layers |
|---|---|---|---|
| S-CARD | `createLayoutGroup({clock, motion: CARD, reducedMotion:'ignore', retain:1})` | `add` on 6; `layoutId`; `layout:'position'` title; `radius` | `createPresence` HOLD; crossfade is layout-owned |
| S-PHOTO | vanilla group | `add` on 301; `layoutId`; `radius:false` | overlay `ani` opacity |
| S-SEG | vanilla group | `add` on 1; `layoutId`; `radius` | selected label color |
| S-ACC | React `LayoutGroup` | `useLayout` on 43; `layout:'position'` header/body/separator; `radius:false` | chevron `rotate` CSS |
| S-STACK | vanilla group | `add` on 12; `layout:'position'` badges; `radius` | `createPresence` on badges |
| S-ISLAND | vanilla group | `add` on 2; `layoutId`; `radius` | `createPresence` HOLD; content `ani` opacities |
| S-INSERT | React `LayoutGroup` | `useLayout` 13 rows; `useLayout`+`usePresence` 3 new rows | presence enter |
| S-DELETE | React `LayoutGroup` | `useLayout` 9 rows; `AnimatePresence mode="popLayout"` | presence exit |
| S-REORDER | vanilla group + **P4 drive** | `add` 14; `layout:'position'`; `radius` | pointer layer |
| S-SHEET | vanilla group + **P4 drive** | `add` 1; `layout:'position'`; `radius` | scrim author |
| S-BULK | vanilla group | `add` 1,000; `radius:false` | none |

All groups set `reducedMotion: 'ignore'` for the primary run and `engine: 'raf'`. The React scenes
use `useLayoutGroup().update(fn)` so each scripted commit has an observable report; the adapter's
normal render path (`useLayout` + state) is the trigger, and `update` wraps the same state change.
`AnimatePresence` is used only where the scene needs an exit (S-DELETE); S-INSERT's new rows use
`usePresence` for the enter and `useLayout` for the position.

### 4.3 P4 dependency

S-REORDER, S-SHEET and the S-BULK held shape require the P4 public surface of §5.10/§7.1:
`createLayoutGroup(...).take(element)` returning a `LayoutDriveHandle` with `state`, `velocity`,
`move(offset)`, `release(velocity?)` and `cancel()`. The scene's gesture layer supplies exact
offsets and release vectors; the layout side freezes the origin, reads the held rect before any
write, solves the pose, carries descendants with `h`, and starts the release with `dt = 0`. The
worktree at `3f25ec8` has none of this. The P4 brief H13 is the contract; until it lands, these
scenes must be reported as blocked, not as failing or passing. The held cost gate G12 also depends
on P4.

### 4.4 P3 dependency

The scene reports' `status` and `snapped` (G7), the diagnostics stream, the kill switch and the
`inert`/focus diagnostics are P3 surface. The P2 scenes can be built and their geometry scored
before P3; their G7 rows are not claimed until P3 lands. S-CARD's crossfade `inert` is the P3
accessibility rule; S-REORDER's focus stability is L-A11Y-1.

---

## 5. Hardest visual-quality risks

These are the places where a scene that looks plausible can still fail the native-grade bar. They
are listed in the order they are likely to bite.

1. **Nested non-uniform scale and counter-scale at 0.05 px.** S-PHOTO's frame changes aspect
   1:1→4:3 while the image stays 4:3; S-CARD's title is position-pinned inside a 358×440→390×844
   surface; S-ACC's body is position-pinned inside a row that scales 48→168. WebKit applies a
   percentage origin to the device-pixel-snapped border box (§5.5); a fractional cell of 128.6667
   at DPR 2 makes the snap visible. The engine's Typed OM origin path must be exact, and the scene
   must not "fix" it with a rounded cell. The 0.05 px gate is four times tighter than the existing
   0.5 px browser rows; this is the first thing to measure on the pinned instrument.

2. **Crossfade coverage, radius and `inert` restoration.** S-CARD's three nested pairs and S-ISLAND's
   surface pair must keep source-over coverage 1 at every frame, draw identical on-screen radii from
   both layers, and restore the follower's `inert` byte-identically on the reversal. The focus must
   never be inside the follower (`focus-in-follower` skips the crossfade). A shadow or a
   semi-transparent surface breaks coverage invisibly to a rect-only check; the harness must check
   opacity/coverage and radius as visual assertions, not only the rect.

3. **Presence + layout composition for a moving second delete.** S-DELETE's second row is mid-flight
   when it is removed. `popLayout` must measure its **presented** box (getBoundingClientRect, with
   the row's own transform divided out, J-027), not its layout slot, and the presence exit must start
   there. A lift at the layout slot is a visible jump that the rect gate catches; a leftover layout
   pose on the exiting row is a double motion that the oracle catches.

4. **Scroll handoff and anchoring.** S-PHOTO's open is a handoff out of a scroller at 1077 px;
   the scroller must be inactive (`scrollend`) or the handoff degrades to a presence enter with
   `handoff-scroll-active`. S-INSERT's insert shifts 13 driven rows by 234 px with only
   driven content visible; the browser's scroll anchoring must not compensate (or must compensate
   before the first read), and the scroll offset must not be moved by layout's writes. These are
   the two places where the browser's camera and the engine's view-space plan can disagree.

5. **Held-frame cost and hold correctness under a moving list.** S-REORDER holds a row while the
   list reorders under it; the held point must be rebased on each reorder, the descendants must
   ride one `h`, and the per-frame held rect read must stay under 0.1 ms per held element. S-SHEET
   holds a 720 px sheet with a large shadow and a scrim; the held read and the pose solve must stay
   under the same gate. These are P4 risks, not P2.

6. **Text crispness and double text during crossfades.** S-CARD's title crossfades between two
   copies; if their boxes differ by a fraction mid-flight, the text looks doubled. The two copies
   must draw at the same lead track and the same computed font; the button/div font reset
   (J-033) must be applied. S-STACK and S-ISLAND's content scales are smaller; the front card and
   the expanded island must be at scale 1 at rest.

7. **Report/status semantics for overlapping runs.** S-ACC, S-DELETE, S-SEG and S-REORDER overlap
   runs; the `'interrupted'` sequence is a scene expectation that depends on the P3 status
   implementation. A per-track report instead of a per-run status would fail G7 even with perfect
   geometry; the engine must match §7.1/§9.3.

8. **The 0.5 px separator and the degenerate axis.** S-ACC's separators are 0.5 px tall; the
   support check's degenerate-axis path must read the exact computed size and not snap the
   subtree. A 1 px rounding assumption would fail the separator's own track and the row's layout.

9. **The 300-mover `maxNodes` boundary.** S-BULK's 300 movers are exactly at the default cap; a
   label or a tile counted twice, or a 301st mover, flips the whole flush to `'capped'`. The scene
   must not add a decorative participant to a moving tile; the harness must count exactly 300.

10. **Cost on the pinned instrument, not a dev laptop.** G9–G13 are decided on the D9 Mac and
    fingerprint; a fast local run is advisory. The floor audit is the defense against a slow floor;
    the scene's 1,000-participant shape must be the same DOM for the engine and the floor.

---

## 6. Implementation order and evidence (no pass claims)

1. **P3 first.** Land the runtime/status/diagnostics/inert surface. Build the P2 scene pages and
   the independent oracle in `bench/layout/`; run S-SEG (smallest) and S-CARD (nested) to validate
   the harness, then S-PHOTO/S-ACC/S-STACK/S-ISLAND/S-INSERT/S-DELETE. Each scene's first run is
   iteration 0: record every failing metric, worst frame/participant and root-cause hypothesis in
   `bench/layout/ITERATIONS.md`; do not weaken a gate.
2. **P4 next.** Land the drive seam, then S-REORDER and S-SHEET, then the S-BULK held 1/10 shape.
   The 0.1 ms/held gate and the release velocity are the deciding rows.
3. **S-BULK last.** The 1,000-participant commit, scrolled/unscrolled floor pairs, steady 300
   nested, sustained 60 Hz and held shapes are measured on the pinned instrument, 5 runs, median.
4. **One report.** The final report contains the fingerprint, the per-run statistics, the medians,
   `g`, the floor audit, the negative-control results and every scene/metric worst value; it is the
   only artifact that can support the native-grade claim. A single green run, a local run, or a
   visually pleasant demo is not evidence.

No scene in this document is claimed to pass. The specification is complete when the harness can
fail every one of the named negative controls and the engine rows in §1.13 are green; the scenes
then start their validation→improvement iterations.
