# Tribunal Report: CP8 — Final

## Verdict

TRIBUNAL FAIL

- Frozen commit: `1a244e33f7c8cbd010be2bdabed345ad1f3d20e4`; reviewed `3a97b5b..HEAD`, plus the CP1–CP8 authority and prior defect dispositions.
- Target: T8.1/T8.2/V8, carried J-016/J-032/J-033/J-034, and the plan's final goal.
- Plan directory: `.trace/ani_layout_final`; independent execution: 2026-10-23 UTC.
- Open: **J-032 (S0), J-035 (S0), J-036 (S1)**. All required command gates pass. Two supported motion counterexamples and the stated linear frame-cost requirement prevent completion.
- Only this report was written locally. No implementation files, commits, pushes, or publishing actions were made.

## Authority Coverage

| File | Role / included reason | Coverage result |
| --- | --- | --- |
| `packages/layout/ARCHITECTURE.md:13` | Controlling §§1–12: model, invariants, solver, shell, adapter, failures, WAAPI, acceptance | Included throughout; failures at `:117`, `:122`, `:264`, `:272`, `:295` |
| `.trace/ani_layout_final/plan.md:3` | Final goal, all 26 T rows and V1–V8, phase gates and boundaries | All 34 rows classified below |
| `.trace/ani_layout_final/00_documentation_drift.md:78` | K1–K22 and decisions resolving earlier trials | K21 accepted; K22 fixes the original repro but remains incomplete |
| `.trace/ani_layout_final/source_decision.md:1` | Approved source record, with both open questions closed | Reconciled against the higher authority; default true and stateful-timing rejection retained |
| `.trace/ani_layout_final/cp1_authority_trial_result.md`, `cp2_spikes_trial_result.md`, `cp3_pure_core_trial_result.md`, `cp4_engine_trial_result.md`, `cp5_react_trial_result.md`, `cp6_acceptance_trial_result.md` | Prior findings, dispositions and re-entry criteria | Closure chain inspected; J-032 remains open, two new findings below |
| `.trace/ani_layout_final/cp1_authority.md` through `cp8_final.md` | Execution claims and fix proofs | Checked against history, source, assertions and independent runs; blanket final PASS rejected |
| `/Users/june/.claude/skills/judging-checkpoint-completion/SKILL.md` | Requested judicial method | Followed; no additional harness or evidence-file system required |

## Judgment Matrix Summary

Counts are authority rows, not distinct defects. A scoped PASS does not certify a failing dependency.

| Requirement group | Rows checked | PASS | FAIL | BLOCK |
| --- | ---: | ---: | ---: | ---: |
| CP1 T1.1–T1.3/V1 | 4 | 4 | 0 | 0 |
| CP2 T2.1–T2.4/V2 | 5 | 5 | 0 | 0 |
| CP3 T3.1–T3.4/V3 | 5 | 3 | 2 | 0 |
| CP4 T4.1–T4.4/V4 | 5 | 2 | 3 | 0 |
| CP5 T5.1–T5.3/V5 | 4 | 4 | 0 | 0 |
| CP6 T6.1–T6.4/V6 | 5 | 5 | 0 | 0 |
| CP7 T7.1–T7.2/V7 | 3 | 3 | 0 | 0 |
| CP8 T8.1/T8.2/V8 | 3 | 2 | 1 | 0 |
| Four carried defects | 4 | 3 | 1 | 0 |
| K21 coverage / K22 general composition | 2 | 1 | 1 | 0 |
| **Total** | **40** | **32** | **8** | **0** |

