# Tribunal Report: CP8 — Final, THIRD RE-TRIAL

## Verdict

TRIBUNAL PASS

- Frozen commit: `ddd8a5c426868814ba215c1287d68d57752b4821`; reviewed `ac36e12..HEAD`, the previous ruling's entry criteria, and the CP1–CP8 closure chain. Date: 2026-10-24 KST.
- **J-038 (S0) is CLOSED. J-037 and all earlier defects remain closed. No open defects.** All 26 tasks T1.1–T8.2 and validations V1–V8 are satisfied under the written authority and its recorded clarifications.
- Only this report was written locally. No implementation file was changed; no commit, push or publication occurred.

## Authority Coverage

| File | Role / included reason | Coverage result |
| --- | --- | --- |
| `packages/layout/ARCHITECTURE.md:13` | Single architecture authority, §§1–12; especially visual B, continuity, amended §5.3 cost and §5.6 follower conversion | PASS |
| `.trace/ani_layout_final/plan.md:3` | Final goal; all T1.*–T8.* and V1–V8 | All 34 authority rows classified below |
| `.trace/ani_layout_final/00_documentation_drift.md:78` | K1–K25; K23's approved cost amendment and K25's ancestry rule | Reconciled with implementation and higher authority |
| `.trace/ani_layout_final/source_decision.md:1` | Approved source record; default `true`, stateful timing rejection | Answers and required acceptance retained |
| `.trace/ani_layout_final/cp8_final_retrial2_trial_result.md:130` | Previous J-038 remediation and re-judgment criteria | Every entry criterion met |
| `.trace/ani_layout_final/cp4_engine.md:475`; `cp8_final.md:88` | Submitted J-038 proof, final review, fresh-clone claim and residual risks | Independently checked; claims discriminate against the old solver |
| CP1–CP6 execution/trial reports, `cp7_waapi.md`, earlier CP8 trial reports | Historical spike gates, defect dispositions, acceptance and WAAPI closure chain | Reconciled with Git history, retained assertions and fresh complete suites |
| `/Users/june/.claude/skills/judging-checkpoint-completion/SKILL.md` | Requested judicial method | Followed; no additional harness or evidence files required |

## Judgment Matrix Summary

Counts include the 34 plan rows and eight specifically requested defect re-checks.

| Requirement group | Rows checked | PASS | FAIL | BLOCK |
| --- | ---: | ---: | ---: | ---: |
| CP1 T1.1–T1.3/V1 | 4 | 4 | 0 | 0 |
| CP2 T2.1–T2.4/V2 | 5 | 5 | 0 | 0 |
| CP3 T3.1–T3.4/V3 | 5 | 5 | 0 | 0 |
| CP4 T4.1–T4.4/V4 | 5 | 5 | 0 | 0 |
| CP5 T5.1–T5.3/V5 | 4 | 4 | 0 | 0 |
| CP6 T6.1–T6.4/V6 | 5 | 5 | 0 | 0 |
| CP7 T7.1–T7.2/V7 | 3 | 3 | 0 | 0 |
| CP8 T8.1/T8.2/V8 | 3 | 3 | 0 | 0 |
| J-038 and seven named earlier closures | 8 | 8 | 0 | 0 |
| **Total** | **42** | **42** | **0** | **0** |

