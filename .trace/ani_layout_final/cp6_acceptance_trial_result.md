# Tribunal Report: CP6 Acceptance, CP7 WAAPI, and CP5 carried defects

## Verdict

TRIBUNAL FAIL

- Frozen commit: `3a97b5b25e259f7685cfaab3ee897bce66023f47`; changes reviewed: `8211c7c..HEAD`.
- Target: T6.1–T6.4/V6, T7.1–T7.2/V7, and J-016, J-020, J-025–J-031.
- Plan directory: `.trace/ani_layout_final`; date: 2026-10-23 UTC.
- Four defects: two S0, two S1. CP7's gates pass; CP6 and the carried repair set do not pass. No implementation was changed.

## Authority Coverage

| File | Role / coverage |
| --- | --- |
| `packages/layout/ARCHITECTURE.md:90`, `:282`, `:339`, `:426`, `:528`, `:553` | Controlling invariants, interruption/layers, ownership, adapter, WAAPI, acceptance. Fully included for this scope. |
| `.trace/ani_layout_final/plan.md:144` | T6.1–T6.4/V6, prescribed E1–E5/Gallery parameters, T7.1–T7.2/V7. |
| `.trace/ani_layout_final/00_documentation_drift.md:97` | K18–K20, including effective equality, moving-map carry, reversal, WAAPI start, and E-1. |
| `.trace/ani_layout_final/source_decision.md:1` | Approved source record; closed default-layout/stateful-timing questions. Later architecture clarifications control. |
| `.trace/ani_layout_final/cp5_react_trial_result.md:74`, `:127` | Each carried disposition and re-entry criterion independently checked. |
| `.trace/ani_layout_final/cp4_engine.md:180`; `.trace/ani_layout_final/cp5_react.md:128` | Fix claims checked against implementations, assertions, original numeric cases and browser execution. |
| `.trace/ani_layout_final/cp6_acceptance.md`; `.trace/ani_layout_final/cp7_waapi.md` | Checkpoint claims, not authority. Firefox acceptance claim is contradicted below. CP7's statement at :57 that React lacks `engine` is superseded by `db17572` and passing RL9. |

CP8, other framework adapters and architecture non-goals were excluded. The Core source is unchanged; its browser-case diff only declares the two CDP cases Chromium-only.

## Judgment Matrix Summary

Counts are coverage rows, not distinct defects. Executable checks are also counted separately from the requirements they support.

| Requirement group | Rows checked | PASS | FAIL | BLOCK |
| --- | ---: | ---: | ---: | ---: |
| Carried defects | 9 | 8 | 1 | 0 |
| T6.1–T6.4/V6 | 5 | 3 | 2 | 0 |
| E-1/K20b beyond the original flat row | 1 | 0 | 1 | 0 |
| T7.1/T7.2/V7 | 3 | 3 | 0 | 0 |
| Executable gate groups | 10 | 9 | 1 | 0 |
| **Total** | **28** | **23** | **5** | **0** |

