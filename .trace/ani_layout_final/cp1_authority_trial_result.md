# Tribunal Report: CP1 — Authority

## Verdict

TRIBUNAL FAIL

- Target: T1.1, T1.2, T1.3, V1 in `plan.md:69–74`.
- Commits: `f46a8c2`, `81d8e57`; base `4aade58`; frozen HEAD `81d8e578d6b2149a4f3c0b49c30495439dc14ca5`.
- Date: 2026-10-23; independent checks recorded at 08:33 UTC.
- Seven S1 defects. No implementation was judged or changed. No local Node/pnpm/repository tests, remote runs, commits, or pushes were performed.

## Authority Coverage

| File | Role / included reason | Coverage result |
| --- | --- | --- |
| `packages/layout/ARCHITECTURE.md` | Highest architecture authority; complete §§1–12 inspected | FAIL: J-001–J-004, J-007 |
| `.trace/ani_layout_final/plan.md` | CP1 tasks/V1 and future acceptance coverage | FAIL: J-005–J-006; acceptance categories all mapped |
| `.trace/ani_layout_final/00_documentation_drift.md` | D1–D5 and every clarification K1–K11 | FAIL: K1/K2/K8/K11 do not establish the claimed preservation of every invariant |
| `.trace/ani_layout_final/source_decision.md` | Complete approved source; both supplied answers applied | Compared throughout; default `true` and stateful-timing rejection are correct |
| `.trace/ani_layout_final/cp1_authority.md` | Implementer's claims, not controlling evidence | T1.2/authority cleanup confirmed; blanket PASS not sustained |
| Git history, tracked files, remaining docs | Deletion and competing-authority audit | PASS within the expressly carried scope |
| `/Users/june/.claude/skills/judging-checkpoint-completion/SKILL.md` | Requested judicial method | Followed; no additional harness/evidence files demanded |

No earlier `*_trial_result.md` exists in `.trace/ani_layout_final/` at the frozen commit.

## Judgment Matrix Summary

Counts describe documentary checks, not future implementation/test passes.

| Requirement group | Rows checked | PASS | FAIL | BLOCK |
| --- | ---: | ---: | ---: | ---: |
| CP1 tasks and V1 components | 5 | 3 | 2 | 0 |
| K1–K11 | 11 | 7 | 4 | 0 |
| §11 acceptance coverage in the plan | 6 | 6 | 0 | 0 |
| Phase gate ordering | 2 | 0 | 2 | 0 |

| Authority row | Evidence / independent check | Result | Defects |
| --- | --- | --- | --- |
| T1.1: faithful, consistent architecture | Full source-to-authority reconciliation; equations and counterexamples below | FAIL | J-001–J-005, J-007 |
| T1.2: retire competing documents | Git deletions plus filesystem/tracked-file absence | PASS | — |
| T1.3: drift record and executable final-goal plan | Goal and outputs exist; reconciliation and phase dependency review | FAIL | J-001, J-003–J-006 |
| V1: required subject inventory | All required sections exist | PASS | — |
| V1: no competing layout authority | Hidden-file search, history, remaining documentation inspection | PASS | — |

| Clarification | Independent assessment | Result |
| --- | --- | --- |
| K1 | Pose-only ancestor maps and the stripped-space definition weaken the source's visual-space guarantee | FAIL, J-001 |
| K2 | Engine-box compensation can address driven nodes, but commit provenance and abandoned captures remain unspecified | FAIL, J-003 |
| K3 | Origin-point channels are an explicit coordinate choice; full-box interpolation remains equivalent | PASS |
| K4 | Internal presence registration supplies ownership and release information without expanding adapter API | PASS |
| K5 | Suppressing routine warnings preserves typed reports and `onSnap` | PASS |
| K6 | Retaining capture reads preserves planning exclusion; changed measurement cost is explicit | PASS |
| K7 | Total-scale radius correction accounts for nesting, subject to resolving K1's coordinate contract | PASS |
| K8 | The fixed clamp does not preserve the required incoming derivative | FAIL, J-004 |
| K9 | Presence touching capture/flush covers exit-settlement commits | PASS |
| K10 | A separate vanilla group already provides an ID namespace | PASS |
| K11 | Defers an expressly conditional pre-production gate until after production solver/engine work | FAIL, J-005 |

