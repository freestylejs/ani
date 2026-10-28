# Tribunal Report: P4 Direct-Manipulation Drive (`p4_drive`)

## Verdict

- **Result: TRIBUNAL FAIL**
- **Target checkpoint:** P4 `p4_drive` only; this ruling does not certify P5.
- **Judged revision:** `848c9b7cebf7f69a30385ea89d3197caa7b893b1`, detached, contained by `origin/dev/ecstatic-ramanujan-1mjr9q`.
- **Code-under-test revision:** `1312c0feeb26053f9440b373fe2e836bc21b46db`; the only changes from that revision to the judged revision are the P4 final logs and self-judgment.
- **Defects:** one S1 essential defect, affecting three authority rows (live landing invalidation under kill switch/abort and consequently full L-DRIVE-4 conformance).
- **Date:** 2026-10-29.

The implementation and evidence establish almost all of P4, including the public seam, held-frame geometry, descendant residuals, release physics, reduced motion, re-take, follower rejection, mover cap, React routing, and the exact published gate totals. P4 nevertheless cannot pass while a `released` or `cancelled` landing—a live hold under P4-C3—is cleared by kill-switch or transactional abort without its public handle becoming `invalidated`.

## Authority Coverage

| File / evidence | Role | Included reason | Coverage result |
|---|---|---|---|
| `.trace/ani_ios_production/00_plan.md` | Program authority | Teleology, D1-D9, pipeline, P4 objective/gate | Covered |
| `packages/layout/ARCHITECTURE.md` §3.2/§3.3, §5.3, §5.7, §5.8, §5.10, §7.2/§7.3, §8, §9.1-§9.4, §11.2 L-DRIVE-1..6, §12 | Normative layout authority | Public contract, solver model, drive state machine, runtime, React, safety, acceptance, risks | Covered in full for the requested sections |
| `.trace/ani_ios_production/p4_authority_clarifications.md` C1-C11 | P4 supplemental authority | Resolves re-take, follower, live holds, cap, WAAPI/snap, scope, held probe, reduced no-fit, take reads, inherited velocity, sticky coverage | All C1-C11 mapped below |
| `.trace/ani_ios_production/p4_drive.md` | Implementer self-judgment | Claimed deliverables, totals, corrective history and residuals | Inspected as evidence, not treated as authority or verdict |
| `reviews/h13_review_20261029.md`, `h13_review_2_20261029.md` | Independent review history | Original S1/S2 findings and corrective-round rejection | Inspected; closure checked against later code/tests/logs |
| `logs/p4/`, `logs/p4fix/`, `logs/p4r2/`, `logs/p4r3/` | Execution history | Red/green progression and H13 repair evidence | Inspected, including all red-evidence summaries and final 1,892-unit run |
| `logs/p4-final/{chromium,webkit,chromium-coverage}.log` | Final deciding browser evidence | Full required-engine suites and browser coverage | Covered; exact totals verified |
| `packages/layout/src/{types,scope,solve}.ts`, `realize/raf.ts` | Core implementation | Surface, state, held reads, residuals, release, cleanup, frame ordering | Inspected directly |
| `packages/react/src/layout/{use_drive,context,index}.ts` | React implementation | Scope routing, ownership, implicit roots, StrictMode preservation, export | Inspected directly |
| `packages/layout/src/__tests__/drive.test.ts` | Unit evidence | Surface/preconditions/state/read counts/velocity | Inspected directly |
| `tests/browser/cases/layout_drive.ts` | Browser drive evidence | L-DRIVE-1..6, corrective and edge rows | Inspected directly |
| `tests/browser/cases/react_layout.ts` | React browser evidence | `RL_DRIVE`, `RL_DRIVE_STRICT`, follower rejection | Inspected directly |
| `tests/browser/cases/layout_ops.ts` | Safety/mutation evidence | M7 first-release-frame control and preserved P3 rows | Inspected directly |
| P3 baseline `46b1487` and current diff | Regression authority | Detect weakened H11b/H12/P3/N1-N3 evidence | No prior row removed or weakened; M7 changed from explicit deferral to an executable control |

## Judgment Matrix