| Authority rows | Evidence inspected / independent decision | Result |
| --- | --- | --- |
| T1.1/T1.2/T1.3/V1 (`plan.md:69`) | Architecture, source, drift and plan inspected. Retired architecture, old trace directories, projection engine and CPC harness absent; no competing layout authority remains. | PASS |
| T2.1/T2.2/T2.3/T2.4/V2 (`plan.md:76`) | `cp2_spikes.md` records all builds and three-browser numbers, sensitivity and checked Suspense reveals. Historical probe/unchecked-movement correction `2297189` precedes production `6485ad8`; prior trials close J-001–J-008. Current composition, first-frame and cost cases remain green. Retired spike modules need not be recreated. | PASS |
| T3.1/T3.2/T3.3/T3.4/V3 (`plan.md:97`) | Geometry, timing/validation, planner and solver properties pass full CI. Pure imports remain geometry/motion/solve and public Core exports, without DOM/clock imports. Independent browser-chain oracle, ordering, endpoints, momentum, anchors, modes, snaps and layered rates remain covered; J-038 passes below. | PASS |
| T4.1/T4.2/T4.3/T4.4/V4 (`plan.md:111`) | DOM/scope/realizers/public API and hard deletion inspected; full `layout` suite passes ×3. Read discipline, first dt=0, presence composition, lifecycle, byte restoration, reduced motion, snap causes and established COST gates pass. | PASS |
| T5.1/T5.2/T5.3/V5 (`plan.md:130`) | Adapter and presence implementation unchanged by this repair. Full unit/browser suites verify capture/flush, StrictMode, concurrent/deferred/Suspense paths, document/clock root isolation, popLayout, release holds, trigger warning and E5, including React 18.3. Retired API audit is clean. | PASS |
| T6.1/T6.2/T6.3/T6.4/V6 (`plan.md:144`) | E1–E5/Gallery and honesty assertions pass all four acceptance builds ×3; regressions and seeded fuzz pass. SCALE records all 50/300/1,000 rows. Shared product fixtures, rewritten docs/changesets and recorded 13-program docs typecheck remain intact; public API/docs did not change in this repair. Fresh CI includes successful production web build. | PASS |
| T7.1/T7.2/V7 (`plan.md:163`) | Shipped gated WAAPI realizer, W1–W5 and easing units pass; independent compositor trace discriminates WAAPI from RAF. Shape, first-frame and documented time limitations remain intact. | PASS |
| T8.1 (`plan.md:172`) | Strict unused-local/parameter typechecks pass. Reference audit finds 69 named runtime exports, none without another-file reference; debris/retired-symbol scans clean. Current pure core totals 1,689 lines; `scope.ts` 1,956. Approximately 900 lines is the plan's estimate, not a hard limit requiring an unrelated refactor. | PASS |
| T8.2/V8 (`plan.md:173`) | `cp8_final.md:107` records fresh-clone gates at `9ca9365`; only the two proof/review documents change afterward. The byte-matching frozen mirror independently passes frozen-lockfile install, complete CI, full three-browser runs, trace, size and strict typechecks. | PASS |

## Defects

None open: **S0 0, S1 0, S2 0, S3 0**.

## Defect Disposition

| ID | Disposition | Evidence / reason |
| --- | --- | --- |
| J-038 | **CLOSED** | `solve.ts:446` converts only the relevant shared-ancestor runs, for boxes and moving-map rates. `layout.ts:2636` retains the exact external-lead reproduction, shared-parent and unchanged-layer controls. All pass ×3, with old-solver discrimination below. |
| J-037 | **CLOSED** | Continuing-follow epoch/current-CSS semantics remain at `scope.ts:1664`; J37/J37Control/J37Moving/J37Retarget pass ×3. No-op/control/moving paths stay within .0067 px; real retarget within .0082 px, with unchanged fade/release/restoration/cleanup. Pure ordering/rate coverage remains green. |
| J-032 | **CLOSED** | `scope.ts:287` preserves current CSS geometry with frozen matrices. J32 and J32B retain x40/w40 and x60/w40 respectively, independent paths, no-op behavior and identity settle ×3. |
| J-035 | **CLOSED** | `solve.ts:478`, `plan.ts:403` keep anchor placement/target comparison in the child's space. J35/J35B retain x120/w40 and every-frame centers ×3; layered anchor properties and rates pass. |
| J-036 | **CLOSED** | `solve.ts:287` retains cached correction/Ω recurrence. `solve_cost.test.ts:76` passes: 95/195/395/795 compositions for N25/50/100/200, zero without layers. New follower conversion respects the amended map-arithmetic bound, as explained below. |
| J-016 | **CLOSED** | Effective default timing resolution remains at `motion.ts:332`; vanilla/React omitted↔explicit ease-out and genuine-change controls pass ×3. |
| J-033 | **CLOSED** | Inherited text styles remain at `layout_fixtures.tsx:560`; all four E4 variants pass Firefox with grid/detail width60.167 px, and pass Chromium/WebKit. |
| J-034 | **CLOSED** | Required completion and finite enter starts remain at `acceptance.ts:337`, `:367`; Gallery detail paths at `:821`, `:849`; exhaustion rejection at `layout_frames.ts:126`. All variants pass ×3. |

