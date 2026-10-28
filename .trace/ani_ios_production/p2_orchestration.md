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
| H5 core | Measured capture (§4.1), view-space flush (§3.2, §4.3), measured B (§4.2), keep paths (§5.7), §4.4 reporting, the interval support check at flush, view-space retained boxes (§5.8), stats (§7.1) | Argon4 (partial), then native helper | Accepted after a review round: 25 commits linearized onto the dev branch (e5d4b80..6544e62); every finding of the independent review fixed, each with a test that failed before its fix; gate logs `logs/p2-integ/` |
| R1 remediation | P1 tribunal P1-001..P1-004; the code side of P0 J-001, J-004 and P0-N001 in `measure.ts` | DeepSeek | Accepted (04d1d12..f94848d) |
| H7 performance | §11.5 commit cost, behaviour-preserving only (`briefs/h7.md`) | Native helper | Accepted on review: 8 commits, no change to frames, reports or read counts; gates identical to `logs/p2-integ` (`logs/p2-h7/`) |
| H6 | Closed-root flat ancestry (§4.6, amended), active-scroll handoff rule (§5.8), L-MEAS-5 React rows; L_MEAS_10 and L_HAND_2 out of `knownFailures` | Native helper | Integrated (2c16008..639a434), all modules green in three engines with empty `knownFailures` but COST (`logs/p2-h6/`); review round H6b open (`briefs/h6b.md`) |

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

## H5 review round (independent reviewer, then a fix round)

- **Gates on H5's head.** Unit 1,711/1,711 and typecheck 11/11. Chromium 176 pass, failing
  `layout:COST` and `regressions:Fuzz` (a capture-less warning the case does not expect). Firefox
  and WebKit: `layout` fails only on COST, and the spring, React layout and WAAPI modules pass.
- **Reviewer findings.** One S0: path 1 kept the old geometry, so children planned in the flush
  drew off by (1 − k)·δ. Two S1: a driven node without B was kept and never reported; β missed a
  child moving with its parent. Two S2: order-dependent verification; the measurement error of
  real engines. Three S3.
- **Authority gaps closed (c7493c1).** §4.2 measurement error, order independence, and reuse
  within one check only; §4.4 nodes without B and the recursive β; §5.7 path-1 geometry; §9.1.
- **COST attribution.** H5 blamed the offset reads. The reviewer finds that unproven (offsetWidth
  on a clean layout is cheap) and suspects the support-check recompute, `engineState()` at capture
  and the ancestor walks. H5 profiles them in the fix round, and a performance slice follows.
- **H4b** (a fresh native helper; the H4 context could not be resumed once its worktree was
  removed) fixes L_MEAS_3, 4, 7, 10 and 12 to the amended authority. It also runs the Firefox
  scroll-anchoring spike: Firefox counts the anchor node's transform, so layout's t = 0 writes
  re-anchor (L_MEAS_2).

## Integration of H5 and H4b (77ec445)

- **Commits.** The 28 helper commits (H5's 25, H4b's 3) are linearized onto the dev branch with
  session trailers. The code is byte-identical to the helpers' branches.
- **Gates (`logs/p2-integ/`).**
  - Unit 1,744/1,744, typecheck 11/11, biome 0 errors.
  - Chromium full suite 181 passed, failing only `layout:COST`.
  - Firefox and WebKit: `layout` 55/56 (COST), and `layout_spring`, `react_layout`, `waapi`,
    `showcase` and `regressions` all pass.
  - `layout_meas` has 13 passes in Firefox and 14 in WebKit.
- **Known failures left.** All are H6's: L_HAND_2, L_MEAS_10 (closed root), and L_MEAS_2 in Firefox
  (S2 fallback). L_MEAS_4 now passes in all three engines, after H5's velocity fix.
- **COST.** H5's profile shows the whole commit at about 25–45 ms against the 4 ms gate. That is
  the H7 slice.

## H7 performance (review and the cost decision)

- **Review.** Every change is a pure restatement:
  - transforms classified once per check (reads precede writes within a check, nothing kept
    across a capture and its flush);
  - `display` read once;
  - an owned declaration's inline value skipped (same branch result);
  - a per-build ancestor memo with at-or-above semantics;
  - `writtenPose` parsed without arrays (identical NaN and missing-component behaviour);
  - lazy child lists;
  - the engine's own pose passed (only its scales are read);
  - the unread `Capture.offsets` dropped.
- **Effect.** 10–25% faster in Chromium and 0–14% in WebKit. Medians of 5 fresh-process runs at
  1,000 participants, after: Chromium 11.85 ms (300 moving, at rest) to 28.78 ms (1,000, tracks
  running); WebKit 14 to 37 ms. Steady frame p95 ≤ 1.9 ms in all engines.
- **The floor.** A hand loop doing only the reads and writes the authority requires, on the same
  DOM:
  - Chromium: 4.8–5.2 ms (300 moving), 8.0–8.8 ms (1,000);
  - WebKit: 4 ms (300 moving), 6–10 ms (1,000).

  Under §4.1 item 1, §4.3 steps 2 and 4, §4.2 and §9.1, the 4 ms commit budget of §11.5 and the
  legacy `layout:COST` row cannot pass on this host. The row's read figure alone (2,000 rects,
  4,000 size getters) is 5.2–6.5 ms, and every one of those reads is required by §11.5.
