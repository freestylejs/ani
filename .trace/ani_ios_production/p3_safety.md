# P3 checkpoint — self-judgment (`p3_safety`)

Skill: `judging-checkpoint-completion` (self-judgment, before the Chief Justice). Authority:
`packages/layout/ARCHITECTURE.md` §7.1, §7.2, §7.3, §8, §9.1–§9.4, §11.2 L-OPS-1/2/2b and
L-A11Y-1, §11.3; `00_plan.md` P3; clarifications C1–C6 in `p3_authority_clarifications.md`.

This is the implementer's verdict. It is not the tribunal's PASS.

## Deliverables

- P3a (`H11b`): `layoutRuntime`, diagnostics, listener/onSnap isolation, transactional flush/frame
  boundary, `'failed'`/`'disabled'` precedence, `maxParticipants`/mover caps, L-OPS-1/2/2b.
- P3b (`H12`): crossfade follower `inert`, focus ownership, focus-in-follower (including nested
  closed shadow roots), lifecycle fuzz, mutation/negative controls, adversarial caps/status.
- Docs: layout README and docs guide.

## Gate evidence (merged P3 head)

| Gate | Evidence | Result |
|---|---|---|
| Unit | `logs/p3-final` / full run: **152 files, 1,874 tests** | PASS |
| Types | **11/11 turbo tasks** | PASS |
| Biome | **0 errors**, 10 pre-existing warnings | PASS |
| Chromium full | **209 passed, 0 failed, 0 known, 0 skipped** | PASS |
| WebKit full | **207 passed, 0 failed, 0 known, 2 Chromium-only skips** | PASS |
| Coverage (Chromium) | statements **92.78%**, branches **82.65%**, functions **95.21%**, lines **95.56%**; floors 90/80/95/92 | PASS |
| Required modules | `layout` 55, `layout_ops` 10, `layout_meas` 20, `layout_spring` 4, `react_layout` 21, `react_layout_r18` 21, `waapi` 6, `showcase` 11, `regressions` 5 = **153/153** each | PASS |
| `knownFailures` | empty in every module | PASS |
| Firefox | `firefox-1490` launch timeout on macOS 27; advisory exception (D5/D9) | EXCEPTION |

## L-OPS / L-A11Y evidence

| Row | Evidence | Result |
|---|---|---|
| L-OPS-1 | Kill switch mid-run (explicit + implicit) and P3 crossfade/presence hold; live tracks finish, styles restore, pending reports `'disabled'`, clock 0; P3 hold is not a drive hold (C3; drive-hold is L-DRIVE-4/P4) | PASS |
| L-OPS-2 | Injected engine faults `measure`/`write`/`animate` → `'failed'`, every affected node `snapped:'failed'`, styles byte-identical, clock 0, no animation/listener/subscription, exact `internal-error` payload; track-finish, capped-flush and kill-switch fault cases | PASS |
| L-OPS-2b | Injecting `onSnap` or a diagnostic listener → `callback-error` to other listeners only, engine state unchanged, async dev rethrow, exact payload/order; reentrant `flush`/`dispose`/`setMode` preserved | PASS |
| L-A11Y-1 | Reorder/re-render keeps `activeElement`; crossfade follower `inert` from first frame; byte-exact restore on reversal/unmount/abort/dispose; authored value preserved; focus-in-follower skip through nested closed shadow roots, lead at A, follower exits presence-alone, one `focus-in-follower` action none; continuing/held follower focus drops the pair so no duplicate target | PASS |
| FUZZ | Seeded browser model with capture, frames, flush, scroll, reflow, detach/re-add, document, layoutKey, take/move/release/cancel (P3 stubs), reduced motion, kill switch, visibility, faults; exact statuses/snapped/diagnostics, per-node B (own/partner/retained or reported snap), per-document read-after-write, one-writer count, idle restore | PASS |
| MUTATION | M2 real frame-marker mutation fails L-MEAS-13; M3/M5/M6 real decisions; M1 is labelled checker control (aged B reused); M4/M8 labelled synthetic; M7 deferred to P4/L-DRIVE-1 (C3); M5 WebKit is the §5.8 no-scrollend fallback, not a mutation | PASS with labels |
| CAPS / CAPS_STATUS | participant cap zero reads, late mount over cap no read, capped capture latches, mover cap, kill-switch precedence, cap+follower fault restore | PASS |

## Review/fix history

- H11b independent review: OPS-01/02/03/04 fixed; N1/N2/N3 fixed and re-verified (late handoff,
  captureAdded cap read, capped-capture latching). No new S0/S1/S2.
- H12 independent review: H12-01/02/03/04 fixed; fuzz/mutation evidence rebuilt (real B identity,
  per-document writes, one-writer, exact statuses, real scroll containment, real/synthetic labels);
  final re-review PASS with only S3 hardening notes.
- Authority contradictions resolved by C1–C6: per-node stale diagnostics; engine vs callback faults;
  P3/P4 hold boundary; `measurement-unsupported` deferred until the S1 fallback; focus-skipped
  follower not inert; per-document read-after-write.

## Accepted S3 / residual risks

- M1/M4/M8 are honest checker/synthetic negative controls, not source-level mutants; M7 is P4.
- WebKit has no `scrollend`; the §5.8 conservative fallback is normative and documented. M5's real
  mutation is Chromium-only.
- FUZZ is seeded and browser-only (16 deterministic sequences), not exhaustive; targeted controls
  cover the critical B/stale/fault decisions.
- The layout-owned idle check covers `translate`, `scale`, `opacity`, `inert`, radius and
  `overflow-anchor`; other authored properties are not layout-owned.
- `captureAdded` late mounts do not populate radius/scrolling/flat in all edge cases; covered by
  targeted rows, not exhaustive.
- Firefox advisory evidence is unavailable on the current instrument.
- P3 has no drive hold; the drive-hold kill switch is L-DRIVE-4 in P4 by C3.

## Self verdict

**P3 implementation and gates: PASS.** The safety surface is transactional, isolated, capped,
accessible and adversarially tested in Chromium and WebKit. The Chief Justice must independently
re-judge the evidence; no `TRIBUNAL PASS` is claimed by this document. P4 drive and P5 native-grade
certification remain future gates.
