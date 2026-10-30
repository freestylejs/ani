# Final Chief Justice re-ratification: P4 `p4_drive` / J-001

## Verdict, route and finality

- **Final P4 J-001 ratification: PASS. P4 `p4_drive` is final TRIBUNAL PASS.**
- **J-P4R-001 is closed.** The previously missing mandatory unit state-machine regression now covers all four required transitions and passes independent execution. No remaining S0/S1/S2 defect was found within this re-ratification.
- **J-P5-001 is closed as the missing-final-P4 prerequisite, subject to P5 re-judgment. P5 may now be re-judged.** This is not itself a P5 PASS, certification or release authorization.
- Judge route: **`openai/gpt-6.1-sol#high`**, the owner-authorized superseding final Chief Justice route in `reviews/chief_justice_route_supersession_20261030.md`; date: 2026-10-30. This is a final ruling, not an acting verdict or impersonation of the unavailable historical route.
- Worktree: `/Users/june/Documents/project/freestylejs/ani-trial-p4-final2`, detached at **`2f39dd4c09b70d52c389b2a911d48a3ad1f00257`**. Initial and pre-report working trees were clean.
- Remediation: **`8cf346b62d6485b67c2f01633c7a3a0fce07fea3`**, `test(layout): cover released and cancelled landing invalidation`.

This report supersedes the *verdict* of `p4_drive_ratification_result.md` after its single remaining finding was repaired; it does not overwrite or erase that FAIL. The owner ruling changes the final judge route, not the evidence standard. Unprefixed trace paths below are relative to `.trace/ani_ios_production/`.

## Authority and scope

Read and reconciled: the owner route supersession; original `p4_drive_trial_result.md` (including Remediation Order item 3); acting `p4_drive_rejudgment_result.md`; prior final `p4_drive_ratification_result.md`; `p4_drive_plan.md` D1-D10; `p4_authority_clarifications.md` C1-C11; Architecture §5.10, §7.2 and §9.2; and `p5_bench_trial_result.md` A03/J-P5-001 and re-entry conditions.

The prior final ratification already accepted the technical J-001 repair and the remaining P4 requirements, but rejected the absent unit regression. This is the ordered, narrow re-ratification of that omission with fresh unit and required-engine landing checks, direct source/browser inspection, historical raw-gate checks and product-identity checks. It is not a claim that every historical P4 gate or the P0–P6 program tribunal was rerun today.

## Four-case unit matrix

Test: `packages/layout/src/__tests__/drive.test.ts:366-434`, **`J-001: released/cancelled landings are invalidated by snap and abort`**. It is one Vitest test with nested parameter loops, not four separately counted Vitest tests.

| Landing | Cause | Live precondition | Required postconditions | Result |
|---|---|---|---|---|
| released | `setMode('snap')` | state `released`, holds = 1 | state `invalidated`; holds = 0; exact authored `cssText`; clock size = 0; `runtime-disabled` | PASS |
| cancelled | `setMode('snap')` | state `cancelled`, holds = 1 | same cleanup; `runtime-disabled` | PASS |
| released | injected write fault + frame | state `released`, holds = 1 | state `invalidated`; holds = 0; exact authored `cssText`; clock size = 0; `internal-error` | PASS |
| cancelled | injected write fault + frame | state `cancelled`, holds = 1 | same cleanup; `internal-error` | PASS |

**Non-vacuity:** each iteration creates its own actual layout group and manual clock, registers a connected node, captures/flushes, saves authored styles, takes and moves by `(40,20)`, advances 16 ms, releases with `(100,0)` or cancels, then advances another 16 ms under a 300 ms motion. Crucially, it asserts the requested landing state **and a live hold count of 1 before the cause**. Thus a landing that instantly completed or never existed cannot pass. Invalidation is asserted before harness disposal; snap is checked synchronously, while abort runs the real development fault seam through the next frame boundary.

Each iteration uses a fresh diagnostic listener/event array and group; the cause-specific diagnostic must be present. Faults, runtime mode, listener and group are cleaned up between iterations, with fault cleanup also added to `afterEach`. No drive method or runtime result is mocked. This is jsdom/manual-clock **unit execution of the source state machine**, not an invocation or relabelling of browser evidence. It complements the browser assertions for listener/marker cleanup and natural completion rather than replacing them.

## Judgment matrix

