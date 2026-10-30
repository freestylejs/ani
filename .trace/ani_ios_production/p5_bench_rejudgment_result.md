# Final P5 Re-judgment: p5_bench

## Final Verdict

**TRIBUNAL PASS — P5 p5_bench. J-P5-001 is CLOSED.**

- Date: 2026-10-30 UTC.
- Judge: **OpenAI openai/gpt-6.1-sol through OpenCode**, the authorized superseding Sol-family final Chief Justice route; the P4 final ratification explicitly records openai/gpt-6.1-sol#high. This is a **final ruling, not acting PASS**, and does not impersonate the unavailable historical gpt-5.6-sol route.
- Plan directory: .trace/ani_ios_production/.
- Read-only trial: /Users/june/Documents/project/freestylejs/ani-trial-p5, detached at **8b47634ee9bd5c2adff8cfece4bc8bce5516d3a2**.
- Original report preserved: .trace/ani_ios_production/p5_bench_trial_result.md, historical **TRIBUNAL BLOCK**.
- Re-judgment boundary: **A03 only**, including its prerequisite proof and source/evidence identity conditions. The other 35 previously accepted P5 rows are unchanged.
- Remaining S0/S1/S2 defects: **zero**. Previously accepted S3 qualifications remain below.

**P6 may start.** This permits release-phase work; it is not P6 completion, a fresh-clone gate result, publication approval, or the final P0–P6 program tribunal.

## Authority and Evidence Inspected

Unprefixed trace paths below are under .trace/ani_ios_production/.

| Evidence | Inspection and significance |
|---|---|
| p5_bench_trial_result.md | Read original A03/J-P5-001 disposition and re-entry conditions; retained the complete prior technical matrix and independent checks |
| p4_drive_ratification_final_result.md | Read full final P4 PASS, route/finality, J-P4R-001 closure, four-case unit matrix, independent execution results and identity checks |
| reviews/chief_justice_route_supersession_20261030.md | Independently read from Git object **2f39dd4:path**; owner explicitly authorizes gpt-6.1-sol#high to replace the historical final route, without lowering the evidence standard |
| p4_drive_ratification_result.md | Independently read from **2f39dd4:path**; establishes that the intervening final FAIL was solely the prescribed missing unit regression, not a newly discovered production defect |
| Remediation commit **8cf346b62d6485b67c2f01633c7a3a0fce07fea3** | Read full diff and file inventory: **one file, 72 additions, zero deletions**, packages/layout/src/__tests__/drive.test.ts; no production change |
| Ratified tree **2f39dd4c09b70d52c389b2a911d48a3ad1f00257** | Compared against the original P5 trial and ea1475c; no production/browser/bench delta invalidates the accepted P5 bridge |
| p5_final_evidence_ruling_20261030.md | Byte identity checked against ratified tree; accepted owner-approved f552728→ea1475c evidence composition unchanged |
| bench/layout/iteration-12/pre-fix/report.json | SHA-256 matched the prior P5 report and ratified Git tree; source f552728, full invocation/certification PASS |
| bench/layout/iteration-12/pre-fix/cost-repeat-3.json | Same identity checks; source f552728, independent cost invocation PASS, G11 exactly 2.0 |
| bench/layout/iteration-12/attempt-load7.53/report.json | Same identity checks; source ea1475c, retained invocation FAIL; not substituted for certification |

The copied final P4 ruling is available in the trial tree. The newer route authorization, intervening P4 FAIL and remediation test are not checked out at this older detached HEAD; they were inspected directly through existing Git objects. No checkout, reset, cherry-pick or copying of source/authority was needed or performed.

## Closure of J-P5-001

### 1. Authorized finality is now present

The owner-approved route supersession expressly replaces the historical gpt-5.6-sol reservation with **openai/gpt-6.1-sol#high** for final P4 adjudication. It requires an independent read-only ratification and does not automatically promote P5. The supplied final P4 report uses that authorized route and unequivocally declares **P4 final TRIBUNAL PASS**, not an acting or conditional approval.

This satisfies the alternative expressly allowed in the original P5 disposition: owner-approved superseding route **plus an actual final P4 PASS**. The old acting report was not edited or relabelled.

