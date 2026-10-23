# Tribunal Report: CP4 — engine and vanilla API

## Verdict

TRIBUNAL FAIL

- Target: `plan.md:111–128`, T4.1–T4.4/V4, and CP3 defects J-009–J-015.
- Frozen HEAD: `5c9f57c`; inspected `git diff 6485ad8..5c9f57c`, including `28d1625` and `9c4502a`.
- Date: 2026-10-23 UTC.
- J-009–J-015 are resolved against the amended authority. Ten new defects remain: seven S0, two S1, one S2.
- No implementation files were changed; no commits or pushes. This report is the only local file written.

## Authority Coverage

| File | Role / included reason | Coverage result |
| --- | --- | --- |
| `packages/layout/ARCHITECTURE.md` | Single authority; §§3–6, 7.1, 8–9 and applicable §11 requirements | Normal projection and capture contract pass; engine failures below |
| `.trace/ani_layout_final/plan.md` | CP4 tasks/V4, carried CP3/V3 requirements and trial protocol | T4.1/T4.3/V4 fail; public surface/deletions and measured T4.4 pass within the stated adapter exclusion |
| `.trace/ani_layout_final/00_documentation_drift.md` | K1–K15 and accepted clarifications | K14 assignment is sound; K15 resolves the prior timing/floor authority questions |
| `.trace/ani_layout_final/source_decision.md` | Approved source record and two answered questions | Reconciled under the higher authority; no source-record change |
| `.trace/ani_layout_final/cp4_engine.md` | Implementer's review and CP3 fix proof | CP3 numeric claims reproduced; CP4 blanket PASS and zero-error Biome claim not sustained |
| `.trace/ani_layout_final/cp3_pure_core_trial_result.md` | J-009–J-015 dispositions and re-entry criteria | All seven original numeric cases independently re-run below |
| Earlier CP2 trial/proof, pure modules/tests, new shell/presence modules, browser module/runner and Git history | Dependency decisions and actual implementation/evidence | Inspected; closed J-001/J-008 retained; no React/E1–E5/WAAPI implementation judgment |
| `/Users/june/.claude/skills/judging-checkpoint-completion/SKILL.md` | Requested judicial method | Followed; existing tests suffice for remediation; no separate harness/evidence system required |

K14 is accepted as an adapter responsibility: `flush()` consumes the epoch synchronously, and an immediately following `capture()` establishes the next render's B for undriven nodes while driven nodes remain known. Only the adapter observes the relevant render/layout-effect interleaving. This accepts the assignment and public seam, not CP5's unbuilt implementation.

## Judgment Matrix Summary

| Requirement group | Rows checked | PASS | FAIL | BLOCK |
| --- | ---: | ---: | ---: | ---: |
| Carried J-009–J-015 | 7 | 7 | 0 | 0 |
| T4.1–T4.4, within the declared adapter exclusion | 4 | 2 | 2 | 0 |
| Engine contract groups below | 12 | 5 | 7 | 0 |
| Six requested executable checks | 6 | 5 | 1 | 0 |
| V4 completion gate | 1 | 0 | 1 | 0 |

| Authority requirement | Evidence / independent decision | Result |
| --- | --- | --- |
| §3.1 visual tracks, full parent maps, measurement, changing presence layer | T2/T6/T7 prove ordinary composition; a new flush after the layer changed loses the actual visual B | FAIL J-025 |
| §4.1 capture reuse/refresh, driven-node exclusion, K14 seam | `scope.ts:551–579`; two same-task captures read once; a later task refreshes and starts at the refreshed x=50; T8 skips two driven nodes | PASS |
| §4.2 read-first flush and §4.3 commit-only writes | Disconnected-drive restoration precedes live reads; frame settle restores during `update` | FAIL J-018 |
| §4.3 first dt=0, ordinary nested settle/restoration/unsubscribe | `scope.ts:468–529`; T1/T2/T6/T9/T12 and SSR suite | PASS |
| §5.5 keep versus retarget | Unchanged `set(element,{})` marks options changed and replaces the track | FAIL J-016 |
| §5.6 handoff, crossfade and release hold | Ordinary T5 passes; removed-lead velocity and retargeted-pair fade state fail | FAIL J-017/J-020 |
| §6 ownership, authored changes and restoration | Ordinary T9 passes; radius acquired mid-run is unsaved; an inline authored change is discarded | FAIL J-021/J-022 |
| §7.1 run resolution and §9 unmount | Replacement resolves interrupted; unregister/unmount instead falsely reports ended | FAIL J-023 |
| §7.1 synchronous validation and throwing update | Validation paths inspected, motion unit suite green; T12 rethrow/capture-discard passes | PASS |
| §9 snaps and reduced motion | Ordinary snap reasons/jump/ignore pass; a mid-run maxDuration toggle leaves the old long track | FAIL J-019 |
| §9 finish/dispose/SSR and callback re-entrancy | T12, SSR; onSnap→dispose resolves disposed; onSnap→nested update interrupts outer and ends inner, both unsubscribe | PASS |
| §11/T4.4 cost, existing S4 configuration | 1,000 participants/300 movers and 300 nested steady movers pass in all three browsers | PASS |