| Authority / requirement | Independently inspected evidence | Result |
|---|---|---|
| Owner final-route authorization | Exact owner-approved supersession and its bounded finality | PASS |
| Original Remediation Order item 3 / J-P4R-001 | Four-case unit matrix above; fresh execution of the complete drive unit file | PASS; closed |
| Original P4-21 / §7.2 / C3 | Shared `invalidateHold`, `finishAll('disabled')`, `snapToDisabled`; fresh released/cancelled snap checks in both engines and units | PASS |
| Original P4-24 / §9.2 / C3 | Write fault, actual frame boundary and abort cleanup; fresh released/cancelled abort checks in both engines and units | PASS |
| Original P4-31 / L-DRIVE-4 | Existing complete state-machine export unchanged; both engines pass | PASS |
| Preserve normal release/cancel completion | `finishHold` does not assign `invalidated`; L_DRIVE_4 retains and executes both natural-completion controls, zero holds and exact styles | PASS |
| No production/authority/gate/tolerance remediation | Commit diff: only 72 added lines in existing `drive.test.ts`; no other file in remediation commit | PASS |
| Other P4 requirements / C1-C11 | Prior final technical acceptance retained; all clarifications read; production/browser identity unchanged since that ratification | PASS, carried forward with prior bounds |
| P5 A03 / J-P5-001 prerequisite | Authorized final P4 PASS now present; product source unchanged and only unit-test delta since ea1475c | Prerequisite closed, subject to P5 re-judgment |

Direct source trace: `scope.ts:2125` invalidates every attached non-invalidated hold before detaching it; `finishHold` at 2674 preserves a naturally completed released/cancelled handle; `abort` at 7575 restores saved declarations, invalidates, disarms/stops and diagnoses `internal-error`; `finishAll` at 7827 invalidates disabled frame holds; `snapToDisabled` at 7909 recognizes live landings and emits `runtime-disabled`. No special test-only production branch was added by this remediation.

## Independent checks and raw results

### Fresh focused execution

The trial has no `node_modules`. Execution borrowed **tooling only** from `/Users/june/Documents/project/freestylejs/ani-ios-scope-correction/node_modules`; all product source and original test bodies came from this detached trial. No install, dependency link, generated project script or disk bundle was created. Exact inline `node --input-type=module -e` invocations and raw output are in this adjudication's tool transcript.

| Check | Exact selection / execution | Observed result |
|---|---|---|
| Unit, process **2764** | Vitest 4.1.2 `startVitest('test', ['layout/src/__tests__/drive.test.ts'], {root: trial+'/packages', config:false, watch:false, maxWorkers:1, fileParallelism:false, cache:false, reporters:['verbose']}, viteOverrides)` | **1 file, 17/17 tests PASS; exit 0**, including the new four-combination loop |
| Chromium, process **2763** | Unchanged `layout_drive:L_DRIVE_4` and `layout_drive:L_DRIVE_EDGES`; browser **140.0.7339.16** | **2/2 PASS**, problems `[]` for each |
| WebKit, same process | Same two unchanged exports; browser **26.0** | **2/2 PASS**, problems `[]` for each |

Unit raw output explicitly marks the J-001 test passing (30 ms). The only unit stderr entries are the existing deliberate invalidated/terminal stale-handle warnings in other tests. The four combinations run inside the new test; 17 is the file total, not a claim of 17 new regressions.

Browser raw results, **in each engine**, include:

- L_DRIVE_4: `unmount invalidated and stopped the read; drive-hold kill switch invalidated synchronously; released landing kill switch invalidated; cancelled landing kill switch invalidated`.
- L_DRIVE_EDGES: `take preconditions and non-finite input; descendant animated-owned probe; released abort invalidated the handle; cancelled abort invalidated the handle; retake write fault aborted cleanly; fault-related listener cleanup; refused size track snapped and kept the hold; animated-owned take/hold refusal`.
- Final browser output: **`TOTAL 4 FAILURES 0`**, exit 0. Page errors and console warning/errors were collected; none occurred.

**Bootstrap details/qualifications:** Vitest used fourth-argument Vite overrides: exact trial core/layout aliases and Vitest ESM alias; package-local `~/` resolution with actual file extensions; in-memory esbuild TS transformation; OXC/default esbuild disabled; Node bare-dependency fallback for missing tooling. Browser bundling used `write:false`, ESM/browser conditions, development define, trial-source aliases and sibling nodePaths, preserving package-local tsconfig paths. Original exports were served entirely in memory at `http://ani.test`, each in a fresh context; two additional animation frames were awaited before collecting results, and all contexts/browsers were closed. Four missing-installed-base-tsconfig bundle warnings were identified explicitly; unexpected bundle warnings were rejected. No test body/assertion was changed.

An initial inline unit command had a regex parsing error (exit 1), and process 2762 failed before executing tests because the first custom alias resolver returned an extensionless path (`/core/src/error`). These are recorded bootstrap failures, **not passing gates or product failures**. Correcting only the in-memory resolver produced process 2764 above. No full-suite/typecheck/format rerun or new red/mutation run is claimed.

