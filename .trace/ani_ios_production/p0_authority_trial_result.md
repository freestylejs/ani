# Tribunal Report: P0 `p0_authority`

## Verdict

- Result: **TRIBUNAL FAIL**
- Target checkpoint: P0 / `p0_authority`, commit `4b194dc989706cb5b3e761220b63bf09a8031681`
- Plan directory: `.trace/ani_ios_production/`
- Evidence inspected: `.trace/ani_ios_production/00_plan.md`, `p0_drift.md`, `p0_authority.md`, `packages/layout/ARCHITECTURE.md`, signed design `.trace/ani_layout_ios/architecture.md`, `packages/core/src/API.md`, and relevant current code in `packages/layout/src/scope.ts` / `dom.ts`
- Date: 2026-10-27 (Asia/Seoul)
- Defects: **2 S0, 4 S1, 1 S3**
- Blocked rows: none

## Thesis / Antithesis / Synthesis

**Thesis.** The checkpoint claims that the drift matrix is closed, `packages/layout/ARCHITECTURE.md` is the approved v3 design made implementation-grade, the hard migration is complete at authority level, and every refinement beyond v3 is sound.

**Antithesis.** The hard-migration text is substantially present, the frame-aging refinement is conservative, the status-precedence order matches v3, and every syntactic section reference resolves. However, two new refinements permit unreported wrong visible motion, the new support-check equation falsely rejects valid supported trees, capture-less reporting changes the signed public degradation contract, the P0 core API documentation deliverable is not done, and DR-18's performance reference remains non-reproducible.

**Synthesis.** P0 cannot pass. The authority is close in coverage, but the checkpoint gate is semantic, not textual: refinements must preserve “snap, never wrong motion.” The §5.7 and §5.10 refinements fail that bar directly, and the remaining S1 defects leave required P0 authority work incomplete or unverifiable.

## Authority Coverage

| File | Role | Included reason | Coverage result |
|---|---|---|---|
| `.trace/ani_ios_production/00_plan.md` | P0 objective and gate | Defines P0 deliverables and “no contradiction” gate | **FAIL** — explicit core API doc deliverable at line 81 is deferred without a plan amendment |
| `.trace/ani_layout_ios/architecture.md` | Signed v3 design | Normative design baseline | **FAIL** — §4.4 reporting materially diverges from v3 §3.5; refinements in §5.7/§5.10 are not sound |
| `packages/layout/ARCHITECTURE.md` | Single package authority | Primary P0 output | **FAIL** — J-001..J-004 and J-006 |
| `.trace/ani_ios_production/p0_drift.md` | Drift matrix | Required P0 drift closure | **FAIL** — DR-18 is not closed to a reproducible gate; DR-14 is contradicted by “onSnap stays as it is” wording |
| `.trace/ani_ios_production/p0_authority.md` | Implementer self-judgment | Execution evidence | **FAIL** — line 83 says the core API note is “explicit in the plan” as P1, while `00_plan.md:81` assigns it to P0 |
| `packages/core/src/API.md` | P0 core API note target | Plan explicitly names core API doc for `physics` | **FAIL** — no `physics` or `inFrame` documentation exists at this commit |
| `packages/layout/src` | Current-code reconciliation | Required where the authority/design says behavior stays “as today” | **PASS with S3 note** — current `onSnap` is demonstrably not isolated, so authority line 917 must not say it “stays as it is” |

## Judgment Matrix Summary

| Requirement group | Rows checked | PASS | FAIL | BLOCK |
|---|---:|---:|---:|---:|
| P0 required outputs and plan consistency | 4 | 3 | 1 | 0 |
| Hard migration / drift closure | 5 | 4 | 1 | 0 |
| Capture, support check, rendering-interval contract | 5 | 3 | 2 | 0 |
| Keep test / re-expression / L-MEAS-4,7 | 3 | 2 | 1 | 0 |
| Drive hold / descendant release | 2 | 1 | 1 | 0 |
| Safety degradation / status precedence | 3 | 2 | 1 | 0 |
| Acceptance / cost-gate testability | 3 | 2 | 1 | 0 |
| Current-code “as today” reconciliation | 2 | 1 | 1 | 0 |
| **Total** | **27** | **18** | **9** | **0** |

The nine failed rows collapse to the seven essential defects below; several rows are different authority consequences of the same root defect.

## Defects