| Authority row | Evidence and independent result | Result |
| --- | --- | --- |
| J-016 | Original inherited/default duration, delay and reordered-spring cases now retain their trajectories in `layout:J16` and `react_layout:J16`, including React 18.3. Omitted timing versus explicit default ease-out still interrupts the vanilla engine: defect below. | FAIL |
| J-020 | Repeated the original parent x100/scale .8→1, departing child left0→200/width40 at **.2 s**: new lead starts **x140/w40**. At .02 s it draws **144.047516 / 144.050003 / 144.047516**, expected **144.04752**. Every .02 s frame through settle matches within .00784 px. Existing J20 also proves retained size momentum (200/60 px/s), delay/rest handling and expiry; pure retained-size derivative assertions are at `plan.test.ts:695`. | PASS |
| J-025 | Repeated moving parent left0→200 and child's own scale .8→1/left0→100 at **.2 s**: B **x40/w40**, incoming vx **200**, next .02 s **44.047523 / 44.050003 / 44.047523**, expected **44.04752**. Every frame and identity settle pass; new browser J25 also passes. A different mixed-geometry failure introduced by E-1 is J-032. | PASS |
| J-026 | J26: equal fresh maxDuration objects preserve **40/44/48**, one subscriber, then every frame of the original track. A genuinely changed policy recreates the scope; latest onSnap remains covered by unit tests. | PASS |
| J-027 | J27: CSS pop box **50/80/100×50**, drawn **50/94/80×40**, every frame through .208 s release. Mid-layout exit remains on its track; scaled-block/own-transform unit cases inspected. | PASS |
| J-028 | J28: moved-fiber replay preserves entering **opacity .2/scaleX .84/width84** and exiting opacity .8, then matches every frame; one release, no remaining subscription. Same-element/inline-ref unit cases inspect handle and stale-completion lifetime. | PASS |
| J-029 | J29: main and iframe sibling both remain **y50**, translate **0px 50px**, at settle-commit t=0, then settle at y0; removing iframe root leaves main root functioning. Routing/disposal unit cases inspected. | PASS |
| J-030 | `layout.ts:1464`, `:1696`, `:1777` now assert reduced-motion trajectory, rect/corner correction, and frozen authored composition. J20/J25 supply missing size/map cases. `react_layout.ts:1000` onward checks the prescribed spring E5 add/enter/interrupted-layout/exit expectations, every frame, on React 19 and 18.3 in three browsers. Original CP5 proof omissions are closed. | PASS |
| J-031 | RL6 and observer unit cases: memoized parent class/style changes warn exactly once; captured renders/update controls animate without warnings; layout/presence frame writes do not spuriously warn. | PASS |
| T6.1 | All six fixtures exist and use prescribed parameters. E1/E2/E5 pass their checks; Gallery grid↔list matches its independent oracle. E4 fails Firefox; E3 can falsely pass missing starts, and Gallery detail legs lack frame expectations. | FAIL, J-033/J-034 |
| T6.2 | LateStart, Unrelated, Crossfade, Jank, T11/J19 reduced-motion, Honest, and 24×60 seeded fuzz execute in three browsers. Assertions inspect read/write order, finite values, owned properties, final byte-identical styles and subscriptions. | PASS |
| T6.3 | COST enforces ≤4 ms reads and ≤2 ms p95 at the established workload. SCALE records 50/300/1,000 all-moving workloads; an independent in-memory assertion before each finish confirmed the actual track count equals the claimed count in every round, all three browsers. | PASS |
| T6.4 | Showcase imports/renders the tested fixtures; CSS-flow toasts and all six controls inspected. READMEs, guide, showcase page, changesets and ^0.2.0 peer inspected. Thirteen documentation programs typecheck; production web build passes. | PASS |
| V6 | No retired layout API/bridge or spike browser module survives inspection/grep. Required three-browser green gate fails in Firefox. | FAIL, J-033 |
| E-1/K20b | Original flat PRESENCE_LAYER and prescribed E5 pass. Keeping an ancestor's frozen geometry while retargeting a descendant mixes map spaces and jumps the descendant. | FAIL, J-032 |
| T7.1 | Real-engine Chromium compositor trace discriminates WAAPI from RAF during the block. | PASS |
| T7.2 | `realize/waapi.ts:57`, `scope.ts:540`, `:1167`, `:1667`: flush creation, pause at zero, next-frame play, no startTime assignment/inline pose writes, sampled linear easing, currentTime sampling, validation and cancellation inspected. W1–W5 pass ×3. Independent later DOM nesting produces two unsupported snaps, zero animations and unchanged inline styles ×3. | PASS |
| V7 | Differential ≤.5 px/frame and first frame after 120 ms block **0%** in all engines; Chromium compositor trace passes. | PASS |

## Defects

C/F/W means Chromium/Firefox/WebKit. Numeric probes bundle the frozen source in memory, use real DOM/Core manual clocks and independently evaluate the scalar track equation. No diagnostic files were created.

