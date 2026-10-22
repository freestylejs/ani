# Valid 06.showcase: Radius/caps/perf, E1–E5 and reduced 2D Gallery proof

## Authority
- Validates task: `cpc_task_06_showcase.md`
- Validator role: independent verification, not implementation
- Scope ceiling: only this task's requirements and prohibited side effects
- Required evidence location: `.trace/ani_layout_cpc_v1/`
- Blocking severity rule: missing/ambiguous evidence is FAIL; missing access is BLOCK.

## 1) 본질적 목적 달성 검증
- Purpose restatement: Harden radius/caps/load behavior, ship all showcase fixtures, and prove the moat with jank and bundle measurements.
- Observable success conditions: exact phase evidence below is reproducible.
- Negative checks: no unrelated feature, no Core V2 diff, no observer/per-frame/inline FLIP, no gate weakening.
- Side-effect checks: existing v1 tests and browser cases remain green.

## 2) Code-level Impl/Test Spec 검증
- Implementation inspection: inspect the task's changed files and contracts.
- Least elaborate sufficient test procedure: run the exact commands in the task plus targeted browser/unit probes.
- Edge-case procedure: exercise the listed interrupts/re-entry/caps/SSR paths relevant to this phase.
- Regression procedure: full `pnpm test:ci`, `pnpm check`, typecheck/build; targeted browser matrix.
- Evidence to capture: commands, results, counts, key assertions, any screenshots/traces, commit hash.

## 3) 최종 검증 테이블
| Task requirement | Validation method | Expected result | Actual evidence | Decision |
| --- | --- | --- | --- | --- |
| Scoped implementation | inspect diff | matches task, no extra scope | | |
| Phase behavior | run targeted tests/browser | all assertions pass | | |
| Architecture invariants | source/guards | zero forbidden mechanisms | | |
| Core/package regression | full CI + diff | pass, core 0 | | |
| Evidence quality | reproduce commands | objective and complete | | |

## Verdict Rule
- PASS only if every required row has concrete evidence.
- FAIL if evidence is missing, ambiguous, unverifiable, or contradicts the task authority.
- BLOCK if required artifacts/access are unavailable.

## 4) Required evidence
All matrix rows selected for B′; P0–P9; 3 engines; final tribunal evidence.
