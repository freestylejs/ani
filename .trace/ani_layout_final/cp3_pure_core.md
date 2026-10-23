# CP3: pure core, implementer's checkpoint review and the CP2 trial fix proof report

- Authority: `plan.md` CP3 (T3.1–T3.4, V3); `ARCHITECTURE.md` §3.1, §3.3, §5.1–§5.7, §9;
  drift K1, K8, K14.
- Code: `packages/layout/src/geometry.ts`, `motion.ts`, `solve.ts`, `plan.ts`.
- Tests: `packages/layout/src/__tests__/{geometry,motion,solve,plan}.test.ts`, plus the
  independent oracle `oracle.ts` (it shares no code with the four modules) and the fixture helper
  `nodes.ts`.
- Command (june-wsl `~/ani-v2/lay`):
  `pnpm vitest run layout/src/__tests__/{solve,plan,geometry,motion}.test.ts` → 4 files, 64/64
  pass.
- Typecheck: `pnpm --filter @freestylejs/ani-core build`, then
  `cd packages/layout && npx tsc --noEmit --skipLibCheck` → no errors outside the CPC harness that
  CP4 deletes. `biome check` on every changed file → 0 errors.
- No DOM or clock in the pure core: `grep -E "document|window|requestAnimationFrame|performance"`
  over the four modules finds nothing.

## Tasks

| Task | Output | Evidence |
|---|---|---|
| T3.1 `geometry.ts` | Per-axis affine `Map2`, `compose`/`invert`/`mapBox`; `Pose` and `aboutOrigin` (pose about an absolute origin point); `poseFor(v, box, ox, oy)`, the pose about `O` that draws `box` at `v`; `OwnTransform` → `ownMap` (inner map `Q` from inner values) and `unmapOwn` (`L` from `Q(L)`). | `geometry.test.ts`: the group laws; `poseFor` checked by the oracle's independent `applyPose` for origins inside and outside the box; `unmapOwn ∘ ownMap = id`. |
| T3.2 `motion.ts` | Option types, defaults (0.35 s, delay 0, `timing.easeOut()`). Validation throws `ANI_INVALID_OPTIONS` synchronously, including on a stateful timing (`timing.dynamicSpring`, rejected by the user). Normalized curve `e` with an exact `e′(0)` for linear, spring and bezier. Field-wise merge. Reduced-motion `maxDuration` clamp. | `motion.test.ts`: 15 invalid inputs each carry the code; every valid option is accepted; the policies; defaults; merge order; clamp; normalization including a spring; `e′(0)`. |
| T3.3 `solve.ts` | The track `c(τ) = A + (B − A)(1 − e) + kτ(1 − τ)²`, with `k = 0` at rest and `k = vD + (B − A)e′(0)` when moving, unclamped. The size floor `max(c, min(1, a, b))`. The delay rule. Modes. The anchor rule. Analytic velocities. Top-down projection with the parent's full map (§5.3). Crossfade opacity and the radius rule. | `solve.test.ts` (below). |
| T3.4 `plan.ts` | Movers by threshold over the animated channels. Keep vs retarget, carrying the velocity with no delay. `layoutId` lead/follower, handoff from a live or retained box, crossfade gating, the presence-opacity warning, duplicate ids. Culling of root movers (union path vs viewport ± 10 %), cap, stale, the unsupported subtree, `layoutDependency` skip, static descendants. | `plan.test.ts`: 22 cases, listed by `describe` block in the file. |

## V3

| V3 requirement | Test | Result |
|---|---|---|
| Random trees, depth ≤ 5, random timings and delays: composed drawn boxes equal the independent oracle within 1e-9 | `solve: exact projection …` covers 400 seeds and > 1,000 nodes. Every level has a random CSS box, origin and own inner map (`translate` + `scale`, half of them identity). Bezier/spring/linear/ease timings, delays, modes, anchors and carried velocities are random. The expected box is the oracle's per-channel track. The drawn box is the oracle's browser composition `rendered()`: each element's inner map, then its pose, root-ward. | pass (relative error < 1e-9) |
| Identity poses at settle | `every pose is identity once every track has ended` (100 random trees with inner maps) | pass |
| `c(0) = B`, `c(1) = A`, `c′(0) = v` for every retarget, including fast short ones | `linear/easeOut/spring: c(0) = B, c(1) = A, c′(0) = v`; `carries a fast retarget over a tiny distance in full (J-004)`; analytic vs finite-difference velocities on 100 random trees | pass |
| Size floor only when it binds | `floors a shrinking size at one pixel`, and the random trees, where the oracle applies the same floor | pass |
| Keep vs retarget | `plan: interruption` (keep on an unrelated re-render; retarget with velocity and no delay; retarget on changed options) | pass |
| Every snap reason | `plan: snaps`: `culled`, `capped`, `stale`; `plan: nesting`: `unsupported`. `reduced` is not a planner decision: the scope applies the reduced-motion policy before planning (§9), so it is proven by T4.3 (jump / maxDuration / ignore / toggle). | pass |
| Validation errors carry the code | `motion: validation throws ANI_INVALID_OPTIONS synchronously` | pass |
| No DOM or clock import | grep above | pass |

## Fix proof report for the CP2 trial (`cp2_spikes_trial_result.md`, frozen `a920df7`)

### J-001: projection across interleaved inner maps (S1)

