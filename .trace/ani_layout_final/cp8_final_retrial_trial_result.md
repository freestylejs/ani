# Tribunal Report: CP8 — Final, RE-TRIAL

## Verdict

TRIBUNAL FAIL

- Frozen commit: `5f1ec4c70f1b38841d255c54ae31762b83fb6611`; reviewed `1a244e3..HEAD` and the CP1–CP8 closure chain.
- Target: J-032/J-035/J-036 re-entry criteria, T8.1/T8.2/V8, and the complete final goal.
- Plan directory: `.trace/ani_layout_final`; independent execution: 2026-10-24 KST (2026-10-23 UTC).
- **J-032, J-035 and J-036 are CLOSED. J-016, J-033 and J-034 stay CLOSED. One open defect: J-037 (S0).** A continuing crossfade follower jumps on a no-op flush after an ancestor layer changes. All required command gates pass.
- Only this report was written locally. No implementation file was modified; no commit, push or publication occurred. Diagnostic source substitutions and counters existed only in memory.

## Authority Coverage

| File | Role / included reason | Coverage result |
| --- | --- | --- |
| `packages/layout/ARCHITECTURE.md:13` | Controlling §§1–12, including track space, invariants, projection, anchor, crossfade, acceptance | Fully included; J-037 violates `:120`, `:125`, `:338` |
| `.trace/ani_layout_final/plan.md:3` | Final goal; all 26 tasks T1.1–T8.2 and eight validations V1–V8 | All 34 rows classified below |
| `.trace/ani_layout_final/00_documentation_drift.md:78` | K1–K23; source decisions and later clarifications | Included; K23's explicitly approved complexity amendment accepted |
| `.trace/ani_layout_final/source_decision.md:1` | Verbatim approved source record; both open questions answered | Reconciled with higher authority; default `true` and stateful-timing rejection retained |
| `.trace/ani_layout_final/cp8_final_trial_result.md:131` | Previous dispositions and exact re-judgment entry criteria | Each carried defect and extended composition requirement checked |
| `.trace/ani_layout_final/cp4_engine.md:274`; `cp8_final.md:50` | Fix proof and final completion claims | Original repairs verified; follower residual risk at `cp8_final.md:94` is a demonstrated contract failure, not an authority amendment |
| `cp1_authority_trial_result.md` through `cp6_acceptance_trial_result.md`, corresponding execution reports, `cp7_waapi.md` | Earlier gates, defects, repairs and required outputs | Closure chain reconciled with history, unchanged outputs and fresh complete suites; no earlier closed defect reopened |
| `/Users/june/.claude/skills/judging-checkpoint-completion/SKILL.md` | Requested judicial method | Followed; no new harness or evidence-file system required |

## Judgment Matrix Summary

Counts are authority rows, not distinct defects. Scoped PASS results do not certify a failing engine dependency.

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
| J-032/J-035/J-036 | 3 | 3 | 0 | 0 |
| J-016/J-033/J-034 | 3 | 3 | 0 | 0 |
| **Total** | **40** | **34** | **6** | **0** |