Source paths abbreviated as `scope.ts`, `plan.ts`, etc. below are under `packages/layout/src/`; browser case line references are `tests/browser/cases/layout.ts`.

| CP3 defect | Independent reproduction against the new modules | Decision |
| --- | --- | --- |
| J-009 | Actual planner order `[follow,track]`; t=.5 gives both `(x,w)=(105,240)`, both `(vx,vw)=(190,320)`. Both root orders pass; nested follower/lead comparison at 0/.1/.5/.9/1 has maximum box/velocity difference 0. `solve.test.ts:637–664`. | RESOLVED |
| J-010 | Root anchor ignored: track, x(.5)=50. Stationary parent/changed offset: `[none,track]`. Running unchanged/changed offset target: `keep`/`track`. `plan.test.ts:467–537`. | RESOLVED |
| J-011 | Original x=50, v=100 retarget to x=200 and width 40: new x=50, analytic v=100; forward velocities at h=1e-5/1e-6/1e-7 are 100.001000/100.000100/100.000010. `plan.test.ts:540–567`. | RESOLVED |
| J-012 | Existing card becomes lead 0: actions `[track(fadeLead=true),follow(start=true)]`, new B `(x,w)=(200,300)`. `plan.test.ts:570–607`. | RESOLVED |
| J-013 | Original visible parent/offscreen child/maxNodes=1: status run, `[track,static]`, snapped `[1:culled]`. `plan.test.ts:610–626`. | RESOLVED |
| J-014 | Original vertical bezier has slope0=Infinity and synchronously throws ANI_INVALID_OPTIONS. Accepted easeOut seeded v=100: shrinking-step forward velocities 99.697449/99.901526/99.968580/99.990036 converge to 100. `motion.ts:237–265`. | RESOLVED |
| J-015 | B=10, A=.5, incoming size velocity -100: endpoints 10/.5, midpoint .5, minimum .5 over 1,001 samples. This now satisfies amended §5.1/K15; the original one-pixel-only wording is not imposed. `solve.test.ts:667–687`. | RESOLVED |

## Defects

All numeric engine cases below use the frozen production source in Chromium, the real Core manual clock, linear timing and duration 1 second unless stated otherwise. Microtasks were drained before reading promise results. They ran through remote stdin Node/esbuild (`write:false`) and Playwright; no test/source files were edited.

