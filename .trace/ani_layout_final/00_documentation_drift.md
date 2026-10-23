# ani-layout — documentation drift (2026-10-23)

Base: `v2/main` `4aade58`. Authority decision: the approved *ANI Layout — Final Architecture*
(Claude Docs, 2026-10-23) plus the Human Engineer's answers of 2026-10-23
(`layout` defaults to `true`; stateful timings are rejected). The new authority document is
`packages/layout/ARCHITECTURE.md`.

## 1. Authority documents inspected

| Document | Authority type | Claimed domain | Confidence after this decision |
|---|---|---|---|
| `packages/layout/ARCHITECTURE.md` (0.1.0, 548 lines) | Architecture contract | Tiers (View Transitions / WAAPI FLIP / snap), ownership, caps | Superseded |
| `packages/layout/ARCHITECTURE_CPC.md` (233 lines) | Architecture contract | Compiled Projection Core, depth ≤ 2, sampled keyframes | Superseded |
| `.trace/ani_layout_v1/*` (plan, direction, matrix, trials) | Plans and acceptance matrix | 0.1.0 plan; Motion matrix E1–E6, C1–C17, P0–P9 | Superseded; the E-row parameters are carried into the new plan |
| `.trace/ani_layout_cpc_v1/*` (plan, tasks, valids, trials, STATUS) | Plans | CPC checkpoints 01–06 (05 and 06 never passed) | Superseded |
| `packages/layout/README.md` | User docs | WAAPI FLIP, `capture`/`play` usage | Code is stale vs the new authority; rewrite with the code |
| `packages/web/content/docs/guides/layout.mdx` | User docs | `deps`, `LayoutConfig`, `'box'`, `'preserve-aspect'`, WAAPI FLIP | Rewrite with the code |
| `packages/web/content/docs/showcase/layout.mdx` + `layout_showcase.tsx` | Showcase | "compiles DOM changes into compositor-native transforms", depth-1 | Rewrite with the code |
| `.changeset/ani-layout.md` | Release notes | "WAAPI approximate FLIP", `LayoutConfig`, caps, step-downs | Rewrite with the code |
| `packages/layout/src/types.ts` (TSDoc) | Inline contract | `LayoutMode`, `LayoutResult`, `LayoutSnapshot`, `maxBoxes` | Replaced by the new API |

## 2. Claim scope (contract-level claims that the new authority changes)

| Claim | Old documents | New authority |
|---|---|---|
| L1 Engine | WAAPI FLIP / compiled keyframe plans with shared `startTime` | One solver on the core clock; WAAPI only as an optional gated engine |
| L2 Depth | ≤ 2 (CPC), parent-relative projection missing (0.1.0) | Unlimited, exact |
| L3 Trigger | `LayoutGroup deps` boundary; without `deps` every render plays | Automatic per commit; `layoutDependency` narrows only |
| L4 Modes | `'position'` default, `'box'`, `'size'`, `'preserve-aspect'` | `true` default, `'position'`, `'size'` |
| L5 Result | `LayoutResult` string, `LayoutSnapshot`, `play(snapshot)` | `LayoutReport { status, snapped }`, `capture()` / `flush()` |
| L6 Options | `maxAnimated`, `maxBoxes`, `onError` | `maxNodes`, `retain`, `onSnap`; no `maxBoxes` |
| L7 Crossfade | Every duplicate `layoutId` fades on every play | Only on a real handoff to an exiting follower; release held |
| L8 Velocity | Position path only | Every channel, velocity term |
| L9 Timing | Springs sampled to CSS `linear()` | Stateless timing evaluated per frame; stateful rejected |
| L10 React | `LayoutConfig`, class boundary with `getSnapshotBeforeUpdate`, facade with microtask snapshots | Render-phase capture, function `LayoutGroup`, implicit root scope |
| L11 popLayout | Box relative to `offsetParent` (wrong when unpositioned) | Box relative to the real containing block |
| L12 Acceptance | Paused-WAAPI oracle in Chromium | Frame-level oracle in Chromium, Firefox, WebKit |

## 3. Empirical evidence (v2/main `4aade58`)

| Claim | Evidence | Result |
|---|---|---|
| L1 | `packages/layout/src/layout_group.ts` (1,207 lines), `projection/*`: `Element.animate` with `startTime = document.timeline.currentTime` | Matches the old docs; drift vs new authority (code stale) |
| L2 | `projection/plan.ts` rejects depth > 2; final judgment: depth > 1 skipped without snapping | Code stale |
| L3 | `packages/react/src/layout/layout_group.tsx` `deps`; `layout_group.ts` ~567 restarts on stationary participants (measured) | Code stale; also a defect |
| L4–L6 | `packages/layout/src/types.ts` | Code stale |
| L7 | `layout_group.ts:490-498,1138-1163` | Code stale; defect |
| L9 | `easing.ts` samples 48 points | Code stale (kept only for View Transitions) |
| L11 | `react/src/layout/presence.tsx` `offsetParent` path | Code stale; defect |
| L12 | `tests/browser/cases/cpc.ts`, `cpc_harness.ts` (Chromium-only, WAAPI pause oracle); fresh-clone `test:ci` typecheck failure caused by the harness self-import | Test stale |

