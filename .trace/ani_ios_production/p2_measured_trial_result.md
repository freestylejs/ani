# Tribunal Report: Combined P0 / P1 / P2

## Verdict

- **Result: TRIBUNAL PASS**
- **Target checkpoint:** combined P0 `p0_authority` + P1 `p1_spring` + P2 `p2_measured`
- **Judgment anchor:** detached `6a99da248cd59eb503f61becf3a7a63a27bdd9dc`
- **Evidence code/log anchor:** `993e9a6bca3fb52090ca3617b7f6d45b4af151bb`; `dada5b1` adds the self-judgment and logs, and `6a99da2` deletes only three malformed duplicate usage-log filenames
- **Branch note:** `6a99da2` is an ancestor of `origin/dev/ecstatic-ramanujan-1mjr9q`; the branch advanced after dispatch by one later briefs-only commit. This tribunal judges the explicitly assigned `6a99da2` checkpoint.
- **Plan directory:** `.trace/ani_ios_production/`
- **Date/time:** 2026-10-28 22:52 KST
- **Open defects:** none (S0: 0, S1: 0, S2: 0, S3: 0)

This ruling accepts only P0, P1, and P2. It does **not** certify the overall iOS Native Grade claim. P3 safety, P4 drive, the P5 frame-by-frame certification harness, and P6 release remain future gates.

## Authority Coverage

| File / evidence | Role | Included reason | Coverage result |
|---|---|---|---|
| `.trace/ani_ios_production/00_plan.md` | Final goal, teleology, D1-D9, pipeline, phase gates | Top-level program authority and exact P0-P2 gates | **PASS** |
| `packages/layout/ARCHITECTURE.md` | Single layout authority | Normative §§4, 5.7, 7, 9, 11.5 and acceptance rows | **PASS** |
| `.trace/ani_ios_production/p0_authority_trial_result.md` | First P0 tribunal | Source of J-001..J-007 | **PASS as prior evidence; every finding re-judged below** |
| `.trace/ani_ios_production/p1_spring_trial_result.md` | First P0/P1 re-judgment | Source of P0-N001 and P1-001..005 | **PASS as prior evidence; every finding re-judged below** |
| `.trace/ani_ios_production/p1_spring_rejudgment_result.md` | Second re-judgment | Source of P0-N002 and P1-N001; retained J-001/J-004 | **PASS as prior evidence; every finding re-judged below** |
| `p0_authority.md`, `p1_spring.md`, `p2_measured.md` | Implementer self-judgments | Claims and remediation mapping, never treated as dispositive | **PASS as trace evidence** |
| `p2_orchestration.md` | P2 execution/review record | Helper slices, review findings, historical H6b state | **PASS as trace evidence** |
| `gate_amendment_20261028.md` | D8 amendment record | Owner-approved retirement and replacement of legacy COST gate | **PASS; legitimate authority amendment** |
| `execution_readiness_20261028.md` | Dated status/dispatch record | P2 closure procedure and D9 environment context; expressly non-authoritative | **PASS as historical evidence** |
| `scope_correction_20261028.md` | Top-level owner scope correction | Removes board product and defines direct P1-P5 proof boundary | **PASS; legitimate authority correction** |
| `logs/p2-h6b/` | Historical gate | Shows COST failure and WebKit React-18 RL3 aged-snap failure before H11a | **PASS as historical evidence** |
| `logs/p2-close/` | Deciding P2 gate | Unit, typecheck, biome, full Chromium/WebKit, H11a load evidence | **PASS** |
| Commits `aaa642a`, `993e9a6`, `dada5b1`, `6a99da2` | Implementation and evidence chain | Carried geometry fixes, RL3 aging row, closure logs/report | **PASS** |
| Current code/tests at `6a99da2` | Independent reconciliation | Verifies implementation, test assertions, empty known failures and retired COST case | **PASS** |

## Authority Amendments

### D8 — commit-cost gate

**PASS; legitimate.** `gate_amendment_20261028.md` explicitly records an owner-approved redefinition, and `00_plan.md` D8 plus layout §11.5 make it normative. It retires an impossible absolute 4 ms reads-only row whose required-work floor already exceeded 4 ms, while retaining the absolute steady-frame, sustained-commit, held-frame and exact-read gates and replacing commit cost with a whole-commit ratio of at most 2× an audited required-work floor. The replacement belongs to P5 and is not falsely claimed at P2. The current browser case list has no `layout:COST` case; only explanatory text and the non-gating `layout:SCALE` diagnostic remain.

### D9 — certification instrument

