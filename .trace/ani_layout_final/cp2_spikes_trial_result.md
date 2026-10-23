# Tribunal Report: CP2 — P0 spikes and CP1 re-judgment

## Verdict

TRIBUNAL FAIL

- Target: `plan.md:76–95` (T2.1–T2.4/V2), §6 gate, and CP1 J-001–J-007.
- Frozen HEAD: `a920df7`; reviewed `git diff 81d8e57..a920df7`, including `5828d95`.
- Date: 2026-10-23, independent checks completed at approximately 08:57 UTC.
- Two S1 defects: carried J-001 and new J-008. J-002–J-007 are resolved.
- Unmodified spike commands pass 57/57; their passing output does not close the uncovered S1 validation requirement.

## Authority Coverage

| File | Role / included reason | Coverage result |
| --- | --- | --- |
| `packages/layout/ARCHITECTURE.md` | Single architecture authority; complete document inspected | FAIL: constant-inner-map equivalence, J-001 |
| `.trace/ani_layout_final/plan.md` | CP2 tasks, V2 and §6; CP1 repair mappings | T2.2–T2.4 pass; T2.1/V2/gate proof incomplete, J-008 |
| `.trace/ani_layout_final/00_documentation_drift.md` | K1–K13 and drift dispositions | K1 fails; other carried corrections accepted |
| `.trace/ani_layout_final/source_decision.md` | Complete approved source, with both supplied answers | Reconciled; unchanged from `81d8e57`; defaults and timing rejection remain correct |
| `.trace/ani_layout_final/cp1_authority.md:30` | Implementer's fix proof report | Each J-001–J-007 re-judged below |
| `.trace/ani_layout_final/cp2_spikes.md` | Implementer's CP2 claims | Numeric results reproduced; S1 completeness/permission to start CP3 not sustained |
| Prior `cp1_authority_trial_result.md` | Original dispositions and re-entry criteria | Read from `/Users/june/Documents/project/freestylejs/ani-judge-cp1_authority/.trace/ani_layout_final/cp1_authority_trial_result.md`; absent from this worktree and its Git history |
| Spike files, `tests/browser/{bundle,run}.ts`, root manifest/lockfile | Actual outputs and runner/dependency changes | Inspected; browser versions/compiler variants exercised |
| `/Users/june/.claude/skills/judging-checkpoint-completion/SKILL.md` | Requested judicial method | Followed; no implementation, new harness/evidence files, commits or pushes |

CP1's retired-authority deletions remain intact. No production source changes occur in the diff under trial. Later engine, adapter and acceptance work is not judged.

## Judgment Matrix Summary

| Requirement group | Rows checked | PASS | FAIL | BLOCK |
| --- | ---: | ---: | ---: | ---: |
| CP1 carried defects | 7 | 6 | 1 | 0 |
| CP2 T2.1–T2.4 | 4 | 3 | 1 | 0 |
| V2 and applied checkpoint gate | 2 | 0 | 2 | 0 |
| Build variants, existing modules, Biome | 3 | 3 | 0 | 0 |

| CP1 defect | Decision | Evidence / reason |
| --- | --- | --- |
| J-001 | **NOT RESOLVED** | `ARCHITECTURE.md:77–93,457–461`; drift K1 `:80`; proof report `cp1_authority.md:40`. The affine identity is valid for one fixed external map, but not for inner maps interleaved with independent parent/child poses. Visual counterexample below. |
| J-002 | **RESOLVED** | `ARCHITECTURE.md:74–76,157–165`; K12 `:91`; proof report `:41`. Read rects with the last written poses applied, divide them out, plan, then write. The running-retarget walkthrough removes restore→read→write. This accepts the specified transaction, not future engine implementation. |
| J-003 | **RESOLVED** | `ARCHITECTURE.md:132–149,167–177`; K2 `:81`; proof report `:42`. Task expiry/refresh, consumption and coalescing now have explicit rules; the abandoned-capture trace refreshes B to 100. All twelve transition build/browser combinations report zero violations, 20 pending-capture interleavings, and sensitive controls (81–90 violations, 37.3 px). J-008 separately concerns Suspense validation coverage. |
| J-004 | **RESOLVED** | `ARCHITECTURE.md:201–216`; K8 `:87`; `plan.md:101–107`. Unclamped coefficient preserves the derivative; moving retargets ignore delay. Independent arithmetic: `k=1249.000000; derivative=3571.428571; incoming=3571.428571`. The size-floor exception is explicit and bounded in scope; future V3 must check it. |
| J-005 | **RESOLVED** | `plan.md:58,91–95,122,181`; K11 `:90`. All four spikes precede production, failures require applied fallback plus successful re-validation, and CP4 retains the engine cost check. J-008 concerns application of this repaired gate. |
| J-006 | **RESOLVED** | `plan.md:135–147`. Package-source/test cleanup belongs to V5; documentation rewrites and final repository cleanup belong to T6.4/V6. |
| J-007 | **RESOLVED** | `ARCHITECTURE.md:373–375`; K13 `:92`; `plan.md:126–132`. Implicit roots partition by `(clock, ownerDocument)` with independent empty-scope disposal, mapped to adapter validation. |

