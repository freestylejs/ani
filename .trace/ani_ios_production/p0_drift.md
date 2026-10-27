# P0 — documentation drift analysis (layout v3)

Method: `analyzing-documentation-drift`. Authority is not ambiguous for any row. The owner approved
the signed-off v3 design (`.trace/ani_layout_ios/architecture.md`, `3ae7dc7`) and every
recommendation of its §13 on 2026-10-27, so **the v3 design is the authority**. Every drift below is
therefore *Doc stale* (for the authority file, which must state the approved design) or *Code
stale* (an implementation gap that a phase closes). No question to the owner remains.

## Authority documents

| Document | Authority type | Domain | Confidence |
|---|---|---|---|
| `.trace/ani_layout_ios/architecture.md` (v3) | Approved design decision | Layout v3 | Highest: signed off and approved |
| `packages/layout/ARCHITECTURE.md` | Package authority | Layout engine, React adapter | Stale: states the 0.2.0 engine |
| `packages/layout/README.md` | User docs | Vanilla API | Follows the authority; updated in P9 |
| `packages/web/content/docs/guides/layout.mdx`, `showcase/layout.mdx` | User docs | Guide, showcase | Follows the authority; updated in P9 |
| `packages/react/README.md` | User docs | React entry list | Follows; updated in P9 |
| `packages/core/src/API.md` | Core API docs | Core exports | Gains `physics` and `Clock.inFrame` (P1) |
| `.changeset/ani-layout.md`, `.changeset/react-layout-adapter.md` | Release notes for 0.2.0 (unreleased) | Release | Rewritten in P9 (hard migration: one changeset for the shipped behaviour) |

## Drift List Matrix

| ID | Sev | Document | Claim (current text) | Authority (v3) | Drift type | Action | Phase |
|---|---|---|---|---|---|---|---|
| DR-01 | S1 | ARCHITECTURE §3.1 | "All boxes are page boxes" | Each flush plans in its own view space; kept tracks move by their rest displacement | Doc stale + Code stale | Rewrite §3.1; implement | P0, P2 |
| DR-02 | S1 | ARCHITECTURE §4.1 | "Driven nodes are not read" | Capture measures every participant, driven included; the analytic state gives only velocity | Doc + Code stale | Rewrite §4.1; implement | P0, P2 |
| DR-03 | S1 | ARCHITECTURE §4.2 | "B at flush: the engine's current drawn box … a frame between capture and flush is compensated exactly" | A capture that crossed a rendering opportunity is aged and never supplies B | Doc + Code stale | Rewrite; implement | P0, P2 |
| DR-04 | S1 | ARCHITECTURE §4.2, §9; README; guide | "An inner scroll container that moved … snaps `'stale'`" | Scroll is measured; `'stale'` means "no valid before-box" only | Doc + Code + Test stale | Rewrite; implement; update rows | P0, P2, P9 |
| DR-05 | S1 | ARCHITECTURE §2 | "Core V2's public API does not change" | D2: core gains the pure `physics` module and `Clock.inFrame` | Doc stale | Rewrite §2 | P0, P1 |
| DR-06 | S1 | ARCHITECTURE §2 | Out of scope: drag-coupled layout, `layoutScroll`/`layoutRoot` | The drive seam is in scope; scroll containers need no markers | Doc stale | Rewrite §2 | P0 |
| DR-07 | S1 | ARCHITECTURE §5.1, §7.1 | `LayoutMotion { duration, delay, timing }`; the momentum term is the only velocity device | Discriminated `type: 'timing' \| 'spring'`; physical spring tracks | Doc + Code stale | Rewrite §5.1, §7.1; implement | P0, P1 |
| DR-08 | S1 | ARCHITECTURE §7.2; React `context.ts` `mergeMotion`; layout `motion.ts` `mergeMotion` | "merged field by field" | Kind-level merge; `duration` never switches kind | Doc + Code stale | Rewrite; implement in both packages | P0, P1 |
| DR-09 | S1 | ARCHITECTURE §5.6, §5.7 | Crossfade and radius progress `p = clamp(e(τ), 0, 1)` only | Spring leads use the perceptual `p(t)` | Doc + Code stale | Rewrite; implement | P0, P1 |
| DR-10 | S1 | ARCHITECTURE §9 | Reduced-motion `{ maxDuration }` scales delay and duration | Springs: a deterministic grid search, bounce clamped to ≤ 0 | Doc + Code stale | Rewrite; implement | P0, P1 |
| DR-11 | S1 | ARCHITECTURE §10 | WAAPI shape rules | WAAPI rejects springs and drives | Doc + Code stale | Rewrite; implement | P0, P1, P4 |
| DR-12 | S1 | ARCHITECTURE §7, §9 | Status union without `'failed'`, `'disabled'`; no diagnostics, no kill switch, no `maxParticipants`, no `layoutKey` | v3 §6, §7, §3.9 | Doc + Code stale | Rewrite; implement | P0, P2, P3 |
| DR-13 | S1 | ARCHITECTURE (absent) | No external-drive seam | v3 §5 | Doc + Code stale | New §5.8; implement | P0, P4 |
| DR-14 | S1 | ARCHITECTURE (absent) | No failure transaction; `onSnap` not isolated (`scope.ts` has no `try/finally` in `flush`) | v3 §6.2 | Doc + Code stale | New text; implement | P0, P3 |
| DR-15 | S2 | ARCHITECTURE §6 | No `inert` owner; crossfade follower stays focusable | v3 §8 | Doc + Code stale | Rewrite; implement | P0, P3 |
| DR-16 | S2 | ARCHITECTURE §7.2 | `useLayout`, `LayoutGroup`, `useLayoutGroup` only | `useLayoutDrive()` dispatcher; per-document portal scope | Doc + Code stale | Rewrite; implement | P0, P2, P4 |
| DR-17 | S1 | ARCHITECTURE §11 | Cost gates measured "somewhere"; three-engine rows only | Two tiers; bench harness in Chromium and WebKit proves the gates (D5) | Doc stale + missing evidence | Rewrite §11; build the harness | P0, P5 |
| DR-18 | S1 | `tests/browser` `layout:COST` | Gate passes on the earlier host | Fails in this container (commit 6.9 ms, frame p95 3.07 ms on 4 vCPU); the gate machine was never stated | Missing evidence | State the reference machine in §11; P5 meets it | P0, P5 |
| DR-19 | S2 | `packages/layout/package.json` | `version 0.1.0`; changeset says 0.2.0; React peers `^0.2.0` | One shipped version, aligned | Code stale | Align in P9 | P9 |
| DR-20 | S3 | ARCHITECTURE header | "Execution plan and evidence: `.trace/ani_layout_final/`" | This program's trace | Doc stale | Rewrite header | P0 |

## User Ask Matrix

None. The owner's 2026-10-27 decision makes the v3 design authoritative for every row. The rows
whose fix is code or tests are an implementation gap report, assigned to the phases above.

## Blocked or missing evidence

- DR-18: the cost gate has no stated reference machine. P5 makes the bench harness the
  measuring instrument and states the machine.