### Diffs, identity and preservation

- `git show --stat --oneline 8cf346b` and its full test diff; `git diff --numstat 8cf346b^ 8cf346b`: **one file, 72 insertions, zero deletions**, `packages/layout/src/__tests__/drive.test.ts`. This includes the fault import, cleanup and new unit test; **no production source changed**.
- `git diff --name-status 7ccd83c..HEAD`: only that test modification plus the already-committed prior P4 FAIL report and P5 BLOCK report. The documentation additions in 2f39dd4 are distinct from remediation commit 8cf346b.
- `git diff --exit-code 7ccd83c..HEAD -- packages ':!packages/layout/src/__tests__/drive.test.ts' tests bench`: **exit 0**. Product, existing browser rows and bench are unchanged since the prior final ratification baseline.
- `git diff --exit-code ea1475c..HEAD -- packages ':!packages/layout/src/__tests__/drive.test.ts' tests`: **exit 0**. Thus the P5 product/browser identity bridge is not disturbed by the test addition.
- `git diff --exit-code 7ccd83c..HEAD -- bench .trace/ani_ios_production/00_plan.md .trace/ani_ios_production/p4_drive_plan.md .trace/ani_ios_production/p4_authority_clarifications.md .trace/ani_ios_production/logs .trace/ani_ios_production/reviews`: **exit 0**.
- A broader initial ea1475c comparison including all `bench/` returned exit 1 because later iteration documentation and retained raw evidence exist. The actual name inventory is `ITERATIONS.md` and iteration-12 JSON/log artifacts, **not bench code**; these pre-existing evidence additions are not misrepresented as an empty all-files diff.
- Pre-report `git status --short --branch`: detached HEAD with no changes; unstaged and staged diffs empty. Only this new report is authorized to be written; no commit is made.

SHA-256 identity before writing:

| Artifact | SHA-256 |
|---|---|
| Prior FAIL `p4_drive_ratification_result.md` | `d140ac5df936305f5171d7f8db9e5ca8862d6f71eccd822decbf2a17e59b6cc9` |
| Unit `packages/layout/src/__tests__/drive.test.ts` | `b29aac51c5f86a209b3e6fe90d7f197f0b4ade7af8cdfcfa2774c8e1e2ac437c` |
| Browser `tests/browser/cases/layout_drive.ts` | `b9647d2b92948096181adc067de474d1fa204b625a788f2110e79affd787b6ab` |

### Historical repair evidence, not fresh full gates

Directly checked `logs/j001/red.md`, `unit.log` and raw typecheck/Biome/browser result lines: **153 unit files / 1,892 tests; 11/11 typecheck tasks; Biome 450 files, no fixes, 10 warnings; Chromium 223 passed / 0 failed / 0 known failures / 0 skipped; WebKit 221 passed / 0 failed / 0 known failures / 2 skips**. Both raw engine logs include the released/cancelled snap and abort details. Red evidence records released-state failures and the common cancelled path; it is not claimed to be a newly executed four-case unit red run. These historical records remain preserved and are not relabelled as current-revision full-gate results. The remediation commit's claim of 1,929 full unit passes was not independently rerun or used in place of the fresh focused result.

## Residual risks and limits

- This closes the specifically prescribed unit-coverage omission, not a new production repair. No required unit combination is absent or vacuous. Browser controls separately retain natural completion, listener disarming and marker cleanup in both engines.
- Prior accepted P4 bounds remain: scope-local nested holds; nearest-animating-ancestor velocity rather than unrestricted composed derivatives; box-preserving rotation/zoom support-classification risk; compositor scrolling may trail a frame; historical branch-coverage margin is narrow; Firefox advisory.
- No new full monorepo gate, deciding cost run, full bench, iOS-device/Mobile Safari certification, P5 acceptance, P6 judgment or release approval is inferred. The P5 tribunal's separately accepted evidence bridge and its retained negative performance experiments are unchanged.

## Final ruling and P5 handoff

**J-P4R-001: CLOSED. Final P4 J-001 ratification: PASS. P4 `p4_drive`: final TRIBUNAL PASS.** The previously accepted technical repair now also satisfies original Remediation Order item 3 with actual independent unit execution, while required browser regressions still pass and the remediation changes no production source.

**J-P5-001 is closed as the final-P4 prerequisite, subject to P5 re-judgment. P5 A03 may now be re-judged using this final ruling and the stated product/test/evidence identity.** This report does not silently rewrite the existing P5 BLOCK report or promote P5 to PASS; its judge must issue that checkpoint's updated verdict. No further P4 remediation or fresh full bench is mandated by this ruling.
