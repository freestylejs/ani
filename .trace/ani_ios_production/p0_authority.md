# P0 checkpoint — self-judgment (`p0_authority`)

Skill: `judging-checkpoint-completion`. Stance: the implementer's own tribunal, before the Chief
Justice's. Scope of P0 (from `00_plan.md`): the drift analysis, the rewrite of
`packages/layout/ARCHITECTURE.md` to the approved v3 design as the single authority, the plan, and
the core API note for `physics` and `Clock.inFrame`.

## Deliverables

| Deliverable | File | State |
|---|---|---|
| Phase plan with the final goal | `.trace/ani_ios_production/00_plan.md` | Written |
| Drift analysis (DR-01..DR-20) | `.trace/ani_ios_production/p0_drift.md` | Written |
| Layout authority v3 | `packages/layout/ARCHITECTURE.md` | Rewritten in full (no 0.2.0 text that contradicts v3 survives) |
| Core API note | `packages/core/src/API.md` | Written in the P1 checkpoint (`## physics`, `clock.inFrame` row). The first submission wrongly deferred it: the plan assigns it to P0 (tribunal J-005) |

## Drift closure matrix

| DR | Closed by (authority section) | Remaining work (code / tests / docs) |
|---|---|---|
| DR-01 page boxes | §3.2 view space; §5.7 re-expression by δ | P2 |
| DR-02 driven nodes not read | §4.1 reads every participant | P2 |
| DR-03 analytic B at flush | §4.1 aging; §4.2 "an analytic box never substitutes"; §4.4 | P2 |
| DR-04 inner-scroll `'stale'` | §4.4 (the only meaning of `'stale'`); §9.1 | P2, P6 docs |
| DR-05 core API frozen | §2.1 (D2: `physics`, `Clock.inFrame`) | P1 |
| DR-06 out-of-scope list | §2.1 (drive in scope; markers unnecessary) | — |
| DR-07 motion type | §5.1 union; §5.3 spring | P1 |
| DR-08 field merge | §5.1 kind-level merge, one function; §7.3 | P1 |
| DR-09 crossfade/radius progress | §5.3 perceptual timeline; §5.8; §5.9 | P1 |
| DR-10 reduced motion | §9.4 grid search | P1 |
| DR-11 WAAPI rules | §10 rejects springs, drives | P1, P4 |
| DR-12 statuses, ops, caps, key | §7.1, §7.2, §9.1, §9.3, §4.7 | P2, P3 |
| DR-13 drive seam | §5.10 | P4 |
| DR-14 transactions | §9.2 | P3 |
| DR-15 inert/focus | §5.8, §6, §8 | P3 |
| DR-16 React drive dispatcher, portal scope | §7.3, §4.6 | P2, P4 |
| DR-17 cost gates without an instrument | §11.5 bench harness (D5) | P5 |
| DR-18 reference machine | §11.5 states it | P5 meets the gates |
| DR-19 versions | — (release work) | P6 |
| DR-20 trace pointer | header | — |

## Refinements of the signed-off design (implementation-grade details, none changes a decision)

The v3 design record left these at design level; the authority states them exactly. Each is
consistent with v3's text and its intent ("snap, never wrong motion"):

1. **Support check at any scale** (§4.2). v3 says "within 1 px plus 0.5 %" of the rect size. With
   `offsetWidth` rounded to an integer, a rect-space tolerance gives false positives at large
   scales (10× of a 50 px box: rounding error 5 px vs 3.5 px tolerance). The authority compares in
   layout px (`rect / expected scale` vs layout size), and computes the expected scale top-down
   from the parent's measured scale, reading a node's computed transform values only when the
   pose-only expectation mismatches (an authored `scale`, e.g. `hover:scale-105`, would otherwise be
   a false positive, since v3's "known scales" omitted the node's own inner map).
2. **Kept-track re-expression** (§5.7). A kept track is translated by `δ = A_new − A_old` and lands
   exactly on `A_new`. A presented *resize* of the box is a target change (keep-test clause 2), so
   it retargets from the measured `(B, v)`: this is the only way to keep L-MEAS-7's first frame
   exact, since a pose computed against the old box draws a resized box at a different size.
3. **Capture-less vs aged reporting** (§4.4). With no capture nothing is known about undriven
   nodes, so they are not reported; with an aged capture, nodes whose A differs from the aged box
   are reported. Driven nodes are reported when `|δ| ≥ threshold`.
4. **Frame marker** (§4.1): the clock's `read(fn)` and the window's `requestAnimationFrame`,
   whichever runs first (a paused or manual clock still ages on a real rendering opportunity).
5. **Hand-off capture validity** (§4.1): the post-flush capture shows exactly what the next frame
   starts from (new tracks at their t = 0 pose = B), so it is valid under the same aging rule.
6. **Held descendants ride** (§5.10): v3 says children "stay in layout under the held map"; the
   authority defines the hold offset `h` and the release rule that keeps descendants continuous.
7. **`take` under the kill switch** returns an `invalidated` handle instead of throwing, so a
   gesture layer can fall back without a try/catch.
8. **`stats`** gains exact counters (`rects`, `offsets`, `styles`, `holds`), as v3 §3.10 requires
   ("`stats` counts every read").
9. **Radius blend source** (§5.9): v3 forbids an analytic or stale B; the third source of 0.2.0
   ("stored geometry from the last ordinary measurement") is therefore removed. With no valid
   source there is no blend.

