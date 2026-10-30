# P6 carry-forward amendment — 2026-10-30

Status: **owner-approved**. J-FINAL-001 is closed by a narrow procedural carry-forward; no gate,
tolerance, scene or motion is changed.

## Situation

The final P0–P6 tribunal passed P0–P5 and blocked P6 only on J-FINAL-001: the P6 plan requires a
fresh-clone/final-release certification, and the fresh-clone bench smoke was killed during warm-up
scoring when the shared host reached load 56–61 from unrelated owner workloads. The release code
`fe3ad08` (evidence `67f0637`) has no bench scene, scorer, gate, tolerance, cost fixture or
production motion change after the accepted P5 bridge:
- P5 full report `f552728`: all 11 scenes and 23 variants, G11 1.959×, G9/G10/G12/G13 green.
- P5 independent D13 repeat `f552728`: G11 2.000×, G9/G10/G12 green.
- Accepted lifecycle bridge `ea1475c`; test-only P4 regression `8cf346b`; P6 docs/versions only.

The fresh clone on the Mac passed `pnpm install --frozen-lockfile`, unit **1929/1929**, typecheck
**11/11**, check **0 errors**, Chromium **223/223**, WebKit **221/221 + 2 Chromium-only skips**
(after disclosed loaded retries). The killed iteration-13 smoke is **not** a pass and is not
relabelled.

A second fresh clone on `june-wsl` (Ubuntu 26.04, 8 cores, lower host load) at the same release
commit also passed `pnpm install --frozen-lockfile`, `pnpm build` **8/8**, unit **1929/1929**,
typecheck **11/11** and check **0 errors**. Its browser/bench steps are not runnable there:
Playwright 1.55 rejects Ubuntu 26.04 (`Playwright does not support chromium on
ubuntu26.04-x64`) and no Docker/Podman is installed. The Mac fresh clone remains the browser
evidence; no june-wsl browser/bench pass is claimed.

## Ruling

- For the unchanged release apparatus and motion, the accepted P5 `f552728` full report + D13
  repeat + `ea1475c` lifecycle bridge are the **P6 bench certification**. A fresh-clone 5-run
  bench is not required solely for the P6 docs/test/version delta.
- The fresh-clone unit/typecheck/check/Chromium/WebKit results decide the P6 release checks.
- The killed iteration-13 smoke remains an incomplete attempt; it is not evidence of a pass.
- This is a **procedural carry-forward**, not a waiver of any P5 scene, gate, tolerance, cost or
  fingerprint rule. Any future change to a scene, scorer, gate, tolerance, cost fixture,
  instrument or executable motion requires a new certification.
- The final tribunal must still independently judge the release and the complete P0–P6 evidence
  body; this amendment closes only the identified procedural prerequisite.

## Evidence

- `.trace/ani_ios_production/p5_bench_rejudgment_result.md` — final P5 TRIBUNAL PASS.
- `bench/layout/iteration-12/pre-fix/report.json` — certified full report.
- `bench/layout/iteration-12/pre-fix/cost-repeat-3.json` — D13 repeat.
- `.trace/ani_ios_production/p5_final_evidence_ruling_20261030.md` — P5 bridge.
- `p6_release.md`, `bench/layout/iteration-13/run.log` — release/fresh-clone evidence and the
  killed smoke log.
- Final tribunal `final_tribunal_result.md` — J-FINAL-001 and its two allowed closure routes.
- Owner ruling 2026-10-30: approve the P6 carry-forward amendment.