| ID | Severity | Authority | Finding |
| --- | --- | --- | --- |
| **J-016** | S0 | §3.3 invariant 5; §5.5; carried effective-default equality mandate | `packages/layout/src/motion.ts:365` compares an unresolved `undefined` timing with an explicit `timing.easeOut()`, although `:406` resolves both to the same curve. Group duration1, default timing, x0→200; at .2 s set only one of two identical movers to `{motion:{timing:timing.easeOut()}}`, flush, then advance two .02 s frames. Updated/control x is **67.194275/72.880173 C**, **67.199997/72.883331 F**, **67.194489/72.880173 W**; the first run reports **interrupted**. `sameTrackOptions({}, {motion:{timing:timing.easeOut()}})` returns false. Existing equality tests omit this default. |
| **J-032** | S0 | §3.1, §3.3 invariants 1/4, §5.3/§5.5; K20b | `packages/layout/src/scope.ts:1544` retains an ancestor's old geometry while a newly planned child uses geometry measured through the current ancestor layer (`:1054`). Repro: parent CSS left0/200×100, origin0, transform scaleX(.8); child left0/40×40, origin0; both registered, linear1 s. Move parent to left200; frame(0), frame(200); change parent transform to scaleX(1). Actual parent/child now start x40, child w40. Capture, set child left100, flush: parent stays x40, but child becomes **x40/w50 immediately**, in all browsers. Child should start x40/w40 and retarget toward x300/w40 at vx200. At .02 s expected x44.04752/w40; actual **44.059402/w50 C/W**, **44.066666/w50 F**. Independent every-frame maximum error is **23.6941 / 23.6902 / 23.6941 px**. Identity settle succeeds but does not cure the intervening wrong motion. |
| **J-033** | S1 | T6.1/V6; §11 E4 title size pinned; three-browser gate | `tests/browser/cases/acceptance.ts:401` reproducibly fails all four Firefox builds: **title first frame x: 177.1666717529297 is not within 0.5 of 178**. Fixture title inherits **sans-serif** inside GridCard's button but **serif** inside CardDetail's div (`packages/web/src/components/layout_fixtures.tsx:485`, `:532`, `:570`). Measured width changes **58.5→60.166656 px**; position mode correctly preserves the centre, shifting the left edge by .83333 px. An in-memory `button{font-family:inherit}` control keeps both widths 60.16667 and x178. This is a fixture inconsistency, not evidence that the solver should violate position-mode semantics. |
| **J-034** | S1 | T6.1/V6; §11: frame oracle, no final-only acceptance | `tests/browser/cases/acceptance.ts:297` subtracts possibly missing starts; NaN passes the `> DT` check at :303. Frame loops can hit their limit without proving settle (`layout_frames.ts:105`). Sensitivity run, changing only the in-memory FolderItem enter target scale to .2 and duration to 1,000 s: **E3Folder still passes in C/F/W**, reporting **stagger within NaN s**. The real test therefore does not reject absent prescribed staggered enters. Separately, Gallery detail opening/return use `() => undefined` throughout their frame loops (`acceptance.ts:665`, `:679`), checking only first/final boxes, contrary to the written frame-oracle gate. |

## Defect Disposition

| ID | Essential defect / impact | Robust correction mandate | Re-judgment evidence |
| --- | --- | --- | --- |
| J-016 | Equality and actual default resolution disagree; an unchanged animation restarts. | Normalize the default timing in effective track comparison as in motion resolution. Preserve genuine-change detection and existing inheritance/key-order behavior. | Omitted↔explicit default timing controls retain the run and match every frame in C/F/W, including the numeric case above; real timing changes still retarget. |
| J-032 | Kept and new tracks use incompatible ancestor maps, producing wrong nested projection. | Make kept ancestors and newly planned descendants compose in a consistent map space while retaining the presence layer and untouched track timeline. Do not fix by retargeting every ancestor, snapping supported nesting, or suppressing the layer. | Exact repro begins w40, remains on the independent track every frame, preserves incoming velocity and settles at identity in C/F/W. Original E-1, J20/J25 and prescribed E5 remain green. |
| J-033 | Shared fixture changes title font metrics between states, failing E4 and V6. | Give GridCard and CardDetail consistent inherited title font metrics; retain position mode and the .5 px assertion. | All four E4 build variants pass Firefox and the other browsers; complete required browser runs are green. Correct the CP6 completion claim using fresh results. |
| J-034 | Missing mandatory behavior can be accepted as NaN or final-only evidence. | Reject missing/non-finite starts and unfinished runs; assert prescribed enter progress/stagger against independent expectations. Add Gallery detail opening/return frame expectations in the existing acceptance suite. | The frozen valid fixtures pass ×3; the held-scale/missing-start control is rejected; every detail frame is checked against its track. No new harness/evidence system is required. |