| ID | Authority requirement | Evidence inspected / independent check | Result | Defect |
|---|---|---|---|---|
| P4-01 | Teleology: painted state is truth; exact motion or typed degradation | Held reads use `viewRect`; release starts from measured presentation; support failures diagnose/snap; browser oracle rows are frame-level | PASS | — |
| P4-02 | P4 scope only; do not substitute P5 scenes/certification | Plan P4 gate, drive rows and React rows inspected; no P5 certification inferred | PASS | — |
| P4-03 | Public `LayoutDriveVector`, state, handle, drive, `LayoutGroup.take`, `stats.holds` seam | `types.ts:23-54,101-139`; `layout/src/index.ts:19`; final unit/browser evidence | PASS | — |
| P4-04 | Gesture/layout responsibility boundary | Architecture §5.10; `use_drive.ts:7-16`; no pointer subsystem falsely claimed | PASS | — |
| P4-05 | `take` preconditions and validation-before-state-change, including runtime-snap before WAAPI and current take reads | `scope.ts:2435-2659`; `drive.test.ts` D1; L_DRIVE_EDGES; C5/C9 tests | PASS | — |
| P4-06 | Scope-local concurrency; siblings may coexist; same-scope ancestor/descendant exclusion; cross-scope bound documented | `scope.ts:2479-2493`; unit D1; L_DRIVE_FIX cross-scope row; C6 | PASS | accepted S3 bound |
| P4-07 | Reject exiting/invisible follower with `ANI_INVALID_OPTIONS` and typed diagnostic | `scope.ts:2466-2477`; `RL_DRIVE_FOLLOWER` in both engines | PASS | — |
| P4-08 | Normal state machine: finite move; release/cancel; non-finite rejection; terminal idempotence/warn-once | `scope.ts:2925-2998`; unit D1; L-DRIVE-4 stale-call evidence | PASS | — |
| P4-09 | Landing re-take validates first, catches current drawn B, invalidates old handle, writes new t=0 pose in the same task | `scope.ts:2450-2459,2661-2722,2908-2921`; L_DRIVE_FIX successful and failed re-takes; H13-05R/H13-05R2 red evidence | PASS | — |
| P4-10 | C3 `stats.holds` counts all live `held`/`released`/`cancelled` holds until finish/invalidation | `isLiveHold` at `scope.ts:388-397`; getter at `7178-7179`; corrective tests | PASS | — |
| P4-11 | One held rect read per held element per frame, before every write | `raf.ts:7-37`; `scope.ts:2007-2152,3544-3568`; unit read-count row | PASS | — |
| P4-12 | H remains fixed under scroll, parent scale, sticky self and sticky ancestor | L-DRIVE-3 source and Chromium/WebKit results: maximum reported error 0.0001 px | PASS | — |
| P4-13 | Held-read support probe covers owned animation/transition in held subtree; unsupported geometry invalidates with typed reason | `scope.ts:2029-2051`; L_DRIVE_EDGES descendant probe and support-failure rows | PASS | accepted documented 180° classification risk |
| P4-14 | Handle take velocity is drawn-origin velocity, including ancestor-carried motion | `scope.ts:2727-2761`; L-DRIVE-2 and L_DRIVE_FIX static, trackless, reflowing and driven-child rows | PASS | accepted nearest-animating-ancestor S3 bound |
| P4-15 | Flush while held updates A, size target/options, never H; flush while landing re-expresses without replay | `readHolds`, `heldTakeGeometry`, held/landing planning; L_DRIVE_EDGES and L_DRIVE_FIX size/position/landing rows | PASS | — |
| P4-16 | Descendants preserve residual motion and ride one common `h` while held, cancelled and landing; anchored/size/moving/static forms | `planResidual` and `solve.ts:765-914`; L-DRIVE-6 plus corrective cancel, anchor, kept-timeline and moving-child rows | PASS | — |
| P4-17 | Release velocity enters once; first release update has `dt=0`; descendant receives only residual + `ḣ` | `releaseHold`; `step`; unit D3; L-DRIVE-1/2/6; executable M7 wrong-first-frame control | PASS | — |
| P4-18 | Snap-back and cancel land exactly and restore authored styles | L-DRIVE-1, L-DRIVE-4, L_DRIVE_FIX cancel row in both engines | PASS | — |
| P4-19 | Held phase remains 1:1 under reduced motion; release uses jump/clamp/ignore; no-fit remains released+reduced; timeout is typed unsupported | `scope.ts:3076-3216`; L-DRIVE-5 policy/no-fit/refusal/landing-policy rows | PASS | — |
| P4-20 | Kill switch synchronously invalidates an actively `held` static or moving handle, restores, reports and unsubscribes | `snapToDisabled`; L-DRIVE-4 static-hold row; `RL_DRIVE` implicit-scope row | PASS | — |
| P4-21 | Kill switch invalidates **every live hold**, including C3 `released`/`cancelled` landings | `finishAll('disabled')` calls `invalidateHold`, but `invalidateHold` changes state only when it is exactly `'held'` (`scope.ts:1855-1865,6746-6748,6785-6837`) | **FAIL** | J-001 |
| P4-22 | Held node and all riding descendants count toward `maxNodes`; overflow invalidates and reports `'capped'` | `scope.ts:5225-5278,5324-5343`; L_DRIVE_FIX cap/onSnap row | PASS | — |
| P4-23 | Exception while actively held aborts transaction, invalidates handle, restores styles, clears marker/listeners/subscription, emits `internal-error` | `abort`; L_DRIVE_EDGES write/measure/listener/retake fault rows | PASS | — |
| P4-24 | §9.2 abort invalidates **every live hold**, including C3 `released`/`cancelled` landings | `abort` calls the same `invalidateHold` (`scope.ts:6468-6612`); a landing handle remains `'released'`/`'cancelled'` although its hold is removed | **FAIL** | J-001 |
| P4-25 | Removal, adoption, layoutKey, dispose and finish invalidate an actively held handle and stop reads | Unit D1/D4; L-DRIVE-4/EDGES lifecycle rows | PASS | — |
| P4-26 | React dispatcher routes to current explicit owner or ownerDocument implicit root and rejects unowned elements | `use_drive.ts`; owner map in `context.ts`; RL_DRIVE React 19 and 18 | PASS | — |
| P4-27 | React StrictMode same-task detach/reattach preserves registration and live hold | `context.ts:304-341`; non-vacuous ref counter in `RL_DRIVE_STRICT`; both React versions and engines | PASS | — |
| P4-28 | L-DRIVE-1 take/move/reorder/release/snap-back/cancel | Chromium/WebKit: held/reorder/release oracle error 0.0000 px; velocity variants and t=0 control | PASS | — |
| P4-29 | L-DRIVE-2 catch moving card, analytic velocity, no jump, size continuation | Chromium 566.7 px/s; size/release error 0.0001 px; WebKit equivalent | PASS | — |
| P4-30 | L-DRIVE-3 scroll, scaling parent, sticky self/ancestor, H invariant | Both engines report ≤0.0001 px | PASS | — |
| P4-31 | L-DRIVE-4 complete state machine per §5.10/§7.2 | Published cases pass the tested held-state paths, but omit and do not satisfy live landing invalidation | **FAIL** | J-001 |
| P4-32 | L-DRIVE-5 three reduced policies and policy changes | Both required engines pass full frame rows | PASS | — |
| P4-33 | L-DRIVE-6 descendants, residual + common h, release velocity once | Both engines: held 0.0000 px, landing 0.0001 px, velocity error 0.00 px/s | PASS | — |
| P4-34 | Edge coverage: support, current take geometry, size/position re-layout, landing flush, anchored/posed descendants, refused residual, cap, cross-scope | L_DRIVE_EDGES/L_DRIVE_FIX source, red evidence and final logs | PASS | — |
| P4-35 | Unit gate exact total | `logs/p4r3/unit.log`: 153 files, **1,892/1,892** tests; final code has no later code change | PASS | — |
| P4-36 | Chromium full gate exact total | `p4-final/chromium.log`: **223 passed, 0 failed, 0 known failures, 0 skipped** | PASS | — |
| P4-37 | WebKit full gate exact total | `p4-final/webkit.log`: **221 passed, 0 failed, 0 known failures, 2 Chromium-only skips** | PASS | — |
| P4-38 | Browser coverage exact totals and floors | `p4-final/chromium-coverage.log`: **92.30 / 80.35 / 95.47 / 94.77** statements/branches/functions/lines, over 90/80/95/92 | PASS | accepted 0.35 branch-margin S3 |
| P4-39 | Empty known-failure inventory | Every browser case module declares `{}`; final logs report 0 known failures | PASS | — |
| P4-40 | Preserve H11b/H12/P3/N1-N3 and mutation evidence | Baseline `46b1487..HEAD` diff: no `layout_meas.ts` change; no existing `layout_ops` row removed; only M7 deferral replaced by executable control; full prior rows remain green | PASS | — |
| P4-41 | H13 S1/S2 corrective history closed honestly | Red logs reproduce original cancel/size/landing/Strict/re-take/follower/cap faults; current code/tests close those named findings except the newly identified landing-invalidation variant | PASS as history/evidence | — |

