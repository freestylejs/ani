# Tribunal Report: CP8 — Final, SECOND RE-TRIAL

## Verdict

TRIBUNAL FAIL

- Frozen commit: `ac36e125982ef8b4fffb1f51f40269eacb5fdeb1`; reviewed `5f1ec4c..HEAD` and the CP1–CP8 closure chain. Date: 2026-10-24 KST.
- **J-037 is CLOSED against the previous ruling's concrete counterexample and controls. J-032/J-035/J-036 and J-016/J-033/J-034 stay CLOSED. One new open defect: J-038 (S0).** The new conversion breaks a newly starting follower when its lead is outside the layered parent.
- All requested executable gates pass. The complete implementation nevertheless fails a supported first-frame/crossfade requirement, so the final goal is not complete.
- Only this report was written locally. No implementation file was modified, and no commit, push or publication occurred. Diagnostic substitutions existed only in memory.

## Authority Coverage

| File | Role / included reason | Coverage result |
| --- | --- | --- |
| `packages/layout/ARCHITECTURE.md:13` | Single architecture authority, §§1–12 | Included; J-038 violates visual B/first-frame continuity and crossfade geometry (`:78`, `:121`, `:126`, `:339`) |
| `.trace/ani_layout_final/plan.md:3` | Final goal, all 26 tasks T1.1–T8.2 and eight validations V1–V8 | All 34 rows classified below |
| `.trace/ani_layout_final/00_documentation_drift.md:78` | K1–K24, including approved K23 cost amendment and new K24 | Reconciled with architecture and source; K24 does not waive first-frame continuity |
| `.trace/ani_layout_final/source_decision.md:1` | Approved source record and answered questions | Default `true`, stateful timing rejection, hard migration and acceptance retained |
| `.trace/ani_layout_final/cp8_final_retrial_trial_result.md:130` | Previous remediation and re-judgment entry criteria | Exact J-037, sensitivity, moving/depth-two, retarget, rate and release criteria checked |
| `.trace/ani_layout_final/cp4_engine.md:392`; `cp8_final.md:70` | Implementer's fix proof and final review claims | Submitted repair verified; extension to a new follower exposes J-038 |
| CP1–CP6 trial results and execution reports; `cp7_waapi.md` | Earlier defects, spike gates, acceptance and WAAPI evidence | Closure chain checked against history, retained implementation/assertions and fresh full suites |
| `/Users/june/.claude/skills/judging-checkpoint-completion/SKILL.md` | Requested judicial method | Followed; no additional harness or evidence-file system required |

## Judgment Matrix Summary

Counts are authority rows, not distinct defects. Scoped earlier PASS rows do not certify the failing solver dependency.

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
| J-032/J-035/J-036 closure | 3 | 3 | 0 | 0 |
| J-016/J-033/J-034 closure | 3 | 3 | 0 | 0 |
| J-037 submitted repair | 1 | 1 | 0 | 0 |
| **Total** | **41** | **35** | **6** | **0** |

