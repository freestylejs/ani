# Tribunal Report: CP3 — pure core and CP2 J-001/J-008 re-judgment

## Verdict

TRIBUNAL FAIL

- Target: `plan.md:97–109`, T3.1–T3.4/V3, plus carried J-001 and J-008.
- Frozen HEAD: `6485ad804c7eaa79bf82b54ebf7cc1cd9fe3566f`; reviewed `a920df7..6485ad8`, including `8fb988e` and `2297189`.
- Date: 2026-10-23 UTC. Seven new defects: five S0 and two S1. Both carried defects are resolved.
- Implementation was not modified. All Node, pnpm and browser execution used the specified Linux mirror. CP4+ implementation and acceptance are excluded.

## Authority Coverage

| File | Role / included reason | Coverage result |
| --- | --- | --- |
| `packages/layout/ARCHITECTURE.md` | Single architecture authority; §§3–6, 8–9, 11–12 control this trial | Visual-space correction accepted; implementation failures below |
| `.trace/ani_layout_final/plan.md:76–109,173–185` | Carried S1 gate, CP3 tasks, V3, trial protocol | T3.1 passes; T3.2–T3.4 and V3 require correction |
| `.trace/ani_layout_final/00_documentation_drift.md` | K1–K14 and drift decisions | K1/K14 accepted; K8's literal floor is not fully implemented |
| `.trace/ani_layout_final/source_decision.md` | Complete approved source, with both questions answered | Reconciled against the higher authority; source record unchanged |
| `.trace/ani_layout_final/cp3_pure_core.md` | Implementer's completion/fix claims | Commands reproduce; blanket PASS is not sustained |
| Earlier `cp1_authority_trial_result.md`, `cp2_spikes_trial_result.md`; CP1/CP2 proof reports | Prior dispositions and re-entry criteria | J-001/J-008 re-judged below; other closed defects are not reopened |
| Four pure modules, six new test/helper files, three changed S1 files; Git diff/history | Actual implementation and validation | Fully inspected within CP3/carried scope |
| `/Users/june/.claude/skills/judging-checkpoint-completion/SKILL.md` | Requested judicial method | Followed; no new harness or separate evidence file required |

## Judgment Matrix Summary

| Requirement group | Rows checked | PASS | FAIL | BLOCK |
| --- | ---: | ---: | ---: | ---: |
| Carried J-001/J-008 | 2 | 2 | 0 | 0 |
| T3.1–T3.4 | 4 | 1 | 3 | 0 |
| V3 clauses, mapped below | 7 | 3 | 4 | 0 |
| Required command checks | 3 | 3 | 0 | 0 |

| Authority requirement | Evidence / decision | Result |
| --- | --- | --- |
| J-001: visual tracks, full parent maps, endpoints and identity settle | `solve.ts:302–315`; `oracle.ts:148–164`; `solve.test.ts:243–361`; independent DOM and 400-seed checks below | PASS |
| J-008: independent reveal truth, replay/no-op distinction, missing-observation failure, K14 | `spike_s1_fixture.ts:44–55,90–96,131–136`; `spike_proto.ts:146–184`; Chromium/WebKit and observation-removal control below | PASS |
| T3.1 geometry | `geometry.ts:38–114`; composition/inversion, origin projection and own-map inversion tests | PASS |
| T3.2 motion | Defaults, merge, validation codes, stateful rejection and reduced-motion clamp pass; infinite initial derivative is silently approximated | FAIL: J-014 |
| T3.3 tracks/solve | Rest `k=0`, ordinary unclamped momentum, delay hold, modes, full-map projection, fade weights and radius arithmetic pass; follower ordering, anchored velocity and floor domain fail | FAIL: J-009/J-011/J-014/J-015 |
| T3.4 planner | Ordinary threshold/keep/retarget, new/retained-node handoff, crossfade opt-outs/opacity warning, duplicate warning, dependency exclusion, unsupported propagation and stale flag pass; anchor decisions, existing-node handoff and culling/cap fail | FAIL: J-010/J-012/J-013 |
| V3: seeded trees/inner maps and identity settle | 400 seeds, 4,895 nodes independently checked; 100-seed identity test passes | PASS |
| V3: endpoints and incoming derivatives | Ordinary linear/ease/spring cases pass; anchored and singular-bezier retargets do not preserve incoming velocity | FAIL: J-011/J-014 |
| V3: size floor only when binding | Normal endpoints ≥1 pass; accepted positive subpixel endpoints lower the interior floor | FAIL: J-015 |
| V3: keep versus retarget | Anchored position-target changes can incorrectly keep the old track | FAIL: J-010 |
| V3: planner snap reasons | Unsupported/stale and ordinary cap/cull cases pass; offscreen descendants incorrectly count toward the visible cap | FAIL: J-013 |
| V3: invalid-option error codes | 15 invalid-option cases include `dynamicSpring`, all with `ANI_INVALID_OPTIONS` | PASS |
| V3: no DOM/clock imports | Imports inspected in all four modules; only permitted Core timing/error/DEV/policy exports and pure-module dependencies | PASS |