## Independent Re-checks

All execution used only `~/ani-v2/lay-judge-cp6_acceptance` on june-wsl, with the requested SSH KEX/BatchMode options and `source ~/ani-v2/env.sh`; WebKit additionally sourced the specified webkit-env.sh. Tests/builds ran remotely only.

| Check | Command or method | Result / output |
| --- | --- | --- |
| Frozen mirror | SHA-256 over ordered tracked path/content pairs before and after execution | All **569** files identical locally/remotely: **2590d006a5264ccb0dac22bc40d18d6bf700319245f8afb2e9e298f16a60cab1**. Remote has no .git. |
| Prerequisite builds | `pnpm --filter @freestylejs/ani-core --filter @freestylejs/ani-layout --filter @freestylejs/ani-react build` | Exit 0, including declarations. |
| Full units | `pnpm vitest run` | Exit 0: **136 files, 1,598 passed**. |
| Full Chromium | `pnpm test:browser --browser chromium` | Exit 0: **122 passed, 0 failed, 0 known failures, 0 skipped**. |
| Full Firefox | `pnpm test:browser --browser firefox` | FAIL: E4 title assertion; core C1/C2 correctly SKIP. Isolated repeat `--case 'acceptance*:E4Card'`: **0 passed, 4 failed**, identical numeric failure in plain/18.3/Compiler/18.3+Compiler. |
| Full WebKit | `pnpm test:browser --browser webkit` | Exit 0: **120 passed, 0 failed, 0 known failures, 2 skipped**. |
| WAAPI trace | `pnpm test:waapi-trace` | Exit 0: WAAPI running, block **120.163 ms**, ticks/draws/swaps **6/5/5**, compositeFailed **[]**; RAF running, **120.18 ms**, **6/0/0**. |
| Browser types | `npx tsc -p tests/browser --noEmit` | Exit 0. |
| Layout types | `pnpm --filter @freestylejs/ani-layout ts:typecheck` | Exit 0. |
| Required Biome | `npx biome check packages/layout packages/react tests/browser packages/web/src/components package.json` | Exit 0: **101 files**, 8 warnings, 1,279 infos; no errors, no fixes. |
| Docs examples | Extract every ts/tsx block from the guide and both READMEs into an in-memory TypeScript program; join the two layout README fragments; use browser tsconfig paths/options, strict/noEmit | **13 programs, 0 diagnostics**. |
| Web build | `pnpm --filter @freestylejs/ani-web build` | Exit 0: compiled, TypeScript passed, **166/166** static pages generated. Optional server/docs smoke was not rerun. |
| Established COST | Full suites; standalone WebKit `--case 'layout:COST'` | C/F/W read gate **2.60/2.00/3.00 ms**, 300 nested movers p95 **1.225/1.000/.750 ms**; pass. All-1,000-mover totals remain recorded measurements, not a newly imposed budget. |
| SCALE workload | Existing SCALE, in-memory assertion of actual stats.tracks before each round's finish, all browsers | All 50/300/1,000 tracks are real. Whole-commit ms / frame p95 ms: C **1.5/.15, 5.4/.50, 15.8/1.45**; F **2/.20, 7/.80, 18/2.80**; W **2/.20, 6/.70, 17/1.70**. |
| Numeric re-trial / sensitivity | Remote stdin Node, esbuild write:false, Playwright, independent scalar equation; temporary substitutions only in memory | Original J20/J25 pass; J016/J032 fail ×3; E3 invalid-enter control falsely passes ×3; E4 font control isolates fixture cause. |
| Migration/product source | V6 grep from cp6_acceptance.md; tracked-file/export/diff inspection; spike file inventory; showcase imports | No surviving retired layout API/bridge or spike module. Legitimate other APIs' dependency/play vocabulary is not a retired layout symbol. |