| ID | Severity | Authority source | Finding and concrete evidence |
| --- | --- | --- | --- |
| J-016 | S0 | Architecture §3.3/§5.5 (`:117–118,278–280`); T4.1/T4.3 | `scope.ts:1315–1321` unconditionally sets `changed=true`; `plan.ts:383–390` consequently cannot keep an unchanged track. Move x:0→200, advance .2 s, capture, `set(e,{})`, flush: original run becomes `interrupted`. Two further 20 ms frames give x=43.968323 instead of the unchanged trajectory's 48. T13 (`:1143–1145`) never calls set and misses this adapter-facing path. |
| J-017 | S0 | Architecture §5.6 (`:292–297`); T4.1/T4.3 | A same-lead retarget clears its active fade (`scope.ts:1114–1121`) without restoring/updating its opacity, while its follower keeps the old fade (`:1126–1127`; `plan.ts:370–376`). Crossfade x:0→200, width 80→400; at .5 s both opacities=.5. Retarget lead to x=400. After another .22 s, follower/lead opacity=`.28/.5` (sum .78). At the original fade's end they become `0/.5`; presence releases while the lead remains half-transparent until its replacement track settles. |
| J-018 | S1 | Architecture §4.2/§4.3 (`:167–172,195–196`), K12; T4.1/T4.3 | Cleanup bypasses the write phase: `settle` immediately restores (`scope.ts:432–439`). With two moving nodes, disconnect one and retarget the other: flush instrumentation outputs `[write,write,rect,style,write]` because `:710–712` settles before reads. An independent clock phase marker also records the normal end-of-track removal of translate and scale with `phase:"update"`, via `:525–526`, rather than commit. |
| J-019 | S0 | Architecture §9 (`:463,471–472`); T4.1/T4.3 reduced-motion toggle | `motionOf` recomputes the clamp (`scope.ts:690–701`), but existing tracks are kept without applying it (`plan.ts:383–390`). Group policy `{maxDuration:.1}`; x:0→200/D=1; toggle reduced motion at .2 s, then capture/flush with unchanged target. After another .22 s output is `result:null, x:84, subscribers:1, tracks:1`: the original one-second track continues beyond the new bound. T11 tests clamp only when enabled before starting. |
| J-020 | S0 | Architecture §5.6 (`:286–290`); T4.1 shared registry/handoff | Removed-lead retention stores only a box (`scope.ts:327–330,1295–1303`); `IdHistory` also has no velocity, so `plan.ts:237–240` supplies none. Departing x:0→200 at .2 s has x=40 and v=200. Remove it and immediately add the same id at x=400: handoff position is 40, but next 20 ms position is 47.200012 (360 px/s); the mandated seeded path would be 44.12672 (initial derivative 200). This is a shell/history defect beyond J-012's corrected live-handoff case. |
| J-021 | S0 | Architecture §3.3/§5.7/§6 (`:112–113,303–307,317`); T4.1/T4.3 restore | Radius is saved only when creating a drive (`scope.ts:1047–1058`), not when an existing drive acquires it (`:1028–1045`). Start x:0→200, width 40→80 with `border-radius:8px`, radius disabled. At .2 s set `{radius:true}` and flush; later call finish. Output: `before:"8px", during:"11.6941px / 8px", after:"11.6941px / 8px"`; the correction remains inline with `!important`. |
| J-022 | S0 | Architecture §3.1/§6 (`:91–92,313`), accepted risk `:527`; T4.1/T4.3 ownership | An inline authored change during the run is lost, rather than applied after settle. `scope.ts:637–642` retains old authored values; `:439` restores the original snapshot unconditionally. Start with translate 4px, move left 0→200; at .2 s author `translate:20px 0px`, capture/flush, finish. Output is `translate:"4px", x:204`; required settled author value is 20px, x=220. |
| J-023 | S1 | Architecture §9 (`:465`), §3.3 final subscription invariant; T4.1/T4.3 lifecycle | Unregister/unmount uses `finishRunNode` (`scope.ts:1305–1310`), whose only result is ended (`:421–427`), not cancellation/disposed. Remove the sole moving participant and its DOM element: output `report:{status:"ended",snapped:[]}, subscribersImmediately:1, pending:1, stats.tracks:1`. Subscription disappears only after another clock frame. The participant did not finish its track. |
| J-024 | S2 | Requested Biome re-check; `cp4_engine.md:24` zero-error claim | `npx biome check packages/layout tests/browser` exits 1: `Found 1 error. Found 7 warnings.` The error is the formatter at `tests/browser/cases/layout.ts:1024–1029`, which must be one line. The warnings are not treated as new completion defects. |
| J-025 | S0 | Architecture §3.1/§3.3/§4.2 (`:79–94,110–116,182–184`); T4.1/T4.3 | B for a driven node comes from the old frozen-map track (`scope.ts:742–752,840–845`), ignoring the permitted presence layer since that flush. Participant parent left=100, scale=.8, origin 0; child left:0→200, width40. At .2 s child is x=132,w=32. Change parent's presence transform to scale(1): actual B is x=140,w=40. Capture, change child target left to300, flush: immediate output jumps back to x=132,w=32. Final x=400,w=40 is correct; first-frame continuity is not. T7 (`:580–625`) changes the layer without any intervening flush and cannot detect this. |