| Authority rows | Evidence / independent judgment | Result |
| --- | --- | --- |
| T1.1/T1.2/T1.3/V1 | Authority, approved source, drift decisions and plan exist; retired architecture, projection engine and old trace directories are absent. No competing authority found. | PASS |
| T2.1/T2.2/T2.3/T2.4/V2 | Required spike numbers and repair evidence remain inspectable in `cp2_spikes.md`; history places corrected Suspense observation `2297189` before production `6485ad8`. Historical hard gates need no recreated spike module. | PASS |
| T3.1/T3.2/T3.4 | Geometry, timing/default validation, planner and independent properties pass; pure modules have no DOM/clock imports. | PASS |
| T3.3/V3 | Layered followers in both orders and finite-difference rates pass, but a new follower with a layerless external lead violates visual B: J-038. The random test's frozen-inner-map comparison (`solve.test.ts:944`) does not prove continuity from an actual new handoff's measured B. | FAIL |
| T4.1/T4.3/V4 | Exact submitted regressions pass ×3; new supported crossfade starts at the wrong follower width and stays off its path: J-038. | FAIL |
| T4.2/T4.4 | Public API/hard deletion, typechecks, read discipline and established cost gates pass. | PASS |
| T5.1/T5.2/T5.3/V5 | Adapter implementation unchanged in this diff; unit and complete browser suites verify capture, concurrent rendering, root isolation, StrictMode, trigger warning, presence and E5. Earlier closure chain remains supported. | PASS |
| T6.1/T6.2/T6.3/T6.4/V6 | E1–E5/Gallery, regressions and fuzz pass ×3, including all four acceptance builds; measurements recorded at 50/300/1,000. Product/docs and their prior example proof are unchanged; fresh docs-example tests and production web build pass; retired API/spike audit is clean. | PASS |
| T7.1/T7.2/V7 | Shipped gated WAAPI implementation, W1–W5, easing units and discriminating compositor trace pass; documented shape/time limitations retained. | PASS |
| T8.1 | Unused-symbol checks and reference audit clean: 68 runtime exports have other references. Current pure files total 1,635 lines; `scope.ts` 1,956. Approximately 900 lines is an estimate, not a new hard gate. | PASS |
| T8.2 | `cp8_final.md:90` records fresh-clone gates at `9f319b1`; only the two proof/review files change after that commit. Matching frozen mirror independently passes lockfile install, full CI, three full browser runs and size. No other remote directory was accessed. | PASS |
| V8 / final goal | Command gates are green, but supported motion regressed. T3.3/V3 and T4.1/T4.3/V4 are not complete. | FAIL |
| J-032 | `scope.ts:287` keeps frozen matrices with current CSS geometry; J32/J32B exact x60/w40 and independent trajectories/no-op/settle pass ×3. | CLOSED |
| J-035 | `solve.ts:392`, `plan.ts:403` retain parent placement/target comparison in the child's space; J35/J35B x120/w40, depth-two paths and no-op checks pass ×3. | CLOSED |
| J-036 | Cached correction/Ω recurrence at `solve.ts:287` remains O(N+L) under amended §5.3. `solve_cost.test.ts:76` passes both tests, including 95/195/395/795 compositions for N25/50/100/200 and zero compositions without layers. | CLOSED |
| J-016 | Effective default resolution remains at `motion.ts:332`; vanilla/React omitted↔explicit ease-out and genuine-change controls pass ×3. | CLOSED |
| J-033 | Inherited text styles remain at `layout_fixtures.tsx:560`; all four E4 variants pass Firefox with grid/detail title width 60.167 px, and pass Chromium/WebKit. | CLOSED |
| J-034 | Finite starts/enter paths at `acceptance.ts:337`, `:367`, Gallery detail frame paths at `:821`, `:849`, and exhaustion rejection at `layout_frames.ts:126` remain intact; complete variants pass ×3. | CLOSED |
| J-037 | `scope.ts:1670` preserves continuing-follow space; converted boxes/rates at `solve.ts:420`, `:447` preserve the exact no-op, moving/depth-two and actual lead-retarget paths. Original sensitivity claims independently discriminate as described below. | CLOSED |

## Defects

| ID | Severity | Authority source | Finding | Required correction |
| --- | --- | --- | --- | --- |
| **J-038** | **S0** | Architecture §3.1 visual B/new flush space, §3.3 invariants 1/4, §5.6, §11; T3.3/V3, T4.1/T4.3/V4, V8 | A fresh crossfade follower under a kept, previously layered parent is converted through its own correction even when the lead is outside that parent and has no layers. At handoff the fully visible follower jumps **x120/w40 → x120/w50**, while the new lead starts correctly at x120/w40. Reproduces in C/F/W; introduced by `4cfc353`. | Make follower conversion respect the actual source/destination ancestry and visual handoff space, for boxes and rates, while preserving J-037's continuing-follow/real-retarget fix. |

### J-038 reproduction and independent expectation

Use absolute border-box divs, origin `0 0`, body margin/scroll zero; manual clock; default `layout:true`; linear group motion, duration 1 s.