| Authority rows | Evidence / independent judgment | Result |
| --- | --- | --- |
| T1.1/T1.2/T1.3/V1 | Single authority and source record exist; retired architecture, projection engine and old trace directories are absent. K1–K23 reconcile the earlier decisions. | PASS |
| T2.1/T2.2/T2.3/T2.4/V2 | Historical spike sources/results and J-008 repair chain remain inspectable. `2297189` repairs reveal observation before production `6485ad8`; all four hard gates precede production. Deleted prototypes need not be recreated. | PASS |
| T3.1/T3.2/T3.4 | Geometry, validation/defaults, effective equality, planning and child-space anchor target comparison inspected; pure suites pass. Pure modules have no DOM/clock import. | PASS |
| T3.3/V3 | Channel, anchor, layered-tree projection and derivative properties pass, but follower boxes/rates are copied directly from the lead (`solve.ts:413`, `:440`) while the engine can give them different epochs. The supported composed result fails J-037. | FAIL |
| T4.1/T4.3/V4 | Original engine and regression cases pass. Continuing-follow frame construction refreshes the follower's epoch while keeping the lead's, producing a visible no-op jump; supported crossfade/layer composition is incomplete. | FAIL |
| T4.2/T4.4 | Public API/hard deletion, typechecks, read discipline and established cost gates pass. | PASS |
| T5.1/T5.2/T5.3/V5 | Adapter sources unchanged since the preceding trial; units and full browser suites cover StrictMode, concurrent capture, hand-off, root isolation, trigger warning, presence and prescribed E5. Earlier adapter repairs remain supported. | PASS |
| T6.1/T6.2/T6.3/T6.4/V6 | Named E1–E5/Gallery, regressions, fuzz and scale rows pass in all three browsers and all four acceptance builds. Fixtures/docs/API unchanged since their prior typechecked proof; fresh web build passes. Showcase uses tested fixtures; retired API/spike cleanup remains intact. | PASS |
| T7.1/T7.2/V7 | W1–W5, easing units, React WAAPI path and fresh discriminating compositor trace pass; documented shape/time limitations retained. | PASS |
| T8.1 | Unused-symbol checks, runtime-export references, debris/deletion audit and actual size inspected. Pure files now total **1,629 lines**, `scope.ts` **1,951**; the approximately 900-line estimate is not a hard gate. No arbitrary split/reduction ordered. | PASS |
| T8.2 | Install, full CI, three full browser runs and size pass on the identical frozen mirror. The claimed fresh-clone input `74da464` differs from HEAD only in the two proof/review files; no other remote directory was accessed to re-inspect that clone. | PASS |
| V8 / final goal | Executable release gates pass; the complete implementation is not correct for a supported crossfade/no-op composition. | FAIL |
| J-032 | `scope.ts:287` updates kept CSS geometry/origin while preserving matrices. Exact x60/w40 repro, unchanged timeline, independent path, no-op and identity settle pass ×3. | CLOSED |
| J-035 | `solve.ts:389`, `scope.ts:1257`, `plan.ts:403` use child-space parent boxes/rates/targets. Exact x120/w40 repro and depth-two/no-op cases pass ×3; derivative properties pass. | CLOSED |
| J-036 | `solve.ts:287` caches each correction/Ω; work is O(N+L), with L the explicitly defined layer-pair count. Approved §5.3 amendment and measured chain counts satisfy the alternative disposition. | CLOSED |
| J-016 | Default timing resolves in `motion.ts:332`; omitted↔explicit ease-out stays on the original trajectory and ends, while genuine timing changes interrupt, in vanilla and React suites ×3. | CLOSED |
| J-033 | Explicit text inheritance remains at `layout_fixtures.tsx:560`; all four E4 variants pass Firefox with equal grid/detail title widths 60.167 px, and pass the other engines. | CLOSED |
| J-034 | Finite enter starts/path/settle checks at `acceptance.ts:337`, `:367`; Gallery detail frame checks at `:821`, `:849`; required-loop exhaustion rejects at `layout_frames.ts:124`. These assertions are unchanged since the independently rejected held-scale control; all variants pass ×3. | CLOSED |

**Projection/cost ruling.** The conjugation product is valid: substituting an ancestor inner map inserts `Ωₐ ∘ Γₐ ∘ Ωₐ⁻¹`; their root-first product carries the base parent map into the node's epoch. `Ωₐ = corrₐ⁻¹ ∘ Mₐ` recovers the shared base map. The same product rule over moving maps correctly carries derivatives. The random layered-tree browser-chain oracle is independent of that recurrence (`solve.test.ts:767`, `:814`); anchor placement and finite-difference tests are at `:834`, `:870`.

The approved wording at `ARCHITECTURE.md:274` is precise: **O(N) map arithmetic plus constant work per layer**, not unconditional O(N) total work. L can be quadratic in N; the amendment explicitly defines the counted pair. Corrections and Ω are memoized, with bounded arithmetic per pair; ancestor discovery is done at flush (`scope.ts:262`, `:480`), not on steady frames. The distinct-root-epoch chain has L=N−1 and measured counts 95/195/395/795. This closes J-036 without changing a latency budget. It does not certify how follower epochs are selected.

## Defects

| ID | Severity | Authority source | Finding | Required correction |
| --- | --- | --- | --- | --- |
| **J-037** | **S0** | Architecture §3.3 invariants 1/4 (`:120`, `:125`), §5.6 (`:338`), §11; T3.3/V3, T4.1/T4.3/V4, final goal | A continuing follower is rebased to the current flush while its lead keeps its older epoch. `scope.ts:1608` keeps its drive, but `:1668` preserves frame matrices only for action `keep`; `:1671`/`:1686` give the continuing `follow` current ancestry/geometry. `solve.ts:414`/`:441` copy the lead's box/rate without an epoch conversion. A no-op flush jumps the visible follower **x140/w52 → x132/w41.6**, with its lead unchanged, in C/F/W. | Keep follower/lead box, velocity and projection spaces coherent across continuing-follow flushes, retaining current CSS geometry, the lead trajectory and the fade timeline. Add the exact independent regression to existing suites. |