**Essential defect (accepted).** The earlier model divided every inner map out of measurement and
composed poses only (`Mπ` = the parent's pose chain). An inner map `Q` that sits between a parent
pose and a child pose does not commute with independently timed poses. In the trial's DOM the
delayed child was drawn at x = 50 instead of its visual B = 40.

**Correction.** Track space is the visual space (`ARCHITECTURE.md` §3.1, §4.1, §4.2, §5.3, §6,
§11, §12; K1):

- B is the rect at capture, as it is. A is the rect at the flush with only the poses the engine
  last wrote divided out. Inner maps stay in.
- `Mₙ = Mπ ∘ Pₙ ∘ Qₙ`, where `Mπ` is the parent's *full* map (its frozen inner map and its
  current pose). The pose solves `Pₙ(Qₙ(Lₙ)) = Mπ⁻¹(V)` about the absolute origin `O`:
  `s = V′_w / X_w`, `t = V′_x − O_x − s(X_x − O_x)`.
- `solve.ts`: `SolveNode` gains `box` (`X = Q(L)`), the absolute origin and `inner`. The
  projection composes `compose(compose(Mπ, aboutOrigin(P, O)), Q)`. Tracks take the origin as
  fractions (`fx = (O_x − L_x) / L_w`), and `plan.ts` passes them through.
- At the end `V = A` for every node, so every pose is the identity. The settle is exact, even when
  a presence `transform` changed during the run. That change is a visual layer, declared in §3.1
  and §12 and covered by T4.3.

**Proof.**

- **The trial's DOM** is reproduced exactly in
  `a delayed child holds its visual B under a scaled, moving parent (CP2 trial J-001 counterexample)`:
  - Parent: left 100, width 200, `scaleX(.8)` about its top-left. Visual B (0, 160) → A (100, 160).
  - Child: left 50, width 100. Visual B (40, 80) → A (140, 80), delayed by 1 s.
  - At the parent's halfway frame the oracle's browser composition draws the parent at x = 50 and
    the child at **x = 40**, with child translation **−62.5**, scale 1 — the trial's own numbers.
  - At settle both poses are the identity.
- **Generality.** The 400-seed property test puts a random inner map on every level and random
  independent timelines with delays. The rendered rect of every node equals its own visual track
  within 1e-9, so interleaved inner maps and independent poses are exact in general, not only in
  the example. The identity-at-settle test covers the endpoint.
- **Oracle independence.** `oracle.ts` applies CSS's order (inner map, then pose, both about the
  origin, then the parent's) with its own `applyPose`; it never calls `geometry.ts`.

**Satisfaction mapping.**

- §§3.1/5.3/11 and K1 are corrected consistently.
- The visual delayed-child track, the endpoints and the identity settle are preserved.
- The visual oracle is not weakened: the expected rect is the visual track itself.
- T4.3 keeps the constant and animating presence cases and adds the trial's DOM as a browser case.
- `cp1_authority.md` marks its J-001 row as withdrawn.

**Residual risk.** A presence `transform` that animates during a layout run is a visual layer on
its element and its participant descendants. This is declared, it ends with the presence motion,
and T4.3 asserts it frame by frame.

### J-008: the Suspense reveal commit was unprobed (S1)

**Correction** (`tests/browser/cases/spike_proto.ts`, `spike_s1.ts`, `spike_s1_fixture.ts`):

- **Probe inside the boundary.** A second `Probe` inside the Suspense boundary takes the
  before-mutation truth of commits confined to it (a reveal).
- **unchecked.** A flush with no truth fails the case when it would animate (B differs from the DOM
  at the flush) or follows a reveal. Initial mounts, StrictMode effect replays and commits that
  move nothing are no-ops by that same test, so they are told apart without guessing.
- **Reveals.** A reveal is counted only when the flush compared it with truth, and once per new
  resolved content (a StrictMode replay of the reveal effect shows the same content). The Suspense
  case requires ≥ 6.
- **Scenario.** The Suspense scenario waits 450 ms, longer than React's 300 ms reveal throttle, so
  every reveal is its own commit.

**What the stricter check found, and the fix.**

- **The gap.** React 19 in Firefox and WebKit had one unchecked flush in the transition scenario:
  - The scheduler ran a commit and the start of the next render in the same task, before the
    commit's flush microtask.
  - The flush then consumed the capture that render had touched.
  - That render would have had no B if it touched nothing more.
- **The rule.** The flush now hands such a render a capture of the A it just read: exactly its
  before-box, at no extra read, and expired so a later touch re-reads (§4.1 "Hand-off", K14).

**Results**, `pnpm test:browser --browser <b> --case 'spike*:S1_*'`:

- 16/16 in each of Chromium, Firefox and WebKit (48/48).
- 4 builds: React 19.2.1 / 18.3.1, each plain and compiled.
- Every run: violations 0, missing 0, unchecked 0.
- Suspense: checked reveals 6 in every build and browser.
- Transition control (no refresh): 90 violations, max 37.3 px, so the check is still sensitive.
- `handoffs 1` in the React 19 transition runs in Firefox and WebKit.

Details are in `cp2_spikes.md` S1.

**Residual risk.** The spike remains a prototype. CP5's React adapter tests replace it and must
keep the four build variants, the in-boundary probe and the unchecked rule.

## Verdict

PASS (implementer review). T3.1–T3.4 and V3 are met, and the CP2 trial's J-001 and J-008 are
corrected with proof. CP4 may start, and CP3 goes to the Chief Justice with the J-001/J-008
re-judgment.