| Authority rows | Evidence / independent judgment | Result |
| --- | --- | --- |
| T1.1/T1.2/T1.3/V1 | Single authority and source record remain; retired architecture, projection directory and old trace directories are absent. J-002–J-007 were closed by CP2, J-001 by CP3; current contracts retain those corrections. | PASS |
| T2.1/T2.2/T2.3/T2.4/V2 | Spike results, sensitivities and subsequent J-008 re-check inspected. `2297189` repaired reveal observation before production `6485ad8`; all four spikes precede production. Deleted prototypes need not be recreated. | PASS |
| T3.1/T3.2/T3.4 | Geometry, validation/defaults and planner outputs inspected; seeded pure suites and new default-equality cases pass within the full 1,601-test run. No DOM/clock dependency in pure modules. | PASS |
| T3.3/V3 | Ordinary projection, momentum, modes, follower ordering, floor and identity properties remain green. Mixed-epoch anchor placement does not reproduce B; mixed-epoch projection is not O(N). J-035/J-036. | FAIL |
| T4.1/T4.3/V4 | Registry, lifecycle, ownership and original regression cases pass; supported kept-child/moving-parent and anchor/layer combinations violate the required first-frame/frame oracle. J-032/J-035. | FAIL |
| T4.2/T4.4 | Public exports, hard deletion, types and established read/frame budgets pass. | PASS |
| T5.1/T5.2/T5.3/V5 | Current unit/browser contracts, scope isolation, capture hand-off, concurrent scenarios, StrictMode/presence replay, trigger warning, update API and prescribed E5 pass. J-026–J-031 closures remain supported. | PASS |
| T6.1/T6.2/T6.3/T6.4/V6 | All named acceptance/regression rows and four acceptance builds pass ×3; fuzz and scale measurements pass. Showcase uses those fixtures. Docs/changesets/peer inspected; guide and README files are unchanged since the prior independent 13-program typecheck; fresh web build passes. No retired symbols or spike modules remain. | PASS |
| T7.1/T7.2/V7 | W1–W5, sampled easing unit tests, React WAAPI path and fresh discriminating compositor trace pass; explicit shape and clock limitations remain documented. | PASS |
| T8.1 | Unused-symbol checks, runtime-export references, debris/deletion review and size accounting inspected; see ruling below. | PASS |
| T8.2 | Frozen mirror matches the worktree; install, full CI, full browser suites, trace and size commands exit 0. `00fbbde..HEAD` adds only the implementer report to the claimed fresh-clone inputs. | PASS |
| V8 / final goal | Command gates pass, but required engine behavior and O(N) claim do not. | FAIL |
| J-016 | Default timing now resolves in the shared merge (`motion.ts:329`, `:344`). Omitted↔explicit default remains on the original oracle every frame, ends normally, genuine ease-in change interrupts ×3. Substituting old engine source makes J16 fail ×3. | CLOSED |
| J-032 | Original x40/w40/vx200 case, later layer change, no-op flush and depth-2 extension pass. Retargeting the parent while its child keeps its track still jumps the child; details below. | OPEN |
| J-033 | GridCard explicitly inherits font, letter/word spacing and text transform (`layout_fixtures.tsx:560`); shared CardBody title styles are equal by construction. All four E4 variants pass Firefox and other engines. Host font metrics need not match each other. | CLOSED |
| J-034 | Finite starts, required completion and independent enter/detail paths are asserted (`acceptance.ts:336`, `:367`, `:825`, `:850`; `layout_frames.ts:124`). Held-scale/1,000-second control is rejected ×3; the old test falsely passes that same control with `stagger within NaN s` ×3. | CLOSED |
| K21 | Sound aggregate gate for the four specified files; unloaded files reject, filtered runs explicitly report only, timed cases run without profiling, CI invokes the full gate. Floors hold. | PASS |
| K22 beyond original J32 | Depth 2, kept ancestors, changed layers, no-op flush and supported ancestor removal checked. Moving-parent/kept-child and anchor combinations fail; distinct epochs also expose quadratic work. | FAIL |

**T8.1 size ruling.** The four pure files total **1,492 lines**, and `scope.ts` totals **1,946**. The source decision's approximately 900-line estimate referred to the layout core more broadly than `cp8_final.md:30` suggests. It is an estimate, not a hard size gate. Required validation, retained motion, ownership, lifecycle and map composition account for the expansion; no unreferenced runtime export or retired engine was found. No file split or arbitrary line reduction is ordered. The concrete algorithmic overrun is J-036. The two `console.log` hits in browser utilities print their required results and are not debris.

## Defects