| CP2 / integration row | Result | Evidence |
| --- | --- | --- |
| T2.1: valid capture across required scenarios/builds | FAIL, J-008 | Required independent fallback-resolution comparison is bypassed; see reproduction below. Ordinary runs and transition controls pass. |
| T2.2: microtask flush, block, first frame ≤6%, control | PASS | `spike.ts:39–129`; all three first-frame readings 0%, controls 26.27% / 0% / 30%. Firefox's insensitive control is disclosed; the plan requires a control, not failure of that control in every engine. |
| T2.3: inner-map measurement within 0.5 px | PASS | `spike.ts:179–301`; actual transformed rects compared with transforms-removed truth, including scaled toast child and three-level chain. Errors 0.0001 / 0.0093 / 0.0297 px. This is measurement evidence, not a proof of J-001's projection claim. |
| T2.4: 1,000-participant reads / 300 nested-mover frame cost | PASS | `spike.ts:312–497`; 2.20 / 2.00 / 2.00 ms reads, p95 0.70 / 2.00 / 1.00 ms. Forced layout reported separately (0.70 / 1.00 / 2.00 ms); adding it still gives ≤4 ms at reported resolution. |
| V2: numbers and complete spike proof | FAIL, J-008 | Numbers exist and reproduce, but `cp2_spikes.md:32,37,103–104` claims completion without an independently checked reveal commit. |
| §6 gate applied to CP2 | FAIL, J-008 | Gate wording is repaired; “CP3 may start” is premature while a required S1 path remains unchecked. No capture-algorithm stop-condition failure has yet been demonstrated; repair its measurement first. |
| React 18/19 × plain/compiler variants | PASS | `bundle.ts:38–96`, `run.ts:35–44`; output verifies versions 18.3.1/19.2.1 and compiled flags in all three browsers. |
| Existing browser modules after dependency/runner changes | PASS | Chromium React 7/7; Core/Vue/Solid/Svelte 21/21. Existing assertions unchanged. |
| Biome, no errors | PASS | `pnpm biome check tests/browser package.json`: exit 0, 31 files, no fixes, 2 warnings and 261 infos; no errors. |

Firefox/WebKit use 1 ms timestamps. The measured Firefox p95 equals the inclusive 2 ms limit; it is not a demonstrated budget miss. No finer precision, new benchmark harness, or early production-engine test is demanded. CP4's existing T4.4 remains required.

## Defects

| ID | Severity | Authority source / finding | Required correction |
| --- | --- | --- | --- |
| J-001 | S1 | Source `:90–109,132,276`; authority `:77–93,457–461`: pose-only projection does not give the claimed visual track with a constant ancestor scale and different timelines. | Correct the projection/coordinate contract and K1 proof while preserving visual endpoints and identity settle; reconcile the numeric example below. |
| J-008 | S1 | `plan.md:77–84`, source P0 S1 `:363`; `spike_s1_fixture.ts:44–54,117–129`, `spike_proto.ts:90–109`: the only snapshot probe is outside Suspense, and a flush with no probe returns before validation. | Observe and compare the independent fallback→resolved-content commit; distinguish real commits from StrictMode effect replay and initial/unmount no-ops. Missing truth must not silently certify a required update. |

### J-001: visual-coordinate counterexample

The implementer's correction of the original width example is accepted: a 125 px layout width under scale .8 is a 100 px visual width. That original example is not relied upon here.

Use a parent with `position:absolute; left:0; width:200px; transform:scaleX(.8); transform-origin:0 0`, containing an absolute child at `left:50px; width:100px; transform-origin:0 0`. Body margin and scroll are zero. Commit the parent's CSS left to 100 px. The parent moves on its own timeline; the child's timeline is delayed. Sizes do not change, and presence scale .8 remains constant throughout.

Independent Chromium DOM evaluation (remote stdin Node/Playwright; no file changes) reports:

| State | Parent visual `(x,width)` | Child visual `(x,width)` |
| --- | --- | --- |
| Before commit, B | `(0,160)` | `(40,80)` |
| New real layout, A | `(100,160)` | `(140,80)` |
| Documented t=0 poses | `(0,160)` | `(40,80)` |
| Parent halfway, child still delayed | `(50,160)` | **`(50,80)`** |
| Identity settle | `(100,160)` | `(140,80)` |

