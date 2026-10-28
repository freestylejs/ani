# H14 fix round — make the harness a judge, not a green printer (2026-10-29)

Independent review found one S0 and a set of S1 methodology defects. H14 is acceptable only as
scaffolding until these are fixed. This round must make a blank or partial trace fail, make the
cost measurement comparable and honest, and separate invocation results from certification.

## Base

Rebase `helper/h14` from `e443f35` onto the fixed H11b transaction `4eb2f7e` (H11b branch), or
merge the local H11b fix. Do not reset to origin. S-CARD `shape.inert` will still fail until H12
(P3b) is merged; that is an expected dependency, not a harness bug.

## Must fix (S0/S1)

1. **H14-01 (S0) completeness gate.** A zero-observation/zero-commit/zero-report trace must fail.
   Add a `ScenePlan` completeness contract: required observations, commits, settle frames, report
   labels, connected participants, validated `data-p` keys, opacities/fonts/radii where declared.
   `n/a` for any declared metric is a fail. Add a blank-trace negative control.
2. **H14-02 certification vs invocation.** Separate `pass` (selected invocation) from
   `certification` (5 measured runs, Chromium + WebKit, all required scenes, S-BULK cost, no
   pending, no launch errors, `advisory.cost === false`). `--runs 1`, single-engine, single-scene
   and advisory+passing-cost runs must not certify. Test all four.
3. **H14-03 floor comparability.** The authority floor now explicitly includes the §4.3 step 2
   computed reads for active nodes (see `packages/layout/ARCHITECTURE.md` §11.5 and
   `gate_amendment_20261028.md`). Add those reads to the floor, reset both fixtures between
   samples, and audit/report engine and floor rect/offset/style/pose counts. The engine and floor
   must start from the same rest state.
4. **H14-04/05 WebKit cost.** Do not treat 1 ms-quantized 30-sample medians as a measured 2.5×
   failure, and do not call a 30 Hz rAF frame with two 60 Hz commits a 60 Hz frame. Measure commit
   script cost per 60 Hz commit with one interval pair, or record the refresh rate and invalidate
   off-rate runs; use a finer/batched timing method for G9. If WebKit cannot be measured validly,
   report `BLOCK`/`not deciding`, not a fabricated ratio.
5. **H14-06 commit attribution.** Consume the commit flag at the next callback, charge the commit
   script to the batch that contains it; add a two-frame sampler unit test.
6. **H14-07 G3 engine continuity.** Add the presented-rect finite difference and/or actual track
   velocity; keep the analytic pair as evidence. Add a trace-level velocity-jump control.
7. **H14-08 G6 priority/restoration.** Record `getPropertyPriority` and full inline `cssText`;
   snapshot mounts before registration; check every removed participant at its last connected
   frame, including S-CARD's card follower.
8. **H14-09 G13 style reads.** Audit the §4.1/§4.3 computed-value set/count; fail over-reads and
   report per-commit style counts.
9. **H14-10 per-scene G9.** Report the engine/floor ratio at S-CARD/S-SEG N, clearly non-deciding;
   the named gate remains S-BULK at 1,000.
10. **H14-11 per-commit aged G2.** Track `capture-aged` per commit/participant; 0.5 px only for the
    aged ones, 0.05 otherwise.
11. **H14-12 20-frame sampling.** Time one 20-frame interval with one `performance.now()` pair and
    divide, or record the quantization error bound; do not average already-quantized per-frame
    costs and call it a 20-frame interval.

## S2 evidence

- H14-13: `pass:false`/`pending` while G12 is pending.
- H14-14: `card-no-inert` control is inconclusive at P3a; compare primary/control delta or wait for
  P3b.
- H14-15: retarget B = previous observation, not oracle ideal.
- H14-16: expose the data-only `window.__scene` descriptor or record the deviation.
- H14-17: use the A-19 150+150 shape for G10 or document the difference.
- H14-18: add `stats.test.ts` for nearest-rank, median, `g`, 20-frame path, empty/single.
- H14-19: use `activeElementKey` for a focus check and a follower-focus control.
- H14-20: one control per metric or a documented mapping (teardown, pill radius, G12, runner G14).
- H14-21: aggregate per-run finding gates; fail non-finite/missing runs.
- H14-22: check real twin diagnostics/final and removed participants at last connected frame.
- H14-23: correct README/ITERATIONS claims to what the code enforces.

## S3 polish

H14-24 report audit objects; H14-25 visual deviations or contributions; H14-26 CI/Biome;
H14-27 oracle reference label/high-bounce settle/dead code; H14-28 exact 5-warmup/30 + raw `g`;
H14-29 compare missing scenes; H14-30 real twin timing/easing; H14-31 `--check` controls;
H14-32 Firefox fingerprint advisory.

## Gate

- `pnpm test:bench-layout` includes the new completeness/stats/scoring tests.
- A blank trace fails; every control fails its target; `--check` exits 1 on a real miss.
- `--runs 5 --engine chromium --engine webkit` writes a report with an explicit `certification`
  field; a partial/advisory run cannot certify.
- Re-run S-CARD/S-SEG/S-BULK on the fixed H11b base. Report G9/G11 honestly; do not change a
  threshold. If WebKit cost is not measurable, return BLOCK with the exact evidence.
- No production source/test/authority edits; no push. Commit plain conventional messages.
- Final reply: commit hashes, each H14 ID with test/result, S-CARD/S-SEG/S-BULK table, floor audit,
  certification result, residual risks.