C/F/W denotes Chromium/Firefox/WebKit. Numeric probes used real DOM, the public manual clock, source bundles with `write:false`, and independently written scalar equations. Coordinates below have body margin/scroll zero; all elements are absolute, with `transform-origin:0 0`.

| ID | Severity | Authority source | Finding | Required correction |
| --- | --- | --- | --- | --- |
| **J-032** | **S0** | Architecture §3.3 invariants 1/4/5, §5.3/§5.5; T4.1/T4.3/V4; carried map-space mandate | `scope.ts:1669`, `:1681` retain the child's obsolete CSS geometry when its visual target is unchanged but an ancestor's geometry changes. Original J32 is fixed; the converse kept-child case below jumps **60→35 px** at flush in C/F/W and stays about **25 px** off the independent path. | Preserve the kept track/timeline/epoch while reconciling its projection basis with current CSS geometry and changed ancestor origin. |
| **J-035** | **S0** | Architecture §3.1, §3.3 invariants 1/4, §5.4; T3.3/V3/T4.3/V4 | `solve.ts:258` anchors to the parent's box in the parent's old track space; `:295` does the analogous velocity calculation. A new child epoch needs that parent in its own space. The centered-child case below jumps **120→100 px** at flush and remains **20 px** left of its anchor in C/F/W. The residual-risk note at `cp8_final.md:73` does not amend the authority or excuse a B discontinuity. | Resolve parent anchor position and velocity in the child's epoch, consistently with projection and layer reconciliation. |
| **J-036** | **S1** | Architecture §5.3 (`:264`), O(N) arithmetic per frame; T3.3 and final-goal architectural claims | `solve.ts:344` walks the entire ancestor chain and `:346` recomposes it for each node with `inners` (`:367`). Supported distinct-epoch chains require **N(N−1)/2 ancestor compositions per steady frame**: N=25/50/100 produces **300/1,225/4,950**, with all N tracks active. | Restore the stated linear per-frame bound, or obtain an explicit approved authority amendment defining and validating the changed complexity. No new latency budget is imposed. |

### J-032 reproduction and independent expectation

1. Parent width/height 200×40, left0, `transform:scaleX(.8)`; child 40×40, left0. Register both, linear duration1 s.
2. Capture; set parent left200 and child left100; flush; deliver first clock frame, then 200 ms. Change parent's transform to scaleX(1). Actual child is **x60/w40**.
3. Capture; set parent left300 and child left−25; flush. Under the child's original .8 epoch its A remains **x280/w32**, so it must keep its track. The parent legitimately retargets.
4. Actual child immediately becomes **x35/w40**, all three browsers. Its CSS page x changed 300→275, but its kept projection geometry still uses 300 (`scope.ts:1681`). No supported snap reason applies.

For subsequent 20 ms frames k=0…59, let t=.02k. Independently, the retargeted parent is
`R(t)=300−260(1−t)−60t(1−t)²` for 0≤t≤1, then 300. The kept child track is
`C(t)=280·min(1,.22+t)`; its current layer yields expected x `R+1.25(C−R)`, width40.
First clock frame: **actual42, expected67**. Maximum rect errors C/F/W:
**25.00003 / 25.00774 / 25.00002 px**. All eventually restore identity at x275/w40 with zero subscribers; that does not repair the intervening wrong motion.

### J-035 reproduction and independent expectation

1. Parent 200×100, left0, scaleX(.8); centered child 40×40 at left80/top30, `layoutAnchor:{x:.5,y:.5}`. Linear duration1 s; move parent left0→200; first frame, then 200 ms.
2. Change parent transform to scaleX(1). Parent is **x40/w200**, child **x120/w40**; their centers coincide at140.
3. Capture; change child to left70/width60; flush. Both before/final anchor offsets are zero. Actual child is **x100/w40**, center120, while the parent remains centered at140.

At subsequent 20 ms frames, parent x is `R=200·min(1,.22+t)` and child width is
`W=40+20t−20t(1−t)²` until t=1, then60. Expected child x is `R+100−W/2`.
Every one of 60 frames was compared independently. First clock frame: **actual104, expected124**.
Maximum rect errors C/F/W: **20.00001 / 20.00803 / 20.00001 px**. Natural completion restores the correct final layout.

