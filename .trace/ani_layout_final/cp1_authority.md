# CP1 — Authority: implementer's checkpoint review

- Checkpoint commit: `f46a8c2` (`docs(layout): make the final architecture the single authority`)
- Authority: `plan.md` §5 CP1 (T1.1–T1.3, V1), the approved decision (Claude Docs
  `ANI Layout — Final Architecture`, rev 13) and the Human Engineer's answers of 2026-10-23.

## Judgment matrix

| Row | Requirement | Evidence | Result |
|---|---|---|---|
| T1.1 | New `packages/layout/ARCHITECTURE.md` derived from the decision + answers, clarifications recorded | File: §1 decision, §2 constraints, §3 model/invariants, §4 commit/frame, §5 solver, §6 ownership, §7 API (`layout` default `true`, stateful timing throws), §8 modules, §9 failure, §10 WAAPI gate, §11 acceptance, §12 risks. Clarifications K1–K11 in `00_documentation_drift.md` §6 and stated in the document body | PASS |
| T1.2 | Delete `ARCHITECTURE_CPC.md`, `.trace/ani_layout_v1/`, `.trace/ani_layout_cpc_v1/` | `git show --stat f46a8c2` | PASS |
| T1.3 | Drift matrix and phase plan with a top-level final goal | `00_documentation_drift.md` (authority set, claims L1–L12, evidence, drift D1–D5, ask matrix, K1–K11); `plan.md` (FINAL GOAL first) | PASS |
| V1 | No other file claims layout authority | `grep -rn "ARCHITECTURE_CPC\|ani_layout_cpc_v1\|ani_layout_v1"`: only `tests/browser/docs_showcase.mjs:118` (a screenshot output path of the old showcase tool). User docs (`README.md`, docs guide, showcase, changeset) and `types.ts` TSDoc still describe 0.1.0; they are code-coupled and scheduled by D3–D5 (CP4–CP6) | PASS with carried items |

## Carried items (not CP1 defects; owned by later checkpoints)

- C1-a (S3, CP6): `tests/browser/docs_showcase.mjs` and `tests/browser/diagnose_layout_showcase.mjs`
  target the 0.1.0 showcase and write into the deleted `.trace/ani_layout_cpc_v1/`; rewrite or
  delete with the showcase.
- C1-b (D5, CP6): `packages/layout/README.md`, `packages/web/content/docs/guides/layout.mdx`,
  `packages/web/content/docs/showcase/layout.mdx`, `.changeset/ani-layout.md`.

## Verdict

PASS (implementer review). Sent to the Chief Justice for trial.

---

## Trial 1 result and fix proof report

Chief Justice trial 1 (`cp1_authority_trial_result.md`, frozen `81d8e57`): **TRIBUNAL FAIL**, J-001–J-007
(all S1, documentary). Per the protocol the failed rows are re-judged with CP2. Changed files:
`packages/layout/ARCHITECTURE.md` (§3.1, §3.3, §4.1, §4.2, §5.1, §7.2, §11, §12),
`.trace/ani_layout_final/00_documentation_drift.md` (K1, K2, K8, K11; new K12, K13),
`.trace/ani_layout_final/plan.md` (§4 rows 2/4, CP2, T3.3, V3, T4.3, T5.1, T5.3, V5, V6, §6).

| Defect | Disposition | Proof |
|---|---|---|
| J-001 visual space | Kept the presence-free layout space, and proved and stated its visual equivalence (§3.1 "Visual space"); the oracle is now stated on the browser's visual rect (§11). | Every map is per-axis affine `f(x) = kx + b`. For a constant ancestor inner map `Q`: `Q(A + (B−A)(1−e) + kτ(1−τ)²) = Q(A) + (Q(B)−Q(A))(1−e) + (k_Q·k)τ(1−τ)²`, i.e. the source's track in visual coordinates, with the velocity scaled by `k_Q` like every visual length. The trial's example, worked through: parent presence `scaleX(.8)` about x = 0, constant; child layout box x 0 → 50, width 125. Visual B = (0, 100), visual A = (40, 100) — the rects the browser reports. The child's pose solves the presence-free track x(t) = 50 − 50(1 − e), w = 125, so the visual rect is (0.8·x(t), 100): exactly lerp(0, 40, e) with width 100 every frame; at settle the pose is the identity and the visual rect is (40, 100), the real layout. The 80 px in the trial assumes a presence-free 100 px box measured as a 100 px visual box, which the measurement (which divides presence out) never does. The time-varying case is defined: a flush-time matrix in `Mπ` would end at a non-identity pose (jump at settle, invariant 2), and per-frame following needs a per-frame DOM read; neither is acceptable, so the ancestor's presence motion is applied to its participant descendants as to any child. The spike S3 three-level chain measures this composition in the browser. |
| J-002 transaction | The flush reads first: A is measured with the last written poses applied and divided out exactly (§3.1 measurement, §4.2 steps 1–3, K12). | Running retarget walk-through: tick k commits pose P(t_k) → React commit mutates DOM → flush: (1) read rect R, inline transform, computed values of non-driven active nodes — no write has happened in this task since React's mutation; (2) `L = (P(t_k)∘Q)⁻¹(R)` with the frozen authored values and the exact pose numbers the engine wrote; (3) plan; (4) write new poses. No read follows a layout write. |
| J-003 capture lifetime | §4.1 lifetime table (task-stamped capture, reuse in the same task, re-read in a later task, consumed by `flush()`), with the React argument; K2 updated. | The trial's trace — abandoned render captures x = 0; a scope-silent commit paints x = 100; a later render commits x = 200 — the later render starts in a later task, so its first touch re-reads and B = 100. Measured in spike S1 (`spike*:S1_transition`): each transition is pre-empted by a `flushSync` commit outside the scope while its capture is pending; the no-refresh control consumes a stale B 90 times (37.3 px) in every React build, the §4.1 rule 0 times. |
| J-004 velocity | `k` unclamped, `c′(0) = v` exactly; the only exception is the physical size floor (≥ 1 px); a node moving at the flush ignores its delay (§5.1, invariant 4, K8, T3.3/V3). | `dc/dτ(0) = −(B − A)e′(0) + k = vD` ⇒ `dc/dt(0) = v` for any `k = vD + (B − A)e′(0)`. The trial's counterexample (B = 375, A = 376, v = 3571.4 px/s): `k = 1249`, `c′(0) = 3571.4 px/s` — no loss. Position channels have no floor, so it never binds there; V3 requires `c′(0) = v` for fast, short retargets. |
| J-005 spikes before code | S4 added to CP2; all four spikes are hard gates with a re-validation rule (plan CP2, V2, §6.4; K11). | `tests/browser/cases/spike.ts` S4 runs before any production code. |
| J-006 gate order | V5 checks package sources and tests; V6 checks the whole repository including user docs. | plan V5, V6. |
| J-007 document isolation | Implicit root per `(clock, document)` with independent disposal (§7.2, K13, T5.1, T5.3). | — |

Carried items C1-a and C1-b are unchanged (CP6).

**CP2 trial ruling on J-001: NOT RESOLVED.** The J-001 row above is withdrawn: the affine
argument holds for one fixed outer map, not for inner maps interleaved with independently timed
poses. The corrected model (track space = visual space, `Mπ` = parent's full map) and its proof
are in `cp3_pure_core.md`.