## 4. Drift list matrix

| ID | Severity | Document | Claim | Evidence | Drift type | Impact | Action |
|---|---|---|---|---|---|---|---|
| D1 | S1 | ARCHITECTURE.md, ARCHITECTURE_CPC.md | L1–L12 | Approved decision | Doc stale (superseded) | Two conflicting authorities | Replaced by one `ARCHITECTURE.md` (done in CP1) |
| D2 | S1 | `.trace/ani_layout_v1`, `.trace/ani_layout_cpc_v1` | Plans, gates, STATUS | Approved decision | Doc stale | Old plans read as open work | Deleted in CP1; E-row parameters carried into `plan.md` |
| D3 | S1 | Source (`layout_group.ts`, `projection/*`, React facade) | L1–L11 | §3 | Code stale | Defects measured in the final judgment | Rewrite (CP3–CP5) |
| D4 | S1 | Browser and unit tests (`cpc*`, `layout.ts`, `react_layout.ts`, `layout_group.test.ts`, `cpc_oracle.test.ts`) | L12 | §3 | Test stale | Prove the retired engine; break fresh-clone typecheck | Delete with the engine; new tests per `ARCHITECTURE.md` §11 |
| D5 | S1 | README, docs guide, showcase, changeset | L3–L7, L10 | §3 | Doc stale | Users would read the retired API | Rewrite when the new code lands (CP6) |

## 5. User ask matrix

| Drift | Decision needed | Decided by | Decision |
|---|---|---|---|
| D1–D5 | Is the approved architecture (doc) or the 0.1.0 code/docs authoritative? | Human Engineer, 2026-10-23 ("V1 Hard-Migration … 정확한 최종 단일 권위화 집행") | **Doc is authority.** No bridge, no compatibility layer |
| Open Q1 | Default `layout` | Human Engineer, 2026-10-23 | `true` |
| Open Q2 | `dynamicSpring` in layout motion | Human Engineer, 2026-10-23 | Rejected (stateful timings throw) |

No authority question is open.

## 6. Implementation clarifications recorded in the new authority

The new `ARCHITECTURE.md` states these implementation-level decisions that the source decision
left open or that the analysis found necessary. Each keeps every invariant and is stricter or
more exact than the source wording.

