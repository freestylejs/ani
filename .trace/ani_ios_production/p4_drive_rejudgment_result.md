# P4 J-001 Re-judgment — Acting Chief Justice

## Verdict

- **J-001: PASS.**
- **Final P4 `p4_drive`: PASS, acting verdict only.** This remains pending ratification by `gpt-5.6-sol`.
- **P5 is not judged or certified.**
- Revision inspected: `3992a6d`, no pre-existing source/test/authority changes; contained by `origin/dev/ecstatic-ramanujan-1mjr9q`. The only current untracked file is this permitted verdict report.

## Evidence inspected

- Prior failure: `.trace/ani_ios_production/p4_drive_trial_result.md`.
- Remediation claim: `.trace/ani_ios_production/p4_drive.md`, J-001 section.
- Source: `packages/layout/src/scope.ts` and `packages/layout/src/runtime.ts`.
- New browser rows: `tests/browser/cases/layout_drive.ts`.
- Recorded J-001 gates: `.trace/ani_ios_production/logs/j001/`.
- Preservation baseline: diff from P3 revision `46b1487`.

## J-001 re-check

1. `invalidateHold()` now assigns `invalidated` for every non-invalidated hold state before clearing the hold and release track. The live states are `held`, `released`, and `cancelled`.
2. The source paths for kill switch, transactional abort, mover cap, removal/adoption, support failure, `finish`, and `dispose` either call this helper or mark support failure invalidated before the normal cleanup step calls it. `stats.holds` therefore cannot hide a stale public landing state.
3. `finishHold()` does not call `invalidateHold()` and leaves the existing `released`/`cancelled` state intact on natural completion. The normal-completion controls assert this for both states.
4. `L_DRIVE_4` adds released and cancelled landing × kill-switch rows. They assert invalidated handle, zero holds, byte-identical styles, zero clock, listener removal, marker cleanup, and `runtime-disabled` diagnostics.
5. `L_DRIVE_EDGES` adds released and cancelled landing × transactional-abort rows. They assert invalidated handle, zero holds, byte-identical styles, zero clock, listener removal, marker cleanup, and `internal-error` diagnostics.
6. `RuntimeScope.resume()` calls `syncListeners()` after returning to animate; disabled cleanup calls `disarm()`. The FUZZ row checks listener balance and the handoff-scroll path in both required engines.

## Recorded gate results

| Gate | Result |
|---|---|
| Unit | 1,892 / 1,892; 153 files |
| Chromium | 223 passed, 0 failed, 0 known failures, 0 skipped |
| WebKit | 221 passed, 0 failed, 0 known failures, 2 Chromium-only skips |
| Coverage | 92.27% statements / 80.35% branches / 95.48% functions / 94.76% lines |
| FUZZ | 16 seeds passed; handoff-scroll degradation and listener balance covered |

The Chromium and WebKit logs both report the new released/cancelled kill-switch and abort rows passing. No known-failure inventory is populated.

## Preservation and defects

- `L_OPS_1`, `L_OPS_2`, `L_A11Y_1`, `FUZZ`, `CAPS_STATUS`, `L_OPS_MAXP_LATE`, `L_MEAS_11_LATE_HANDOFF`, and the mutation controls pass in both engine logs.
- The P3/H11b/H12/N1-N3 browser files have no weakened or removed rows. The only baseline deletion is the former M7 deferral message, replaced by an executable `L-DRIVE-1` control; all other changes are additive.
- No new S0, S1, or S2 defect was found. J-001 has no remaining defect in the inspected implementation/evidence chain.

## Final ruling

The prior P4 FAIL is overturned for this re-judgment: the live landing invalidation defect is fixed, normal landing terminal states are preserved, listener re-arming is explicit, and the exact required gates are green. **ACTING PASS for P4 `p4_drive`, pending `gpt-5.6-sol` ratification.**