### J-036 supported-state construction

Use N nested origin-zero 100×40 participants, a root scaleX(1), linear duration1 s; move root left0→200 and advance to .2 s. For each descendant i in order, capture, set root scaleX(1+i/1000), change only that descendant's CSS width to120, and flush without advancing time. Absolute descendants retain their own targets; each selected track records a distinct epoch. A counter inserted only in the in-memory `epochMap` composition loop records the counts above on the next steady frame. No source file was edited. This is a structural complexity failure, not a claim that the existing ≤2 ms benchmark failed.

## Defect Disposition

| ID | Essential defect / impact | Why it breaks completion | Robust correction mandate | Re-judgment evidence |
| --- | --- | --- | --- | --- |
| J-032 | A frozen track is conflated with an obsolete CSS projection basis | A supported ancestor retarget jumps an unchanged child and corrupts every intervening frame | Reconcile current geometry/origins with the kept track's epoch without restarting it, suppressing the layer or snapping supported nesting. Clarify frozen geometry versus current CSS basis if necessary while preserving invariants. | Exact 60→35 case instead preserves x60; original timeline, current layer, independent every-frame path, velocity and identity settle ×3; original J32/E-1/J20/J25 remain green |
| J-035 | Anchor boxes/rates use the parent's epoch rather than the child's | Zero-offset anchor jumps at the new flush despite exact measured B | Use one consistent child-epoch parent anchor and derivative in planning, drawn-box evaluation, velocity and projection. Do not declare anchors unsupported or treat the jump as an accepted risk. | Exact 120→100 case instead preserves x120 and centers; independent width/anchor path and velocity ×3, including nested depth≥2 and kept/no-op controls |
| J-036 | Each mixed-epoch node repeats its complete ancestor composition | Unlimited-depth linear frame-cost claim is false | Share/reuse the required map work so the stated bound holds; alternatively present an explicitly approved authority change with honest complexity and existing cost-gate results. Do not drop epoch correctness or impose an unapproved depth cap. | Algorithmic accounting and supported distinct-epoch chain evidence; existing cost gates still pass; unchanged geometry/anchor oracles |

## Independent Re-checks

Every remote command used `ssh -o KexAlgorithms=curve25519-sha256 -o BatchMode=yes june-wsl`, sourced `~/ani-v2/env.sh`, and ran only inside `~/ani-v2/lay-judge-cp8_final`. WebKit also sourced the specified `webkit-env.sh`. No local Node/pnpm/tests ran. Each remote command stayed below ten minutes.