1. Parent participant: left100/top0, 300×100, `transform:scaleX(.8)`. Old child: left0/top0, 40×40, `layoutId:'pair'`. Register a presence handle on the old child with present/exit `translateY:0`, exit duration .1 s, same clock, no opacity ownership. Capture/flush to establish the id.
2. Capture; move parent left100→200; flush. Deliver `frame(16)`, `frame(200)`, then set parent transform to `scaleX(1)`. The old child's actual B is **(120,0,40,40)**.
3. Capture; start old child's presence exit. Add the new lead **outside the parent**, as a top-level sibling at left400/top0, 100×40, same id. Flush. This is a **new follower (`start:true`)**; the parent track is kept. Its old .8 matrix and the follower's new ancestry1 create a follower layer; the top-level lead has no layers.
4. Immediately, follower rect is **(120,0,50,40)**, lead rect **(120,0,40,40)**, inline opacities **1/0** in all three browsers. No time elapsed or layer changed during this handoff.

The incoming visual rate is vx100, vw0. At new-track time s∈[0,1], the independent §5.1 path for **both** nodes is:

`x(s) = 120 + 280s − 180s(1−s)²; w(s) = 40 + 60s − 60s(1−s)²; y=0; h=40`.

No further presence transform changes occur. Checking every 16 ms frame through the fade gives:

| Measurement | Chromium | Firefox | WebKit |
| --- | ---: | ---: | ---: |
| Immediate follower width, expected40 | **50** | **50** | **50** |
| Maximum lead error against independent path | .000059 px | .008327 px | .000064 px |
| Maximum visible follower error (63 frames) | **49.437158 px** | **49.434778 px** | **49.437158 px** |
| Same case with `5f1ec4c` engine | <.0001 px | <.0084 px | <.0001 px |
| Same case with only new follower conversion removed | <.0001 px | <.0084 px | <.0001 px |

At s=.992, Chromium/WebKit lead is x397.748566/w99.516205; follower is x447.185730/w124.395203. Opacities remain complementary, release occurs at s1, the run reports `ended` with `snapped:[]`, lead styles restore, follower holds opacity0 and disposal leaves zero subscribers. These lifecycle successes do not cure the geometry failure. The kept parent remains on its original timeline within .000007 px. The shared-parent control follows the independent pair path within .0084 px ×3; the unchanged-layer control preserves both first boxes at x120/w32.

**Cause:** `solve.ts:399` activates `seenFrom` whenever either node has layers; `:404`–`:408` apply `corr_f ∘ corr_l⁻¹` without distinguishing this external lead from a node affected by the follower's ancestor. The lead's B is already the current visual handoff box. Applying the follower-only 1.25 correction changes its width40 to50. `scope.ts:1672` correctly treats this as a new start; preserving continuing-follow geometry is not the cause. K24's conversion must be applied consistently with the authority's visual B and first-frame invariants, not used to redefine that visible jump as correct.

The separately documented ancestor-follower bypass (`solve.ts:401`, `cp8_final.md:112`) was also inspected. An exiting ancestor makes its descendants exiting (`presence_link.ts:25`), and `plan.ts:235` excludes them from live leads; the public probe did not create such a crossfade. No additional defect is assigned from that residual-risk statement alone.

## Defect Disposition

| ID | Essential defect | Why it breaks completion | Robust correction mandate | Re-judgment evidence |
| --- | --- | --- | --- | --- |
| J-038 | A correction built from the follower's ancestor epochs is applied to an external lead's already-current visual box as though both occupied that ancestor context | A supported handoff changes a fully visible element at t0 and separates the crossfade pair for the entire fade; §11's every-frame oracle fails | Reconcile follower/lead spaces for different ancestry and new starts, including rates. Keep continuing followers' epochs and current CSS geometry, kept timelines, real-retarget continuity and O(N+L) accounting. Do not globally remove conversion: J37Retarget then fails by13 px. No crossfade suppression, blanket restart, supported-input snap or weakened B/oracle | Exact x120/w40 on both nodes at handoff; independent path/rate, fade/release/restoration/cleanup ×3; shared-parent and unchanged-layer controls; original J37 family and earlier closures remain green |

## Independent Re-checks

All executable checks ran through `ssh -o KexAlgorithms=curve25519-sha256 -o BatchMode=yes june-wsl`, sourced `~/ani-v2/env.sh`, and used only `~/ani-v2/lay-judge-cp8_final_retrial2`. WebKit additionally sourced `~/ani-v2/sysroot/webkit-env.sh`. No local pnpm/Node/tests ran. Each remote command finished below ten minutes. Independent browser diagnostics used remote stdin Node, esbuild `write:false` and Playwright; source substitutions and the isolated pure-property assertion runner were memory-only.