**PASS; legitimate.** The authoritative owner-decision table in `00_plan.md` and normative layout §11.5 consistently re-pin the unreachable Linux instrument to the recorded Mac. This changes the deciding cost instrument, not any frame-scoring tolerance. D5 still makes Chromium and WebKit deciding and Firefox advisory. Independent fingerprinting on this tribunal host matched the pin: macOS 27.0.1 / Darwin 27.0.0, Apple M2 Pro, 10 cores, 32 GiB, Node 24.19.0, pnpm 10.20.0, Playwright 1.55.0, with pinned browser build directories `chromium_headless_shell-1187`, `webkit-2203`, and `firefox-1490`. P2 has no deciding cost claim, so §11.5's P5 fingerprint gate is not being pre-judged.

## Judgment Matrix

### Program authority and scope

| ID | Authority requirement | Evidence inspected / independent check | Result |
|---|---|---|---|
| A-01 | Painted-frame teleology and “snap, never wrong motion” remain controlling | `00_plan.md` lines 3-28; layout §§1, 3.4, 9 | **PASS** |
| A-02 | One v3 authority; no legacy page-box, inner-scroll-stale or field-by-field path | Architecture header/removal text; current source and acceptance rows; legacy terms occur only in removal/anti-regression context | **PASS** |
| A-03 | No board deliverable | `git ls-tree`/glob: no `app/board`, no `briefs/h10.md`; only historical scope-correction references remain | **PASS** |
| A-04 | D8 is valid and P1/P2 exclude only retired COST | Owner-approved amendment, plan D8, layout §11.5, case list | **PASS** |
| A-05 | D9 is valid and required engines remain Chromium/WebKit | Plan D5/D9, layout §11.5, matching live fingerprint | **PASS** |

### Carried P0 defects

| Defect | Prior severity | Independent re-judgment and evidence | Result |
|---|---:|---|---|
| J-001 | S0 | `aaa642a`: `keepPath` uses measured screen jump `J = D - B`; scope wires raw flush rect versus fresh B. KP-1 and L-MEAS-4/7 cover amplified/live-scale cases. Focused Chromium and WebKit L-MEAS-4 reruns passed at ≤0.001 px in the amplified case. | **PASS** |
| J-002 | S0 | Authority §5.10 now defines one inherited displacement `h`, descendant residuals, and release velocity entering once; L-DRIVE-6 is assigned to P4. The pure remediation proof reproduced the old 68.5 px tear and passed the corrected residual equation at 2.84e-14 with `h′(0)=600`. P4 implementation is not a P0-P2 gate. | **PASS** |
| J-003 | S1 | Authority §4.2 and current `supportCheck` use exact modeled `E = Eπ·p·q`, not propagated measured scale. Focused tests and `p1_proofs.mjs` pass the 50.49/1000 cases at 0.1×, 1× and 10× and the 20,000-chain property. | **PASS** |
| J-004 | S1 | Authority §4.4 and `staleReported` use conservative screen bound β; scope recursively includes parent-frame movement. ST-3 and L-MEAS-11 report the 300× amplified 0.005/0.009 px cases. Focused Chromium and WebKit L-MEAS-11 reruns passed with exact stale sets. | **PASS** |
| J-005 | S1 | `packages/core/src/API.md` now documents `clock.inFrame` and the full `physics` surface and domain. | **PASS** |
| J-006 | S1 | Layout §11.5 now defines the pinned D9 fingerprint, required-work floor, sample counts, nearest-rank statistics, five-run aggregation and advisory mismatch rule. | **PASS** |
| J-007 | S3 | Layout §7.2 says the `onSnap` API surface stays while callback isolation is a P3 behavior change; it no longer claims existing isolation. | **PASS** |
| P0-N001 | S1 | Degenerate `offsetWidth/Height <= 1` axes read exact computed size; measure tests cover 1 px and 0.5 px leaves and unsupported zoom. | **PASS** |
| P0-N002 | S0 | `supportCheck` never propagates a measurement as proof. SC-7 verifies 3- and 1,999-level skew chains and top-down classifier reads. The focused measure suite passed. | **PASS** |

### Carried P1 defects and P1 gate

