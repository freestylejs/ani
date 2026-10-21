# ANI V2 gate amendment — 2026-10-20

Status: **user-approved gate redefinition** for the 2026-10-20 ANI V2 handoff.
This document is authoritative where it conflicts with the original delegation
gate text. The retired criteria are replaced, not retroactively passed. It does
not change package versions or published artifacts; judge notes are corrected
separately for attribution.

## Approval

On **2026-10-20** the user explicitly approved redefining the multi-target group
gate and the bundle-size gate after measurement showed the original criteria did
not match the measured cost structure. The approval covers:

- replacing the 3x `groupGain` gate with an absolute `raf-group` p95 gate plus a
  diagnostic `groupGain` regression guard;
- replacing the 10.6 KB `raf-minimal` target and the no-V1-regression criterion
  with a 12.2 KB target and a 12.4 KB budget, with the V1 measurement retained
  as a diagnostic.

The judge-attribution policy below is a correction to the handoff record, not a
change to either gate.

## Multi-target group gate

| | Criterion |
| :--- | :--- |
| Original | `groupGain >= 3x` (median `raf-timelines` tick p95 / median `raf-group` tick p95) |
| Amended hard gate | absolute **`raf-group` tick p95 at N=5000 <= 4.5 ms** |
| Amended release target | **`raf-group` tick p95 at N=5000 <= 4.0 ms** |
| Diagnostic guard | `groupGain >= 2.5x` (`minGroupGain` in `bench/browser/budget.json`) |

`groupGain` is a diagnostic and a regression guard, not the release success
criterion. The absolute p95 gate is enforced by `pnpm bench:check`. At N=5000
the group performs 10,000 DOM declarations per frame (transform + opacity); the
measured floor is p50 3.3-3.4 ms and p95 3.9-4.2 ms, while the per-timeline
path measures 10.2-11.8 ms. A 3x ratio would require the group to beat its DOM
write floor. The 2.5x guard still fails `--check` on an amortization regression,
and `--update-budget` preserves the amended guard and clamps the group p95
budget to the 4.5 ms hard ceiling.

## Size gate

| | Criterion |
| :--- | :--- |
| Original | `raf-minimal <= 10.6 KB` gzip, with no V1 regression |
| Amended target | **`raf-minimal <= 12.2 KB (12,200 B)` gzip** |
| Amended budget | **`raf-minimal <= 12.4 KB (12,400 B)` gzip** (`bench/size/budget.json`) |
| Diagnostic | Our build of V1 `ce45eb2` measured **10,339 B** gzip; independent judge builds measured **10,351–10,494 B** depending on the V1 import/bundler variant. All are diagnostic. |

The V1 numbers are recorded as diagnostics only. The original no-V1-regression
criterion is **explicitly waived** by the user-approved amendment; it is not
silently satisfied. The original 10.6 KB target assumed more production
stripping than the XDEV production build delivered: stripping accounts for
about 0.6 KB of the shortfall, and the rest is V2 runtime/feature cost (clock,
plan, group, loop), not development strings.

## Judge attribution

Verdicts produced in this handoff are attributed exactly as
**`orchestrator (DeepSeek V4.1 Flash MAX)`**. They are not Opus 5.5 verdicts.
Existing git notes under `refs/notes/judge` keep their recorded `judged_by`
values; legacy notes must not be relabeled. The orchestrator will correct
`judged_by` separately where needed.

## Ratification

This amendment is the gate used for this handoff because the user approved it on
2026-10-20, but **Opus must ratify it** before it is treated as the final,
judge-ratified release gate. Opus must explicitly confirm:

1. the absolute `raf-group` p95 gate: 4.5 ms hard, 4.0 ms target at N=5000;
2. `groupGain` as a diagnostic with a 2.5x regression guard, not a 3x gate;
3. the size target of 12.2 KB / budget of 12.4 KB, and the explicit waiver of
   the original no-V1-regression criterion;
4. the judge attribution policy above.

Until that ratification is recorded, this document is truthful about what was
approved, but it is not an Opus-ratified verdict.
