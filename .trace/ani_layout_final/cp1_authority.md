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
