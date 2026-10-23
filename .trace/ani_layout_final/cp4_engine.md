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
- Lint: `biome check packages/layout tests/browser package.json` → 0 errors.
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
