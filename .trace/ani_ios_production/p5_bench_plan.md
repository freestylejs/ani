# P5 native-grade certification — plan and report contract

Authority: `packages/layout/ARCHITECTURE.md` §11.5/§11.6; `00_plan.md` P5; D8/D9; H14 harness
README. This is the final proof phase. A PASS is a frame-by-frame report, not a visual impression.

## Preconditions

- P4 TRIBUNAL PASS; L-DRIVE-1..6 and G12 held evidence green.
- H14 harness certifiable: completeness, 5-run certification, controls/self-tests, exact floor,
  exact G13, WebKit cost either decidable with a documented protocol or an explicit amendment.
- H15 P2/P3 scenes and H16 drive scenes implemented, no placeholder/pending.
- H17 performance: G9 ≤ 2× floor and G11 60Hz sustained gate green, or a floor-audited owner
  amendment. WebKit cost decidable or explicitly amended.

## Scene set

S-CARD, S-PHOTO, S-SEG, S-ACC, S-STACK, S-ISLAND, S-INSERT, S-DELETE, S-BULK, S-REORDER, S-SHEET.
Each has a manual-clock script, a real-clock twin, per-participant/per-frame scoring, exact G13
reads, shape/status/restoration checks, a negative control and a viewable page.

## Gate matrix

| Gate | Requirement |
|---|---|
| G1 oracle geometry | ≤ 0.05 px (0.5 px only for a per-commit aged React participant) |
| G2 first-frame continuity | ≤ 0.05 px (aged per-commit 0.5 px) |
| G3 velocity continuity | ≤ 1% larger speed + 1 px/s, analytic + observed FD |
| G4 spring fidelity | §11.6 tolerance |
| G5 settle exactness | §11.6 tolerance |
| G6 restoration | full owned style/inert byte identity, removed participant at last connected |
| G7 status/degradation | exact status/snapped/diagnostic |
| G8 long frames | §11.6 |
| G9 commit cost | ≤ 2× audited required-work floor at 1,000/300, unscrolled/scrolled |
| G10 steady frame | p95 ≤ 2 ms at 300 nested movers |
| G11 sustained commits | 60 Hz 300 movers, commit p95 gate (or owner-approved floor-relative amendment) |
| G12 held frame | ≤ 0.1 ms per held element |
| G13 exact reads | 2N rects/offsets + §4.3 computed reads + poses; steady 0 |
| G14 fingerprint | matching D9 instrument; otherwise advisory cost |
| Shape | opacity/coverage/radius/pill/inert/focus/font/teardown |
| Certification | 5 measured runs, Chromium+WebKit, all scenes, no pending/launch errors, controls+self-tests pass, non-advisory cost |

## Iteration process

1. Run `pnpm bench:layout --runs 5 --engine chromium --engine webkit --check` on a quiet instrument.
2. For every failing metric: worst frame/participant, root-cause hypothesis, fix engine or scene,
   re-run. Never weaken a tolerance.
3. Keep `bench/layout/ITERATIONS.md` with before/after, failures and fixes.
4. Repeat until every required row is green in both deciding engines; S-BULK cost on a quiet
   instrument with matching fingerprint.

## Report contract

- Fingerprint, load, 5 per-run statistics, medians, `g`, floor audit, engine read audit.
- Scene/metric table with worst frame/participant; G1–G14 and shape.
- Certification object: certified true/false, reasons, controls/self-tests.
- Iteration log with every failure and fix; no weakened tolerance.
- Commit/apparatus hash.

## P5 checkpoint

- `p5_bench.md` self-judgment with the full report and iteration log.
- Chief Justice P5 tribunal; every P0–P5 checkpoint PASS required for P6.
- P5 PASS means the iOS Native Grade claim is earned on Chromium/WebKit Playwright; it is not
  iOS-device/Mobile Safari certification (D5).