## Defect Disposition

| ID | Essential defect / completion impact | Robust correction mandate | Re-judgment evidence |
| --- | --- | --- | --- |
| J-016 | Invocation of set is mistaken for changed options; unrelated adapter renders restart motion. | Compare effective options before invalidating a drive; retain genuine option-change retargeting. | Same and equivalent unchanged options preserve original run and every control-frame rect, including during delay. |
| J-017 | Geometry replacement abandons one half of an active fade pair. | Keep pair opacity/timeline/hold state coherent across same-lead retargets; acquire a new crossfade only on a qualifying handoff. | Both rects and complementary opacities every frame; no stuck opacity; release follows the actual fade; follower remains 0 until removal. |
| J-018 | Cleanup writes occur immediately inside bookkeeping/solve paths. | Stage restoration with the relevant write phase: after all flush reads and in clock commit for frame cleanup. | T8-style read/write log including disconnection, and a phase-marked settle/fade cleanup. |
| J-019 | A new reduced-motion mode changes prospective motion but not kept active tracks. | Apply the current clamp at the next flush to existing tracks, using motion.ts as the clamp authority. | Toggle with unchanged A, including delayed tracks; completion fits the bound and leaves no subscriber. |
| J-020 | Removed-node history discards incoming motion. | Retain and hand off the departing drawn velocity with its box; preserve expiry/no-handoff rules. | Original numeric case, shrinking-step incoming derivative, position/size channels, retain expiry. |
| J-021 | Newly acquired owned properties lack restoration snapshots. | Save corner declarations/priorities before their first layout write, including on existing drives. | Enable radius mid-run, then natural settle/finish/dispose restore exact declarations. |
| J-022 | Drive snapshots overwrite later authored intent. | Preserve the latest authored inline declarations for settle while keeping the run's frozen composition. | Inline translate/scale changes survive natural settle/finish/dispose; unchanged styles remain byte-identical. |
| J-023 | Unmount is treated as successful track completion and leaves stale scheduling state. | Resolve a cancelled run with the required cause; clean up empty drive scheduling and holds without cancelling untouched participants. | Sole-node and partial-run removals, disconnected-node flush, correct once-only reports/styles/holds/subscribers. |
| J-024 | Reported validation does not match the frozen file. | Format the identified call and correct the proof report after rerunning the exact command. | Biome exits 0; no unrelated lint cleanup required. |
| J-025 | A cached track box is mistaken for the current visual box after an inner-layer change. | Reconcile known B/velocity with the permitted changing presence layer when freezing the next flush, within the existing read-first/driven-capture contract. | Original x140/w40 preserved at new t=0; constant/changing ancestor and own transforms, retarget, identity settle, frame oracle. |

These are repair mandates, not implementation patches. Do not hide the cases through disabling animation, dropping the supported composition, restarting every fade, or weakening the authority/oracle.

## Independent Re-checks

All executable JS/tests/builds used only the specified Linux mirror. Command prefix:

```sh
ssh -o KexAlgorithms=curve25519-sha256 -o BatchMode=yes june-wsl \
  'source ~/ani-v2/env.sh; cd ~/ani-v2/lay-judge-cp4_engine && <command>'
```

WebKit additionally sourced `~/ani-v2/sysroot/webkit-env.sh` after env.sh.