## Judgment Matrix Summary

| Requirement group | Rows | PASS | FAIL | BLOCK |
|---|---:|---:|---:|---:|
| Authority/API/state/solver | 27 | 25 | 2 | 0 |
| L-DRIVE and edge acceptance | 7 | 6 | 1 | 0 |
| Gates/regression/history | 7 | 7 | 0 | 0 |
| **Total** | **41** | **38** | **3** | **0** |

## Defects

| ID | Severity | Authority source | Finding | Required correction |
|---|---|---|---|---|
| J-001 | **S1** | Architecture §7.2 kill switch; §9.2 transaction step 2; P4-C3 live-hold definition; L-DRIVE-4 | `invalidateHold()` only assigns `invalidated` when `hold.state === 'held'`. A `released` or `cancelled` landing remains live and counted by `isLiveHold`, yet kill-switch and abort cleanup remove it from the scope without changing its public handle state. Thus “holds become invalidated” is false for two live states, and the green suite samples only actively held faults/switches. | Make every cause that normatively invalidates a live hold transition `held`, `released`, and `cancelled` to `invalidated` before clearing it. Preserve `released`/`cancelled` only on normal landing completion. Add focused kill-switch and abort rows for both landing states, then rerun all gates. |

## Defect Disposition

### J-001 — live landing is cleared without public invalidation