| Check | Command or method | Result / evidence |
| --- | --- | --- |
| Frozen identity, before and after | SHA-256 over ordered tracked path/content pairs locally and remotely | **572 files**, both times identical: `6f56da7c4d3e2fb751b97e59319d3fcd1e3f0ba00c88f6e54861b42b9154b5bb`; mirror has no `.git` |
| Frozen install | `pnpm install --frozen-lockfile` | Exit0: lockfile up to date, already up to date; postinstall succeeds |
| Full CI | `pnpm test:ci` | Exit0: Biome no errors, 11/11 typecheck tasks, 8/8 build tasks, **166/166** web pages; **136 files / 1,601 tests passed**; V8 coverage thresholds pass |
| Full Chromium / coverage | `pnpm test:browser --coverage` | Exit0: **125 passed, 0 failed, 0 known, 0 skipped**, 94.2 s; aggregate engine statements/branches/functions/lines **94.67/85.84/98.03/97.49%**, floors **90/80/95/92%** |
| Full Firefox | `pnpm test:browser --browser firefox` | Exit0: **123 passed, 0 failed, 0 known, 2 skipped**, 90.9 s; E4 title grid/detail **60.167/60.167 px** in all four builds |
| Full WebKit | `pnpm test:browser --browser webkit` | Exit0: **123 passed, 0 failed, 0 known, 2 skipped**, 85.1 s; only core C1/C2 skip by design |
| WAAPI trace | `pnpm test:waapi-trace` | Exit0: WAAPI running, block120.116 ms, ticks/draws/swaps **6/5/5**, compositeFailed[]; RAF120.011 ms, **6/0/0** |
| Size | `pnpm size` | Exit0, **8/8 PASS**; everything **22,910/23,700 gzip bytes** |
| Extra unused-symbol/types gate | `pnpm exec tsc -p packages/layout --noEmit --noUnusedLocals --noUnusedParameters`; same for `tests/browser` | Both exit0; browser program includes the React layout sources |
| Established COST | Full browser runs, C/F/W | 1,000 participants/300 movers read **2.20/3.00/2.00 ms**; 300 nested movers frame p95 **.735/.900/.750 ms**; pass. All-1,000-mover measurements remain recorded, not a new gate |
| SCALE | Full browser runs, C/F/W | All 50/300/1,000 workload rows complete; 1,000-moving commit **16/20/16 ms**, frame p95 **1.54/3.20/1.90 ms** |
| Original J16/J32 and old-code sensitivity | Remote stdin `node --input-type=module`, esbuild in-memory source substitutions from `3a97b5b` | Current every-frame regressions pass ×3: J16 max **0/.0080/0 px**, J32 max **0/.0083/0 px**. Old J16 interrupts; old J32 immediately draws width50 instead of40 ×3 |
| J33 font control | Remove only four GridCard inheritance declarations in memory; run current E4 | C rejects Arial vs Times; F rejects sans-serif vs serif. W happens to resolve equal metrics and passes. Current fixture explicitly normalizes styles and passes all builds/engines; no cross-host font assumption imposed |
| J34 sensitivity | Held-scale .2 / duration1,000 enter in memory, current versus old E3 assertions | Current rejects ×3 at the first enter frame (C difference **3.086 px**); old test passes ×3 and reports **NaN** stagger |
| K22 depth≥2 / kept ancestors / no-op | Root .8, middle .5, grandchild retarget; then root .9/middle .7, no-op flush; 65 independently checked 20 ms frames | Grandchild max error C/F/W **.000019/.007935/.000019 px**; root/middle ≤ roundoff; no-op `no-change`, natural `ended`, identity styles, zero subscribers |
| K22 ancestor removal | Unregister middle participant, retain its DOM as a translation-only wrapper; retarget from carried B/v; 60 independent frames | Max C/F/W **.000017/.010696/.000016 px**; B≈60.19/w20 preserved; ends x300/w40, identity styles, zero subscribers |
| Expanded counterexamples / complexity | Remote stdin Node/Playwright and independent scalar equations; diagnostic composition counter only in memory | J-032/J-035 fail ×3 with numbers above; supported 25/50/100-track chains require 300/1,225/4,950 ancestor compositions per frame |
| K21 failure modes | `new EngineCoverage().report(...,true)`; `pnpm test:browser --coverage --case layout:T1`; source/CI inspection | Empty full report rejects **“an engine file was never loaded”**. Filtered run reports **50.25/37.72/56.20/53.65%** and exits0 as explicitly specified by K21; it is not a coverage certification. CI runs unfiltered. `run.ts:378` excludes timed cases from profiling, not execution; missing maps/load errors fail |
| Cleanup / migration / docs continuity | Runtime exports cross-referenced, `git diff --check 3a97b5b..HEAD`, V6 retired-symbol grep, deleted-path inspection, docs diff | No unreferenced runtime export, whitespace error, retired API or spike module; docs unchanged. Optional docs server/smoke not rerun |

The engine floors are aggregate across the four files, not per-file floors. DOM's lower statement/branch percentages and RAF's lower function percentage do not violate that written gate. Coverage measures execution, and does not establish the correctness falsified by J-032/J-035.

## Remediation Order

1. **J-032:** repair kept-track projection basis under a moving/retargeted ancestor; add the exact regression to the existing layout suite and relevant pure expectations.
2. **J-035:** reconcile anchor positions and rates with the same epoch model; add the centered-child repro and a depth≥2 case to existing solver/browser tests.
3. **J-036:** resolve the written linear-cost requirement with inspectable algorithmic proof or an explicitly approved authority amendment; preserve both motion repairs and existing budgets.
4. Update the existing engine fix proof and final review, then rerun the required final gates on the corrected frozen source. No new harness or evidence directory is required.