Source filenames in this matrix abbreviate `packages/layout/src/` and its `__tests__/` directory; S1 files are under `tests/browser/cases/`. Reduced-motion jump, live policy application, retained-box expiry, DOM unsupported detection, restoration and presence release belong to the later shell checkpoints; their absence is not a CP3 defect.

## Defects

| ID | Severity | Authority source | Finding / implementation evidence |
| --- | --- | --- | --- |
| J-009 | S0 | Architecture §5.6, `:271–274`; T3.3/V3 | `packages/layout/src/solve.ts:207–209,240–242` assumes a follower's lead was already evaluated, although the declared ordering only requires parents first. The planner's legal `[follow(lead=1), track]` output draws the follower at its own A and assigns zero velocity. Existing `solve.test.ts:564–605` tests only lead-first order. |
| J-010 | S0 | Architecture §5.4–§5.5, `:254–263`; T3.4/V3 | `packages/layout/src/plan.ts:122,319–325` ignores all position changes whenever `anchor` is present. It misses an anchored child's changing discrepancy under a stationary parent, keeps a running track when its position target changes, and ignores root position changes even though root anchors must be ignored. |
| J-011 | S0 | Architecture §3.3 invariant 4 and §5.1, `:115–116,213–226`; T3.3/V3 | `packages/layout/src/solve.ts:112,117–124` discards origin momentum for anchors; `:193–199,263–279` interpolates offsets without incoming relative velocity. A genuine anchored retarget changes velocity from 100 to 150 px/s without a binding size floor. The random oracle checks the same unseeded offset path (`solve.test.ts:207–224`), not the required incoming anchored velocity. |
| J-012 | S0 | Architecture §5.6, `:267–274`; T3.4 | `packages/layout/src/plan.ts:248–252` suppresses handoff and crossfade when the newly selected lead already has a before-box. Lead change is the contract's condition; a new mount is not required. Returning to a still-registered card from an exiting detail can produce no tracks at all. |
| J-013 | S1 | Architecture §9, `:437–438`; T3.4/V3 | `packages/layout/src/plan.ts:358–360` exempts descendants of moving ancestors from culling, then `:365–375` counts their offscreen tracks toward `maxNodes`. One visible mover plus one wholly offscreen child can incorrectly cap the whole flush. |
| J-014 | S0 | Architecture §5.1/§7.1, `:212–228,367`; T3.2/T3.3/V3 | `packages/layout/src/motion.ts:231–236,268–275` recognizes an infinite native-bezier initial derivative, then substitutes a finite secant. `validateMotion` accepts it. Reported velocity can equal the seed while the actual path has an infinite initial derivative and a large excursion. |
| J-015 | S1 | Architecture §5.1, `:221–223`; drift K8; T3.3/V3 | `packages/layout/src/solve.ts:160,169` implements `min(1,A,B)`, not the specified one-pixel floor. `__tests__/oracle.ts:111` copies that exception. Positive subpixel endpoints have no stated exclusion, yet allow an interior size below one pixel. The proof report discloses the formula but does not establish an authority amendment. |

Numeric reproductions used the frozen production modules bundled by esbuild with `write:false` and imported from memory; no implementation/test files were edited. Boxes below are visual CSS-pixel coordinates; omitted y/height remain constant.