**Essential defect.** P4-C3 defines `held`, `released`, and `cancelled` as live holds until finish or invalidation. The shared cleanup helper says it invalidates a hold, but at `scope.ts:1858` it changes only `'held'`; it then clears `p.hold`, the release track and riders. `finishAll('disabled')` and `abort()` both rely on that helper. Consequently:

1. `take` → `move` → `release` (or `cancel`) starts a still-running landing;
2. `layoutRuntime.setMode('snap')`, or an injected frame/flush exception, clears the landing and restores styles;
3. `stats.holds` becomes zero, but `handle.state` remains `'released'` or `'cancelled'`, not `'invalidated'`.

This is not a documentation-only discrepancy. It violates the public state machine and hides forced invalidation from a gesture/component owner holding the handle.

**Robust correction mandate.** Correct the invalidation primitive or its mandatory callers so all three `isLiveHold` states transition to `invalidated` for kill switch, abort, cap, removal/adoption, layout-key reset, dispose, finish, and support invalidation. Do not change natural landing completion: a successfully completed release/cancel may retain its terminal released/cancelled state. Do not special-case only the two new tests.

**Required tests.** At minimum, in both Chromium and WebKit:

- release a nontrivial landing, switch runtime to snap before settle, and assert handle `invalidated`, styles restored, `stats.holds === 0`, clock/listeners stopped, typed diagnostic/onSnap behavior;
- repeat for a cancelled landing;
- release/cancel a landing, inject a frame write or measure failure before settle, and assert handle `invalidated`, failed cleanup/report/diagnostic, byte-exact restoration, no pending marker/listener/subscription;
- retain existing normal-completion assertions proving an undisturbed release/cancel remains `released`/`cancelled`.

**Forbidden workaround.** Do not redefine a live landing as non-live, weaken P4-C3/§7.2/§9.2, merely change `stats.holds`, or alter the tests to accept a stale terminal state.