### J-037 reproduction and independent expectation

All elements are absolute, box-sizing border-box, origin `0 0`, body margin/scroll zero. Both participants use default `layout:true`; group motion is linear, duration 1 s.

1. Parent participant: left100/top0, 300×100, `transform:scaleX(.8)`. Its old child is left0/top0, 40×40, `layoutId:'pair'`.
2. Register a presence handle for that child: present `{translateY:0}`, exit to `{translateY:0}` over .1 s, same manual clock; no opacity ownership. Capture/flush once to establish the lead.
3. Capture; start the old child's exit; add a new child under the same parent at left200/top0, 100×40, same id; flush. The old child becomes the held crossfade follower, the new one the lead.
4. Deliver `frame(16)`, then `frame(200)`: track time τ=.2. Change the parent's transform to `scaleX(1)`. Both actual boxes are **(x140,y0,w52,h40)**.
5. Capture/flush with **no further DOM or option change**. Output is `{status:'no-change',snapped:[]}`. The lead remains **x140/w52**, but the follower immediately becomes **x132/w41.600006**. It is still visible (opacity .8).

The original track is `x=100+160τ`, `w=32+48τ`. The shared presence-layer change is 1/.8 about x100, so **both visible boxes must be `x=100+200τ`, `w=40+60τ`**. No time or target changed during the flush. Independently checking 50 frames, τ=.2+.016k (k=0…49), gives:

| Control / result | Chromium | Firefox | WebKit |
| --- | ---: | ---: | ---: |
| No intervening flush: maximum rect error, both nodes | .000027 px | .006675 px | .000027 px |
| With no-op flush: maximum lead error | .000027 px | .006675 px | .000027 px |
| With no-op flush: maximum follower error | **39.359998 px** | **39.366650 px** | **39.359998 px** |

The same failure reproduces with the `1a244e3` engine in memory: this is a newly demonstrated remaining defect, not a regression caused by the three repairs. A moving-parent variant also fails (follower width 38.8213→43.1348 at a no-op). Natural completion still reports `ended`, holds follower opacity0 and leaves zero subscribers; that does not cure the visible motion. The residual-risk note at `cp8_final.md:94` cannot authorize a jump contrary to §3.3/§5.6.

## Defect Disposition

| ID | Essential defect | Why it breaks completion | Robust correction mandate | Re-judgment evidence |
| --- | --- | --- | --- | --- |
| J-037 | Continuing followers and kept leads can acquire incompatible projection epochs, while the shared box/rate assumes one space | A supported, reported no-change flush changes a visible participant and separates the crossfade pair; every-frame exactness is false | Reconcile or preserve the pair's spaces consistently for boxes and rates, including current CSS geometry and a real lead retarget. Do not restart the lead/fade, suppress the presence layer, disable crossfade, or snap this supported input | Exact x140/w52 preservation, independent every-frame pair path and velocity, no-flush control, correct fade/release/identity settle ×3; relevant pure layered-follower coverage and all existing gates |

## Independent Re-checks

Every executable check used `ssh -o KexAlgorithms=curve25519-sha256 -o BatchMode=yes june-wsl`, sourced `~/ani-v2/env.sh`, and ran only in `~/ani-v2/lay-judge-cp8_final_retrial`. WebKit additionally sourced `~/ani-v2/sysroot/webkit-env.sh`. No local Node/pnpm/tests ran. Each command stayed below ten minutes. Browser probes used esbuild `write:false` and remote stdin Node/Playwright, with public manual clocks and independent scalar expectations; no diagnostic files were created.

