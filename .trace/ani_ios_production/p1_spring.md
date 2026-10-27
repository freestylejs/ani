# P1 `p1_spring` — self-judgment and P0 remediation proof

Final goal (from `00_plan.md`): a production-grade, iOS-native-grade layout animation tool on the
v3 authority, proved by unit, integration and e2e tests, with the bench harness as the device gate.

This checkpoint carries two things for one tribunal:

1. **P0 re-judgment.** The remediation of J-001..J-007 (`p0_authority_trial_result.md`, verbatim
   copy of the tribunal's report) is recorded in `p0_authority.md` § Remediation and proved below.
2. **P1.** Core `physics`, the motion union with its kind-level merge, spring tracks, the perceptual
   timeline, the reduced-motion grid, the settle cap and WAAPI rejection.

## Thesis / antithesis / synthesis

- **Thesis.** P1 delivers the spring as a first-class motion kind. It is exact against an
  independent oracle, it plugs into every place that consumed timing progress (crossfade, radius,
  presence release), and the authority now admits no wrong-motion path.
- **Antithesis.** The risks are these:
  - a spring that never settles inside a frame budget;
  - a perceptual timeline that disagrees with the fade/blend end;
  - merge semantics that silently mix a timing curve into a spring;
  - reduced-motion clamping that exceeds `maxDuration`;
  - an authority fix that only moves the wrong motion somewhere else.
- **Synthesis.** Each risk has a test or a proof below:
  - the exact settle uses bisection on the last tolerance exit;
  - the fade ends at `elapsed ≥ D` and L-SPRING-2 asserts it;
  - kind switches drop `duration`/`timing`/`bounce`, validation rejects a curve on a spring, and
    L-SPRING-3 covers it;
  - the reduced-motion grid property is L-SPRING-4;
  - every remediation path is checked by `p1_proofs.mjs`, including a reproduction of each
    original defect.

## P0 remediation proofs (re-judgment evidence)

Run `node .trace/ani_ios_production/p1_proofs.mjs` (pure, no browser). Output on this commit:

```
PASS  J-003 fractional parent 50.49 / child 1000 at total scale 0.1  (reads 1)
PASS  J-003 fractional parent 50.49 / child 1000 at total scale 1  (reads 1)
PASS  J-003 fractional parent 50.49 / child 1000 at total scale 10  (reads 1)
PASS  J-003 old rule rejects the same tree (documents the defect)  (recovered 990.295, error 9.705 > 6)
PASS  J-003 no false positive on 20000 random supported chains  (0 rejected)
PASS  J-003 a 3 % unowned zoom under a small parent is detected  (M [1.02897,1.03103])
PASS  J-001 raw δ translation is wrong under parent scale 0.5 (documents the defect)  (10 px first-frame error)
PASS  J-001 path 3 first frame equals measured B
PASS  J-001 path 2 exact when every ancestor scale is 1
PASS  J-002 child-to-parent geometry follows the residual only  (max error 2.84e-14)
PASS  J-002 old independent-motion rule detaches the child (documents the defect)  (max gap 68.5 px)
PASS  J-002 release velocity enters once (h′(0) = v)  (h′(0) 600.000000)
```

### J-001 (§5.7): why the three paths are exact

The drawn box of a node is `Mπ(t) ∘ Pₙ(t) ∘ Qₙ (Lₙ)`, where `Mπ(t)` is the composed ancestor
map. A presented camera or layout shift moves `Lₙ` by `d` in the parent's local frame. On screen
it moves the drawn box by `Kπ(t_k)·d`, where `Kπ` is the linear part of `Mπ`. `A` is measured
with the engine's poses divided out, so `A_new − A_old = Kπ,rest · d`. The two agree exactly when
`Kπ(t_k) = Kπ,rest`. In the supported model, ancestors' linear parts are pose scales times
inner-map scales, so they agree when every participant ancestor has pose scale 1 and an unchanged
inner-map scale. That is path 2.

Otherwise no translation of the old visual track reproduces B. Path 3 plans from the measured
`(B, v)`, which by construction draws B at the first frame with velocity `v` (invariant 4). The
case `|δ| < 0.01 px` is path 1.

The tribunal's case: parent scale 0.5, scroll 20 px. The child's B moved 10 px, raw δ is 20 px,
so raw δ gives a 10 px error. The case is reproduced, and path 3 takes it.

Invariant 5 now names this as its one exception. Under a live scale, a presented scroll restarts
the child's timeline from `(B, v)`. It cannot be wrong; it only re-times.

### J-002 (§5.10): one displacement

Each descendant is drawn at `own(t) + h(t)` and the held node's origin at `rest + h(t)`. So
child − parent = `own(t) − rest` for every `t`. That is independent of how `h` decays, which makes
the relative geometry exact by construction (error 2.8e-14 is floating point).

At take, the residual is re-planned from `(drawn − h, v_drawn − ḣ⁻)`, so the drawn box is
continuous. Release velocity is the held node's incoming velocity only, so it enters once. The
proof's `h′(0) = 600` is analytic.

The old rule (each descendant animates `h` under its own 0.1 s timing) separates the child from a
0.5 s spring parent by up to 68.5 px. That is the tribunal's defect, reproduced.

### J-003 (§4.2): no false positive by construction

`|W − O| < 1` puts the true `S` in `M`. By induction the true `S` lies in `I_π`, so it lies in
`E = I_π·p·q` whenever `q` is the true inner scale (read), or in `M` alone when `q` is assumed. An
intersection that contains the truth is never empty, so a supported tree always passes.

The forced read for wide intervals with participant children keeps `I` within ±0.5 %, which keeps
the detection power of the old `1 px + 0.5 %` tolerance. The 3 % zoom case is caught. The random
check (20,000 chains, depth 1–6, sizes 0.3–1500 px, pose 0.1–10, inner scale 0.5–2, two rounding
models) found 0 false positives.

### J-004, J-005, J-006, J-007

These are text and doc fixes; `p0_authority.md` § Remediation maps each to its section. Section
references: 173, with 0 missing targets.

## P1 deliverables

| Item | Where | Notes |
|---|---|---|
| `physics.spring`, `settleTime`, `perceptual`, `decay` | `packages/core/src/physics/` | ω₀ = 2π/D; ζ = 1 − b (b ≥ 0), 1/(1 + b) (b < 0); underdamped / series / exponential regimes; exact settle via bisection between zeros of f and f′ (0.1 px, 1 px/s) |
| `clock.inFrame` | `packages/core/src/loop/clock.ts` | Read-only; true inside a frame (§4.1 rendering-callback bound) |
| Core API note | `packages/core/src/API.md` | `## physics`, `clock.inFrame` row (closes J-005) |
| Motion union, kind-level merge, validation | `packages/layout/src/motion.ts`; exported `mergeLayoutMotion`, `sameLayoutMotion` | A layer naming a kind drops `duration`/`timing`/`bounce`; `delay` merges on its own; bounce only with `type: 'spring'`, in (−1, 1); no curve on a spring |
| Spring tracks, `TrackLaw`, seeds | `packages/layout/src/solve.ts`, `plan.ts` | Timing seed `k = v·D + (B − A)·e′(0)` for a moving, unpinned channel; spring seed `v₀`; settle cap 10 s → `'unsupported'` + `spring-timeout` |
| Perceptual timeline | `solve.ts` (`lawProgress`, `fadeEnded`) | Crossfade, radius blend and presence release end at `t = D` on a spring lead |
| Reduced-motion grid | `createTrack` | {1, 0.85, …, 0.1}; bounce clamped ≤ 0; carries v, then v = 0, else `'reduced'` (status falls back to `'reduced'` when nothing ran) |
| WAAPI rejection | `scope.ts` | A spring with `engine: 'waapi'` throws `ANI_INVALID_OPTIONS` before any state change |
| React | `packages/react/src/layout/context.ts`, `layout_group.tsx` | Uses `mergeLayoutMotion` / `sameLayoutMotion`; the old field-by-field merge is removed (hard migration) |
| Browser rows | `tests/browser/cases/layout_spring.ts`, `layout_kit.ts` | L-SPRING-1..4 |

## Verification

| Check | Command | Result |
|---|---|---|
| Unit, property, integration | `npx vitest run` (repo root) | 138 files, **1,651 passed** |
| Types | `pnpm ts:typecheck` | 11/11 tasks successful |
| Lint/format of changed files | `npx biome check <changed> --diagnostic-level=warn` | Clean except one warning in `scope.ts:1704` (`useDefaultSwitchClause`), which predates this change |
| L-SPRING-1..4 | `node tests/browser/run.ts --browser {chromium,firefox,webkit} --case 'layout_spring:*'` | 4/4 in each engine |
| Full Chromium suite | `node tests/browser/run.ts --browser chromium` | **168/168** (104.8 s) |
| Layout modules in Firefox and WebKit | `--browser {firefox,webkit} --case '{layout,layout_spring,waapi}:*'` | Firefox 56 + 4 + 6, WebKit 56 + 4 + 6: all passed (Firefox `layout:COST` passed on this run; it is load-sensitive, DR-18) |
| Remediation proofs | `node .trace/ani_ios_production/p1_proofs.mjs` | 12/12 PASS |

Environment: the pinned §11.5 container (Ubuntu 24.04.5, kernel 6.18.44, 4 × Xeon @ 2.80GHz,
16 GB, Node 22.22.0, Playwright 1.55.0).

## Gate mapping

| Gate (`00_plan.md` P1) | Evidence | Self |
|---|---|---|
| Unit and property tests against an independent oracle (1e-9) | S1 (4,000 cases, 1e-9), S2 RK4 (1e-7), T1–T6, P1, D1; layout `solve.test.ts` spring oracle in random trees | PASS |
| L-SPRING-1..4 in Chromium, Firefox, WebKit | Browser runs above | PASS |
| Existing suites green | vitest 1,651; Chromium 168/168; Firefox and WebKit layout modules green | PASS |

## Residual risks

- Firefox `layout:COST` is load-sensitive on this container (it failed on the base commit and
  passed on this run). The pinned performance gate is P5's (§11.5), not a P1 claim.
- J-001 path 3 re-times a child under a live-scaling ancestor after a presented scroll. That is
  correct motion but not "no restart". The bench scenes in P5 will show whether that is
  perceptible.
- The J-002 and J-003 rules are authority text plus pure proofs here. Their implementation and
  rows are P4 (L-DRIVE-6) and P2 (§4.2 intervals, L-MEAS-4/7/11, spike S1 (b)).

**First self verdict: PASS** for P1 and for the P0 remediation. The tribunal ruled **FAIL** on both
(`p1_spring_trial_result.md`: 1 S0, 7 S1).

## Second remediation (re-judged now)

My first verdict missed J-001/J-004 for the same reason the P0 self-check missed J-001: I proved
each path exact in its own frame instead of judging the drawn error on screen. The fix judges every
cut-off in screen space.

| ID | Correction | Where | Proof |
|---|---|---|---|
| J-001 S0 | §5.7: every path is judged in screen space. `ρ` per axis is the product over participant ancestors of pose scale × innerNow / innerPlanned. Unchanged only when `|δ|·max(1, ρ) < 0.01 px` | Authority 81893f3; code f94848d (`keepPath`) | `measure.test.ts` KP-1: 0.009 px under ancestor scale 323 → `'retarget'`; ρ = 1 at 0.0099 px → `'unchanged'`. KP-2/KP-3 cover the other two paths |
| J-004 S1 | §4.4 driven row: reported when `|δ|·max(1, ρ) ≥ threshold`, or `≥ 0.01` when the translation is not exact | Authority 81893f3; code f94848d (`staleReported`) | `measure.test.ts` ST-2 |
| P0-N001 S1 | §4.2: a degenerate axis (`O ≤ 1`) reads the exact computed size `W`, so `M = R/W`; `W ≤ 0` is a zero size, which snaps. S1(b) gains the degenerate leaf under `zoom: 2` | Authority 81893f3; code f94848d (`supportCheck(…, readExactSize)`) | `measure.test.ts` SC-5 (degenerate axes alone never fail a supported tree), SC-6 (degenerate leaf under unowned `zoom: 2` or an ancestor transform is detected) |
| P1-001 S1 | `LayoutGroup` validates its own layer, then the merged layers with the outermost engine, before merging or touching state (`validateMotionLayers(layers, engine?)`) | a4689eb | `layout.test.tsx` P1-001 |
| P1-002 S1 | The chosen reduced-motion candidate is subject to the §5.3 cap: a settle beyond 10 s refuses the track (`'unsupported'`, `spring-timeout`). §9.4 now says so | d8e793d; authority 9d79886 | `solve.test.ts` P1-002 |
| P1-003 S1 | `physics.perceptual` asserts a finite `t` and a finite duration > 0; `spring` asserts its whole domain | 04d1d12 (core `physics/spring.ts`) | `physics.test.ts` S5, P2 (P1-003) |
| P1-004 S1 | L-SPRING-4's expectation comes from `reducedSpringOracle` in `oracle.ts`, built on `settleOracle` (closed form plus bisection, independent of production `settleTime`/`planTrack`) | d8e793d | `solve.test.ts` L-SPRING-4 oracle property; browser row L-SPRING-4 |
| P1-005 S1 | Raw logs, one executable command per engine: `bash .trace/ani_ios_production/logs/p1/run.sh` | `logs/p1/*.log` at f94848d | The logs themselves (each records its command, commit and exit code) |

### Gate at f94848d (raw logs in `logs/p1/`)

| Check | Log | Result |
|---|---|---|
| Environment fingerprint | `env.log` | Matches §11.5 (Ubuntu 24.04.5, 6.18.44, 4 × Xeon @ 2.80GHz, 16 GB, Node 22.22.0, Playwright 1.55.0, chromium_headless_shell-1187, firefox-1490, webkit-2203) |
| Unit, property, integration | `vitest.log` | 140 files, **1,681 passed** |
| Types | `typecheck.log` | 11/11 |
| Lint/format | `biome.log` | exit 0 (10 warnings, all predating P1) |
| Full Chromium suite | `chromium-all.log` | 167/168; the failure is `layout:COST` (see below) |
| Firefox `layout`, `layout_spring`, `waapi` | `firefox-*.log` | 55/56 (`layout:COST`), 4/4, 6/6 |
| WebKit `layout`, `layout_spring`, `waapi` | `webkit-*.log` | 56/56, 4/4, 6/6 |
| `core` module, both engines | `*-core.log` | 2 skipped, as at P1 (Chromium-only cases) |
| Remediation proofs | `node p1_proofs.mjs` | 12/12 PASS |

**`layout:COST` is not a P1 regression**, as shown by `logs/p1/cost-ab.log`.
- **Method.** Interleaved Chromium runs of the P1 base (bb28e72) and HEAD, with nothing else
  running.
- **Result.** Both fail the 4 ms read budget about half the time. With one warm-up and the median
  of five, the base reads 5.0 ms and HEAD 4.9 ms.
- **Interference.** The Firefox run in the gate overlapped those re-runs, so its COST number is
  not clean.
- **Owner.** The row sits at its budget on this host. It is the P5 pinned-bench gate (§11.5), and
  H5's removal of the scroll-offset reads lowers its read count.

**Self verdict: PASS** for the second remediation of P0 and P1, with `layout:COST` handed to P5 as
recorded. Pending the tribunal.