| ID | Severity | Authority source | Finding | Required correction |
|---|---|---|---|---|
| J-001 | **S0** | `packages/layout/ARCHITECTURE.md:580-599`; L-MEAS-4 at 1150 | A kept child's raw `δ = A_new - A_old` re-expression is wrong under a live scaling ancestor and can jump away from measured B on the first frame. | Make kept-track re-expression ancestor-map-aware, or retarget from measured `(B,v)` whenever an exact re-expression cannot be proven. |
| J-002 | **S0** | `packages/layout/ARCHITECTURE.md:740-744`; signed v3 `architecture.md:455-466` | On release, every held descendant independently animates the common hold displacement under its **own** motion; differing child/parent motion makes descendants visibly detach from the held parent. | Keep the inherited hold/release displacement as one common parent map/layer; descendant motion applies only to residual descendant motion. |
| J-003 | **S1** | `packages/layout/ARCHITECTURE.md:300-307` | §4.2 propagates `parent S = rect/offsetWidth` as exact scale. Integer rounding in the parent's `offsetWidth` biases descendant expected scale and falsely snaps valid geometry at small, normal, and large scales. | Do not propagate a rounding-contaminated measured S as exact. Use known composed scale or an explicit error interval/bound that preserves the no-false-positive contract. |
| J-004 | **S1** | `packages/layout/ARCHITECTURE.md:358-368,1029,1047`; signed v3 `architecture.md:239-248` | Capture-less undriven nodes are now “not reported,” contradicting signed v3's per-node `snapped:'stale'` contract and §9.1's normative report row. | Restore an exhaustive conservative stale-reporting rule, or obtain an explicit design/owner amendment defining `report.snapped` as best-effort. |
| J-005 | **S1** | `00_plan.md:81`; `p0_authority.md:15,83`; `packages/core/src/API.md` | The plan explicitly requires the core API doc in P0, but the self-judgment defers it to P1. No `physics` or `Clock.inFrame` note exists. | Add the P0 core API contract note (clearly marked planned for P1 implementation if necessary) or amend the plan through the program authority before re-judgment. |
| J-006 | **S1** | `p0_drift.md:42`; `packages/layout/ARCHITECTURE.md:1214-1233` | DR-18 is not truly closed: “Xeon class, 2.8 GHz” does not identify a reproducible reference machine, and the per-run aggregation for commit/sustained cost gates is not specified. | Pin a reproducible machine/image and complete benchmark sampling/aggregation protocol so an independent runner gets an unambiguous pass/fail. |
| J-007 | **S3** | `packages/layout/ARCHITECTURE.md:914-917`; `packages/layout/src/scope.ts:1868-1869`; `p0_drift.md:38` | “`onSnap` stays as it is, isolated the same way” is factually wrong for current code; current `onSnap` is called directly without isolation. §9.2 correctly specifies the future behavior, so this is a misleading authority phrase rather than a missing safety rule. | Say the `onSnap` API surface stays, while callback isolation is a P3 behavior change. |

## Defect Disposition

| ID | Essential defect | Why it breaks completion | Robust correction mandate | Re-judgment evidence |
|---|---|---|---|---|
| J-001 | The new kept-track change-of-space is translation-only even when the node's old track space is under a non-identity ancestor map. | The essential rule is exact visible continuity. A presented scroll under a parent at scale 0.5 can move the child's measured B by 10 px while rest-space A/L move by 20 px; translating the visual track by 20 px creates a 10 px wrong first frame. | Replace raw rest-space `δ` with an exact mapping into the track's visual space using the relevant ancestor maps. If exact keep cannot be established, retarget from measured `(B,v)`. Do not retain a raw-`δ` fast path for nested scaled ancestors. | Updated §5.7 plus an L-MEAS-4 case with a live scaling parent and a commit after scroll; every frame ≤0.5 px and velocity continuous. Add a nested L-MEAS-7 layout-shift case. |
| J-002 | A common held-parent displacement is converted into independent descendant tracks on release. | Different effective motions produce different displacement functions, so a 100 ms child can reach A while a 500 ms parent remains displaced. That violates “children stay in layout under the held map” and produces visible structural tearing with no degradation. | Define one inherited hold/release displacement owned by the held ancestor until its release settles. Descendant-specific tracks must be residual to that common map. Define the velocity split so release velocity is not double-counted. | Updated §5.10 and L-DRIVE tests with parent spring + child short timing, `layout:'size'` child, and a child already moving at take/release. Relative geometry must remain exact under the common release map. |
| J-003 | Parent scale is inferred from a rounded layout size and then treated as exact for descendants. | Valid supported 2D trees can snap `unsupported`, contradicting the support matrix and the refinement's claim that rounding is covered “at any scale.” | Propagate exact known scale, or propagate a rigorous interval/error budget; never use `rect / rounded offset` as an exact ancestor multiplier. Preserve the v3 fallback principle: if support cannot be proven, defined snap is allowed, but supported geometry must not be falsely rejected by the rounding model. | A pure/math test or documented proof covering fractional parent widths and nested children at total scales 0.1, 1, 10 (plus sub-pixel parent width), and S1 browser spike cases. |
| J-004 | The authority changes the signed per-node stale reporting contract without approval and conflicts with its own normative degradation table. | P0 gate requires no contradiction with signed v3; public `LayoutReport.snapped` / `onSnap` semantics are part of the safety contract. | Define a conservative exhaustive rule that never silently omits a node that may have jumped on a capture-less/aged flush, or obtain a signed design amendment. Make §4.4, §7.1, and §9.1 use the same semantics. | Updated authority plus L-MEAS-11 assertions for `status`, `report.snapped`, `onSnap`, and diagnostics for no-capture and aged cases. |
| J-005 | A required P0 deliverable was re-scoped only in the self-report, not in the plan. | A checkpoint cannot PASS with an explicit objective item undone. | Document the approved `physics` surface and `Clock.inFrame` semantics in `packages/core/src/API.md`, clearly distinguishing planned P1 implementation from currently exported API; then update the self-judgment. | Diff of `packages/core/src/API.md`; grep for `physics` and `inFrame`; mapping back to D2 and authority §2.1/§4.1. |
| J-006 | The benchmark reference describes a hardware class, not a reproducible gate environment/protocol. | DR-18 exists precisely because performance evidence depends on the machine. A different Xeon-class 4-vCPU host can cross 2/4 ms thresholds without any code change. | Record the exact reference environment (machine or immutable image, CPU model/quota, OS, browser builds), and define metric sampling/aggregation for each gate, including how p95 and the median-of-five compose. | Updated §11.5 and a dry-run protocol that an independent runner can execute without choosing any unstated parameter. |
| J-007 | Current behavior is mislabeled as already isolated. | It can mislead P3 implementation, although §9.2 and DR-14 otherwise make the requirement clear. | Change wording only; no P0 source-code fix is required. | Authority text and self-judgment no longer claim current `onSnap` isolation. |

