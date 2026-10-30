# P5 tribunal brief — iOS Native Grade certification

You are the Chief Justice (or acting Chief Justice) for checkpoint **P5 `p5_bench`** of the ani iOS
Native Grade program. Work read-only under the `judging-checkpoint-completion` standard. Do not
modify source, tests, authority, gates, scenes, or the evidence. Your only output is
`.trace/ani_ios_production/p5_bench_trial_result.md` in the trial worktree and a final verdict in
the conversation.

## Authority

- `.trace/ani_ios_production/00_plan.md` — P5, D5/D8/D9/D10/D11/D12/D13.
- `packages/layout/ARCHITECTURE.md` §11.5/§11.6, §4.1–§4.4, §5.5/§5.7/§5.8/§5.10, §6, §7,
  §9.1–§9.4, §11.2.
- `.trace/ani_ios_production/p5_bench_plan.md`, `p5_scene_spec.md`,
  `p5_scene_clarifications.md`.
- Gate amendments: `gate_amendment_20261028.md`, `gate_amendment_g11_20261029.md`,
  `gate_amendment_g12_20261029.md`, `gate_amendment_webkit_cost_20261029.md`,
  `gate_amendment_controlled_load_20261030.md`.
- Prior checkpoints: P0–P3 TRIBUNAL PASS; P4 ACTING PASS pending gpt-sol ratification.

## Evidence to inspect

- `.trace/ani_ios_production/p5_bench.md` — self-judgment.
- `bench/layout/iteration-12/report.json` — final combined five-run Chromium+WebKit `--check`
  report.
- `bench/layout/iteration-12/cost-repeat.json` — second independent five-run Chromium cost
  invocation required by D13.
- `bench/layout/iteration-12/run.log`, `cost-repeat.log`.
- `bench/layout/iteration-11/hang-probe-chromium.json` / `.log` — 1-run isolation evidence.
- `bench/layout/iteration-10/report.json` / `variants.md` — DPR/reduced-motion support rows.
- `bench/layout/ITERATIONS.md`, `bench/layout/README.md`.
- Unit/browser/bench logs cited by `p5_bench.md`.

## Required review

1. **Coverage.** Every P5 authority row: 11 scenes (S-CARD, S-SEG, S-PHOTO, S-STACK, S-ISLAND,
   S-ACC, S-INSERT, S-DELETE, S-REORDER, S-SHEET, S-BULK), 8 DPR variants, 15 reduced-motion
   variants, both engines, all G1–G13/shape/status rows.
2. **Evidence chain.** Open the reports, not only the summary. Verify `sourceRevision`,
   fingerprint, load/controlled-load, per-run medians, worst frames/participants, exact G13 reads,
   floor audits, controls/self-tests, certification reasons/advisory, and that no scene is missing
   or `pending`.
3. **D13.** Two independent five-run Chromium cost invocations (full + cost-only repeat) both
   show G11 median ≤2× and G9/G10/G12 green. A load >1.0 is controlled-load evidence, not a pass;
   a hard fingerprint mismatch is advisory and cannot certify.
4. **D12.** WebKit frame/scoring/shape/status rows are green; WebKit cost rows (G8–G12) are
   BLOCK/advisory and not fabricated. A WebKit frame failure still fails.
5. **Integrity.** No gate/tolerance/row/scene weakening, no `knownFailure`, no skipped metric, no
   fabricated ratio, no stale report cited as final. The H18/H20/H22 fixes and H17i fast path are
   covered by tests and scenes.
6. **Independent re-checks.** Re-run light checks where feasible (layout unit, bench self-tests,
   typecheck, a focused browser row). Do not run a deciding cost gate on a different host.
7. **Defects.** Assign S0–S3, and give a repair disposition for every S0/S1/S2.

## Output

Write `p5_bench_trial_result.md` with: verdict (TRIBUNAL PASS / FAIL / BLOCK), authority coverage,
judgment matrix, defects, independent re-checks, residual S3, and the exact evidence paths. State
the judge route and whether it is final or acting. Do not claim iOS Native Grade if any required
row is missing, blocked, or only advisory for a deciding gate.
