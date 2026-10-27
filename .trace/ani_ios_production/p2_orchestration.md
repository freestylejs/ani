# P2 orchestration record

From P2 onward the helpers write the product code, following the owner's instruction of
2026-10-27. The orchestrator slices the work, briefs each helper, reviews and judges every patch,
runs every gate in the reference container and commits.

## Helpers and workspaces

| Slot | Model | Clone (Mac) | Mirror (june-wsl) |
|---|---|---|---|
| H1 / H5 | Argon4 (`agy --model gemini-4-argon-high --effort high`), one continued conversation | `ani-h1` | `~/ani-v2/h1` |
| R1 | DeepSeek v4.1 flash (MonkeyGPT worker) | `ani-h2` | `~/ani-v2/h2` |
| H3 | DeepSeek v4.1 flash | `ani-h3` | `~/ani-v2/h3` |
| H4 | DeepSeek v4.1 flash | `ani-h4` | `~/ani-v2/h4` |

### Helper route substitution (2026-10-27, 16:30)

Both owner-named helper routes became unavailable during P2:
- **DeepSeek.** The MonkeyGPT pool stayed saturated by outside work (5 of 5 workers in use, 3
  queued), and its tasks went blocked without producing work. The opencode CLI hung on a trivial
  prompt.
- **Argon4.** It hit its individual quota ("Resets in 166h59m") while H5 and H4 were in progress.
  It left uncommitted drafts: H5 about a fifth done, H4 with every row drafted and none run.

From H4 and H5 on, the helpers are **native Claude Code sub-agents** running in the reference
container, each in its own git worktree.
- **Roles are unchanged.** The helpers write the code; the orchestrator briefs, reviews, judges,
  runs the gates and commits; the Chief Justice stays on its own route.
- **Briefs.** They keep the three prerequisites and are committed under `briefs/`.
- **Gain.** The container is the pinned §11.5 environment and has all three browsers, so the
  helpers run browser rows themselves. june-wsl has none.

- **Briefs.** Each brief carries the three prerequisites: the authority documents, the essential
  purpose, and the task boundary as thesis, antithesis and synthesis. They are kept verbatim on
  the Mac under `~/Documents/project/freestylejs/ani-p2-brief/` (`h1.md`, `h3.md`, `h4.md`,
  `h5.md`, `r1.md`).
- **Clones.** Every clone was reset to a pushed checkpoint, and its push URL is disabled.
- **Patch transfer.** The orchestrator transfers each patch as a hash-checked `git format-patch`,
  then reviews it and runs the gates here.

## Slices

| Slice | Scope (authority) | Helper | State |
|---|---|---|---|
| H1 measure | Pure `measure.ts`: interval support check (§4.2), `L_k` recovery, keep paths (§5.7), stale rule (§4.4); property tests | Argon4 | Accepted (ba1fe64): 11 tests, 20,000-chain no-false-positive property, 10,000-tree `L_k` property at 1e-9 |
| H2 capture | §4.1 capture lifecycle | DeepSeek | Withdrawn before start (the pool was blocked); merged into H5, since it is coupled to the flush |
| H3 identity | Flat-tree ancestry, document affinity (§4.6), `layoutKey` (§4.7) | Argon4 | Accepted (78bbdba, integrated at f94848d) |
| H4 rows | `layout_meas` browser rows L-MEAS-1..13 (without 5), L-HAND-1..2, L-KEY-1, L-DOC-1, tests first, with a `knownFailures` worklist that must be empty at the gate | Argon4 (draft), then native helper | Accepted (e682706 draft as received, a3a657e reviewed): 16 rows; 2 pass and 14 are known failures, each failing at the same frame for its named P2 reason in Chromium, Firefox and WebKit; re-run here |
| H5 core | Measured capture (§4.1), view-space flush (§3.2, §4.3), measured B (§4.2), keep paths (§5.7), §4.4 reporting, the interval support check at flush, view-space retained boxes (§5.8), stats (§7.1) | Argon4 (partial), then native helper | Running (`briefs/h5.md`) |
| R1 remediation | P1 tribunal P1-001..P1-004; the code side of P0 J-001, J-004 and P0-N001 in `measure.ts` | DeepSeek | Accepted (04d1d12..f94848d) |
| H6 | Closed-root flat ancestry (§4.6, amended), active-scroll handoff rule (§5.8), L-MEAS-5 React rows; L_MEAS_10 and L_HAND_2 out of `knownFailures` | Native helper | After H5 (`briefs/h6.md`) |

## Tribunal carry-over into P2 (from `p1_spring_trial_result.md`)

| ID | Owner | Fix |
|---|---|---|
| J-001, J-004 (S0, S1) | Orchestrator (authority, 81893f3) and R1 (code) | Screen-space bound `|δ|·max(1, ρ)` for every keep path and for the driven report rule |
| P0-N001 (S1) | Orchestrator (authority, 81893f3) and R1 (code) | Degenerate axis reads the exact computed size |
| P1-001..P1-004 (S1) | R1 | React per-layer validation; settle cap on every candidate; physics domain validation; independent reduced-grid oracle |
| P1-005 (S1) | Orchestrator | Raw gate logs committed under `logs/`, one executable command per engine |

## Findings carried inside P2

| Source | Finding | Owner |
|---|---|---|
| H4 L-KEY-1 | A `layoutKey` change mid-run resolves the run `'ended'`; §9.1 says `'disposed'` (`resetLayoutKey` → `stopParticipantDrive(p, false)`) | H5 (addendum) |
| H4 L-MEAS-10 | `flatParent` uses `assignedSlot`, which is null for a node slotted into a closed shadow root, so a slotted participant is planned without its flat-tree parent. The defect was in the authority too: §4.6 named `assignedSlot` as the primitive while claiming closed roots. §4.6 now finds the slot through the shadow roots the scope knows | Authority (orchestrator); code H6 |
| H4 L-HAND-2 | The §5.8 active-scroller rule is not implemented | H6 |
| H4 build | The root `pnpm build:fast` fails because turbo.json has no `build:fast` task (predates this work); helpers use `pnpm -r --filter './packages/*' run build:fast` | Noted |