| Defect | Reproduction and actual command output | Required result |
| --- | --- | --- |
| J-009 | Old exiting root `(x,w)=(10,80)` precedes new lead A `(200,400)`, linear D=1. Planner emits `[follow,track]`. At t=.5: `drawn=[{x:10,w:80},{x:105,w:240}]`, `velocities=[{x:0,w:0},{x:190,w:320}]`. | Both boxes `(105,240)` and both velocities `(190,320)`; ordering must not change the result. |
| J-010 | True-layout, unchanged size 20, anchor `{0,0}`, x:0→100. Root: `actions=[none]`; with stationary participant parent: `[none,none]`. Running anchored target x:100→200 with unchanged size: `positionOnlyAction="keep"`. | Root anchor ignored and ordinary position track created; child's discrepancy tracked; changed running target retargeted. |
| J-011 | Stationary parent; old anchored x:0→100, D=1, sampled at .5 gives x=50 and v=100. Retarget to x=200 and width 40 from width 20, D=1. Output: `sizeAndPositionAction="track", newVelocity.x=150, k=[0,0,-20,0]`. | Position remains 50 and incoming x velocity remains 100. Width change ensures this is an actual retarget, independently of J-010. |
| J-012 | Existing card index 0 at x=10, order 1; prior detail lead index 1 at x=200, order 2, now exiting; both have before-boxes and id `x`. Output: `lead=0, actions=[none,none]`. | Card takes B=200 from the departing detail and animates to A=10; qualifying crossfade is planned. |
| J-013 | Viewport x=0..1000, margin 100; visible parent x:0→100; child x:2100→2000, width 20, parent index 0; `maxNodes=1`. Output: `status="capped", actions=[none,none], snapped=[0:capped,1:capped]`. | Offscreen child is culled and uncounted; one visible mover does not exceed the cap. Preserve required counter-projection under its parent. |
| J-014 | Accepted `timing.bezier({p2:{x:0,y:1},p3:{x:1,y:1}})`, x:0→100, v=100, D=1. Output: `slope0=1731.384108814013, reported=100`; forward velocities at h=1e-7/1e-8/1e-10 are `374617.51 / 1558945.73 / 17147402.99`; x(.001)=`-167.2820508744315`. | No false finite derivative. This curve has e′(0)=+∞, so the stated finite polynomial cannot cancel it. Establish a valid timing domain and reject an unsolvable timing synchronously with the required code, or provide an explicit authority-consistent resolution. |
| J-015 | Width/height B=10, A=.5, incoming size velocity -100, linear D=1, t=.5: `SUBPIXEL_FLOOR {x:0,y:0,w:0.5,h:0.5}`. Endpoints are positive; target/before ratio .05 is within the stated scale range. | Enforce the stated floor on supported tracks and reconcile subpixel endpoints with exact endpoints/settle; no unstated endpoint-dependent floor. |

## Defect Disposition

| ID | Essential defect / completion impact | Robust correction mandate | Re-judgment evidence |
| --- | --- | --- | --- |
| J-009 | Follow references are evaluated as if they were parent-order references; shared boxes diverge. | Resolve follower boxes and velocities independently of registration/index order while preserving parent-first projection. Do not merely reorder the existing test to put the lead first. | Existing pure suites exercise planner output with follower before/after lead, including nested participants, and compare visual boxes/velocities. |
| J-010 | Anchor displacement is missing from planner movement/target decisions. | Use effective anchor rules only with a participant parent; detect changing anchor discrepancies and position targets. Keep truly unchanged tracks. | Root-ignore, stationary-parent offset change and running position-only target-change regressions. |
| J-011 | Replacement anchor channels have no momentum seed. | Carry the relative anchor-point velocity, accounting for parent and size velocities, through the offset path and its derivative. Preserve the own-timeline delay rule. | Retarget finite differences and analytic output match the incoming visual velocity, including the numeric case above. |
| J-012 | Handoff incorrectly depends on absence of the new lead's capture. | Base handoff on lead change; use the departing drawn box/velocity even when the arriving lead was already registered. Retain all crossfade gates. | Existing-node return handoff, moving departing lead and qualifying/nonqualifying crossfade tests. |
| J-013 | The visible-mover budget counts offscreen descendants. | Apply the documented cull policy before cap accounting, while retaining counter-projection where necessary. | Numeric case yields an uncapped visible parent and a reported, uncounted culled child. |
| J-014 | A secant is presented as a finite derivative where no finite derivative exists. | Handle the known infinite-derivative case before frames; document any necessary timing-domain clarification. Do not report the algebraic seed as proof of actual path continuity. | Synchronous validation/error-code result or an inspectable coherent alternative, plus independent shrinking-step derivative tests for accepted curves. |
| J-015 | Implemented floor and supported endpoint domain contradict the written contract. | Reconcile the domain/floor explicitly, preserving exact B/A and identity settle for supported tracks; enforce any unsupported boundary rather than silently lowering the floor. | Subpixel endpoint regression plus ordinary binding/nonbinding floor and endpoint checks; authority/proof records agree. |

## Independent Re-checks

Every executable command used:

```sh
ssh -o KexAlgorithms=curve25519-sha256 -o BatchMode=yes june-wsl \
  'source ~/ani-v2/env.sh; cd ~/ani-v2/lay-judge-cp3_pure_core && <command>'
```

WebKit additionally sourced `~/ani-v2/sysroot/webkit-env.sh` after `env.sh`. The mirror has no `.git`; an initial Git command therefore did not run tests. Content identity was established separately before relying on results.

