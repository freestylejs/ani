# P6 checkpoint — release (`p6_release`)

Skill: `judging-checkpoint-completion` (self-judgment, before the final Chief Justice). Authority:
`00_plan.md` P6, `packages/layout/ARCHITECTURE.md` §12, `p6_release_plan.md`, the package READMEs
and the P0–P5 tribunal results.

This is the implementer's verdict. It is not the final tribunal's PASS.

## Release identity

- Release commit: **`fe3ad081b81271d750af105b38319901f88be8c1`**.
- Evidence/docs commit: **`871d178cf0734257348426a90f04b006bb94e60c`** (this artifact; docs/log only).
- Branch: `dev/ecstatic-ramanujan-1mjr9q` (pushed).
- Versions: `@freestylejs/ani-core` **2.0.0**, `@freestylejs/ani-layout` **0.2.0**,
  `@freestylejs/ani-react` **2.0.0**; layout peer `ani-core ^2.0.0`, React peer
  `ani-layout ^0.2.0`.
- P5 certification: final TRIBUNAL PASS (`p5_bench_rejudgment_result.md`), on the `f552728`
  full report plus the owner-approved `ea1475c` lifecycle bridge; D13 repeat `2.000×`.
- P4: final J-001 TRIBUNAL PASS (`p4_drive_ratification_final_result.md`) after the unit landing
  regressions at `8cf346b`.

## Release work

### Docs and migration

- `packages/layout/README.md`: runtime, diagnostics/statuses, caps, drive, WAAPI limits,
  `layoutKey`, exact commands, D12/D13 cost rules, and the earned P5 evidence claim.
- `packages/react/README.md`: `LayoutGroup`, `useLayout`, `useLayoutDrive`, presence, StrictMode,
  trigger contract, migration and the earned evidence claim.
- `packages/web/content/docs/guides/layout.mdx`, `migration-v2.mdx`, `showcase/layout.mdx`: the
  hard migration, kind-level motion merge, `layoutKey`, current stats/read semantics, and the
  earned claim. No page boxes, inner-scroll `'stale'`, field-by-field merge, facade or legacy
  bridge.
- Source-comment/authority drift closed: `LayoutStats.reads` now includes `layoutOffsets`,
  `layoutOffsets` is in the authority stats block, and `drive-rejected`/`reduced-no-fit` are in the
  diagnostic code list.

### Versions and changesets

- `pnpm changeset version` consumed the release changesets and generated the package changelogs.
- Peer alignment: layout `ani-core ^2.0.0`; React `ani-layout ^0.2.0`.
- `pnpm install --frozen-lockfile` succeeds in the fresh clone; the lockfile is unchanged.
- No dead public export was added by this phase; the existing layout/React surface is typed.

### Hard-migration audit

- No board/canvas/editor product, no H10 brief, no unrelated app.
- No product path reintroduces page boxes, the inner-scroll `'stale'` cause, field-by-field motion
  merge, `play()`, `LayoutResult`, `deps`/`maxAnimated`/`maxBoxes`, or a compatibility alias.
- Historical `.trace`/test wording remains as evidence/anti-regression, not product docs.

## Fresh-clone gate (`/Users/june/Documents/project/freestylejs/ani-release`)

Cloned `dev/ecstatic-ramanujan-1mjr9q` at `fe3ad08`; clean tree.

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS (sharp source-build warning only) |
| `pnpm test` | **1929/1929 pass** (one transient worker failure on the first loaded run; two subsequent clean runs pass) |
| `pnpm ts:typecheck` | **11/11 tasks** |
| `pnpm check` | **0 errors**, 10 pre-existing warnings, 8495 infos |
| Chromium browser | **223/223 pass**, 0 failed, 0 known, 0 skipped |
| WebKit browser | **221/221 pass**, 0 failed, 0 known, 2 Chromium-only skips (one transient loaded run at 219/2 and one at 220/1 before the clean 221/0) |
| Bench smoke | **not completed** — attempted in the fresh clone; killed during warm-up scoring when the shared host reached load 56–61 from unrelated owner workloads. The P5 5-run certification is the deciding bench evidence; the release adds no bench scene/instrument change. Log retained at `bench/layout/iteration-13/run.log`; no pass is claimed. |
| Firefox | advisory (D5/D9); not a release gate |