J-038's independent path remains the previous ruling's scalar equation, with incoming vx100/vw0:

`x(s)=120+280s−180s(1−s)²; w(s)=40+60s−60s(1−s)²; y=0; h=40`.

Both nodes start at **x120/w40**, opacity1/0, without hiding different ancestry. Over 64 frames both nodes and the kept parent match independent expectations; maximum C/F/W error is **.0001/.0083/.0001 px** for J38 and both controls. The unchanged-layer control starts at w32. Fade error is .0000; release and lead-opacity restoration occur at τ1.008, the first frame past1. The run ends with `snapped:[]`, lead styles restored, follower held at opacity0 and zero subscribers after cleanup (`layout.ts:2700`, `:2714`, `:2755`, `:2766`).

The general ancestry rule is also supported, beyond those three browser cases. Layer lists are root-first (`scope.ts:262`); shared ancestors form their common initial run. If the lead correction is `S_lead ∘ D_lead`, replacing its shared run with `S_follower` gives `S_follower ∘ S_lead⁻¹`, leaving the lead-only deeper run intact. `solve.ts:454` selects exactly those runs using subtree spans, regardless of relative depth/order. This preserves a lead under its own layered ancestry. Moving-map composition/inversion and `carry` apply the same transformation with its derivative (`geometry.ts:148`, `:187`). For an anchored node and its parent, both selected lists are the whole lists, so the previous anchor conversion is unchanged.

Independent in-memory counters on the existing 300-seed follower property report **662 pairs**: 389 follower-first, 273 lead-first, 354 with unshared layers, 185 with lead-only layered ancestry, 241 with a deeper lead, 253 with a shallower lead, and 168 with shared layers. All 662 finite-difference rate checks pass; the browser-chain oracle at `solve.test.ts:943` uses scalar pose rendering, not correction algebra. Layered anchor position/rate properties also pass unchanged.

Cost remains within §5.3/K23: `treeSpans` is one lazy O(N) construction per `drawnMotion` call (`solve.ts:337`, `:421`), each ancestry query O(1), and `through` performs constant map work per selected layer (`:295`). Whole corrections/Ω maps are cached; anchors reuse whole corrections, and each crossfade lead has at most one follower. Partial conversion runs add only work proportional to the pair's layer entries. There is no ancestor-chain map recomposition per node. This judges the amended **map-arithmetic** claim, not a new latency or depth requirement.

The residual note at `cp8_final.md:131` matches §3.1/§5.6: a later presence layer affects its own subtree; an external follower does not acquire that unrelated layer. It does not excuse a handoff jump. The actual J-038 first-frame invariant is now preserved.

## Independent Re-checks

Every executable gate used `ssh -o KexAlgorithms=curve25519-sha256 -o BatchMode=yes june-wsl`, `source ~/ani-v2/env.sh`, and **only** `cd ~/ani-v2/lay-judge-cp8_final_retrial3`. WebKit additionally sourced `~/ani-v2/sysroot/webkit-env.sh`. Each remote command stayed below ten minutes. No local pnpm/Node/tests ran. Diagnostic source substitutions/counters existed only in memory (`esbuild write:false`, remote stdin); no implementation files were substituted on disk.