## Independent Re-checks

| Check | Command or method | Result | Evidence |
|---|---|---|---|
| Trial baseline | `git fetch origin dev/ecstatic-ramanujan-1mjr9q && git reset --hard origin/dev/ecstatic-ramanujan-1mjr9q` | PASS | HEAD = `4b194dc989706cb5b3e761220b63bf09a8031681` |
| Hard-migration terminology | Search authority for `page box`, old inner-scroll stale, analytic before-box, field-by-field merge | PASS | Only removal/header explanation, anti-regression statements, or mutation-test wording remain; no legacy path is specified |
| Section-reference integrity | Parsed every `§N` / `§N.M` reference against headings | PASS | 161 references, 0 missing targets |
| Frame marker / callback bound | Compare authority §4.1 with signed v3 §3.3 and current clock API | PASS | Racing `clock.read` with owner-window rAF is conservative and closes paused/manual-clock aging; third-party rendering callbacks remain explicitly unsupported |
| Support-check rounding | Arithmetic counterexample from §4.2 | **FAIL** | Parent true width 50.49 / offset 50 biases measured S by 0.98%; 1000 px child recovers 990.295 px, error 9.705 > tolerance 6.0. Same failure at total scale 0.1, 1, and 10 |
| Keep re-expression | Algebraic nested-map counterexample | **FAIL** | Under parent scale 0.5, a 20 px presented local scroll moves measured child B by 10 px while `A_new-A_old` is 20 px; raw-`δ` keep writes a wrong first frame |
| Held-descendant release | Motion-composition counterexample | **FAIL** | Parent 500 ms spring + child 100 ms timing causes the common hold displacement to decay at different rates; child detaches visually before parent lands |
| Capture-less reporting | Textual reconciliation | **FAIL** | Signed v3 lines 247-248 require per-node stale reporting; authority line 364 says no-capture undriven nodes are not reported; §9.1 still says report stale |
| P0 core API deliverable | `grep -n -E '\\bphysics\\b|inFrame' packages/core/src/API.md` | **FAIL** | No matches |
| Status precedence | Compare authority §9.3 to signed v3 §6.3 | PASS | Exact order preserved: failed, disposed, disabled, capped, interrupted, ended, reduced, stale, no-change |
| Current `onSnap` behavior | Inspect `packages/layout/src/scope.ts:1868-1869` | NOTE | Direct callback invocation, no isolation today; confirms J-007 |
| Cost-gate reproducibility | Review §11.5 and DR-18 | **FAIL** | Thresholds exist, but hardware identity and metric aggregation remain underspecified |

No heavy Mac build or browser suite was run.

## Remediation Order

### Remediation Order for P0

**Defect IDs:** J-001, J-002, J-003, J-004, J-005, J-006. J-007 should be corrected with the same authority edit but is S3.

1. **FIX J-001 — §5.7 kept-track re-expression**
   - Change `packages/layout/ARCHITECTURE.md §5.7` so a kept nested track is re-expressed through its ancestor map(s), not by raw `A_new - A_old` in rest space.
   - If an exact mapping cannot be established for the supported model, mandate retarget from the fresh measured `(B,v)`.
   - Prove with L-MEAS-4 under a scaling parent and a nested L-MEAS-7 case; first-frame error ≤0.5 px and velocity continuous.