| Check | Command or method | Result / evidence |
| --- | --- | --- |
| Mirror identity | SHA-256 over ordered paths and contents of all 563 Git-tracked files, local versus remote | Both `2e3278bdb2e03e3df142eac0242f0fcb0d80def19cd247a2900bd0cc5166e73c`; `MATCH: True` |
| Pure suites | `pnpm -s vitest run layout/src/__tests__/{solve,plan,geometry,motion}.test.ts` | Exit 0: `Test Files 4 passed (4)`, `Tests 64 passed (64)` |
| Typecheck | `pnpm -s --filter @freestylejs/ani-core build && cd packages/layout && npx tsc --noEmit --skipLibCheck` | Core build succeeds; tsc exit 2 reports only `../../tests/browser/cases/cpc_harness.ts(1,50): TS2307 Cannot find module '@freestylejs/ani-layout'`. This is the explicitly allowed CP4 deletion item; no new-module error. |
| Biome | `npx biome check` on the four modules, six new test/helper files and three changed S1 files | Exit 0: `Checked 13 files ... No fixes applied. Found 240 infos.` No errors/warnings from Biome. |
| Chromium S1 | `pnpm test:browser --browser chromium --case 'spike*:S1_*'` | `16 passed, 0 failed, 0 known failures (74.4 s)` |
| WebKit S1 | `pnpm test:browser --browser webkit --case 'spike*:S1_*'` | `16 passed, 0 failed, 0 known failures (76.4 s)` |
| S1 build/control details | React 19.2.1/18.3.1 × plain/compiled | All runs: violations/missing/unchecked 0. Every Suspense run: reveals 6. Transition no-refresh controls: 90 violations, max 37.3 px. WebKit React 19 plain/compiled: handoffs 1. Firefox rerun was optional and was not performed. |
| Independent reveal certification | In-memory Chromium diagnostics using actual React `onCommitFiberRoot`, touch/probe counts, and flush truth | Three boundary-only reveal commits each report `touches=2, probes=1, loading=false`; subsequent flush has `truth=true, reveal=true, hasCapture=true`. |
| Reveal-observer sensitivity | Remove only the in-boundary Probe in the in-memory bundle | Actual independent commits have `touches=2, probes=0`; scenario rejects with `S1 failed ... unchecked 3, reveals 3`. Thus a missing reveal observer no longer silently passes. |
| J-001 real DOM | Chromium, original parent scaleX(.8), left 0→100, child left 50; apply frozen solver poses at t=0/.5/2 | B parent/child x=0/40; A=100/140. At .5: parent x=50, child x=40, child tx=-62.5, sx=1. At 2: both poses identity, rects x=100/140. Widths remain 160/80. |
| General projection/oracle | Evaluate existing 400-seed generator and oracle in memory; compare independent CSS composition with solver poses | 4,895 nodes; max absolute error `2.034994395216927e-11`, max relative error `2.7791127058243765e-14`. Absolute error satisfies 1e-9 despite the test's relative assertion. |
| New defect reproduction | Remote stdin Node/esbuild `write:false`, frozen pure-module imports | Numeric outputs in the Defects table. One initial diagnostic stopped when J-010 returned `keep` rather than a track; the corrected diagnostic forced an independent size retarget and reproduced J-011. |
| Scope/integrity | `git diff --check a920df7..6485ad8`; diff/import inspection | Clean diff; no Core/React/web implementation changes in the trial diff; no DOM or clock imports in the pure modules. |

J-001 is resolved in general: the solver chooses P such that P(X)=Mparent⁻¹(V), and its full map composes Mparent∘P∘Q. The independent oracle applies Q, then P about the same origin, then each ancestor's Q/P; it imports no implementation geometry/solver code. At settle A=Mparent,rest(X), so induction gives identity poses at every level. The declared changing-presence visual layer remains a CP4 browser requirement, not an early engine demand.

J-008 is resolved. New content is counted once, actual reveal commits are probed, and unobserved relevant movement/reveals fail. K14 is sound within the stated same-root trigger contract: the flush's post-commit A is the next render's before-box, and immediate expiry forces a later touch to refresh it. WebKit exercises that handoff. This accepts the prototype and contract, not an unbuilt React adapter.

## Remediation Order

1. Repair J-009 and J-012's shared-id data flow; prove planner output works directly with the solver, including return to an existing lead.
2. Repair J-010's anchor planning, then J-011's anchor momentum; preserve ordinary keep-versus-retarget behavior.
3. Repair J-013's culling/cap accounting without dropping required descendant counter-projection.
4. Resolve J-014's timing domain and J-015's subpixel/floor contract, then enforce and test the resulting boundaries. Do not silently weaken the published continuity/floor claims.
5. Update the existing CP3 proof report and rerun the existing four suites, typecheck and changed-file Biome. Retain resolved J-001/J-008 coverage; rerun S1 if its files or commit contract change.