## Independent Re-checks

| Check | Method | Result | Evidence |
|---|---|---|---|
| Worktree identity and cleanliness | `git status --short --branch`, `git rev-parse HEAD`, remote containment | PASS | Detached clean HEAD `848c9b7`; authoritative remote contains it |
| Final-log/code correspondence | `git diff --name-status 1312c0f..HEAD` | PASS | Only `p4-final` logs and `p4_drive.md`; no code/test delta |
| Exact browser totals | Direct final-log inspection | PASS | Chromium 223; WebKit 221 + 2 skips; no failures/known failures |
| Exact coverage | Direct final coverage-log inspection | PASS | 92.30/80.35/95.47/94.77 |
| Exact unit total | Direct `p4r3/unit.log` inspection and commit-chain audit | PASS | 153 files, 1,892 tests; no later code delta |
| Prior-row preservation | Diff from P3 tribunal revision `46b1487` | PASS | Existing P3/layout-ops rows retained; M7 strengthened; `layout_meas.ts` unchanged |
| Source-level live-state trace | Followed `isLiveHold` → `invalidateHold` → `finishAll('disabled')`/`abort` | **FAIL** | Deterministic missing state assignment for released/cancelled landing |
| Focused unit rerun | Attempted Vitest from detached worktree | Not executed | Detached tribunal worktree intentionally has no `node_modules`; using the main checkout’s binary still could not resolve the detached worktree’s extended tsconfig without writing dependency links. No source/worktree mutation was made. Existing green logs remain inspectable but do not cover J-001. |

## Accepted S3 Bounds (Non-blocking)

The following owner-accepted S3 bounds are honestly visible in the implementation/evidence and do not cause this FAIL:

1. ancestor-carried take velocity uses the nearest animating participant ancestor rather than a full composed derivative through every scale layer;
2. ancestor/descendant hold exclusion is scope-local, so cross-scope nested holds remain a documented bound;
3. browser branch coverage is only 0.35 percentage points above its floor;
4. box-preserving 180° rotation/zoom classification remains a documented support risk.

Firefox launch evidence is advisory under D5/D9 and does not decide P4. This tribunal makes no P5 scene or cost certification claim.

## Remediation Order

### Remediation Order for P4 `p4_drive`

**Defect IDs:** J-001.

1. Repair live-hold invalidation semantics for `released` and `cancelled` landings without changing normal completion.
2. Add non-vacuous browser rows for kill-switch and transactional abort during both landing states.
3. Add/extend focused unit state-machine coverage for the same transitions.
4. Re-run the focused drive/React/M7 rows in Chromium and WebKit.
5. Re-run the complete unit, type, format/lint, Chromium, WebKit and Chromium-coverage gates; retain empty known failures and all prior P3/H11b/H12/N1-N3 rows.

## Fix Proof Report Requirements

Before re-judgment, the fixer must submit a proof report containing:

- changed files and exact commit;
- root-cause explanation distinguishing live forced invalidation from normal landing completion;
- test names for release/cancel landing × kill-switch/abort;
- focused command outputs for Chromium and WebKit;
- full unit total, full browser totals, exact coverage percentages and known-failure count;
- explicit mapping to Architecture §7.2, §9.2, P4-C3 and L-DRIVE-4;
- confirmation that no P3/H11b/H12/N1-N3 row or tolerance was weakened;
- residual risks.

## Re-Judgment Entry Criteria

- J-001 correction is committed on the authoritative branch and inspectable.
- All required focused rows demonstrate handle state `invalidated` for forced cleanup of released and cancelled landings.
- Normal release/cancel completion remains terminal without false invalidation.
- Full required-engine and unit gates are green with empty known failures and coverage above the existing floors.
- The proof report above is present.

Absent implementation/test evidence leaves the next ruling **FAIL**; inaccessible required artifacts would produce **BLOCK**.

## Final Ruling

**P4 `p4_drive`: TRIBUNAL FAIL.** The checkpoint has a strong and largely complete evidence body, and the published exact totals are verified. However, a green suite cannot override the source-proven violation of the live-hold state contract. P4 may return for re-judgment after J-001 is repaired and proven in both required engines. P5 is not judged or certified here.