| Check | Command or method | Result / command output |
| --- | --- | --- |
| Frozen identity before/after all execution | SHA-256 over ordered tracked path/content pairs; local Git HEAD/status | **575 files**, local/remote identical both times: `18a2a128bf79c1fe9a7d4d9543bfd0d2aa0048198ed9b964cf49b1238ab6d6a3`; local status clean before this report; mirror has no `.git` |
| Lockfile install | `pnpm install --frozen-lockfile` | Exit0; “Lockfile is up to date”, “Already up to date”; web postinstall succeeds |
| Full CI | `pnpm test:ci` | Exit0; Biome/typechecks/builds green, web **166/166 pages**; **137 files / 1,608 tests passed**, coverage gate passes; includes both `solve_cost` tests |
| Full Chromium coverage | `pnpm test:browser --coverage` | Exit0: **132 passed, 0 failed, 0 known failures, 0 skipped**, 96.4 s; engine S/B/F/L **94.69/85.88/98.01/97.53%**, above **90/80/95/92%** aggregate floors |
| Full Firefox | `pnpm test:browser --browser firefox` | Exit0: **130 passed, 0 failed, 0 known failures, 2 skipped**, 91.8 s |
| Full WebKit | `pnpm test:browser --browser webkit` | Exit0: **130 passed, 0 failed, 0 known failures, 2 skipped**, 89.1 s; only Chromium CDP core:C1/C2 skip |
| WAAPI compositor gate | `pnpm test:waapi-trace` | Exit0: WAAPI block120.221 ms, ticks/draws/swaps **6/5/5**, compositeFailed[]; RAF120.017 ms, **6/0/0** |
| Size | `pnpm size` | Exit0: **8/8 PASS**; everything **22,910/23,700 gzip bytes** |
| Unused-symbol/types | `pnpm exec tsc -p packages/layout --noEmit --noUnusedLocals --noUnusedParameters`; same for `tests/browser` | Both exit0, no diagnostics; browser program includes React layout sources |
| Established COST | Full C/F/W, uninstrumented timed cases | 1,000 participants/300 moving read medians **2.70/3.00/3.00 ms**; 300 nested movers frame p95 **.630/.850/.650 ms**; all pass |
| SCALE measurements | Full C/F/W, all 50/300/1,000 rows | Recorded; 1,000-moving commit **16.10/18/15 ms**, frame p95 **1.530/3.100/1.800 ms**. Measurement rows are not additional latency gates |
| Exact J-037 family | `layout:J37`, `J37Control`, `J37Moving`, `J37Retarget` in full runs ×3; source/oracle inspection at `layout.ts:2455` | Exact x140/w52 retained, no-op `no-change`; 50 frames on no-op/control/moving path, maxima C/F/W **.0000/.0067/.0000 px**; retarget64 frames at vx200/vw60, **.0001/.0082/.0001 px**; unchanged fade, releaseτ1, restoration, zero subscribers |
| Claimed sensitivity | Existing cases bundled with old scope/solve, then with only new follower conversion removed; Chromium/Firefox | Old J37: **x132/w41.6 vs x140/w52**; old Moving **x152 vs160**; old control passes. Conversion-only removal: J37Retarget **x150/w65 vs x140/w52, 13 px** |
| Pure follower ordering/rates | Full CI; isolated unchanged follower property, current vs conversion-only removal | Current 300 seeds pass, >50 pairs each order and >100 finite-difference rate checks; removal fails **seed1, follower3/lead6, relative .3547370077** |
| New-start / external layerless lead | Independent public-API reproduction and scalar path above, current/old/conversion-only variants ×3 | **FAIL current**, width40→50, visible path error≈49.44 px. Both sensitivity controls pass; shared-parent control passes. Kept non-follower parent timeline and lifecycle remain correct |
| Earlier closure / product continuity | Complete suites plus retained assertions and diff/history audit | J16/J20/J25, J32/J32B/J35/J35B, E-1/E1/E5, all acceptance variants pass. No earlier closed defect reopens. Optional docs smoke omitted; current web build and docs-example tests pass |
| Cleanup / boundaries | Runtime-export references, pure imports, retired paths, `git diff --check 5f1ec4c..HEAD`, content hash | Clean; no Core/adapter/product implementation change in this repair diff, no retired engine/API/spike module or implementation mutation |