| Defect / gate | Prior severity | Independent re-judgment and evidence | Result |
|---|---:|---|---|
| P1-001 | S1 | React `LayoutGroup` and `useLayout` validate each motion layer and then the merged effective motion with the engine before state changes; WAAPI spring rejection is preserved. | **PASS** |
| P1-002 | S1 | Every ordinary and reduced spring candidate checks the 10 s settle cap; focused solve tests include carried-velocity and zero-velocity retry cases. | **PASS** |
| P1-003 | S1 | `physics.perceptual` rejects non-finite time and non-finite/non-positive duration; property test P2 covers the tribunal counterexamples. | **PASS** |
| P1-004 | S1 | `reducedSpringOracle` uses independent closed-form/bisection `settleOracle`, its own grid and cap rather than production `settleTime`/`planTrack`. | **PASS** |
| P1-005 | S1 | Raw P1 logs exist per command. More importantly, current full Chromium/WebKit logs at `993e9a6` directly rerun L-SPRING-1..4 and all remaining suites. | **PASS** |
| P1-N001 | S1 | D8 validly retires only `layout:COST`; current remaining suites are green and P5 owns the replacement whole-commit gate. | **PASS** |
| P1-G1 | — | Unit/property implementation against an independent oracle: focused four-file rerun 112/112; closure unit log 1,798/1,798 | **PASS** |
| P1-G2 | — | L-SPRING-1..4 in required engines: Chromium and WebKit full logs 4/4 in each; historical Firefox 4/4 is advisory | **PASS** |
| P1-G3 | — | Existing suites green except retired COST: Chromium 197/197; WebKit 195 pass with two documented Chromium-only core skips; no known failures | **PASS** |

### P2 acceptance rows

| Authority row | Direct evidence | Result |
|---|---|---|
| L-MEAS-1 | Full Chromium/WebKit logs: page and panel anchoring, every frame ≤0.000 px | **PASS** |
| L-MEAS-2 | Full logs: commit-time scroll, seven cards from presented boxes, 21 oracle frames | **PASS** |
| L-MEAS-3 | Full logs: instant `scrollIntoView`, participants glide from presented boxes | **PASS** |
| L-MEAS-4 | Full logs plus independent focused reruns in both engines: paths 1/2/3, live scales and 332× amplification | **PASS** |
| L-MEAS-5 | Full React 19 and React 18.3 modules in both engines: sliced render, aged branch, urgent, Suspense and coalescing | **PASS** |
| L-MEAS-6 | Full logs: sticky engagement with and without later commit | **PASS** |
| L-MEAS-7 | Full logs: flat/nested presented and commit-task changes, velocity carried | **PASS** |
| L-MEAS-8 | Full logs: fixed sheet unaffected by page scroll | **PASS** |
| L-MEAS-9 | Full logs: nested fresh capture and aged capture, no rewind | **PASS** |
| L-MEAS-10 | Full logs: open/closed roots, slotted participants and root moves | **PASS** |
| L-MEAS-11 | Full logs plus focused reruns: capture-less/aged exact reports and amplified β case | **PASS** |
| L-MEAS-12 | Full logs: unsupported box-changing rotations snap; 180° box case animates exactly | **PASS** |
| L-MEAS-13 | Full logs: rendering-callback capture aged immediately; never uses intermediate B | **PASS** |
| L-HAND-1 | Full logs: forward/back shared handoff and coverage | **PASS** |
| L-HAND-2 | Full logs: active inner/document/shadow scrollers, presence and viewport-fixed reparent | **PASS** |
| L-KEY-1 | Full logs: fresh baselines at rest and mid-run, no interpolation | **PASS** |
| L-DOC-1 | Full logs: foreign add/set throw, adoption disposal/restoration, re-add | **PASS** |
| L-MEAS-14 (current additional authority row) | Full logs: anchoring probe/fallback shapes, WAAPI and classic-scrollbar row | **PASS** |

### P2 closure gates and exact claims

| Gate / exact claim | Evidence inspected / re-check | Result |
|---|---|---|
| Unit 1,798/1,798 | `logs/p2-close/unit.log`: 145 files, 1,798 tests, exit 0 | **PASS** |
| Typecheck 11/11 | `logs/p2-close/typecheck.log`: 11 successful / 11 total, exit 0 | **PASS** |
| Biome | `logs/p2-close/biome.log`: 0 errors, 10 warnings, exit 0 | **PASS** |
| Chromium 197/197 | `logs/p2-close/chromium.log`: 197 passed, 0 failed, 0 known, 0 skipped, exit 0 | **PASS** |
| WebKit 195 pass / 2 skipped | `logs/p2-close/webkit.log`: 195 passed, 0 failed, 0 known, two `core:C1/C2` CDP/Chromium-only skips, exit 0 | **PASS** |
| Empty `knownFailures` | Every case module declares `{}`; both full logs report 0 known failures | **PASS** |
| No `layout:COST` case | Independent `node tests/browser/run.ts --list` contains no COST case; source has only D8 explanatory text | **PASS** |
| No `app/board` | Glob and `git ls-tree` found no board path or H10 brief | **PASS** |
| RL3 intended measured sequence | H11a loaded Chromium/WebKit × React 18.3/19 logs pass; WebKit React-18 has three consecutive loaded runs | **PASS** |
| RL3_AGED deterministic outcome | Source advances the manual clock in `AgeCapture` after group render capture and before commit; logs and independent reruns in both engines/React versions return `advanced aged commit: 'stale' acdebf`, all at authored layout styles, no other snap reason | **PASS** |
| Firefox treatment | D5/D9 make it advisory; macOS pinned build launch exception is recorded, never counted as a pass | **PASS** |
| Evidence applies to final target | `993e9a6..6a99da2` changes only trace logs/self-judgment and deletion of malformed duplicate log names; no product/test behavior changed | **PASS** |

