# Final P0–P6 Tribunal Re-judgment — P6 / J-FINAL-001

## Final verdict

**FINAL TRIBUNAL PASS — P6 and the complete ani iOS Native Grade P0–P6 program.**

- **J-FINAL-001: CLOSED.** No open S0/S1/S2 finding remains in the adjudicated program.
- **Release approval: YES**, for release **fe3ad081b81271d750af105b38319901f88be8c1**, with the evidence composition and platform/claim bounds below. This is approval, not a claim that packages have been published.
- Judge: **OpenAI openai/gpt-6.1-sol through OpenCode**, the owner-authorized superseding final route recorded as **openai/gpt-6.1-sol#high** in `reviews/chief_justice_route_supersession_20261030.md`. Date: 2026-10-30.
- Read-only trial: `/Users/june/Documents/project/freestylejs/ani-trial-final`, detached at **67f0637e48cea8cc914385196c1e2a1437a3c2df**.
- Scope: **P6/J-FINAL-001 only**. P0–P5 and all other previously accepted release rows remain accepted on the original independent audit, with identity rechecked here. This is not a new full-program test or benchmark execution.
- Prior `final_tribunal_result.md` remains intact as the historical **TRIBUNAL BLOCK**. This report supersedes that verdict only after the specified owner-amendment closure route was satisfied. Only this new report is written; no commit is made.

Unprefixed trace paths below are relative to `.trace/ani_ios_production/`.

## Why J-FINAL-001 now closes

The original BLOCK did **not** reject the P5 benchmark evidence or identify a release motion defect. It enforced the still-explicit P6 requirements to include certification in the fresh-clone gate and rerun it on the final release commit. Its disposition expressly allowed an **owner-approved P6 authority amendment** accepting identified carry-forward evidence on unchanged motion/apparatus.

The owner has now supplied that decision directly and in `p6_carry_forward_amendment_20261030.md`. I read the amendment and the updated `p6_release.md`, then independently verified its identity conditions rather than adopting its statement that the defect was closed.

The amendment:

1. Expressly makes the accepted **f552728 full P5 report + independent D13 repeat + ea1475c lifecycle bridge** the P6 bench certification for this unchanged release.
2. Removes the requirement for another fresh-clone five-run bench solely for the identified docs/test/version delta, thereby superseding the conflicting P6 rerun procedure for this release.
3. Retains the fresh-clone unit/typecheck/check/Chromium/WebKit requirements; the second clone additionally corroborates the build and non-browser gates.
4. Explicitly preserves iteration-13 as an **incomplete killed attempt**, not a pass.
5. Changes **no P5 scene, deciding gate, tolerance, cost rule or fingerprint rule**. It requires new certification for future changes to motion, the apparatus or instrument.

These are the precise procedural changes authorized in the original disposition, not a post-hoc relabelling of failed evidence. The required identity conditions hold. **J-FINAL-001 is therefore closed through the amendment route.** No new deciding cost run or full bench is needed or performed for this re-judgment.

## Evidence inspected and identity checks

| Evidence / check | Independent finding | Result |
|---|---|---|
| `p6_carry_forward_amendment_20261030.md` and owner's current instruction | Explicit owner-approved P6 carry-forward, naming the exact reports/bridge and killed-run status; procedural prerequisite only | PASS |
| Updated `p6_release.md` against HEAD | Only the new june-wsl execution table and carry-forward explanation were added. Existing release identity, Mac results and killed-smoke disclosure remain | PASS |
| Prior `final_tribunal_result.md` | Original S2 finding, two permitted closure routes, accepted P0–P5 and other P6 rows preserved | PASS; amendment satisfies route 2 |
| Current git identity/status | HEAD remains 67f0637. Initial changes are the owner-supplied p6_release.md update and amendment, plus the prior untracked tribunal report; staging is empty | PASS; not misrepresented as a clean whole working tree |
| `git diff --exit-code HEAD -- packages tests bench pnpm-lock.yaml package.json` | Empty; no current source/test/apparatus/config/evidence change | PASS |
| fe3ad08 → 67f0637 | Only p6_release.md and iteration-13 run.log; no product/build/test configuration delta | PASS; WSL source/build input equivalent to the release |
| ea1475c → 67f0637 executable source | Only drive.test.ts unit regression/formatting and a types.ts **comment** change appear in source paths; no executable production motion change | PASS |
| ea1475c → 67f0637 browser/apparatus | Existing browser tests unchanged; bench changes restricted to iteration documentation and retained JSON/log artifacts, not scenes/scorer/oracle/gates/tolerances/cost fixtures | PASS |
| Accepted P5 report/repeat | Hashes match the original audit; both name f552728. Full report invocation PASS/certified true; repeat invocation PASS, correctly not a standalone full certification | PASS |
| D13 G11 medians | Recomputed from the five measured cost runs: full **1.958904183161217**, repeat **exactly 2.0** | PASS; no rounding of an above-threshold ratio |
| Retained contrary evidence | Failed ea1475c report and iteration-13 log retain their original hashes; no failed/incomplete attempt is converted to PASS | PASS |
| Final P4/P5 ruling identity | Final P4 ratification and P5 re-judgment remain byte-bound to the accepted dependency chain | PASS; no prerequisite reopened |
| Versions/peers | core **2.0.0**, layout **0.2.0**, React **2.0.0**; layout peer core **^2.0.0**, React optional peer layout **^0.2.0** | PASS; unchanged |