## Remediation Order

1. **J-038:** correct follower box/rate conversion for a new handoff across different ancestry. Preserve the successful J-037 epoch retention and its real-retarget conversion, J-032 current CSS geometry, J-035 anchors and amended J-036 accounting.
2. Add the exact external-lead regression and its controls to the existing browser/pure suites. Update the existing engine proof and final review, then rerun the final gates on the corrected frozen source. No new harness, evidence directory or unrelated refactor is required.

## Fix Proof Report Requirements

Submit proof in `.trace/ani_layout_final/cp4_engine.md` and `cp8_final.md`, or the conversation: changed files, implementation rationale, exact verification commands/results, architecture/T/V mapping and residual risks. Show measured before/after boxes, independent path and incoming vx100/vw0, the lead's absence of layers and follower's new-start state, unchanged parent timeline, complementary opacities, release at1, natural restoration/held-zero and zero subscribers ×3. Reconcile any refinement of §5.6/K24 with the visual-B/first-frame invariants. Preserve the original J37 sensitivity and J32/J35/cost evidence.

## Re-Judgment Entry Criteria

- Frozen correction and per-defect proof are inspectable.
- J-038's fully visible follower and new lead both retain **x120/w40** at the handoff and follow the stated independent path within .5 px every visible frame in C/F/W, with coherent rates and correct fade/release/cleanup. Different ancestry must not be hidden by moving the lead into the old parent.
- Original J37/J37Control/J37Moving/J37Retarget, pure ordering/rate coverage, J-032/J-035/J-036 and J-016/J-033/J-034 remain closed. Removing conversion globally is not an acceptable fix.
- Required full CI, unfiltered Chromium coverage, full Firefox/WebKit, WAAPI trace, size and unused-symbol/type gates pass; product/docs continuity remains supported.
- Any remaining supported follower jump is FAIL. Missing corrected source, required proof or execution access prevents acceptance and may produce BLOCK.

## Final Ruling

The submitted no-op defect J-037 is repaired and its sensitivity claims are accurate. Earlier named defects stay closed, and every requested command gate passes. However, the conversion introduces **J-038 (S0)** on the explicitly requested new-follower/layerless-lead boundary. Therefore **T3.3/V3, T4.1/T4.3/V4 and V8 fail**; not every T1.*–T8.*/V1–V8 requirement is satisfied. The complete ani-layout implementation is rejected pending that correction. Access and evidence were sufficient to judge; this is FAIL, not BLOCK.

## Fix directive for the implementer

- **J-038 — `packages/layout/src/solve.ts:392`, `:399`, `:420`, `:447`:** correct the box and rate conversion across different follower/lead ancestry so the fresh external handoff above preserves **x120/w40 on both nodes** and its independent path. **`packages/layout/src/scope.ts:262`, `:1670`:** preserve new-start versus continuing-follow epoch semantics and supply any ancestry/context needed by the corrected conversion; retain current CSS geometry and kept timelines. Do not blanket-remove conversion or restart/snap the pair. **`tests/browser/cases/layout.ts:2455`:** add the exact moving-parent/external-top-level-lead case with first-frame and every-frame scalar expectations, shared-parent/unchanged-layer controls, opacities, release, restoration and cleanup in three browsers. **`packages/layout/src/__tests__/solve.test.ts:903`:** add the corresponding new-epoch follower/layerless-external-lead case with an independent current-DOM composition and rates; preserve both ordering and existing layered-retarget coverage. **`packages/layout/ARCHITECTURE.md:339` and `.trace/ani_layout_final/00_documentation_drift.md:103`:** reconcile the conversion's ancestry/context definition if its formulation changes, preserving visual B and first-frame continuity. **`.trace/ani_layout_final/cp4_engine.md:392` and `cp8_final.md:70`:** record the correction, discrimination, complete final gates and actual completion status according to the proof and re-entry requirements above.