| Check | Command or method | Result / command output |
| --- | --- | --- |
| Frozen identity, before and after | SHA-256 over ordered tracked path/content pairs | **574 files**, local/remote identical both times: `92756f5e75903eac7a5270cd4af7ab0c1bdae6a9938f43b06a8197c5b1594a73`; remote has no `.git` |
| Install | `pnpm install --frozen-lockfile` | Exit0: “Lockfile is up to date”, “Already up to date”; web postinstall succeeds |
| Full CI | `pnpm test:ci` | Exit0: Biome no errors, workspace types/builds including production web build (**166/166 pages**); **137 files / 1,607 tests passed**, coverage gate passes |
| Full Chromium / coverage | `pnpm test:browser --coverage` | Exit0: **128 passed, 0 failed, 0 known failures, 0 skipped** (95.9 s); engine statements/branches/functions/lines **94.69/85.84/98.01/97.53%**, floors **90/80/95/92%** |
| Full Firefox | `pnpm test:browser --browser firefox` | Exit0: **126 passed, 0 failed, 0 known failures, 2 skipped** (92.8 s) |
| Full WebKit | `pnpm test:browser --browser webkit` | Exit0: **126 passed, 0 failed, 0 known failures, 2 skipped** (86.4 s); only core C1/C2 skip by design |
| WAAPI trace | `pnpm test:waapi-trace` | Exit0: WAAPI block120.111 ms, ticks/draws/swaps **6/5/5**, compositeFailed[]; RAF120.094 ms, **6/0/0** |
| Size | `pnpm size` | Exit0, **8/8 PASS**; everything **22,910/23,700 gzip bytes** |
| Unused-symbol/types | `pnpm exec tsc -p packages/layout --noEmit --noUnusedLocals --noUnusedParameters`; same for `tests/browser` | Both exit0, no diagnostics; browser program also includes React layout sources |
| Established COST | Full C/F/W runs, unprofiled timed cases | 1,000 participants/300 movers reads **2.40/3.00/2.00 ms**; 300 nested movers frame p95 **.700/.850/.700 ms**, all pass |
| SCALE | Full C/F/W runs | All 50/300/1,000 all-moving rows recorded; 1,000-moving whole commit **15.8/18/16 ms**, frame p95 **1.54/3.20/1.80 ms**; these rows are measurements, not new gates |
| Exact J-032/J-035 repros | J32/J32B/J35/J35B current and old-source in-memory bundles, all three browsers | Current: 64 independent frames per case, no-op `no-change`, `ended`, identity settle. Maximum child error J32B **.0001/.0111/.0000 px**, J35/J35B **.0001/.0179/.0001 px**. Old engine: J32B **“drawn x35 … x60 … 25.000 px”**, J35/J35B **“drawn x100 … x120 … 20.000 px”** ×3; original J32 still passes |
| Distinct-epoch actual engine chain | N nested participants; root left0→200 at .2 s; successive root scales `1+i/1000`, descendant widths100→120, one flush per descendant; next steady frame; in-memory counters | All N tracks active. Current N25/50/100/200: L24/49/99/199, **95/195/395/795** plain map compositions. Old N25/50/100: **300/1,225/4,950** ancestor compositions |
| Layered pure properties | Full CI plus source/oracle inspection, `solve.test.ts:793` onward, `solve_cost.test.ts:76` | 300 random layered trees, 400 anchor trees, 200 velocity trees and restored-layer controls pass; independent browser-chain recomposition and finite differences inspected |
| Depth-two kept ancestors / changing layers / no-op | Root .8, middle .5; both layers1 at child retarget; then root .9/middle .7; 65 independent 16 ms frames | Expected `x=R+.63(C−R)`, w25.2 after layer change; max C/F/W **.000020/.011742/.000019 px**; no-op `no-change`, identity, zero subscribers |
| Moving-map velocity carry | Same mixed-epoch depth-two state; current layers1.1/.9; child retarget at old elapsed .304 | Independent B **110.1422096384/w39.6**, vx **255.7618688**; 65 new-track frames max C/F/W **.000061/.015486/.000039 px**; `ended`, identity, zero subscribers |
| Supported ancestor removal | Translation-only middle wrapper unregistered; child retarget at old elapsed .304 | Independent B **110.20425216/w40**, vx **256.32512**, A x400/w40; 65 frames max C/F/W **.000056/.012408/.000020 px**; `ended`, identity, zero subscribers |
| Followers beyond existing cases | Reduced J-037 repro above, no-flush control, current/old engine ×3 | **FAIL**, immediate x8/w10.4 discontinuity, then approximately39.36 px maximum error; existing J17/Crossfade tests do not exercise this differing-epoch no-op |
| Earlier closures / product continuity | Complete suites, unchanged adapter/fixture/acceptance/coverage files since `1a244e3`; direct assertion/source inspection | J-016/J-033/J-034 and earlier named repairs remain closed. E1/E5, J20/J25, E-1 and all four acceptance variants pass. Optional docs smoke not rerun; current production web build passes |
| Cleanup / boundaries | Runtime-export reference audit; pure import audit; retired paths; `git diff --check 1a244e3..HEAD`; tracked source hash | No unreferenced runtime export, forbidden pure import, retired engine, whitespace error or implementation mutation. Two console.log hits are browser-result reporters. No Core/adapter/product source change in this re-trial diff |