Dividing presence out gives child layout B `(50,100)` and A `(150,100)`; this example therefore uses the actual measurement convention. With zero origins, §5.3 gives parent translation −50 and child translation `50−150−(−50)=−50`. The browser draws the child at `50 + .8·(50−50) = 50`. Its own visual track must still hold visual B **x=40** during the delay: **10 px error**.

More generally, for parent displacement p and child's own displacement c, the documented poses produce `x_visual = 40 + .2p + .8c`, whereas its visual track is `40+c`. Affine interpolation commutes with a fixed map applied to the entire track; it does not commute that map through independently changing poses. The proof's stationary-parent example misses this interaction.

The separate time-varying-presence argument identifies a real difficulty: freezing an obsolete inner map or reading it from the DOM every frame can violate the stated constraints. Defining that motion as a visual layer addresses that case explicitly; it does not prove equivalence for the constant-scale case above. This rejection requires neither time-varying presence nor a per-frame read. For example, at the disputed frame a child translation −62.5 would draw x=40, and the correct final translation is still zero; identity settle itself does not forbid constant-map compensation.

### J-008: independently resolved Suspense commit is unobserved

`Detail` reads the resource and touches capture inside Suspense (`spike_s1_fixture.ts:88–91`), but `Probe` is its sibling outside the boundary (`:117,126–129`). A retry confined to that boundary cannot update this probe. `flush()` then executes `if (expected === null) return` before checking a missing capture or comparing B (`spike_proto.ts:99–109`).

Independent remote in-memory bundle check used the existing `S1_suspense` scenario, one round instead of six, and 450 ms instead of its 120 ms waits so the fallback can reveal before the next state update. Diagnostic calls recorded `touch`/`probe` and React's actual `onCommitFiberRoot` events; repository files were untouched. Output:

```text
fallback commit: touches=18, probes=1, loading=true
independent reveal commit: touches=2, probes=0, loading=false
case still passes: flushes 12, compared 36, violations 0, missing 0
```

Mount/unmount events were excluded from this comparison. Separate unmodified instrumentation showed that empty StrictMode replay flushes also occur; those are not counted as failing commits. The finding is the actual reveal commit above. It establishes a hole in the required independent validation, not a proven incorrect capture algorithm. An ignored reveal cannot establish “zero flushes using a B other than the probe's.”

## Defect Disposition

| ID | Essential defect / impact | Robust correction mandate | Re-judgment evidence |
| --- | --- | --- | --- |
| J-001 | Local-space exactness is incorrectly asserted to imply visual exactness across independent nested timelines; affects the future solver/oracle contract. | Correct §§3.1/5.3/11 and K1 consistently. Preserve the visual delayed-child track, correct endpoints and identity restoration, or provide an explicit approved amendment. Do not erase the error by stripping inner maps from the visual oracle. | Revised authority and CP1 proof addressing the browser numbers and interleaved maps; existing T4.3 must retain constant and animating ancestor-presence coverage. No production implementation is required for this documentary re-entry. |
| J-008 | A required Suspense update can pass without independent before-mutation truth; S1/V2 cannot certify all required paths. | Extend the existing probe/scenario to cover independent fallback resolution, make unchecked relevant updates fail, and retain transition-control sensitivity. Do not merely count every effect replay as a commit or delete the Suspense assertion. | Updated existing spike files/report; reveal commit compared against its true pre-mutation boxes, with zero wrong/missing captures across 18/19 × plain/compiler × three browsers. |

## Independent Re-checks

All Node/pnpm/browser execution used only the specified Linux mirror through:

```sh
ssh -o KexAlgorithms=curve25519-sha256 -o BatchMode=yes june-wsl \
  'source ~/ani-v2/env.sh; cd ~/ani-v2/lay-judge-cp2_spikes && <command>'
```

WebKit additionally sourced `~/ani-v2/sysroot/webkit-env.sh` after `env.sh`.