| ID | Clarification | Why |
|---|---|---|
| K1 | Track space is the visual space: B is the rect at capture as it is, A the rect at the flush with only the engine's last poses divided out. The pose solves `Pₙ(Qₙ(Lₙ)) = Mπ⁻¹(V)` with `Mπ` the parent's *full* map (frozen inner map and current pose), so `Mₙ = Mπ ∘ Pₙ ∘ Qₙ` (§3.1, §5.3). At the end `V = A`, so every pose is the identity even if an inner map changed; a presence `transform` animating during the run is a visual layer on the element and its descendants | CP2 trial J-001 refuted the earlier presence-free layout space with pose-only `Mπ`: a constant ancestor scale does not commute through independently timed parent/child poses (trial DOM: parent scaleX(.8) moving 0 → 100, delayed child drawn at x = 50 instead of its visual B = 40). With the full parent map the delayed child is drawn at 40 (translation −62.5) and settles at identity; `solve.test.ts` reproduces the trial's numbers and checks 400 random trees with random inner maps against an independent browser-composition oracle |
| K2 | Capture lifetime per task (§4.1 table): reuse within the capturing task, re-read in any later task, consumed by `flush()`; an animation frame between capture and flush is compensated exactly through the engine's drawn box | Ties every B to the DOM its own render pass saw: a render restarted after a pre-empting commit re-reads. Spike S1 shows it: with a sync commit pre-empting each transition, the no-refresh control uses a stale B 90 times (37.3 px), the rule 0 times (CP1 trial J-003) |
| K3 | Position channels interpolate the transform-origin point (§5.1) | Motion parity (centre origin); identical to top-left interpolation when the size animates |
| K4 | Presence ↔ layout coupling is package-internal (`presence_link.ts`) | The crossfade rules need the exiting phase, the opacity owner and a release hold without widening the adapter API |
| K5 | Development warnings only for `'unsupported'`, `'capped'`, `'stale'` | `'culled'` and `'reduced'` are normal operation |
| K6 | `layoutDependency` excludes the participant from planning; its capture read still happens | The new value is known only at commit, after capture |
| K7 | Radius uses A's radii divided by the total drawn scale | Keeps on-screen corners exact under nested scale |
| K8 | `k` is not clamped (`c′(0) = v` exactly); the only exception is the size floor (a size channel never drops below 1 px); a node moving at the flush ignores its delay | A clamp on `k` drops velocity (CP1 trial J-004: a 1 px retarget lost 94.5 %); holding B during a delay drops it too. The size floor is physical: a box cannot have a negative size |
| K9 | `AnimatePresence` is a capture/flush toucher | A settle commit renders no participant; without it siblings would jump after a `sync` exit |
| K10 | Vanilla `LayoutGroupOptions` has no `id` | A vanilla group is its own scope; namespacing is needed only where nested React groups share a scope |
| K11 | All four spikes S1–S4 run in CP2, before any production code; S4 is measured again on the real engine in CP4 | The source makes all four hard gates before P1 (CP1 trial J-005) |
| K12 | The flush reads first: A is measured with the engine's last written poses still applied and divided out exactly, so no owned style is restored or stripped before the read | Keeps "reads never interleave with writes" for a running retarget (CP1 trial J-002) |
| K13 | Implicit root scope per `(clock, document)` | Source wording; restores document isolation (CP1 trial J-007) |
| K14 | Flush hand-off: when a participant rendered after the commit's last layout effect, the React adapter calls `capture()` right after `flush()`, so that render keeps an exact before-box (§4.1) | Found by the stricter S1 check (CP2 trial J-008 fix): in React 19, Firefox and WebKit, the scheduler started the next render in the commit's task, before the flush microtask; the flush consumed the capture that render had touched. Re-capturing after the flush reads the after-boxes of every node the engine does not drive, which are that render's before-boxes. The adapter owns it because only it sees layout effects; the scope keeps its public API (CP4) |
| K15 | Planner/solver precision (CP3 trial J-009–J-015): drawn boxes and velocities resolve followers and anchored nodes independently of node order; an anchor applies only under a participant parent and moves by its offset and size, with momentum `k` on the offset; handoff happens on a lead change when the previous lead departs, even to an already registered node; culling (also under a moving ancestor, which stays counter-projected) precedes the `maxNodes` count; a timing must start with a finite slope (rejected with `ANI_INVALID_OPTIONS`); the size floor is one pixel or the smaller endpoint below it; a CSS transition configured on `translate`/`scale` (or `all`) snaps as `'unsupported'` | §5.1, §5.4, §5.6, §6, §9 amended; each case is a regression test in `solve.test.ts` / `plan.test.ts` / `motion.test.ts` |
| K16 | Engine lifecycle and composition (CP4 trial J-016–J-025): track options compared by value; a reduced-motion mode change re-plans running tracks; a removed lead retains its velocity; a lead retargeted mid-crossfade keeps its fade; every restore is written in the write phase; an inline authored change to an owned property is recognised by its priority and restored at settle; corners owned from mid-run are saved; an unregistered or disconnected mover is cancelled (`'disposed'` for a run left empty); B of a driven node is seen through the current presence matrices | §4.3, §5.5, §5.6, §6, §9, §12 amended; each defect is a browser regression case `layout:J16`–`J25` (and `plan.test.ts` J-020) |
| K17 | React adapter mechanics (CP5): removal deferred to the end of the task because React 19 StrictMode replays the refs and effects of mounted *and moved* fibers (a reorder otherwise loses the moved nodes' B); `usePresence` keeps `motion.initial` as a prop until the enter finished (React otherwise clears the enter's values for a frame, which also reads as a layout change); the trigger-contract warning's capture flag is reset at each flush and carried across the hand-off; participant options compared by value | §7.2 amended ("Adapter mechanics", "StrictMode", "Presence styles"); `react_layout:RL2` (StrictMode reorder), `react_layout:E5`, `react_layout:RL6`, jsdom `layout.test.tsx` |
| K18 | Engine precision from the CP5 trial (J-016, J-020, J-025) and CP6 acceptance: track options compared by *effective* value (group motion and defaults merged in; timing parameters in any key order); layer reconciliation recovers each pose with its rate and recomposes it through the current presence maps (exact velocity, replacing a size-ratio scaling); a removed lead is carried through its parent's current layers at the next flush; a crossfade that reverses keeps fading below the threshold and starts from the opacity the new lead shows; an inline merged ref in the toast example is replaced by `useLayout({ ref })` (a new merged ref per render recreates presence) | §5.5, §5.6, §7.2 example, §11 cost record amended; `layout:J16`/`J20`/`J25`, `geometry.test.ts` moving maps, `plan.test.ts` (retained size momentum, reversal), `solve.test.ts` (reversal weight), `acceptance:E2Create` |
| K19 | WAAPI engine realization (CP7): the decision's "created in the flush and start at the browser's pending-play time" holds in Chromium only; Firefox and WebKit count a main-thread block right after creation as elapsed time (29–30 % at the first frame after 120 ms). The animation is created in the flush, held paused at τ = 0 and played from the next animation frame, still without a `startTime`. The engine ships as `engine: 'waapi'` after all three gates passed | §10 rewritten (shape, realization, time, gates), §7.1, §8, §12; `waapi:W1`–`W5`, `waapi.test.ts`, `pnpm test:waapi-trace` |