| Check | Command or method | Result / command output |
| --- | --- | --- |
| Frozen identity before/after execution | SHA-256 over ordered tracked path/content pairs; Git HEAD/status | **576 files**, local/remote identical both times: `4f05870ec24b23a287749531fc8452d8bfbcf38711edd63e8aba5478daa1b928`; local status clean before this report |
| Install | `pnpm install --frozen-lockfile` | Exit0: “Lockfile is up to date”, “Already up to date”; web postinstall succeeds |
| Full CI | `pnpm test:ci` | Exit0: check/typechecks/builds/coverage pass; **137 files, 1,609 tests passed**; includes both `solve_cost` tests |
| Full Chromium coverage | `pnpm test:browser --coverage` | Exit0: **135 passed, 0 failed, 0 known failures, 0 skipped**, 98.9 s; aggregate S/B/F/L **94.69/85.88/98.01/97.53%**, above **90/80/95/92%** floors |
| Full Firefox | `pnpm test:browser --browser firefox` | Exit0: **133 passed, 0 failed, 0 known failures, 2 skipped**, 95.0 s |
| Full WebKit | `pnpm test:browser --browser webkit` | Exit0: **133 passed, 0 failed, 0 known failures, 2 skipped**, 96.8 s; only Chromium CDP core:C1/C2 skip |
| Compositor gate | `pnpm test:waapi-trace` | Exit0: WAAPI block120.158 ms, ticks/draws/swaps **6/5/5**, `compositeFailed:[]`; RAF120.087 ms, **6/0/0** |
| Size | `pnpm size` | Exit0: **8/8 PASS**; everything **22,910/23,700 gzip bytes** |
| Strict unused-symbol/type gates | `pnpm exec tsc -p packages/layout --noEmit --noUnusedLocals --noUnusedParameters`; same for `tests/browser` | Both exit0, no diagnostics; browser program also includes React layout sources |
| Established COST gates, C/F/W | Uninstrumented `layout:COST` in complete runs | 1,000 participants/300 moving read medians **2.70/3.00/3.00 ms**; 300 nested movers frame p95 **.685/1.050/.750 ms**; all pass |
| SCALE, C/F/W | All 50/300/1,000 rows in complete runs | Recorded; 1,000-moving commit **15.70/19.00/18.00 ms**, frame p95 **1.510/3.200/2.400 ms**. These measurement rows are not additional gates |
| Claimed browser sensitivity | Existing J38/J38Shared/J38Unchanged with only `4cfc353` solver injected in memory, C/F/W | Old J38 fails identically in all three: **follower x120/w50 vs expected x120/w40, 10.000 px**. Both old-engine controls pass |
| Claimed pure sensitivity / generality | Existing selected properties with current vs `4cfc353` solver, in memory; independent assertion runner | Current passes; old follower property fails **seed1/follower5/lead14, relative .1081226016670396**; old closed-form width **61.475 vs49.18**, exactly1/.8. Anchor position/rate controls pass on both |
| Earlier closure / product continuity | Full suites; retained assertions, authority, history and repair diff | Named closures above stay closed; E1–E5/Gallery, regressions/fuzz, React variants and WAAPI all green. Optional docs smoke omitted; docs/fixtures unchanged and production web build green |
| Cleanup/boundaries | Reference/debris/pure-import/retired-API audits; `git diff --check ac36e12..HEAD` | Clean. Repair implementation changes are confined to solver and existing regression suites; no Core public API or other-adapter production changes |

## Remediation Order

None. No corrective work remains under CP1–CP8.

## Fix Proof Report Requirements

Satisfied by the submitted proof and independent re-checks above. No further proof report required.

## Re-Judgment Entry Criteria

The previous ruling's criteria are met: frozen correction/proof inspected; exact external-lead handoff and every-frame path/lifecycle pass ×3; shared/unchanged controls discriminate; J-037 and earlier closures remain green; all required final gates pass. No pending re-judgment entry condition remains.

## Final Ruling

CP8 and the complete ani-layout implementation are **accepted** at the frozen commit. J-038 is repaired without suppressing the crossfade, hiding ancestry, snapping supported inputs, restarting kept tracks or weakening the oracle. All plan tasks T1.*–T8.* and validations V1–V8 are satisfied. **Open defect list: []**. Publication and the out-of-scope adapters are outside this ruling.

## Fix directive for the implementer

[]