| §11 coverage group | Plan location and reconciliation | Result |
| --- | --- | --- |
| Independent pure oracle / seeded trees | T3.1–T3.4, V3 (`plan.md:90–100`) | PASS: mapped |
| Deterministic manual-clock / three-browser layer | T4.3/V4, T5.3/V5, V6 (`plan.md:108–133`) | PASS: mapped |
| Real-clock layer | Final goal, T6.2–T6.3 (`plan.md:8–10,128–130`) | PASS: mapped |
| E1–E5 and reduced Gallery | T6.1/V6 and all six parameter rows (`plan.md:127–141`) | PASS: mapped |
| Six regressions and seeded fuzz invariants | T6.2/V6 incorporates §11 (`plan.md:63,128–133`) | PASS: mapped |
| Read counts and numerical cost gates | T4.3–T4.4/V4, T6.3/V6; architecture §11 supplies limits | PASS: mapped |

The two phase-order rows fail separately: P0/S4 prerequisites (J-005), and V5's docs gate preceding T6.4 (J-006). Naming all acceptance items does not resolve contradictory instructions for satisfying them.

## Defects

| ID | Severity | Authority source and finding | Required correction |
| --- | --- | --- | --- |
| J-001 | S1 | `packages/layout/ARCHITECTURE.md:65–79,419–420,454–455` removes every ancestor inner map from projection and redefines drawn boxes to exclude those maps. The source explicitly includes participant ancestors' presence matrices in Mπ (`source_decision.md:132`) and judges actual visual rects (`:276–281`). A new accepted risk cannot substitute layout-space exactness for that guarantee. | Restore visual-space ancestor compensation and an oracle that checks actual browser geometry, or supply an explicitly approved source amendment. Preserve identity/restoration at settle as well. |
| J-002 | S1 | `packages/layout/ARCHITECTURE.md:130–134` mandates owned-style writes, then A reads, then pose writes. This directly conflicts with its read/write claim (`:25–26`) and seeded-fuzz invariant (`:437–438`), inherited from `source_decision.md:14,302`. Retargeting a running node necessarily exercises the conflict. | Specify a measurement transaction consistent with no DOM read after layout-owned writes; reconcile both the transaction and its validation. |
| J-003 | S1 | `packages/layout/ARCHITECTURE.md:117–122,137–147` permits an uncommitted render's capture to remain, defines frame-based refresh, and makes only inner scrolling stale. It omits the source's consumption-by-own-commit rule (`source_decision.md:73–75`), although `plan.md:80–81` still requires it. “True ... as long as no commit happened” supplies no invalidation rule when one did. | Define capture ownership, consumption/invalidation, and coalescing across abandoned renders and intervening commits, including idle scopes. Keep exact compensation only where its provenance is established. |
| J-004 | S1 | `packages/layout/ARCHITECTURE.md:171–179` promises c′(0)=v while clamping the coefficient that uniquely supplies that derivative. Its delayed-retarget-at-rest rule also conflicts with unconditional velocity continuity (`:99`). K8 was not derived from the required ≤5% velocity check (`:435–436`; `source_decision.md:298`). | Supply a consistent supported-retarget rule preserving the incoming derivative, endpoints and size safety; reconcile delay semantics and the existing velocity/property validations. Do not silently clamp/reset velocity while retaining the continuity claim. |
| J-005 | S1 | `source_decision.md:7,326,359–366` makes all four P0 spikes hard gates before P1 production code. K11 (`00_documentation_drift.md:90`) and `plan.md:59–61,76–88,112` move S4 after CP3/into CP4. Measuring the real engine later is useful, but does not satisfy the approved prerequisite. V2 also says only “fallback recorded,” without requiring successful revalidation before production proceeds. | Restore a pre-CP3 S4 spike and explicit stop/reopen/revalidate gates for S1–S4; retain CP4's real-engine cost check. Alternatively provide an approved amendment of the source's conditional approval. |
| J-006 | S1 | V5 forbids retired symbols in docs (`plan.md:123–124`), but the same docs are expressly carried until T6.4 (`:131–132`; drift D5). Present examples prove the conflict: `packages/layout/README.md:21`; `packages/web/content/docs/guides/layout.mdx:29,48,57`. | Move the docs portion of the symbol-removal gate to V6, or schedule those rewrites before V5. Keep final removal mandatory. |
| J-007 | S1 | `packages/layout/ARCHITECTURE.md:336–337` changes the implicit-root partition to one scope per clock, dropping the source's “per clock and document” (`source_decision.md:209`). The same clock can otherwise merge unrelated document coordinate spaces and layoutId registries. | Restore document isolation in the implicit-root contract and its lifecycle/adapter validation scope. |

## Defect Disposition

All seven are CP1 authority/plan defects, not findings against unimplemented code.