## Judgment Matrix Summary

| Requirement group | Rows checked | PASS | FAIL | BLOCK |
|---|---:|---:|---:|---:|
| Program authority and amendments | 5 | 5 | 0 | 0 |
| Carried P0 defects | 9 | 9 | 0 | 0 |
| Carried P1 defects and P1 gate | 9 | 9 | 0 | 0 |
| P2 acceptance rows | 18 | 18 | 0 | 0 |
| P2 closure gates and exact claims | 12 | 12 | 0 | 0 |
| **Total** | **53** | **53** | **0** | **0** |

## Defects

No open tribunal defect was found. All carried S0/S1/S3 findings are closed by inspectable authority, implementation and test evidence. Therefore no remediation order, repair-ready disposition or fix proof report is required.

## Independent Re-checks

| Check | Command or method | Result |
|---|---|---|
| Exact anchor and ancestry | `git rev-parse HEAD`; `git merge-base --is-ancestor 6a99da2 origin/dev/...` | `6a99da2`; ancestor check passed |
| Evidence-to-target diff | `git diff --stat 993e9a6..6a99da2` and commit inspection | Only closure logs/self-report and malformed-log deletion |
| Focused defect suites | `pnpm exec vitest run measure.test.ts motion.test.ts solve.test.ts physics.test.ts` | 4 files, **112/112 passed** |
| P0 remediation proof | `node .trace/ani_ios_production/p1_proofs.mjs` | **12/12 passed** |
| Browser case inventory | `node tests/browser/run.ts --list` | No `layout:COST` case |
| Chromium critical rows | RL3_AGED (React 19/18.3), L-MEAS-4, L-MEAS-11 | **4/4 passed**, 0 known failures |
| WebKit critical rows | Same four focused rows | **4/4 passed**, 0 known failures |
| Scope inventory | Glob and `git ls-tree` | No `app/board`; no H10 brief |
| Known-failure inventory | Source grep plus full-log summaries | Every module `{}`; full logs 0 known failures |
| D9 fingerprint | Live fingerprint commands | Exact pinned host/runtime/build directories present |
| Worktree integrity | `git status --short --branch` after checks | Detached HEAD, no tracked changes before writing this report |

The first focused test attempt occurred before dependencies were installed and returned `Command "vitest" not found`. The expressly permitted `pnpm install --frozen-lockfile --offline` completed with exit 0; the rerun then passed 112/112. No tracked source or test file changed.

## Residual Program Limits (Not P0-P2 Defects)

- The P5 §11.5/§11.6 certification harness and its real frame-by-frame native-grade report do not exist yet. That is expected at P2 and prevents any overall iOS Native Grade claim, not this checkpoint PASS.
- P3 safety/operations and P4 drive remain unimplemented and unjudged.
- Firefox is advisory and its pinned build does not launch on the D9 macOS host; Chromium and WebKit are the deciding P2 engines.
- D8's replacement whole-commit cost gate is unjudged until P5; this tribunal accepts the amendment, not future performance evidence.

## Remediation Order

None.

## Fix Proof Report Requirements

None.

## Re-Judgment Entry Criteria

Not applicable for P0-P2. A later tribunal must re-open this result if product/test behavior at or before P2 changes, a carried defect is shown not to be closed, or an authority amendment is withdrawn.

## Final Ruling

Every carried defect has concrete closure evidence, every P1/P2 deciding row is green in Chromium and WebKit, the exact unit/typecheck/browser counts are present in raw logs, the known-failure maps are empty, and the retired COST row and removed board scope are absent as active gates/deliverables. D8 and D9 are legitimate amendments within the supplied owner authority. The absent P5 harness is not a P2 gate and is not treated as one.

# **TRIBUNAL PASS — combined P0 / P1 / P2 checkpoint**
