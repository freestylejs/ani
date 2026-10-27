# P1 tribunal result (`p1_spring`), as returned by the Chief Justice

The Chief Justice reported writing `p1_spring_trial_result.md` in the tribunal clone. That file is
not on disk (the clone was re-anchored for the next tribunal), so this record is the tribunal's
final reply, verbatim. Judged at `3b9c11705192537bb0620b96d9a6fe2e25015c77`.

---

Tribunal complete at exact HEAD `3b9c11705192537bb0620b96d9a6fe2e25015c77`. No source files were
modified.

**P0 re-judgment: TRIBUNAL FAIL.** Five prior defects close, but J-001 and J-004 remain open, plus
one new support-check defect.

**P1 `p1_spring`: TRIBUNAL FAIL.**

| Defect | Severity | Finding |
|---|---|---|
| P0 J-001 | **S0** | §5.7's unconditional `|δ| < 0.01px` keep path can become multi-pixel wrong motion under a large valid live ancestor scale. |
| P0 J-004 | **S1** | The same sub-0.01 cutoff can suppress `'stale'` reporting even when ancestor-scale amplification makes the actual error exceed `threshold`. |
| P0-N001 | **S1** | §4.2's `O <= 1 → M=[0,∞)` case has no guaranteed unsupported-geometry detector for a degenerate leaf; an unsupported map such as `zoom` can escape the support check. |
| P1-001 | **S1** | React can merge away an invalid or WAAPI-forbidden group spring before core performs the required per-layer validation. |
| P1-002 | **S1** | Reduced-motion spring planning bypasses the unconditional 10-second settle cap. |
| P1-003 | **S1** | Public `physics.perceptual()` does not validate its documented finite, positive-duration domain and can silently accept invalid inputs. |
| P1-004 | **S1** | L-SPRING-4's "largest fitting grid factor" proof is not independent: expected selection reuses production `settleTime`/`planTrack`. |
| P1-005 | **S1** | Required checkpoint logs are absent; the three-engine/full-suite results exist only in the self-report, and its brace-form browser commands are not executable as written by the runner. |

The focused P1 unit/property rerun on WSL was green at **180/180**, and the main closed-form spring
oracle is genuinely independent. Those positives do not cure the implementation and gate-proof
defects above.

**P0 RE-JUDGMENT: TRIBUNAL FAIL**
**P1: TRIBUNAL FAIL**