## Fix Proof Report Requirements

Submit the proof in `.trace/ani_layout_final/cp3_pure_core.md` or the conversation: changed files, rationale per J-009–J-015, exact commands/results, before/after numeric reproductions, T3.1–T3.4/V3 mapping, any authority/domain decisions, and residual risks. Use existing tests; no separate harness, fixture or evidence-file system is required.

## Re-Judgment Entry Criteria

- A frozen inspectable correction and proof report for every new defect, with the prescribed pure-suite, typecheck and Biome results.
- Direct tests establish follower/lead equality in legal orderings; anchor target changes and incoming velocity; existing-lead handoff; visible-only cap accounting; coherent timing and size-floor domains.
- J-001's visual track/identity proof and J-008's independent-reveal sensitivity remain intact. Unchanged 64/64 output without these regressions remains FAIL.
- Missing corrected outputs/access would produce BLOCK. The known CPC harness typecheck error remains accepted only within this CP3 scope.

## Final Ruling

CP3 is rejected. The coordinate/projection correction and stricter S1 observation close both carried defects, and all required current commands reproduce their reported results. Seven independently reproduced CP3 defects prevent the pure core and V3 from satisfying the written contract. Corrective pure-core work and re-judgment are required; no CP4+ implementation is ordered here.

## Fix directive for the implementer

- **J-009:** In `packages/layout/src/solve.ts`, resolve follower drawn boxes and velocities when their lead occurs later in the parents-first array. In `packages/layout/src/__tests__/solve.test.ts` and `packages/layout/src/__tests__/plan.test.ts`, feed actual planner pairs to the solver in both legal root orders and with nested participants; prove equal boxes/velocities throughout.
- **J-010:** In `packages/layout/src/plan.ts`, include effective anchor discrepancy/position-target changes in mover and keep decisions, and ignore anchors without a participant parent. Extend `packages/layout/src/__tests__/plan.test.ts` with the root, stationary-parent and running position-only target-change cases above, proving B at start and A at settle.
- **J-011:** In `packages/layout/src/solve.ts` and `packages/layout/src/plan.ts`, seed and evaluate anchor-offset momentum from the incoming visual anchor-point velocity relative to the parent. Extend `packages/layout/src/__tests__/solve.test.ts`, `packages/layout/src/__tests__/plan.test.ts`, and the independent expectation in `packages/layout/src/__tests__/oracle.ts` as needed; prove 100→100 px/s in the cited retarget and continuity with moving/scaling parents. Do not derive expected incoming velocity from the replacement track.
- **J-012:** In `packages/layout/src/plan.ts`, remove the new-mount-only handoff restriction and apply departing drawn B/velocity whenever the lead changes. Extend `packages/layout/src/__tests__/plan.test.ts` to prove return to an existing registrant, moving handoff, and unchanged crossfade gates.
- **J-013:** In `packages/layout/src/plan.ts`, cull wholly offscreen descendants and exclude them from the visible-mover cap while preserving necessary counter-projection. Extend `packages/layout/src/__tests__/plan.test.ts` to prove the cited maxNodes=1 case remains uncapped and reports the child as culled.
- **J-014:** In `packages/layout/src/motion.ts`, stop substituting a finite secant for a known infinite e′(0); enforce a coherent synchronous timing-domain rule with `ANI_INVALID_OPTIONS`, or supply a mathematically valid authority-consistent alternative. Add the native-bezier counterexample and shrinking-step derivative checks to `packages/layout/src/__tests__/motion.test.ts` and `packages/layout/src/__tests__/solve.test.ts`. Record any required contract clarification in `packages/layout/ARCHITECTURE.md` §5.1 and `.trace/ani_layout_final/00_documentation_drift.md`; keep the approved source verbatim.
- **J-015:** Reconcile `packages/layout/src/solve.ts`'s `min(1,A,B)` rule with `packages/layout/ARCHITECTURE.md` §5.1 and drift K8. Define/enforce the supported subpixel endpoint behavior, using `packages/layout/src/plan.ts` if a typed unsupported disposition is required. Update `packages/layout/src/__tests__/oracle.ts`, `packages/layout/src/__tests__/solve.test.ts` and, if planning changes, `packages/layout/src/__tests__/plan.test.ts`; prove the stated floor, exact supported endpoints and identity settle together. An implementation-only exception is insufficient.