| ID | Essential defect / impact | Robust correction mandate and re-judgment evidence |
| --- | --- | --- |
| J-001 | A coordinate redefinition weakens observable nested correctness | Correct §3.1/§11/K1 and the new risk; show the parent-inner-scale example below satisfies the visual oracle, including settle. Include it in existing composition/projection validation scope. Merely stripping transforms from the oracle is insufficient. |
| J-002 | Required transaction and required invariant cannot both pass | Give the ordered measurement/write sequence and reconcile §§1/4/11. Walk a running-node retarget through it. Exempting restoration writes from observation does not repair the conflict. |
| J-003 | Capture lifetime is not tied to the consuming commit | State epoch transitions and show aborted render → intervening commit → later committing render cannot reuse the wrong B. Retain explicit coalescing semantics. Add that case to existing S1 scope; a low stale rate alone is insufficient. |
| J-004 | The bounded coefficient destroys C1 continuity | Reconcile the equation, K8, delayed interruption, V3 and §11. Supply the derivative calculation and demonstrate the counterexample is handled without an undisclosed velocity loss. Do not narrow test inputs merely to avoid the clamp branch. |
| J-005 | Approval prerequisites became later checks | Reorder S4 and make failed spikes block production until a validated fallback/revised architecture passes, or produce an approved amendment. Recording a failed number alone cannot close the gate. |
| J-006 | CP5 requires an output scheduled for CP6 | Supply a consistent task-to-gate ordering that still checks all retired layout API symbols before final completion. |
| J-007 | Implicit roots lost document isolation | Restore `(clock, document)` isolation and document empty-scope disposal for each partition; map it to T5.1/T5.3. |

## Independent Re-checks

| Check | Command or method | Result / evidence |
| --- | --- | --- |
| Frozen baseline and scope | `git status --short`; `git log -5 --oneline`; `git diff 4aade58..HEAD --stat` | Initially clean; HEAD `81d8e57`; 42 changed files, 1,040 insertions, 2,997 deletions. No implementation changes outside retired trace artifacts. |
| Required deletions | `git ls-files -- packages/layout/ARCHITECTURE_CPC.md .trace/ani_layout_v1 .trace/ani_layout_cpc_v1`; Python filesystem existence inspection | No tracked paths; all three paths `exists=False`. |
| Competing authority | `rg -n -i --hidden -g '!.git' -g '!pnpm-lock.yaml' '(authorit(y|ative)|source.of.truth|ARCHITECTURE_CPC|ani_layout_(v1|cpc_v1)|layout architecture)' .`, then inspect hits | No extra competing layout authority. Historical source has an explicit record-only disclaimer. `GATE_AMENDMENT.md` concerns core gates. Old docs/TSDoc and `tests/browser/docs_showcase.mjs:118` are acknowledged carried items. |
| Full acceptance coverage | Read §11 against CP3–CP8; in-memory Python text reconciliation | All six coverage groups above returned `MAPPED`. This establishes coverage, not future passing results. |
| K1 geometry | Direct affine composition using the source's CSS composition order | Parent pose identity, parent presence scale .8, child width track 100 px: pose-only ancestor projection gives child scale 1; actual child width is 80 px, a 20 px difference. Accounting for the ancestor's inner map is necessary to keep that child at its own visual width. This is an analytical example, not a browser test result. |
| K2 lifetime | Specification trace, not implementation execution | An abandoned capture at x=0; a later scope-silent commit paints x=100; a subsequent scope render/commit targets x=200, with no intervening solver frame. The written reuse/refresh rules do not specify rejection of the abandoned B=0. A commit ownership/invalidation rule is needed to guarantee B=100. |
| K8 coefficient bound | In-memory Python arithmetic, reproduced below | `B=375`, `k_raw=1249`, `k_limit=67.5`, velocity `3571.428571 → 195.714286 px/s`; loss `94.52%`, versus ≤5%. |
| Plan dependencies | Read source P0 conditions and CP2–CP6; inspect old API examples with `rg -n 'LayoutConfig|preserve-aspect|\.play\(|deps=' ...` | S4 occurs only after production begins; V5's doc cleanup precedes T6.4's rewrites. |

The K8 calculation uses a valid zero-delay linear position track, width 20 px, duration .35 s, old travel 0→1000 px, initially at rest. At τ=.5 its position is 375 px; the new target is 376 px (changed sufficiently from the old target). The initial track's coefficient satisfies K8. For the replacement, max τ(1−τ)² = 4/27:

