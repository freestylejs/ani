# P2 checkpoint — self-judgment (`p2_measured`)

Skill: `judging-checkpoint-completion` (self-judgment, before the Chief Justice). Scope from
`00_plan.md`: measured presentation, capture/aging, view-space planning, pose inversion and keep
test, support check, capture-less/aged flush, flat-tree ancestry, document affinity, `layoutKey`,
active-scroll handoff, retained view boxes, plus the carried P0/P1 defects.

This is the implementer's verdict. It is not the tribunal's PASS.

## Deliverables and gate evidence

| Gate | Evidence | Result |
|---|---|---|
| Unit and property tests | `logs/p2-close/unit.log`: 145 files, **1,798/1,798** | PASS |
| Types | `logs/p2-close/typecheck.log`: **11/11 tasks** | PASS |
| Lint/format | `logs/p2-close/biome.log`: exit 0, **0 errors**, 10 pre-existing warnings | PASS |
| Chromium full browser suite | `logs/p2-close/chromium.log`: **197 passed, 0 failed, 0 known, 0 skipped** | PASS |
| WebKit full browser suite | `logs/p2-close/webkit.log`: **195 passed, 0 failed, 0 known, 2 skipped** | PASS |
| Retired COST row | `layout:COST` is not a case (`--list` has no COST); D8 and §11.5 own the P5 relative floor gate | PASS |
| RL3 intended sequence | `logs/p2-close/h11a-webkit-r18.log` (3 consecutive under 20× `yes` load) + Chromium/WebKit React 18.3/19 logs | PASS |
| RL3 aged outcome | `RL3_AGED` deterministically advances the manual clock between the group's render capture and commit; `'stale' acdebf`, every list item at its layout box, no other snap reason | PASS |
| L-MEAS-1..13, L-HAND-1..2, L-KEY-1, L-DOC-1 | Included in the full Chromium/WebKit suites; empty `knownFailures` | PASS |
| Firefox | Advisory (D5/D9). `firefox-1490` aborts on macOS 27 at launch; recorded as an environment exception, not an engine pass | EXCEPTION |

## H11a — RL3 closure

The H6b failure was:

```
FAIL react_layout_r18:RL3
    b moved by 38.00 px while time stood still
    console.warn: [ani-layout] no valid measurement ...
```

The engine was correct: the commit landed after the render's capture aged, §4.4 snapped every
participant to `A`, and the scope warned once. The row assumed motion.

The fix is test-only (`tests/browser/cases/react_layout.ts`):

- `RL3` now accepts an aged commit, checks the exact `'stale'` set and that every list participant is
  at its layout box with the authored style, then retries the intended measured sequence up to 3
  attempts. It fails if the intended sequence never happens.
- `RL3_AGED` makes the aged branch deterministic: a child calls `manualClock.frame(16)` after the
  group's render capture and before its commit. It asserts the same exact aged outcome.
- RL4/RL5 are untouched.

Evidence:

- WebKit React 18.3, 20× CPU load, 3 consecutive runs: all green (`h11a-webkit-r18.log`).
- Chromium/WebKit, React 18.3 and 19, under load: all green
  (`h11a-chromium-react_layout*.log`, `h11a-webkit-react_layout.log`).
- Full `react_layout` + `react_layout_r18` modules: **42/42** in Chromium and **42/42** in WebKit.

## Carried P0/P1 defects

| ID | Prior finding | Current evidence | Self status |
|---|---|---|---|
| J-001 (S0) | kept-track re-expression wrong under a live ancestor map | `aaa642a`: path 1 is decided by the measured jump `J = D − B`; `KP-1` covers the 323× case; `L-MEAS-4/7` green | CODE PASS, re-judgment required |
| J-004 (S1) | stale reporting could be suppressed by a scalar bound | `aaa642a`: screen-space `β = (R_axis / min(w,h))·max(e_x,e_y)`; `ST-3` covers the 300× case; `L-MEAS-11` green | CODE PASS, re-judgment required |
| P0-N002 (S0) | measured interval propagated as proof, accumulating skew | `aaa642a`: exact model `E = E_π·p·q`, assumed `q` verified top-down only on failure; `SC-7` covers 3 and 1,999 levels | CODE PASS, re-judgment required |
| P1-001..005 | React validation, settle cap, physics domain, independent oracle, raw logs | Closed by the P1 re-judgment; the current full suites and `logs/p1/` remain | CLOSED |
| P1-N001 | existing suite not green on `layout:COST` | D8 retires the row; the remaining full suites are green; P5 owns the relative commit gate | CLOSED BY D8, pending tribunal acceptance |
| P0 J-002/J-003/J-005/J-006/J-007 | held release, scale rounding, core API note, environment pin, onSnap wording | Prior remediation; D9 re-pins the instrument; the P2 tribunal re-judges the set | CODE/DOC PASS, re-judgment required |

## Authority coherence

- The single authority is `packages/layout/ARCHITECTURE.md`; no legacy page-box, inner-scroll
  `'stale'` or field-by-field merge path is present.
- D8 is normative in §11.5; the retired row is absent from the browser cases.
- D9 records the reachable macOS instrument; old Linux cost reports are historical/advisory.
- Board scope remains absent: no `app/board`, no H10 brief, no board phase.
- The P5 harness is not part of P2 and is not claimed here.

## Self verdict

**P2 implementation and gates: PASS.** The remaining P0/P1 items are code-fixed and evidenced but
have not been re-judged since their FAILs. The combined P0/P1/P2 tribunal must decide whether those
remediations close the carried defects. No `TRIBUNAL PASS` is claimed by this document.

## Residual risks

- Firefox advisory evidence is unavailable on macOS 27; Chromium and WebKit are the deciding engines.
- The P5 relative commit gate and the §11.6 scene set are not yet built; no native-grade claim is
  made at P2.
- The H11a aged row is deterministic at the engine boundary; real React scheduling was also exercised
  under load, but a future scheduler change may need a new aging probe.