The amendment loosely calls the second clone “the same release commit.” The updated execution record and owner instruction correctly identify it as **67f0637**, not fe3ad08. The inspected two-file documentation/log-only delta establishes unchanged product/build inputs. No false claim that those two Git SHAs are equal is necessary or accepted.

### Binding hashes

| Artifact | SHA-256 |
|---|---|
| Preserved prior BLOCK report | `22f1bf10cece7f49d9ef8cdef7d02e9a442678ddd3ccee0ca71fc9b1eb8077ab` |
| Owner P6 amendment | `2235650d1ecebed18576db196a50dc9664aa4293e624e2f387140ca99886a715` |
| Updated P6 execution record | `165caff2585d9fdb00050e9d8c6dc42195006b509c340ab85747c8267b71b709` |
| P5 full report | `71511de270f733235a05acac3f6e666bbb75b4c963dffe25cb9f8f955d3f0b8f` |
| P5 independent repeat-3 | `9c9b44e35414605faa14254d174b4520f57c3704f3b2fec1b69e93aa43517562` |
| Retained failed ea1475c attempt | `377e32c7af66eb5891d226cb9ae9dbbf2a942ac004af640ceaf17089f0ec6bea` |
| Incomplete iteration-13 log | `28334396b2425bec6dcc5b291b9e6383d2d79e810a44d201f13e75ae46bb8cef` |
| Final P4 ratification | `1b06e60b8502c051a18573a4e14986de9236ca021d760019a3b161f5fa159b86` |
| Final P5 re-judgment | `5a597324fc3fb8c7f7fdba59954fdb5f175e89ba9f444684ea39086dd2984a80` |

## Release evidence composition under the amendment

| Layer | Record and actual result | Tribunal use |
|---|---|---|
| Mac fresh clone, fe3ad08 | Frozen install PASS; unit **1929/1929**; types **11/11**; check **0 errors**; Chromium **223/223**; WebKit **221/221 + 2 Chromium-only skips** after disclosed loaded retries | Deciding fresh-clone release/browser record, unchanged from the original audit |
| june-wsl fresh clone, 67f0637, Ubuntu 26.04 x64 | Frozen install PASS; build **8/8**; unit **1929/1929**; types **11/11**; check **0 errors**, 10 warnings, 8495 infos | Additional build/non-browser corroboration on independently cloned equivalent source |
| june-wsl browser/bench | **Not runnable** under the supplied Playwright 1.55/Ubuntu 26.04 environment; no Docker/Podman; no pass claimed | Not certification and not a replacement D9 instrument; Mac browser evidence still decides |
| P5 f552728 full report + D13 repeat | Full certified report: all eleven scenes and 23 support variants, both required engines' deciding frame/shape/status/read rows; Chromium cost gates; second independent qualifying cost invocation | **Carried P6 benchmark certification**, as explicitly authorized; no report provenance is changed |
| ea1475c lifecycle bridge | Previously accepted exact two-file delta, original independent browser checks and final P4/P5 dependency closure | Preserved; release adds no motion/apparatus delta invalidating the bridge |
| Iteration-13 fresh-clone smoke | Killed during warm-up; incomplete | **Not a pass**, not the certification input |