### 2. The intervening unit-regression defect is actually repaired

The earlier final P4 FAIL identified **J-P4R-001, S2**, because original Remediation Order item 3 demanded unit state-machine regressions in addition to the already passing browser cases. I inspected the new test rather than treating the later PASS headline as sufficient.

The test titled **J-001: released/cancelled landings are invalidated by snap and abort** loops over all four combinations:

| Live landing | Cause | Non-vacuous precondition | Asserted outcome |
|---|---|---|---|
| released | runtime snap | released state; holds = 1 | invalidated; holds = 0; exact authored cssText; clock = 0; runtime-disabled |
| cancelled | runtime snap | cancelled state; holds = 1 | same cleanup and runtime-disabled |
| released | injected write fault, then actual frame | released state; holds = 1 | invalidated; holds = 0; exact authored cssText; clock = 0; internal-error |
| cancelled | injected write fault, then actual frame | cancelled state; holds = 1 | same cleanup and internal-error |

Each combination creates a real group/manual clock/connected participant, takes and moves it, advances a frame, releases or cancels, advances again, and asserts the landing is still live **before** triggering snap or abort. Invalidation is checked before disposal. Runtime/fault/listener/group cleanup separates iterations. No drive or runtime result is mocked. This is one parameter-loop unit test, not four separately counted Vitest tests.

The final independent P4 ratification records:

- **17/17 tests PASS**, one drive unit file, exit 0, including the new four-combination test (process 2764).
- Unchanged **L_DRIVE_4 and L_DRIVE_EDGES**: Chromium **2/2 PASS**, WebKit **2/2 PASS**, total **4/4**, exit 0, no browser problems (process 2763).
- Existing natural release/cancel completion controls remain intact; no production patch was introduced to make the regression pass.

Those are the final P4 judge's actual focused execution results, not a claim that this P5 re-judgment reran them. I independently verified the test diff, its non-vacuity, commit scope and the report's source/browser hashes. The final authorized prerequisite adjudication, backed by this inspectable correction, closes the prescribed omission and supplies the missing P5 prerequisite. No fresh full-suite result is inferred from these focused counts.

### 3. No production delta disturbs P5

Independent read-only checks established:

- 8cf346b changes **only** packages/layout/src/__tests__/drive.test.ts.
- **git diff --exit-code ea1475c..2f39dd4 -- packages ':!packages/layout/src/__tests__/drive.test.ts' tests** exits 0: production and existing browser tests remain identical to the accepted final-source baseline.
- **git diff --name-only 8b47634..2f39dd4 -- bench** is empty: the complete bench apparatus and retained evidence are unchanged from this original P5 trial.
- The complete 8b47634..2f39dd4 inventory is the unit-test addition, owner route supersession and prior adjudication reports; no P5 scene, scorer, gate, tolerance, cost fixture or production source changes.

The prior f552728→ea1475c bridge therefore remains valid. The new unit test adds proof of an existing production behavior; it is not another source-motion delta requiring recertification.

## Matrix Delta — A03 Only

| Row | Authority requirement | Before | New deciding evidence | After |
|---|---|---|---|---|
| **A03 / J-P5-001** | p5_bench_plan.md: P4 final TRIBUNAL PASS prerequisite | BLOCK; acting-only P4 ruling | Owner-authorized route supersession, final P4 PASS after 8cf346b, four-combination unit coverage and 17/17 + both-engine 4/4 focused evidence, unchanged product/bench identity | **PASS; J-P5-001 CLOSED** |

| Matrix accounting | PASS | FAIL | BLOCK |
|---|---:|---:|---:|
| Prior 36-row P5 matrix | 35 | 0 | 1 |
| A03 delta | +1 | 0 | −1 |
| **Final P5 matrix** | **36** | **0** | **0** |

All other rows and their original coverage are incorporated by reference to the preserved P5 trial report: 11 primary scenes, 8 DPR and 15 reduced-motion variants in both engines, all deciding G1–G13/shape/status/fingerprint/control requirements, D12 advisories and the D13 two-invocation rule. This is a prerequisite re-judgment, not a claim of new full bench execution.