## Fix Proof Report Requirements

Submit in the existing `.trace/ani_layout_final/cp4_engine.md` fix-proof section and `cp8_final.md`, or the conversation. For each defect include changed files, root cause and rationale, exact commands/results, T/V/architecture mapping and residual risks. For J-032/J-035 supply measured B, independent B/A/velocity and every-frame expectations in C/F/W, untouched-track evidence and natural identity settle. Retain original J32, E-1, J20/J25, E1/E5, J16 and acceptance sensitivities. For J-036 supply an algorithmic work account for distinct epochs; a passing common-epoch benchmark alone is insufficient. No new latency threshold is required.

## Re-Judgment Entry Criteria

- Frozen corrected diff and per-defect proof are inspectable.
- The 60→35 and 120→100 counterexamples preserve their actual pre-flush boxes and match independent trajectories within .5 px every frame ×3, with velocity continuity and exact natural settle.
- Kept ancestors/children, nested depth≥2, changing layers, no-op flush and ancestor-removal cases remain correct without broad retargeting, layer suppression or unsupported snaps for supported inputs.
- O(N) steady-frame work is established for distinct epochs, or an explicit approved authority amendment is supplied and its gates pass.
- Required full CI, unfiltered Chromium coverage, Firefox/WebKit suites, trace, types and size gates pass on the correction; docs/product checks remain satisfied.
- A reproduced jump or unchanged complexity violation remains FAIL. Missing required correction/proof/access prevents acceptance and may produce BLOCK.

## Final Ruling

CP8's executable release checks and cleanup review pass. J-016, J-033 and J-034 are closed; earlier closures remain supported. **J-032 remains open**, and J-035/J-036 additionally violate the written architecture. Therefore the whole CP1–CP8 final goal is **not complete**. The verdict is FAIL, not BLOCK: access and required evidence were available, and concrete corrective work is identified.

## Fix directive for the implementer

- **J-032 — `packages/layout/src/scope.ts` (`plannedBoxes`, frame construction at `:1669`/`:1681`), `packages/layout/src/solve.ts` as needed; `tests/browser/cases/layout.ts` J32 and `packages/layout/src/__tests__/solve.test.ts`:** keep the child's original track/epoch while projecting from the correct current CSS basis when its parent retargets. Add the exact parent left200→300 / child left100→−25 repro: preserve x60/w40 at flush, then the independent path above and identity settle ×3. Preserve original J32/E-1 and current-layer velocity/retention cases. Update `.trace/ani_layout_final/cp4_engine.md` and `cp8_final.md` with proof; clarify `ARCHITECTURE.md` §5.5 / drift K22 only if necessary to distinguish track state from CSS basis, without weakening continuity.
- **J-035 — `packages/layout/src/solve.ts` (`drawnBoxes` at `:258`, `drawnVelocities` at `:295`), `scope.ts`/`plan.ts` where the corresponding anchor inputs are formed; existing `solve.test.ts`, `plan.test.ts` and `tests/browser/cases/layout.ts`:** make anchor positions/rates use the child's epoch consistently. Add the parent .8→1 / centered child 40→60 repro: preserve x120/w40 and center140 at flush, every frame on `R+100−W/2`, correct velocity and settle ×3; include depth≥2 and kept/no-op controls. Replace the unresolved anchor “risk” in the existing engine/final proof with actual correction evidence.
- **J-036 — `packages/layout/src/solve.ts:337` (`epochMap` and its per-node call), `packages/layout/src/scope.ts:261`/`:491` (epoch preparation/cache), existing solver tests and engine proof:** eliminate repeated full-chain steady-frame recomposition sufficiently to restore the stated O(N) bound while preserving distinct-epoch geometry. Supply algorithmic accounting and the supported chain control above, plus existing cost results. Alternatively provide explicit approval for a precisely documented complexity amendment in `packages/layout/ARCHITECTURE.md:264` and `.trace/ani_layout_final/00_documentation_drift.md`; a unilateral risk note or common-epoch timing result is insufficient. Update `cp4_engine.md` and `cp8_final.md` with the final proof.