**Provenance:** fresh-clone command totals are the direct execution records supplied by the owner and recorded in p6_release.md. I did not independently rerun those full commands or access june-wsl during this narrow re-judgment. This is not represented as new raw full-suite stdout or new browser/benchmark execution. The original independent audit's **130/130 harness tests, 12/12 pure proofs, eight current-source browser executions and complete 68-row/340-measured-run/1732-entry P5 census** remain its actual checks, not newly executed results today. The new checks here are document/diff/hash/source-identity reconciliation and the cost-median recomputation.

## Matrix delta — P6 / J-FINAL-001 only

| Row | Prior result | New authority/evidence | Final result |
|---|---|---|---|
| J-FINAL-001: P6 fresh-clone/final-release certification procedure | S2 BLOCK; rerun incomplete, no owner-approved P6 exception | Explicit owner P6 carry-forward amendment; unchanged source/apparatus; exact accepted report/repeat/bridge identity; retained killed-run disclosure | **PASS — CLOSED** |
| P6 completion | BLOCK solely on J-FINAL-001; other release rows accepted | Sole prerequisite closed; prior release rows and dependency chain unchanged; second fresh clone supplies additional build/non-browser corroboration | **FINAL TRIBUNAL PASS** |
| Complete P0–P6 program | BLOCK because P6 was incomplete | P0–P5 retain final PASS; P6 now final PASS | **FINAL TRIBUNAL PASS; RELEASE-APPROVED** |

**Finding accounting:** prior open S0 **0**, S1 **0**, S2 **1** → final open S0 **0**, S1 **0**, S2 **0**. No new S0/S1/S2 was found. Original P4 J-001, J-P4R-001 and P5 J-P5-001 remain closed; they are not replaced by this amendment or silently promoted from acting verdicts.

## Residual S3 and claim bounds

1. **Performance margin remains narrow:** repeat-3 G11 is exactly 2.0; two other independent repeats fail. The failed final-source reduced-drive G12 attempt remains failed, with individual overruns larger than some old summaries imply. Load alone is not a proven cause. No arbitrary-load reliability or universally green rerun is claimed.
2. **Platform boundary:** the earned claim is the specified **Chromium/WebKit Playwright evidence on D9 under D5/D8–D13**, not iOS-device/Mobile Safari certification. Chromium decides costs; WebKit cost BLOCK/advisories are not measured passes. Firefox remains advisory. WSL supplies no browser/bench certification.
3. **Gesture boundary:** the layout drive seam is not a complete pointer/gesture/accessibility subsystem. Consumer ownership of pointer capture, velocity estimation, touch-action, keyboard operation and announcements remains unchanged.
4. **Maintenance/platform bounds:** scope-local nested holds, nearest-animating-ancestor take velocity, compositor-scroll lag, labelled seeded/synthetic controls, narrow historical coverage margin, support-classification limits, guarded planner eligibility and synchronous per-scope scratch ownership remain accepted limitations.
5. **Evidence transparency:** disclosed transient attempts, failed repeats, failed ea1475c support rows, historical FAIL/BLOCK reports and killed runs remain preserved. The amendment does not rewrite their outcomes or manufacture fresh full-suite logs.
6. **Carry-forward scope:** this approval attaches to the identified unchanged release only. Future changes to executable motion, a scene, scorer, gate, tolerance, cost fixture or instrument require new certification under the amendment. No board/canvas/editor product or unrelated application is certified or added.

## Final ruling and release approval

The original blocker was a missing authorized P6 procedural exception, not absent P5 technical proof. The owner has supplied precisely that exception; independent identity checks establish its preconditions. The previously audited P5 benchmark body remains deciding, the fresh-clone release/browser checks retain their actual provenance, and the killed smoke remains incomplete.

**J-FINAL-001: CLOSED. P6: FINAL TRIBUNAL PASS. Complete P0–P6 program: FINAL TRIBUNAL PASS. Release approval: YES, within the stated evidence and platform bounds.**

No remediation, new full bench, deciding cost run, source edit or commit is ordered by this re-judgment. The prior BLOCK report is preserved. Only this re-judgment report was created by the judge.