K21 is an aggregate engine-coverage gate, not four separate per-file floors. It was exercised by an unfiltered run; CI invokes that full command at `.github/workflows/test.yml:71`. Coverage and the existing green suites do not establish correctness for the independently failing follower case.

## Remediation Order

1. **J-037:** repair continuing follower/lead epoch coherence, preserving the new current-CSS geometry handling, anchor correction and O(N+L) recurrence. Add the reduced repro and its no-flush control to existing tests, with every-frame pair and velocity expectations.
2. Update the existing engine proof and final review with the corrected behavior, replacing the unresolved follower-risk claim. Re-run final gates on the corrected frozen source. No new harness, evidence directory or unrelated refactor is required.

## Fix Proof Report Requirements

Submit the proof in `.trace/ani_layout_final/cp4_engine.md` and `cp8_final.md`, or the conversation. Include changed files, root cause/rationale, exact commands/results, architecture/T/V mapping and residual risks. For J-037 show both measured pre/post-flush boxes, the independent scalar path and incoming rates, a no-flush control, unchanged lead/fade timelines, complementary opacities, release timing, natural identity settle and zero subscribers in C/F/W. Include a moving/depth-two ancestor control and relevant pure follower ordering/layer/rate coverage. Preserve the closed J32/J32B/J35/J35B, J16/J20/J25, E-1/E1/E5, acceptance and cost evidence.

## Re-Judgment Entry Criteria

- Frozen corrected diff and per-defect proof are inspectable.
- The exact J-037 no-op retains **x140/w52 on both nodes** and agrees with the no-flush control and independent path within .5 px every visible frame ×3, with coherent velocity and no timeline restart.
- Continuing followers, a real lead retarget, and the moving/depth-two ancestor control retain correct pair geometry, opacity/release and cleanup; the original J-032/J-035 repros and amended J-036 accounting remain satisfied.
- Required full CI, unfiltered Chromium coverage, full Firefox/WebKit, WAAPI trace, unused-symbol/types and size gates pass on the correction; product/docs continuity remains supported.
- A remaining supported follower jump is FAIL. Missing required corrected source, proof or execution access prevents acceptance and may produce BLOCK.

## Final Ruling

The three defects submitted for re-trial are repaired, and their exact old-engine counterexamples discriminate correctly. The approved complexity amendment is honestly implemented. All requested executable gates pass, and J-016/J-033/J-034 remain closed. However, **J-037 (S0) remains open**: a supported crossfade loses visual continuity merely because a no-op flush refreshes only the follower's epoch. Therefore T3.3/V3 and T4.1/T4.3/V4 are not fully satisfied, and V8/the complete CP1–CP8 final goal is **not complete**. The verdict is FAIL; access and evidence were sufficient to judge.

## Fix directive for the implementer

- **J-037 — `packages/layout/src/scope.ts:1607`, `:1668` (continuing-follow handling and frame geometry/ancestry), and `packages/layout/src/solve.ts:413`, `:440` where box/rate space conversion is needed:** keep continuing follower and kept lead projection spaces coherent while updating the CSS basis. The precise required result is no x140/w52→x132/w41.6 jump on the reduced no-op repro, both nodes following `x=100+200τ`, `w=40+60τ`, with unchanged lead/fade timing. Preserve real-retarget behavior and current presence layers; no blanket restart, crossfade suppression or unsupported snap. **`tests/browser/cases/layout.ts`**: add that exact case, no-flush control and moving/depth-two control with independent every-frame rect/rate, opacity, release and cleanup checks ×3. **`packages/layout/src/__tests__/solve.test.ts`**: cover layered follower/lead space coherence and rates in both orders. **`.trace/ani_layout_final/cp4_engine.md:386` and `cp8_final.md:92`**: replace the unresolved follower-risk claim with changed-file/rationale/verification proof and the actual final completion result; supply the re-judgment evidence above.