## Independent Identity Checks

| Artifact | SHA-256 / result |
|---|---|
| Preserved P5 BLOCK report | **5e377520e82c22ea645a6ed9b043470e050dd4c4652e4885d7abab6643905e10**; also byte-identical to 2f39dd4 copy |
| Copied final P4 PASS report | **1b06e60b8502c051a18573a4e14986de9236ca021d760019a3b161f5fa159b86** |
| Ratified drive unit file at 2f39dd4 | **b29aac51c5f86a209b3e6fe90d7f197f0b4ade7af8cdfcfa2774c8e1e2ac437c**; matches final P4 report |
| Ratified existing browser drive file | **b9647d2b92948096181adc067de474d1fa204b625a788f2110e79affd787b6ab**; matches final P4 report |
| f552728 full report | **71511de270f733235a05acac3f6e666bbb75b4c963dffe25cb9f8f955d3f0b8f**; unchanged |
| f552728 cost repeat-3 | **9c9b44e35414605faa14254d174b4520f57c3704f3b2fec1b69e93aa43517562**; unchanged |
| ea1475c retained failed near-pass | **377e32c7af66eb5891d226cb9ae9dbbf2a942ac004af640ceaf17089f0ec6bea**; unchanged |
| Owner final-evidence ruling | **481ca60e0385cee0770c7f97bdd4fc4195ae9359ac06bd9b41249cbe362c4f1f**; byte-identical to ratified tree |

No full bench, deciding cost gate, new browser/unit execution, install, dependency link or commit was performed in this re-judgment. Only this re-judgment report was written. Pre-existing copied/prior reports were preserved; tracked working changes were empty before writing.

## Residual S3 — Unchanged, Non-blocking

1. **Performance margin:** repeat-3 G11 is exactly 2.0; two other invocations fail. High load alone is not a proven explanation, and arbitrary-load repeatability is not established. The failures remain genuine and retained, not advisory/pass conversions.
2. **Final-source near-pass:** ea1475c's combined attempt remains NOT CERTIFIED due to four reduced-motion support G12/RUN rows. Raw s-sheet@rm-max values include approximately 0.145 and 0.190 ms/held, larger overruns than the summary's 0.005–0.03 ms wording. Acceptance still rests on the earlier qualifying reports plus the inspected lifecycle bridge, not this failed attempt.
3. **Full-suite provenance:** the prior P5 report did not independently verify raw ea1475c full-unit/typecheck/full-browser totals in the supplied inventory. Its actual fresh 130-test harness and eight targeted browser executions remain the independent checks supporting its accepted bridge. The new P4 17/17 and 4/4 results do not replace a fresh monorepo gate. Preserve original full-suite logs for P6 review.
4. **Platform limits:** Chromium decides costs under D12; WebKit cost BLOCK/advisories are not measured passes. WebKit deciding frame/shape/status/read rows remain required and accepted. Firefox is advisory. No iOS-device/Mobile Safari certification is inferred.
5. **Maintenance/platform bounds:** retain guarded retarget-only eligibility, per-scope scratch ownership/synchronous flush assumptions, and the P4 ratification's existing scope-local hold/composed-velocity/rotation/compositor-scroll limitations.
6. **History:** prior FAIL/BLOCK reports, historical scaffold wording, failed repeats and killed runs remain evidence. This new ruling supersedes the prior P5 verdict only after closure of its expressly identified prerequisite; it does not erase history or weaken a gate.

## Final Ruling and P6 Handoff

**J-P5-001 is CLOSED. A03 is PASS. P5 p5_bench is final TRIBUNAL PASS.** The sole blocker has been satisfied by authorized final P4 ratification after the prescribed test-only repair. The other 35 P5 rows and the f552728→ea1475c bridge remain unchanged, with no new blocker found.

**P6 may start.** No additional P5 remediation or fresh full bench is required by this re-judgment. P6 must still satisfy its own documentation/migration/versioning, fresh-clone gates, final review and final program-tribunal requirements before release. P5 acceptance is bounded Chromium/WebKit Playwright evidence under D5/D8–D13, not unconditional performance or iOS-device certification.