| Check | Command / method | Actual output |
| --- | --- | --- |
| Mirror identity | SHA-256 over paths and contents of all 550 Git-tracked files, local vs mirror | Both `d81612d47c2ec6ac69ea1bee687cb56f2b286e97220b8c139ee02f89951d8049`; `MATCH: True`. Mirror has no `.git`; content comparison establishes identity. |
| Chromium spikes | `pnpm test:browser --browser chromium --case 'spike*:*'` | `19 passed, 0 failed, 0 known failures (69.7 s)` |
| Firefox main spikes | `pnpm test:browser --browser firefox --case 'spike:*'` | `7 passed, 0 failed, 0 known failures (23.1 s)` |
| WebKit main spikes | `pnpm test:browser --browser webkit --case 'spike:*'` | `7 passed, 0 failed, 0 known failures (20.9 s)` |
| Firefox other variants | `pnpm test:browser --browser firefox --case 'spike_*:*'` | `12 passed, 0 failed, 0 known failures (52.8 s)` |
| WebKit other variants | `pnpm test:browser --browser webkit --case 'spike_*:*'` | `12 passed, 0 failed, 0 known failures (51.4 s)` |
| Existing React | `pnpm test:browser --browser chromium --case 'react:*'` | `7 passed, 0 failed, 0 known failures (3.1 s)` |
| Other existing modules | `pnpm test:browser --browser chromium --case 'core:*' --case 'vue:*' --case 'solid:*' --case 'svelte:*'` | `21 passed, 0 failed, 0 known failures (11.4 s)` |
| Biome | `pnpm biome check tests/browser package.json` | Exit 0; `Checked 31 files in 21ms. No fixes applied. Found 2 warnings. Found 261 infos.` No errors. |
| CP1 reasoning | Full revised diff vs original trial criteria; affine browser evaluation and coefficient arithmetic | J-001 counterexample reproduced; J-002–J-007 resolved as mapped above |
| S1 completeness | Remote stdin Node, `bundleForBrowser`, in-memory scenario pacing and commit/probe diagnostics | Actual independent reveal has zero probes while case passes; J-008 |
| Scope/integrity | `git diff --check 81d8e57..a920df7`; tracked-path/deletion audit | Clean diff check; required deletions intact; source record unchanged; no production edits |

## Remediation Order

1. Repair J-001's authority/proof before treating the visual-equivalence contract as established. Keep the approved source verbatim.
2. Repair J-008 in the existing S1 fixture/prototype/scenario; independently observe fallback resolution and rerun the required build/browser matrix.
3. Correct `cp2_spikes.md`'s completion/gate statement from the resulting evidence. Until S1 is fully validated, V2 and §6 do not authorize CP3. If the corrected spike demonstrates a real stop-condition failure, apply its named fallback and successfully revalidate before proceeding; this tribunal does not order fallback merely because an observer was incomplete.

## Fix Proof Report Requirements

Update the existing `cp1_authority.md` / `cp2_spikes.md`, or submit in conversation: changed files, rationale per defect, exact verification methods/commands and results, T1.1/T1.3/V1 and T2.1/V2/§6 mapping, and residual risks. J-001 needs the affine/visual reconciliation; J-008 needs evidence that the reveal actually committed and its B was compared. No additional harness or standalone evidence file is required.

## Re-Judgment Entry Criteria

- Inspectable frozen revised diff and proof report for both J-001 and J-008.
- Internally consistent visual projection/oracle with the delayed-child numerical case resolved, including identity settle.
- Existing S1 tests cover independently resolved fallback content, detect missing relevant truth, preserve sensitive controls, and pass all four builds in all three browsers. Recheck runner/Biome if those files change.
- Repeating unmodified 57/57 output, an unprobed reveal, or redefining away the constant-scale visual error remains FAIL. Inaccessible revised outputs or required runs produce BLOCK.
- Future production-engine tests remain at their planned checkpoints.

## Final Ruling

The checkpoint is rejected for two S1 defects. Six CP1 defects are resolved; numerical S2/S3/S4 gates, all current spike commands, existing-module regression checks and Biome pass. The constant-map proof still contradicts observable geometry, and the required S1 Suspense validation has an unchecked commit path. Repair and re-judgment are required; production implementation was not judged.

## Fix directive for the implementer

- **J-001:** Correct `packages/layout/ARCHITECTURE.md` §§3.1/5.3/11, `.trace/ani_layout_final/00_documentation_drift.md` K1, and `.trace/ani_layout_final/cp1_authority.md:40`. Supply the exact visual reconciliation for parent B/A x=0/100, child B/A x=40/140 (width 80), constant ancestor scale .8, parent halfway and child delayed: required child x=40, currently x=50. Preserve identity settle. Keep the case within `.trace/ani_layout_final/plan.md` T4.3's existing ancestor-presence/mixed-timeline validation; do not demand early production code or weaken the oracle.
- **J-008:** In `tests/browser/cases/spike_s1_fixture.ts`, place/extend the snapshot observation so a Suspense-only reveal is probed. In `tests/browser/cases/spike_s1.ts`, wait for and verify an independent fallback→content commit before issuing the next unrelated update. In `tests/browser/cases/spike_proto.ts`, detect unchecked relevant update commits while excluding initial/unmount no-ops and StrictMode effect replay. Update `.trace/ani_layout_final/cp2_spikes.md` with the actual comparisons and all four build results in Chromium/Firefox/WebKit; only then reassert the V2/§6 gate.