```sh
python3 - <<'PY'
D, q, width, delta = .35, .5, 20., 1.
B = 1000 * (2*q*q - q**3)
v = 1000 * (4*q - 3*q*q) / D
k_raw = v*D - delta
k_limit = .5 * max(delta, width) / (4/27)
v_after = (delta + min(k_raw, k_limit)) / D
print(f'B={B:.6f}; k_raw={k_raw:.6f}; k_limit={k_limit:.6f}')
print(f'v_before={v:.6f}; v_after={v_after:.6f}; loss={100*(1-v_after/v):.2f}%')
PY
```

Output: `B=375.000000; k_raw=1249.000000; k_limit=67.500000`; `v_before=3571.428571; v_after=195.714286; loss=94.52%`.

## Remediation Order

1. Repair the observable geometry, transaction, capture-lifetime and continuity contracts (J-001–J-004); reconcile their K entries and existing validation tasks. These define what future implementation must do.
2. Restore document isolation (J-007).
3. Repair spike prerequisites and CP5/CP6 gate ordering (J-005–J-006).
4. Update the implementer's checkpoint review against the corrected documents and submit the proof report. Keep the source decision as a verbatim record; do not rewrite it to erase discrepancies.

## Fix Proof Report Requirements

Submit in the conversation or `.trace/ani_layout_final/cp1_authority.md`: changed files, rationale per defect, verification methods/commands and actual results, T1.1/T1.3/V1 mapping, source/clarification reconciliation, and residual risks. Include the affine, derivative and epoch reasoning requested above. No new harness or standalone evidence artifact is required.

## Re-Judgment Entry Criteria

- A frozen revised diff and the proof report must be inspectable; each J-001–J-007 must have a disposition and corresponding document change or approved amendment.
- CP1 re-entry requires consistent documents and analytical justification. It does not require CP2–CP8 production implementation or browser tests to be completed early.
- Unchanged contradictions, a weaker oracle, silently narrowed velocity cases, or a merely recorded failed prerequisite remain FAIL. Missing revised outputs or inaccessible required proof produce BLOCK.

## Final Ruling

CP1 is rejected. Superseded-authority removal passes, the two supplied answers are correctly incorporated, and every §11 acceptance category has a planned validation. The architecture and phase gates nevertheless contain seven material inconsistencies/omissions; their existence is established without judging future code.

## Fix directive for the implementer

- **J-001:** In `packages/layout/ARCHITECTURE.md` §§3.1/5.3/11/12 and `.trace/ani_layout_final/00_documentation_drift.md` K1, preserve actual visual-space ancestor compensation and identity settle. In `.trace/ani_layout_final/plan.md` T2.3/T4.3, include participant-ancestor presence composition within the existing validation scope. Provide the scale-.8/100-px reconciliation; do not redefine the oracle to ignore the error.
- **J-002:** In `packages/layout/ARCHITECTURE.md` §§1/4.2/11, replace the contradictory restore→read→write requirement with a consistent transaction and demonstrate its read/write ordering on a running retarget. Preserve the source invariant or supply an approved amendment.
- **J-003:** In `packages/layout/ARCHITECTURE.md` §§4.1–4.2/9, `.trace/ani_layout_final/00_documentation_drift.md` K2, and `.trace/ani_layout_final/plan.md` T2.1, define commit-owned epoch consumption/invalidation and exact coalescing. Provide the abandoned-render/intervening-idle-commit trace showing a fresh correct B.
- **J-004:** In `packages/layout/ARCHITECTURE.md` §§3.3/5.1/11, `.trace/ani_layout_final/00_documentation_drift.md` K8, and `.trace/ani_layout_final/plan.md` T3.3/V3/T6.2, reconcile coefficient bounds, delayed retargets, C1 continuity and ≤5% velocity acceptance. Provide the derivative proof and disposition of the 94.52% counterexample.
- **J-005:** In `.trace/ani_layout_final/plan.md` §§4–5/6 and `.trace/ani_layout_final/00_documentation_drift.md` K11, restore all four P0 gates before CP3 and prevent failed prerequisites from being bypassed through ordinary carry-forward. Keep CP4's engine cost check. State each stop/fallback/revalidation gate, or supply an explicit approved amendment authorizing the changed ordering.
- **J-006:** In `.trace/ani_layout_final/plan.md` V5/T6.4/V6, align the documentation symbol-removal gate with the checkpoint that performs the rewrites; preserve final cleanup. Update the carry description in `.trace/ani_layout_final/cp1_authority.md` if its ownership changes.
- **J-007:** In `packages/layout/ARCHITECTURE.md` §7.2, restore one implicit root per `(clock, document)`, with independent disposal; in `.trace/ani_layout_final/plan.md` T5.1/T5.3, include that isolation in the existing adapter contract scope.