| Check | Command or method | Result / evidence |
| --- | --- | --- |
| Mirror identity, before and after checks | SHA-256 over ordered path/content pairs of all 558 Git-tracked files | Local and remote both `a8beef7a5790dd6f5ff911b7acbb0ceed2a0ca4b9bc8e052c3feab8331ad8686` |
| Unit suites | `pnpm vitest run layout/src/__tests__` | Exit 0: `Test Files 8 passed (8)`, `Tests 115 passed (115)` |
| Layout typecheck | `pnpm --filter @freestylejs/ani-core build` then `pnpm --filter @freestylejs/ani-layout ts:typecheck` | Both exit 0 |
| Chromium | `pnpm test:browser --browser chromium --case 'layout:*'` | Exit 0: `15 passed, 0 failed, 0 known failures (3.8 s)` |
| WebKit | `pnpm test:browser --browser webkit --case 'layout:*'` | Exit 0: `15 passed, 0 failed, 0 known failures (6.5 s)` |
| Firefox | `pnpm test:browser --browser firefox --case 'layout:T*'` | Exit 0: `13 passed, 0 failed, 0 known failures (5.0 s)` |
| Firefox cost | `pnpm test:browser --browser firefox --case 'layout:COST'` | Exit 0: `1 passed, 0 failed (3.5 s)` |
| Cost outputs, Chromium / Firefox / WebKit | Existing COST; same 1,000-participant/300-mover setup as CP2 `cp2_spikes.md:92–96` and `spike.ts:346–350` | Commit reads `2.70 / 3.00 / 3.00 ms`; 300 nested movers frame p95 `.615 / .950 / .950 ms`. All pass. All-1,000-mover reads were `3.60 / 6.00 / 6.00 ms`; this additional maxNodes=5000 configuration is not the established S4 gate. |
| Biome | `npx biome check packages/layout tests/browser`; follow-up `--diagnostic-level=warn --max-diagnostics=30` | Both exit 1; one formatter error, seven warnings; J-024 |
| Other package/browser typing | `pnpm -r --filter '!@freestylejs/ani-react' ts:typecheck`; `npx tsc --noEmit --skipLibCheck -p tests/browser/tsconfig.json` | Core/codemod/layout/Solid/Svelte/Vue pass. Initial web errors from missing ordinary React build artifacts were removed by building its main entry only. Web then reports only missing `@freestylejs/ani-react/layout`; browser tsc reports that deferred module and its deleted CPC-harness import in `react_layout.ts:7,11`. These are declared adapter dependencies, not new CP4 engine errors; this report does not claim a green full-workspace typecheck. |
| CP3 numeric re-trial | Remote `node --input-type=module`, esbuild `write:false`, frozen pure modules imported from memory | J-009–J-015 outputs reproduced in the matrix above |
| Engine counterexamples | Remote stdin Node, in-memory esbuild browser bundle, Playwright Chromium/manual clock | Exact setups/results in J-016–J-025; no file-based diagnostic harness |
| Re-entrancy controls | onSnap→dispose; onSnap→nested update, then finish | `{outer:"disposed",size:0}`; `{outer:"interrupted",inner:"ended",size:0}` |
| Integrity/deletions | `git diff --check 6485ad8..5c9f57c`, diff/import/export inspection, final tracked-source hashes | Clean diff check; old engine/projection/CPC harness removed; no implementation mutations |

The existing oracle imports no solver/geometry/planner/motion implementation (`__tests__/oracle.ts:1–6`). T1/T2/T4–T7/T9/T13 compare applicable motion at every manual-clock frame. Those successful trajectories are valid evidence, but their fixtures omit the reproduced lifecycle/composition paths. Passing 15 existing cases therefore does not establish all of T4.3/V4.

## Remediation Order

1. Repair visual-state carry: J-025 and J-020; preserve the CP3 full-map/identity and momentum results.
2. Repair effective-option/reduced-motion decisions: J-016 and J-019; keep unchanged control trajectories.
3. Repair pair/teardown/write-phase lifecycle: J-017, J-018, J-023; retain coherent run resolution and presence holds.
4. Repair dynamic ownership/restoration: J-021 and J-022.
5. Correct J-024 and update the existing CP4 proof report; rerun the existing suites and required browser/type/Biome checks.

## Fix Proof Report Requirements

Submit the proof in `.trace/ani_layout_final/cp4_engine.md` or the conversation: changed files, rationale per defect, exact commands/results, before/after numeric outputs, T4.1–T4.4/V4 and architecture mapping, and residual risks. Extend existing unit/browser tests; no new harness, evidence directory or additional report-file system is required. Retain the seven resolved CP3 regressions. Distinguish deferred adapter diagnostics from an actually green command.

## Re-Judgment Entry Criteria