- **Decision.** P1-N001 needs an owner-approved amendment (the tribunal's words). The orchestrator
  put the options to the owner and recommends this one:
  - retire the legacy row;
  - gate the commit in the P5 pinned harness at ≤ 2× the required-work floor on the same host;
  - keep the absolute steady p95 ≤ 2 ms and the exact read counts.

  Until the owner decides, the item stays open. A `flush()` restructuring slice follows H6 under
  any option.

## H6 integration and review round

- **Integration.** H6's 7 commits are linearized onto the dev branch after H7 and the review
  amendment. The one conflict, in `nearestParticipant`, combines H7's per-build memo with
  `flatParent(node, roots)`; the reviewer confirmed the memo stays correct.
- **Gates (`logs/p2-h6/`).**
  - Unit 1,783/1,783, typecheck 11/11, biome 0 errors.
  - Chromium 194 pass, failing only `layout:COST`.
  - Firefox: every module passes except `layout:COST`.
  - WebKit: every module passes, COST included on this run.
  - `knownFailures` is empty in every module.
- **Independent review.** It ran three probe tests, which fail on the integrated head.
  - S0: a root is never re-tracked once set (wrong frame, the old L-MEAS-10 error).
  - S1: scroll events do not compose, so scrollers in shadow roots that hold no participant were
    unseen.
  - S1: the viewport-fixed rule was not applied to reparents.
  - S1: the probe's 10 × 10 box has an empty scrollport under classic scrollbars.
  - S2: driven scroll containers exempt from the fallback; the WAAPI engine without probe or
    fallback; probe and `offsetParent` reads miscounted; a quadratic slot lookup; no test of a
    degraded lead with a presence.
  - S3: the active state outlives a disarm; nits.
- **Rulings.**
  - The authority is amended (e8ca1c6): §3.3, §4.6, §5.8, §6, §7.1, S2, §12, and rows L-MEAS-10,
    L-HAND-2 and L-MEAS-14.
  - Finding 11 (an author's mid-run `overflow-anchor` write is used until the next flush) conforms
    to §6 and stays.
  - The focus-in-follower rule the reviewer found missing belongs to P3 (L-A11Y-1).
  - The code fixes go to H6b.

## H6b review round (integrated as 3458bee and 492a9f0)

- **Scope.** All eleven thesis items of `briefs/h6b.md` are done, each with a test that failed
  before its fix. Unit tests went from 1,783 to 1,798.
- **Findings beyond the brief.**
  - Gecko gives a `position: fixed` element the body as its offset parent. The viewport-fixed test
    therefore reads the computed `position` of the walk's elements from its end backwards. The
    authority is amended to state this (7910ca2).
  - The classic-scrollbar run needs its own headed Firefox. Headless Firefox hides every scrollbar,
    so the runner starts Xvfb when `DISPLAY` is unset.
- **Readings accepted.**
  - A per-root unlisten keeps that root's active state.
  - Only a participant whose own flat parent changed runs the reparent viewport-fixed test. An
    ancestor moved into a fixed sheet is now a §12 risk (7910ca2).
- **Commit messages** were rewritten to the repository's conventional style, with the session
  trailers. The code is byte-identical to the helper's branch. Gates: `logs/p2-h6b/`.

## Scope correction — top-level owner directive (2026-10-28)

The owner explicitly corrected an earlier orchestration mistake: the references to FigJam,
draw.io and tldraw were a production-quality bar for ani, not an instruction to build a separate
whiteboard/canvas product. The former board work was therefore scope drift.

- H10 is **cancelled before implementation**. Its brief and `app/board/ARCHITECTURE.md` are removed
  from the current tree; the historical commits remain only as Git audit history.
- Former P6–P8 board phases are removed from `00_plan.md`. No board model, editor, persistence,
  connector, export, minimap or generic canvas framework belongs to this program.
- H9/P5 remains in scope because it is the independent iOS Native Grade proof instrument, not an
  application product.
- The execution order after P2 is P3 safety → P4 drive/direct manipulation → P5 native-grade
  certification → P6 release.
- The owner-level success criterion is now explicit: ani must earn the iOS-native-grade claim from
  the complete P1–P5 evidence body: frame-level correctness, continuity, the P4 layout drive seam,
  authority-defined degradation/safety and pinned performance evidence. Building an unrelated
  complex application is not substitute evidence.

## Execution readiness (2026-10-28)

`execution_readiness_20261028.md` is the current status and dispatch record. In summary:

- P2 is **implemented through H6b but not formally closed**. There is no `p2_measured.md` and no
  P2 tribunal result. The only remaining functional P2 gate failure at H6b was WebKit React 18
  `RL3` under load; Chromium's `layout:COST` failure is retired by D8.
- `layout:COST` is retired as a gate. P5 owns the whole-commit gate at ≤ 2× the measured
  required-work floor (`gate_amendment_20261028.md`; §11.5).
- H11 is split. **H11a** is the P2-closure RL3 robustness fix only. **H11b** is the P3a safety
  implementation (the former H11 items 1–7 and 9). H11a lands first; H11b resets to the P2 closure
  head.
- The P0/P1 carried defects (J-001, J-004, P0-N002) are code-fixed in `aaa642a` with SC-7/KP-1/ST-3
  proofs, but they have not been re-judged since. The combined P0/P1/P2 tribunal re-judges them
  together after P2's gates are green.
- The P5 instrument is re-pinned to the recorded macOS host (D9); the old Ubuntu/Xeon cost reports
  are historical and advisory.

## Combined P0/P1/P2 tribunal — PASS (2026-10-28)

The Chief Justice returned **TRIBUNAL PASS** at anchor `6a99da2`: 53/53 authority rows, no open
defects, all carried P0/P1 findings re-judged. Report:
`p2_measured_trial_result.md`. This certifies P0–P2 only; P3 safety, P4 drive, P5 native-grade
certification and P6 release remain future gates. P3a (H11b) is dispatched from the P2 closure
head.