## Remediation Order

1. Close J-016 in effective timing equality and its existing unit/browser regressions.
2. Repair J-032's nested map consistency; retain E-1's no-op behavior and original momentum fixes.
3. Normalize the E4 fixture font metrics (J-033), preserving its oracle and position semantics.
4. Complete the existing acceptance assertions (J-034), update the existing proof sections, and rerun the required gates. No CP8 work is ordered.

## Fix Proof Report Requirements

Use the existing `cp4_engine.md` engine fix-proof section and `cp6_acceptance.md`, or the conversation. For each defect provide changed files, rationale, exact commands/results, numeric before/after evidence in three browsers, authority/task mapping, the actual independent frame assertions, and residual risks. Preserve the passing carried-defect proof. Do not create a separate harness or evidence directory.

## Re-Judgment Entry Criteria

- Frozen corrections and inspectable proof for J-016/J-032/J-033/J-034.
- Omitted/default timing equality retains the original run; mixed kept-parent/retarget-child case starts at w40 and matches every frame with continuous velocity and identity settle.
- E4 passes all build variants in Firefox; missing E3 starts cannot yield PASS/NaN; Gallery detail legs have independent frame expectations.
- Required unit suites, three complete browser suites, types, Biome, WAAPI trace and existing cost gates pass; docs examples and web build remain green.
- A reproduced restart, jump, false acceptance or Firefox E4 failure remains FAIL. Missing required source/proof/access prevents acceptance and may yield BLOCK.

## Final Ruling

CP7 satisfies its written scope and gates. Eight carried defects are closed, but J-016 remains open. CP6 also has a supported nested-projection failure, a reproducible Firefox fixture failure and incomplete acceptance assertions. The combined checkpoint is rejected pending the specified corrections and re-judgment.

## Fix directive for the implementer

- **J-016:** In `packages/layout/src/motion.ts`, compare omitted timing as the effective default ease-out. Extend `packages/layout/src/__tests__/motion.test.ts` and `tests/browser/cases/layout.ts` J16 with omitted↔explicit default timing and genuine-change controls. Update `.trace/ani_layout_final/cp4_engine.md` with every-frame/run-status proof ×3.
- **J-032:** Correct kept/new geometry composition in `packages/layout/src/scope.ts`. Extend `tests/browser/cases/layout.ts` PRESENCE_LAYER/J25 with the exact kept scaleX(.8) ancestor, current scaleX(1), retargeted child case above; assert x40/w40 at flush, vx200, the independent path and identity settle ×3. Record proof in `.trace/ani_layout_final/cp4_engine.md` or `cp6_acceptance.md`; retain original E-1 and E5 behavior.
- **J-033:** In `packages/web/src/components/layout_fixtures.tsx`, give GridCard the same inherited font family as CardDetail (for example `fontFamily: 'inherit'` on GridCard). Keep `tests/browser/cases/acceptance.ts` E4's position-mode/.5 px checks. Supply green `acceptance*:E4Card` and full three-browser results in `.trace/ani_layout_final/cp6_acceptance.md`.
- **J-034:** In `tests/browser/cases/acceptance.ts`, require finite starts for every E3 item, verify expected enter/stagger/settle behavior, reject the held-scale/missing-start control, and check Gallery detail opening/return every frame against an independent track. Where used for these rows, make exhaustion of `tests/browser/cases/layout_frames.ts`'s bounded frame loop fail when required completion has not occurred. Update `.trace/ani_layout_final/cp6_acceptance.md` with the actual assertions and three-browser proof; use the existing harness.
