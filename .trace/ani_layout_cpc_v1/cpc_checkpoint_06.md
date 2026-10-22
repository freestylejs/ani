# Checkpoint 06: Radius/caps/perf, E1–E5 and reduced 2D Gallery proof

## Authority
- Gate after: `cpc_task_06_showcase.md`, `cpc_valid_06_showcase.md`
- Gate before: final acceptance
- Required reviewer stance: neutral, evidence-bound, no implementation during tribunal

## Completion Inventory
| Required task | Required valid | Evidence location | Status |
| --- | --- | --- | --- |
| `cpc_task_06_showcase.md` | `cpc_valid_06_showcase.md` | `.trace/ani_layout_cpc_v1/` | pending |

## Cross-Task Consistency Checks
- Completed work produces the declared final goal progress:
- Dependency contract still holds:
- No validated v1 behavior regressed:
- Shared artifacts remain compatible:
- Supporting mechanisms remain means rather than substitute outcomes:
- Known risks before next order:

## Gate Decision Table
| Check | Method | Pass standard | Decision |
| --- | --- | --- | --- |
| Task implementation | diff/source inspection | exact scope, no hidden fallback | |
| Valid evidence | reproduce commands | objective PASS | |
| Invariants | source/guards | no observers/rAF/inline FLIP/Core diff | |
| Regression | full test:ci/build/check | PASS | |
| Next-order readiness | architecture/API check | no unresolved blocker | |

## Required Follow-Up
- Must fix before proceeding:
- May defer with explicit risk:
- Next authorized task: `final acceptance`