2. **FIX J-002 — §5.10 descendants on release**
   - Replace independent full descendant release tracks with a common inherited release/hold map owned by the held ancestor; descendant own motion may animate only residual child motion.
   - Define release-velocity composition exactly once.
   - Add L-DRIVE coverage for differing parent/child motion, `layout:'size'`, and an already-moving child.

3. **FIX J-003 — §4.2 support math**
   - Remove exact propagation of `parent measured S = rect / rounded offset size`.
   - Specify an exact known-scale composition or rigorous error-bound/interval method.
   - Add the fractional-parent/nested-child counterexample at 0.1×, 1×, and 10× and retain the S1 browser spike.

4. **FIX J-004 — §4.4 / §9.1 reporting**
   - Make capture-less and aged per-node reporting one coherent public contract consistent with signed v3's safety intent.
   - Do not silently omit a potentially jumped undriven node from all per-node reporting without an approved design amendment.
   - Prove `LayoutReport.status`, `snapped`, `onSnap`, and diagnostic behavior in L-MEAS-11.

5. **FIX J-005 — missing P0 core API note**
   - Add the D2 `physics` and read-only `Clock.inFrame` contract to `packages/core/src/API.md`, explicitly marked as the P1 implementation target if not yet exported.
   - Correct `p0_authority.md`; do not claim the plan assigns this deliverable to P1.

6. **FIX J-006 — DR-18 / §11.5**
   - Pin the exact benchmark environment and metric aggregation protocol.
   - The description must be sufficient for an independent runner to decide every cost gate without selecting unstated hardware or statistical parameters.

7. **FIX J-007 — authority wording**
   - Replace “`onSnap` stays as it is, isolated the same way” with wording that preserves the API but identifies isolation as the P3 behavior change already required by §9.2 / DR-14.

**Forbidden workaround:** do not weaken L-MEAS/L-DRIVE frame assertions, add broad exclusions for nested scaling/fractional boxes, or convert wrong motion into an undocumented snap merely to satisfy the written gate.

## Fix Proof Report Requirements

The fixer must submit a proof report at the normal checkpoint execution-report location before re-judgment. It must include:

- correction summary for J-001..J-007;
- changed files/outputs;
- rationale for the corrected §5.7 mapping, §5.10 release composition, and §4.2 scale proof;
- verification commands/methods and complete results;
- the exact counterexample cases from this tribunal and their expected outcomes;
- P0 objective/gate satisfaction mapping, including the core API note and DR-18;
- residual risks.

For P0 re-judgment, documentation-level proofs and small pure checks are sufficient; the P2/P4 browser implementation rows remain assigned to their later phases, but the authority must now specify an implementable, non-contradictory contract.

## Re-Judgment Entry Criteria

Required before the tribunal can be re-run:

1. Updated `packages/layout/ARCHITECTURE.md` resolving J-001, J-002, J-003, J-004, J-006, and J-007.
2. Updated `packages/core/src/API.md` satisfying the P0 D2 API-note objective.
3. Updated `p0_authority.md` with a truthful closure matrix and proof of the counterexamples.
4. A reproducible §11.5 benchmark protocol.
5. Evidence that all syntactic section references still resolve and the hard-migration terms have not reintroduced a legacy path.

Conditions that still produce **TRIBUNAL FAIL**:
- any authority path can produce a wrong visible frame without a defined reported degradation;
- raw `A_new-A_old` remains the only kept-child re-expression under non-identity ancestor scale;
- descendants still consume the same held displacement through independent effective motions;
- fractional parent rounding can poison descendant support checks;
- capture-less reporting remains inconsistent between §4.4, §9.1, and signed v3;
- the core API note is still deferred without an amended P0 plan;
- the cost gate still depends on an undefined hardware/statistical choice.

Conditions that produce **TRIBUNAL BLOCK**:
- the signed design/owner must be changed to permit the J-004 reporting semantics, but no amended decision record is provided;
- required files or the assigned commit cannot be inspected.

## Final Ruling

P0 has several strong parts: the hard migration is stated, the new frame marker is conservative, syntactic section references are internally complete, and §9.3 preserves the signed status precedence exactly. Those successes do not overcome the gate failures.

The decisive defects are J-001 and J-002. They violate the program's essential rule — **snap, never wrong motion** — by specifying visible motion that can be wrong even with fresh measurements and otherwise-supported geometry. J-003 then rejects valid supported geometry because of a mathematically biased scale estimate. J-004 changes signed public degradation reporting, J-005 leaves a required P0 deliverable undone, and J-006 leaves the performance gate non-reproducible.

**TRIBUNAL FAIL**
