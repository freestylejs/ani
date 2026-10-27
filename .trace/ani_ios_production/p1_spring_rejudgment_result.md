# Tribunal Report: P0 second re-judgment + P1 second re-judgment (`p1_spring`)

Condensed from the Chief Justice's final reply (verdicts, findings and entry criteria are kept
word for word; the evidence columns are shortened). The tribunal's full file is
`ani-trial/.trace/ani_ios_production/p1_spring_rejudgment_result.md` on the owner's Mac
(18,786 bytes, sha256 `8f29f6767f4fc608e7dc5ca79666e05ff5c849e974c2fda88a7a516d49f60eb2`).

## Verdict

- Anchor: `a2a2e180e56912aed048e16909bf30a70a4b422b`
- Branch authority fetched: `origin/dev/ecstatic-ramanujan-1mjr9q`
- P0 second re-judgment: **TRIBUNAL FAIL**
- P1 second re-judgment: **TRIBUNAL FAIL**
- Date: 2026-10-28
- Product source was not edited. The only file written by this tribunal is this result file.

The second remediation closes **P0-N001** and **P1-001..P1-005** as those defects were previously
stated. It does **not** close **J-001** or **J-004**: the new screen-space scalar bound assumes an
axis-diagonal ancestor map, while §4.2 can still classify a chain of small unsupported skews as
supported without ever invoking the computed-value classifier. That allows the skew to accumulate
until the true screen displacement exceeds the `0.01 px` keep bound and, for a valid low threshold,
the stale-report threshold.

P1's implementation defects are repaired, but the P1 checkpoint gate still does not pass: the raw
full Chromium and Firefox layout logs exit 1 on `layout:COST`. The interleaved A/B evidence is
sufficient to show that this is not a P1 regression, but the P1 authority says **"existing suites
green"**. P5 ownership of the definitive §11.5 performance harness does not amend or waive that P1
gate.

## Thesis / Antithesis / Synthesis

**Thesis.** The remediation claims that `|delta| * max(1, rho)` is now a true screen-space bound;
the degenerate-axis support hole is closed; reduced spring candidates obey the 10 s settle cap;
React validates motion layers before merge/state; public physics validates its domain; L-SPRING-4
uses an independent oracle; and raw gate logs prove the P1 gate.

**Antithesis.** The screen-space claim fails when §4.2's interval propagation absorbs a sequence of
individually sub-resolution unsupported skews. For 201 px square participants with a per-level
`skewX` shear coefficient `k = 0.0048`, each measured interval is narrower than the `0.5%`
forced-classifier threshold and overlaps the prior propagated interval. The classifier therefore
need not run, even though the accumulated transform is unsupported. Three such ancestors already
make `delta = (0.0099, 0.0099)` move `x` by `0.01004256 px`, while `rho = 1` and `keepPath` returns
`'unchanged'`. Extending the same construction to 1,999 ancestors (within the default
`maxParticipants = 2000` when the child is included) produces an actual `x` displacement of
`0.10489248 px`; with `threshold = 0.05`, the documented/code stale rule returns false from its
`0.0099 px` scalar bound.

The P1 code and focused tests survive re-check, but the checkpoint's raw browser evidence contains
real exit-1 full-suite runs. `cost-ab.log` proves baseline parity, not "green".

**Synthesis.** P0 remains failed on the essential "snap, never wrong motion" rule. P1's listed
implementation/evidence defects close, but P1 remains failed on its own unamended full-suite gate.

## Item Re-judgment Table

| Item | Result |
|---|---|
| **J-001 (S0)** | **FAIL**: three 201 px ancestors with shear `k=0.0048` pass the interval hand-off without a classifier read; with `delta=(0.0099,0.0099)` the bound is `0.0099` per axis but the composed `x` shift is `0.01004256` |
| **J-004 (S1)** | **FAIL**: the same blind spot at 1,999 ancestors gives `0.10489248 px` while the rule sees `0.0099 px`; at `threshold=0.05`, `staleReported` is false |
| **P0-N001 (S1)** | **PASS** |
| **P1-001 (S1)** | **PASS** |
| **P1-002 (S1)** | **PASS** |
| **P1-003 (S1)** | **PASS** |
| **P1-004 (S1)** | **PASS** |
| **P1-005 (S1)** | **PASS** (two WebKit module logs are at descendant `9d79886`, which has no runtime change) |
| **P1-N001 (S1, new)** | **FAIL**: Chromium full suite 167/168 and Firefox layout 55/56 exit 1 on `layout:COST`; non-regression is not "green" |

## New / Remaining Defects

| ID | Severity | Finding | Required correction |
|---|---|---|---|
| **J-001** | **S0** | `rho` is only a product of axis scales. Because §4.2 may fail to classify small skew/rotation layers, `|delta|*max(1,rho)` is not a valid screen-space component bound. | Make the support/keep proof compositional for the full supported linear map: prove every participant ancestor axis-diagonal, or carry a conservative full linear-map bound; otherwise retarget/snap. Add the cumulative-skew regression. |
| **J-004** | **S1** | The same invalid scalar bound can suppress `'stale'` reporting above a valid threshold. | Use the same sound screen-space bound in §4.4 and `staleReported`; prove the cumulative case reports. |
| **P0-N002** | **S0** | The propagated measured interval can absorb unsupported geometry one level at a time (`O=201`, `k=0.0048`: total width mismatch 2.8944 px by the third ancestor with no classifier read). | Do not propagate unexplained measured scale as proof of an ancestor's supported scale; add multi-level skew/rotation tests. |
| **P1-N001** | **S1** | The recorded full suite is not green on `layout:COST`. | Return a green existing-suite run, or obtain an explicit owner-approved amendment excluding the legacy row from the P1 gate and defining the replacement evidence. |

## Re-Judgment Entry Criteria

1. J-001/P0-N002: a corrected §4.2 + §5.7 proof and implementation where the three-level skew
   construction cannot reach `'unchanged'` as a supported tree.
2. J-004: the same construction cannot suppress stale reporting.
3. P1-N001: the existing-suite commands are green, or the plan carries an owner-approved amendment.
4. The focused affected suites and L-SPRING-1..4 remain green in their required engines.

**P0 SECOND RE-JUDGMENT: TRIBUNAL FAIL**

**P1 SECOND RE-JUDGMENT: TRIBUNAL FAIL**
