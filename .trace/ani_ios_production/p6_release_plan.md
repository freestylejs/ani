# P6 Release — plan and final-gate checklist

Authority: `00_plan.md` P6, `packages/layout/ARCHITECTURE.md` §12 and the package READMEs. The
release may call the system "iOS-native-grade" only after the complete P1–P5 evidence body is green
and every carried tribunal defect is closed.

## Preconditions

- P0/P1/P2 combined TRIBUNAL PASS (`p2_measured_trial_result.md`).
- P3 TRIBUNAL PASS (`p3_safety.md` + `p3_safety_trial_result.md`).
- P4 TRIBUNAL PASS (`p4_drive.md` + `p4_drive_trial_result.md`).
- P5 TRIBUNAL PASS (`p5_bench.md` + `p5_bench_trial_result.md`), all required scenes green in
  Chromium and WebKit, commit cost ≤ 2× the audited floor, steady/sustained/held/exact-read gates
  green, no weakened tolerance.
- No open S0/S1 finding from any checkpoint.

## Release work

1. **Docs**
   - `packages/layout/README.md`: runtime, diagnostics, statuses, caps, drive, engine limits,
     exact commands; no stale "field-by-field" wording; no claim beyond the evidence.
   - `packages/react/README.md`: `LayoutGroup`, `useLayout`, `useLayoutDrive`, presence, StrictMode,
     trigger contract.
   - `packages/web/content/docs/guides/layout.mdx` and related API pages.
   - Migration notes from the previous 0.1/0.2 surface; hard migration: no page boxes, no inner
     scroll `'stale'`, no field merge, no legacy bridge.
2. **Versions/changesets**
   - Changesets for `@freestylejs/ani-layout` and its React entry; peer dependency alignment with
     `@freestylejs/ani-core`; no mismatched workspace versions.
   - Package exports/types for every new public symbol; no dead export.
3. **Hard-migration audit**
   - Search the tree for obsolete 0.2.0 wording, page boxes, inner-scroll stale, field merge.
   - Confirm no board/canvas product, no H10 brief, no unrelated app.
4. **Fresh-clone gate**
   - Clone the pushed branch into a new directory; `pnpm install --frozen-lockfile`,
     `pnpm test`, `pnpm ts:typecheck`, `pnpm check`, full browser suite Chromium/WebKit,
     e2e/P5 certification.
   - The docs-example typecheck must resolve `@freestylejs/ani-layout` without a hoisted symlink.
5. **Final review**
   - Remove dead code/abstractions created by the drive/safety work.
   - Re-check every earlier tribunal defect and remediation mapping.
   - Re-run the P5 certification on the final release commit; a docs-only change after the run
     requires a new run if it changes a scene or the instrument.
6. **Final tribunal**
   - Chief Justice reviews P0–P6, the fresh-clone logs, P5 report and the release diff.
   - Program completion requires `TRIBUNAL PASS` on every checkpoint.

## Commands (certification instrument)

```sh
git clone <release-ref> ani-release && cd ani-release
pnpm install --frozen-lockfile
pnpm test
pnpm ts:typecheck
pnpm check
pnpm test:browser --browser chromium
pnpm test:browser --browser webkit
pnpm bench:layout --check
```

Firefox is advisory (D5/D9); a launch failure on macOS 27 is recorded, not counted as a pass.

## Forbidden

- Declaring iOS Native Grade from a demo, a visual impression, a P5 run with a mismatched
  fingerprint, or a scene that skipped a metric.
- Weakening a tolerance to make the release green.
- Reintroducing a board/canvas/editor product as proof.
- Publishing while an S0/S1 tribunal finding is open.