The transient browser/unit failures occurred only on the first loaded runs while the host was
shared with unrelated owner workloads (load up to 32+); the clean reruns are recorded. They are not
relabelled as passes in the first attempts.

### Second fresh clone (`june-wsl`, Ubuntu 26.04 x64, 8 cores)

Cloned `dev/ecstatic-ramanujan-1mjr9q` at `67f0637`; clean tree.

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS (pnpm 10.20.0; codemod bin warning only) |
| `pnpm build` | **8/8 tasks** |
| `pnpm test` | **1929/1929 pass** |
| `pnpm ts:typecheck` | **11/11 tasks** |
| `pnpm check` | **0 errors**, 10 warnings, 8495 infos |
| Browser / bench | **not runnable**: Playwright 1.55 rejects Ubuntu 26.04 (`Playwright does not support chromium on ubuntu26.04-x64`); no Docker/Podman. No pass is claimed. |

The june-wsl unit/build/type/check results corroborate the Mac fresh-clone results. The Mac fresh
clone remains the browser evidence; the P5 D9 report remains the bench certification. The
owner-approved P6 carry-forward amendment
(`p6_carry_forward_amendment_20261030.md`) governs the bench/final-release certification for the
unchanged apparatus.

## P5 / P6 boundary

The P5 full report is at `bench/layout/iteration-12/pre-fix/report.json` (code `f552728`); the
release code `fe3ad08` adds only the P4 unit-test regression, the P6 docs/versions and test
formatting after the accepted `ea1475c` bridge. No P5 scene, scorer, gate, tolerance, cost fixture
or production motion changed. The P5 tribunal accepted this evidence composition and ordered no
fresh full bench solely for the bridge; the release-phase changes are docs/test/version only.

## Residual S3

- P5 G11 repeat-3 is exactly 2.000×; two extra repeats failed G11 at higher load. The claim is
  bounded Chromium/WebKit Playwright evidence under D5/D8–D13, not arbitrary-load performance or
  iOS-device/Mobile Safari certification.
- WebKit cost is D12 BLOCK/advisory; its frame/scoring/shape/status rows decide and pass.
- The fresh-clone gate was run on a shared host; transient failures were retried to clean runs and
  are disclosed. A fully quiet new instrument is not available.
- Firefox is advisory.
- The retarget-only planner fast path, per-scope scratch buffers and the P4 scope-local hold
  limitations remain maintenance bounds.

## Self verdict

**P6 release work: FINAL TRIBUNAL PASS; the complete P0–P6 program is FINAL TRIBUNAL PASS and
release-approved for `fe3ad08`.** The versions, docs, migration, hard-migration audit, P5 claim and
fresh-clone gate are green. The owner-approved P6 carry-forward amendment closed J-FINAL-001 on the
unchanged release apparatus/motion; the final judge accepted the P5 f552728 full/repeat + ea1475c
bridge, the Mac fresh-clone browser evidence, and the june-wsl fresh-clone build/unit/type/check
corroboration. No source motion or gate changed after the accepted P5 bridge.

## Final P0–P6 tribunal

**FINAL TRIBUNAL PASS** — `final_tribunal_rejudgment_result.md`, judge
`openai/gpt-6.1-sol#high` (owner-authorized superseding final route), 2026-10-30. J-FINAL-001 is
closed; open S0/S1/S2 = 0. Release approval: **YES** for `fe3ad08`, within the bounded D5/D8–D13
Chromium/WebKit Playwright claim; it is not iOS-device/Mobile Safari certification. The prior P6
BLOCK report (`final_tribunal_result.md`) is preserved as history.
