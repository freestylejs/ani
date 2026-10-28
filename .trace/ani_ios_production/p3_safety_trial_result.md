# Chief Justice Tribunal Report — P3 Safety

## Verdict

- **Result: TRIBUNAL PASS**
- **Target checkpoint:** P3 'p3_safety' (P3a H11b + P3b H12)
- **Judgment anchor:** detached f5dfc229447b6f237b6e71b77338970122815dd1
- **Deciding browser evidence:** Chromium at 85f456da7a806b67f9dc4c55b30ab4bd312bf03f; WebKit at e6bc05953091914e79268c34fb7ec7839cede97a
- **Date:** 2026-10-29
- **Open P3 defects:** none (S0: 0, S1: 0, S2: 0, S3: 0)

This ruling certifies P3 safety only. It does not certify the P4 drive seam, drive-hold behavior, P5 native-grade performance, or the final product claim.

## Authority Coverage

| File / evidence | Role | Tribunal treatment | Result |
|---|---|---|---|
| .trace/ani_ios_production/00_plan.md | Program teleology, pipeline, exact P3 objective and gate | Controlling phase authority | **PASS** |
| packages/layout/ARCHITECTURE.md §§7.1–7.3, 8, 9.1–9.4, 11.2–11.3 | Public API, runtime, accessibility, safety, acceptance, fuzz and mutation authority | Controlling product authority | **PASS** |
| .trace/ani_ios_production/p3_authority_clarifications.md C1–C6 | Resolves internal drift on diagnostic cardinality, callback ownership, phase boundary, reserved code, focus/inert, and cross-document ordering | Reconciles existing authority without weakening P3 | **PASS** |
| .trace/ani_ios_production/p3_safety_plan.md | H11b/H12 execution and review checklist | Used to enumerate required P3 surfaces | **PASS** |
| .trace/ani_ios_production/p3_safety.md | Implementer self-judgment | Claims treated as trace evidence, never as dispositive | **PASS as trace evidence** |
| .trace/ani_ios_production/p2_measured_trial_result.md | Prior accepted baseline | Confirms no carried P2 defect was assigned to P3 | **PASS as prior evidence** |
| reviews/h11b_review_*.md and reviews/h12_review_*.md | Independent defect discovery and re-review chain | Every deciding S1/S2 finding re-judged below | **PASS** |
| logs/p3a-final and logs/p3-final | Recorded required-engine runs and coverage | Raw deciding browser evidence | **PASS** |
| packages/layout/src/runtime.ts, fault.ts, scope.ts, dom.ts, plan.ts, realize/* and React wiring | P3 implementation | Independently reconciled with authority and tests | **PASS** |
| packages/layout/src/__tests__ and tests/browser/cases/layout_ops.ts | Unit and browser proof surface | Independently inspected; focused and full unit reruns performed | **PASS** |
| packages/layout/README.md and packages/web/content/docs/guides/layout.mdx | P3 public documentation | P3 safety/runtime/accessibility claims reconciled with code | **PASS for P3** |
| Commits 85f456d, e6bc059, f5dfc22 | Final implementation/evidence chain | Final source delta and log applicability checked | **PASS** |

## Authority Clarifications

| ID | Clarified requirement | Judgment | Result |
|---|---|---|---|
| C1 | Stale diagnostics are per reported node, with one element-less event when none is reported | Matches the typed payload and exact L-MEAS-11 assertions | **PASS** |
| C2 | Engine faults fail transactionally; user callbacks are isolated as callback-error | Restores the ownership distinction required by §§9.1–9.2 | **PASS** |
| C3 | P3 tests run and crossfade/presence holds; drive hold and release-dt remain P4 | Executable phase boundary; no P4 behavior is falsely certified | **PASS** |
| C4 | measurement-unsupported remains typed but has no emitter unless the S1 fallback ships | No reachable condition exists in the current deciding engines | **PASS** |
| C5 | A focus-skipped follower does not become inert | Preserves focus and avoids creating inert ownership without a crossfade | **PASS** |
| C6 | Read-after-write ordering is scoped per document | Correctly distinguishes same-document layout forcing from foreign-document restoration | **PASS** |

## Judgment Matrix

### P3a — runtime, transactions, diagnostics, caps, and status

| ID | Requirement | Evidence and independent judgment | Result |
|---|---|---|---|
| P3A-01 | Public singleton layoutRuntime with mode, setMode and onDiagnostic; installed copy shared by adapters | runtime.ts, package export, React adapter imports and unit coverage show one module singleton rather than duplicated state | **PASS** |
| P3A-02 | Synchronous kill switch in explicit and implicit scopes | L_OPS_1 in both engines proves live completion, identity/style restoration, disabled reports, zero subscription, re-enable, and P3 hold behavior | **PASS** |
| P3A-03 | Exact typed diagnostic payload and stable codes | Runtime construction supplies version/scope/run/engine/action/reason/metrics; browser and unit assertions cover exact payloads and ordering | **PASS** |
| P3A-04 | No diagnostic payload cost when no listener exists | Runtime checks listener presence before payload construction; tests cover subscription and duplicate-listener behavior | **PASS** |
| P3A-05 | onSnap and listener isolation, other-listener-only callback-error, async dev rethrow, no recursion | Focused callback tests and L_OPS_2 cover onSnap, listener failure, ordering and unchanged engine state | **PASS** |
| P3A-06 | Reentrant callback safety | flush, dispose and setMode re-entry tests preserve run/event state and terminal cleanup | **PASS** |
| P3A-07 | Idempotent transactional boundary around flush and every frame | scope/fault implementation and transaction tests cover measure, write, frame-write, animate, track-finish, cleanup-throw and lifecycle fault paths | **PASS** |
| P3A-08 | Abort restores declarations/inert, cancels animations, clears writes/holds/markers/listeners, stops clock, resolves reports | L_OPS_2 and focused tests assert byte-identical styles, zero clock/listeners/animations and terminal failed reports | **PASS** |
| P3A-09 | failed and disabled semantics and §9.3 precedence | Unit precedence matrix plus CAPS_STATUS show failed before capped and disabled before capped; source order matches authority | **PASS** |
| P3A-10 | maxParticipants gates capture/flush before reads and remains latched | caps tests, CAPS, CAPS_STATUS and L_OPS_MAXP prove zero reads, whole-scope capped result and exact participant-cap metrics | **PASS** |
| P3A-11 | Late mounts cannot read after crossing maxParticipants; maxNodes caps visible movers | L_OPS_MAXP_LATE proves zero reads/metric zero; CAPS_STATUS proves mover boundary and over-cap behavior | **PASS** |
| P3A-12 | Invalid options throw ANI_INVALID_OPTIONS before state change; development warnings retain required once-per-scope behavior | Validation and diagnostics/status suites cover boundaries and state preservation | **PASS** |

### P3b — accessibility and adversarial lifecycle safety

| ID | Requirement | Evidence and independent judgment | Result |
|---|---|---|---|
| P3B-01 | Crossfade follower is inert from the first frame | L_A11Y_1 in Chromium and WebKit asserts first-frame, live and held states | **PASS** |
| P3B-02 | Authored inert is restored byte-identically on reversal, unmount, abort and dispose | Unit restoration matrix and browser row cover authored-present/absent outcomes and all critical termination paths | **PASS** |
| P3B-03 | Layout never changes DOM order/focus and keyed reorder/held re-render preserve activeElement | L_A11Y_1 exact activeElement and attribute assertions pass in both engines | **PASS** |
| P3B-04 | Focus inside the follower skips crossfade, keeps focus, takes no inert ownership, emits one action:none diagnostic | Browser and unit rows prove lead at A, presence-only exit, no snapped/onSnap entry and exact diagnostic | **PASS** |
| P3B-05 | Focus containment works through nested closed shadow roots | L_A11Y_1 covers one and two nested closed roots; root-chain implementation follows shadow-including ancestry | **PASS** |
| P3B-06 | Focus arriving in a continuing or held follower cannot leave an invisible interactive duplicate | Pair is ended/settled, opacity and inert ownership restored, hold released, focus retained | **PASS** |
| P3B-07 | Seeded model exercises the §11.3 lifecycle event set within the P3 boundary | FUZZ runs 16 deterministic sequences of 10–14 events, including capture/frame/flush/scroll/reflow/lifecycle/options/reduced/kill/fault events; drive calls are P3 stubs under C3 | **PASS** |
| P3B-08 | Fuzz invariants: valid B or reported snap, per-document read-before-write, terminal handles/reports, idle cleanup, byte-exact owned-state restore | Browser summaries and inspected checker state assert each invariant at event/idle boundaries | **PASS** |
| P3B-09 | One writer per element/property and exact cap/fault/follower interactions | ONE_WRITER and CAPS_STATUS pass in both engines, including follower inert restoration on cap and fault | **PASS** |

### Mutation evidence

| Mutant / control | Required disposition | Evidence | Result |
|---|---|---|---|
| M1 consume aged capture | Accepted checker control | L-MEAS-11 rejects reuse of aged B; honestly labelled checker rather than source mutation | **PASS with accepted S3 label** |
| M2 skip frame marker | Real mutation | Real frame-marker mutation fails L-MEAS-13 | **PASS** |
| M3 predicted rather than measured box | Real mutation | Mutated capture is rejected by L-MEAS-4 | **PASS** |
| M4 drop layout-size check | Accepted synthetic control | §9.1 size-limit control is labelled synthetic | **PASS with accepted S3 label** |
| M5 ignore scrollend | Platform-sensitive real control | Chromium removal fails L-HAND-2; WebKit has no scrollend and exercises the normative conservative fallback | **PASS** |
| M6 skip abort cleanup | Real mutation | Blocked removal is rejected by L-OPS-2 | **PASS** |
| M7 release with dt != 0 | P4 row | Explicitly deferred to L-DRIVE-1 with C3; not counted as a P3 mutation pass | **PASS as phase-boundary disposition** |
| M8 merge motion field by field | Accepted synthetic control | L-SPRING-3 rejects it; labelled synthetic | **PASS with accepted S3 label** |

### Review-defect closure

| Finding(s) | Closure evidence | Result |
|---|---|---|
| OPS-01 | Transaction-owned declarations survive settle until commit and restore on a later fault | **PASS** |
| OPS-02 | Reports resolve after commit; later failure wins and internal-error carries the active run | **PASS** |
| OPS-03 / OPS-04 | Cleanup steps are independently guarded; lifecycle writes are bounded/self-cleaning and dispose unregisters | **PASS** |
| N1 | Accepted late handoffs clear unmeasured even when no track is needed; same-box/sub-threshold rows pass | **PASS** |
| N2 | captureAdded counts before viewRect; late add over cap performs zero reads | **PASS** |
| N3 | Capped capture remains latched through the flush and smaller subsequent participant list | **PASS** |
| H12-01 | Pending inert restore survives release/reversal/settle | **PASS** |
| H12-02 | Abort replays resting inert independently of live drive registration | **PASS** |
| H12-03 | Focus-skipped held former follower is settled rather than left opacity-zero/inert | **PASS** |
| H12-04 | Focus reaching a continuing/held follower ends or settles the pair, removing the duplicate target | **PASS** |
| H12-05 / H12-06 | Nested closed-root traversal is complete and does not mutate participant chain-root state | **PASS** |
| H12-07–H12-15 | Per-node B model, per-document writes, one-writer, exact event outcomes, real scroll containment, mutation labels and P4 deferral are present | **PASS with accepted S3 limits** |

### Gates and exact claims

| Gate / claim | Evidence | Result |
|---|---|---|
| Full build | Tribunal scratch archive of f5dfc22, frozen offline install, pnpm build | **8/8 packages PASS** |
| Unit inventory and result | Tribunal scratch rerun after build | **152/152 files; 1,874/1,874 tests PASS** |
| Focused P3 unit rerun | Seven P3-critical files via detached-source Vitest setup | **7/7 files; 71/71 tests PASS** |
| Typecheck | Tribunal scratch pnpm ts:typecheck | **11/11 tasks PASS** |
| Biome | Tribunal scratch pnpm check | **0 errors; 10 warnings; exit 0** |
| Chromium full browser | logs/p3-final/chromium.log | **209 passed, 0 failed, 0 known failures, 0 skipped; exit 0** |
| WebKit full browser | logs/p3-final/webkit.log | **207 passed, 0 failed, 0 known failures, 2 documented Chromium-only skips; exit 0** |
| Chromium coverage | logs/p3-final/chromium-coverage.log | **92.78% statements / 82.65% branches / 95.21% functions / 95.56% lines**, above 90/80/95/92 floors |
| Known-failure inventory and final applicability | Source maps are empty; both full logs report zero. HEAD after e6bc adds only final logs/self-judgment; the only post-Chromium source change removes an unused accessor and adds its direct unit test | **PASS** |

### Documentation

| ID | Requirement | Judgment | Result |
|---|---|---|---|
| DOC-01 | README documents runtime, diagnostics, transactions, caps, statuses, accessibility and P3/P4 boundary | Claims match the inspected implementation and authority | **PASS** |
| DOC-02 | Web guide documents the same P3 public behavior without claiming P4/P5 certification | P3 sections match code and explicitly assign drive hold to P4 | **PASS** |

## Judgment Matrix Summary

| Requirement group | Rows checked | PASS | FAIL | BLOCK |
|---|---:|---:|---:|---:|
| Authority clarifications | 6 | 6 | 0 | 0 |
| P3a safety/runtime | 12 | 12 | 0 | 0 |
| P3b accessibility/fuzz | 9 | 9 | 0 | 0 |
| Mutation evidence | 8 | 8 | 0 | 0 |
| Review-defect closure | 12 | 12 | 0 | 0 |
| Gates and exact claims | 9 | 9 | 0 | 0 |
| Documentation | 2 | 2 | 0 | 0 |
| **Total** | **58** | **58** | **0** | **0** |

## Independent Re-checks

| Check | Method | Result |
|---|---|---|
| Worktree anchor and integrity | git rev-parse HEAD; git status --short before report | f5dfc22; clean |
| Exact unit gate | Git archive of f5dfc22 in approved scratch storage, frozen offline install, full build, pnpm test | 152 files, **1,874/1,874 passed** |
| Types and static check | Same scratch archive | **11/11 type tasks**; Biome **0 errors**, 10 warnings |
| P3-focused unit behavior | Seven transaction/runtime/caps/diagnostics/status/accessibility/RAF test files | **71/71 passed** |
| Required browser totals | Raw final log summaries and exit markers | Chromium **209/209**; WebKit **207 pass + 2 accepted skips** |
| Coverage floors | Raw Chromium coverage summary | **92.78 / 82.65 / 95.21 / 95.56**, all floors met |
| Critical browser rows | Raw L_OPS_1, L_OPS_2, L_A11Y_1, FUZZ, MUTATION, ONE_WRITER, CAPS_STATUS, L_OPS_MAXP and L_OPS_MAXP_LATE lines | Green in Chromium and WebKit |
| Known failures | Source inventory plus both deciding summaries | Empty / zero |
| Evidence-to-HEAD relation | Commit and diff inspection | e6bc059 is final source; f5dfc22 adds only final trace evidence |

The first scratch unit attempt deliberately used only dependency symlinks and lacked generated package output; it discovered the exact 1,874-test inventory but produced four fixture-resolution failures. After a frozen offline install and successful full build in the scratch archive, the unmodified checkpoint source passed all 1,874 tests. Those setup failures are not product failures and no project file was modified.

## Defects and Remediation

No open P3 defect was found. Therefore there is no repair-ready defect specification, remediation order, fix proof requirement, or P3 re-judgment entry condition.

## Accepted Residual Limits (Non-blocking)

- M1 is a checker control; M4 and M8 are synthetic controls; all are labelled honestly. M7 belongs to P4.
- WebKit has no scrollend event; its conservative §5.8 fallback is normative, not a skipped correctness branch.
- FUZZ is seeded and deterministic rather than exhaustive; targeted rows cover the critical transaction, B, focus, cap, stale and fault decisions.
- measurement-unsupported has no reachable emitter because the S1 measurement fallback did not ship; retaining the stable code is not a missing P3 behavior.
- Firefox remains advisory under D5/D9 and its recorded macOS launch timeout is not counted as a deciding pass.
- packages/web/content/docs/guides/layout.mdx line 288 contains the older phrase “merged field by field.” That P1 wording predates P3 and is outside this P3 safety ruling; the controlling §5.1 kind-level rule, implementation and L-SPRING-3 remain unchanged. It should be handled as documentation drift in the appropriate authority scope, not used to fail P3.
- The raw P3 final directory omitted a unit log even though the self-judgment named the total. The tribunal independently reproduced the exact clean 1,874/1,874 result; this is evidence-hygiene debt, not an unverified gate.

## Scope Boundary

This tribunal does not certify take/move/release/cancel, release-dt, drive residuals, drive-hold invalidation, P5 frame/cost gates, or the iOS Native Grade claim. Those remain P4/P5 work. P3's hold judgment is limited to the crossfade/presence states that exist at P3, exactly as C3 and L-OPS-1 require.

## Final Ruling

The P3 implementation is transactional under engine faults, isolates user callbacks, applies the kill switch synchronously, enforces participant and mover caps with the required zero-read behavior, preserves exact status precedence, restores all layout-owned state, and enforces the follower/focus accessibility contract. The fuzz, one-writer, mutation/control and adversarial rows are green in both deciding engines under their declared labels. Exact gates are independently established: unit 1,874/1,874; typecheck 11/11; Chromium 209/209; WebKit 207 pass with two accepted Chromium-only skips; zero known failures; coverage 92.78/82.65/95.21/95.56.

# **TRIBUNAL PASS — P3 safety checkpoint**