## Judgment matrix

| Criterion | Evidence | Verdict |
|---|---|---|
| Every v3 decision placed in the authority | v3 §3.1–§3.10 → §3, §4; §4 → §5.1–§5.3, §9.4, §10; §5 → §5.10, §7.3; §6 → §9; §7 → §7.2; §8 → §8; §9 → §7, §2.1; §10 → §7.4 (modules, plus `runtime.ts`); §11 → §11; §14 → §12 | PASS |
| No surviving contradiction with v3 | Searched for "page box", "page scroll", "not read", "inner scroll", "field by field", "does not change": only the header's removal note, a row title (L-MEAS-8) and a mutation test name | PASS |
| Hard migration (no bridge text) | No "legacy", "compat", "deprecated" path in the authority | PASS |
| Drift matrix closed at doc level | Table above: every DR has a section or a phase | PASS |
| Core API note | First submission: deferred, which the plan does not allow (J-005, FAIL). Remediated: `packages/core/src/API.md` documents `physics` and `clock.inFrame`, both now exported | PASS after remediation |

**First self verdict: PASS** for P0. The tribunal ruled **FAIL** (2 S0, 4 S1, 1 S3;
`p0_authority_trial_result.md`). My verdict missed J-001 and J-002 because I checked coverage
and wording, not whether each refinement keeps "snap, never wrong motion".

## Remediation (re-judged with P1)

| ID | Defect | Correction (authority section) | Proof |
|---|---|---|---|
| J-001 S0 | Raw-δ keep is wrong under a live ancestor scale | §5.7: three exclusive paths. Unchanged when `|δ| < 0.01 px`. Translated by δ only when every participant ancestor's pose scale is 1 at `t_k` and its inner-map scale is unchanged since planning. Otherwise retarget from measured `(B, v)`. Invariant 5 states the exception. L-MEAS-4/7 rows name both paths and a nested case | `p1_proofs.mjs`: 10 px raw-δ error at scale 0.5 reproduced; path 3 first frame = B; path 2 exact at scale 1 |
| J-002 S0 | Descendants animate the hold displacement under their own motions | §5.10: one inherited displacement `h(t)` owned by the held node through hold and landing. Descendants are drawn at residual + `h`. They are re-planned as residuals at take (`B − h`, `v − ḣ`). Release velocity enters once, through `h`. New row L-DRIVE-6; plan P4 gate is L-DRIVE-1..6 | `p1_proofs.mjs`: relative-geometry error 2.8e-14 under parent spring 0.5 s and child timing 0.1 s; the old rule detaches the child by 68.5 px; `h′(0) = v` |
| J-003 S1 | `rect / offsetWidth` propagated as exact | §4.2: interval propagation. Measured `M = [R/(O+1), R/(O−1)]`, expected `E = I_π·p·q`; pass iff `M ∩ E ≠ ∅`. An assumed `q` is not propagated; a wide interval with participant children forces a computed read. S1 spike (b) names the counterexample | `p1_proofs.mjs`: the 50.49 / 1000 px case passes at 0.1, 1 and 10 (the old rule's 9.705 px error reproduced); 0 false positives over 20,000 random supported chains; a 3 % unowned zoom under the small parent is detected |
| J-004 S1 | Capture-less undriven nodes not reported | §4.4: exhaustive, conservative rule against each node's last known box (the aged capture's box, else its A at its previous flush; a node with no known box is reported). Driven nodes are reported when `|δ| ≥ threshold`, or when δ is non-zero and the translation is not exact. `report.snapped`, `onSnap` and the diagnostic count use one rule; §9.1 points to §4.4. L-MEAS-11 enumerates the cases | Textual: §4.4 now matches signed v3 §3.5 ("each node that would have moved is reported") |
| J-005 S1 | Core API note missing | `packages/core/src/API.md` `## physics` and the `clock.inFrame` row (P1 implements and exports both) | `grep -n 'physics\|inFrame' packages/core/src/API.md` |
| J-006 S1 | Reference machine not reproducible; aggregation unspecified | §11.5: pinned environment table and fingerprint (any mismatch makes the report advisory). Measurement: cross-origin isolated `performance.now()`, a timer-granularity rule, nearest-rank percentiles. Per-gate per-run statistics; 1 warm-up run, then the median of 5 fresh-process runs, per engine | Fingerprint collected on the pinned container (Ubuntu 24.04.5, 6.18.44, 4 × Xeon @ 2.80GHz, 16 GB, Node 22.22.0, Playwright 1.55.0, chromium_headless_shell-1187, webkit-2203) |
| J-007 S3 | "`onSnap` stays as it is, isolated" | §7.2: the API surface stays; isolation is the P3 behaviour change (§9.2) | Text |

References: 173 `§` references, 0 missing targets after the edits. Legacy terms ("page box",
"inner-scroll", "analytic before-box", "field-by-field") occur only in the header's removal note.

## Second remediation (re-judged with P1, after `p1_spring_trial_result.md`)

The P1 tribunal reopened J-001 and J-004 and added P0-N001. All three are corrected in the
authority (81893f3) and in `measure.ts` (f94848d). The proofs are in `p1_spring.md` § Second
remediation.
- **J-001 and J-004.** Every cut-off is judged in screen space (`|δ|·max(1, ρ)`).
- **P0-N001.** A degenerate axis reads the exact computed size.