- Inspectable frozen corrections and proof for J-016–J-025.
- Existing tests reproduce the cases above and pass after correction; every affected visual/opacity trajectory is compared per frame with an independent expectation in Chromium, Firefox and WebKit.
- Unit suites, layout typecheck and exact requested Biome command pass; existing COST remains within its established bounds. Report remaining deferred React diagnostics explicitly.
- Incorrect B/velocity, an unchanged-options restart, unmatched fade weights/hold, ignored clamp, lost authored declarations, wrong unmount report, or writes in the prohibited phase remains FAIL. Merely repeating 115/115 and the unchanged browser cases is insufficient.
- Missing corrected outputs, required proof or mirror access produces BLOCK. No React adapter, E1–E5 or WAAPI implementation is required for this re-trial.

## Final Ruling

CP4 is rejected. All seven carried CP3 numeric defects close under the amended authority, and the ordinary browser trajectories and established cost gates reproduce. Independent engine counterexamples violate visual continuity, shared motion, ownership, lifecycle and phase contracts; the frozen Biome claim also fails. Corrective work and re-judgment are required.

## Fix directive for the implementer

- **J-016:** In `packages/layout/src/scope.ts`, make add/set invalidate only changed effective options. Extend `tests/browser/cases/layout.ts` T13 with unchanged set calls, equivalent option objects and delay-time calls; prove identical control trajectory and no interrupted report.
- **J-017:** In `packages/layout/src/scope.ts` and, if needed, `packages/layout/src/plan.ts`, preserve coherent active pair fade/hold state across geometry retargets. Extend `tests/browser/cases/layout.ts` T5 with the .5 s retarget; prove opacity sum 1, correct release and no stuck lead opacity/follower pop.
- **J-018:** In `packages/layout/src/scope.ts`, defer settle/opacity restoration to the proper write phase, including disconnected-node flush cleanup. Extend `tests/browser/cases/layout.ts` T8 with the logged disconnection and phase-marked terminal frame; prove all flush reads precede writes and frame restoration occurs in commit.
- **J-019:** In `packages/layout/src/scope.ts` / `packages/layout/src/plan.ts`, apply a changed reduced-motion mode to active tracks using `packages/layout/src/motion.ts` clamping. Extend `tests/browser/cases/layout.ts` T11 with mid-run maxDuration activation and unchanged A, including delay; prove bounded completion/restoration/unsubscribe.
- **J-020:** In `packages/layout/src/scope.ts` and `packages/layout/src/plan.ts`, retain and pass removed-lead drawn velocity with its box. Extend `packages/layout/src/__tests__/plan.test.ts` and `tests/browser/cases/layout.ts` handoff coverage with the x40/v200→x400 case, shrinking-step derivative and retention expiry.
- **J-021:** In `packages/layout/src/scope.ts`, save radius declarations/priorities when an existing drive first acquires radius ownership. Extend `tests/browser/cases/layout.ts` T9 to enable radius mid-run and prove exact restore on settle, finish and dispose.
- **J-022:** In `packages/layout/src/scope.ts` and `packages/layout/src/dom.ts` as needed, preserve newly authored inline translate/scale intent for settle while maintaining frozen run composition. Extend `tests/browser/cases/layout.ts` T9 with the 4px→20px case and scale changes, checking settle/finish/dispose and unchanged-style byte equality.
- **J-023:** In `packages/layout/src/scope.ts`, distinguish cancellation/unmount from successful completion and clean up empty scheduling/hold state. Extend `tests/browser/cases/layout.ts` T12 with sole/partial-run removal and disconnected-node flush; prove required once-only status and untouched-track survival.
- **J-024:** Format `tests/browser/cases/layout.ts:1024–1029`; rerun `npx biome check packages/layout tests/browser` and correct `.trace/ani_layout_final/cp4_engine.md`'s validation claim.
- **J-025:** In `packages/layout/src/scope.ts`, reconcile driven B/velocity with changed presence inner maps at the next flush without adding driven capture reads or pre-read writes. Extend `tests/browser/cases/layout.ts` T7 with changing own/ancestor presence transforms plus intervening flush/retarget; prove x140/w40 at replacement t=0, frame continuity and identity settle.
