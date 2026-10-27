# Helper brief H6b — the H6 review round

You are helper H6b on the ani layout engine. H6 (closed-root ancestry, the active-scroller rule,
the S2 anchoring fallback, the L-MEAS-5 React rows) is integrated on the dev branch. An
independent review found the defects below, and the orchestrator amended the authority to close
them (e8ca1c6). You fix the code to the amended authority. The orchestrator reviews every line
and runs every gate; the Chief Justice judges the P2 checkpoint.

## Setup

- Work in your own git worktree. First run `git reset --hard 6ec77f3` (the dev head with H6 and
  the amendment); worktrees can start from a stale base.
- Install with `pnpm install --frozen-lockfile --offline` if `node_modules` is missing.
- Build with `npx tsup` in `packages/core`, `packages/layout` and `packages/react`, in that order.
  The root `pnpm build:fast` fails: turbo.json lacks the task.
- Browsers: export `PLAYWRIGHT_BROWSERS_PATH=/home/user/.pw-extra` on every browser command. Run
  `node tests/browser/run.ts --browser <engine> --case '<module>:*'`, one engine at a time.
- Biome ignores worktree paths through the VCS ignore file: pass `--vcs-use-ignore-file=false`.
- The browser runner fails a case on any `console.warn` the case does not expect.
- Never read anything from a directory named `ui-kit`.

## Prerequisite 1 — authority

`packages/layout/ARCHITECTURE.md`, word by word, as amended in e8ca1c6 (`git show e8ca1c6`):
- §3.3, the lifetime row of active scroll containers;
- §4.6, flat-tree ancestry: re-tracking roots, the per-pass slot map, and scroll events not
  composing;
- §5.8, the actively scrolling source: listeners on every shadow root of a participant's
  flat-ancestor chain, the disarm at the end of the task, and the viewport-fixed test for
  reparents;
- §6, the `overflow-anchor` row;
- §7.1, `LayoutStats` (new `probes` and `parents`);
- §11.2, rows L-MEAS-10, L-HAND-2 and L-MEAS-14;
- §11.4 S2 and §12.

## Prerequisite 2 — essential purpose

"Snap, never wrong motion." A lead that flies from a box the user no longer sees, or a scroll
offset moved by layout's own writes, is the worst kind of defect. Where the authority leaves room,
degrade or report; never fly.

## Prerequisite 3 — task boundary

### Thesis: what you fix

Write each fix test-first: a unit test or browser row that fails before the fix, then the fix.

1. **S0: roots are re-tracked** (§4.6).
   - Today `trackRoot` returns early once `p.root` is set, so a registered element moved into
     another root keeps its old root.
   - In every capture and flush, compare `getRootNode()` with the tracked root for each connected
     participant. On a change, drop the old root and track the new one. No layout read.
   - Row L-MEAS-10 (b), in all three engines.
2. **S1: listeners on every shadow root of the flat-ancestor chain** (§5.8).
   - Arm a listener pair on every ShadowRoot that the capture and flush walks pass: each walked
     node's root, and each assigned slot's root.
   - Disarm a root's listeners when no participant's chain reaches it any more.
   - L-HAND-2 variants:
     - a scroller inside an open root that holds no participant, around a slot;
     - a scroller in an outer root, around the root that holds the participant.
3. **S1: the viewport-fixed test covers reparents** (§5.8).
   - The capture stores each participant's flat parent.
   - For a participant whose flat parent changed since its capture, the reparent rule also counts
     the document as the departing container. The `offsetParent` walk then decides whether the
     lead is outside it.
   - Variant in L-HAND-2: a card reparented into a `position: fixed` sheet while the document
     scrolls.
4. **S1: the probe has no scrollbar** (S2).
   - Set `scrollbar-width: none` on the probe container.
   - Add an L-MEAS-14 (a) run in Firefox with classic scrollbars: the Firefox user preference
     `ui.useOverlayScrollbars` set to 0, through the runner's launch options, scoped to that run.
     It must fail before the fix.
5. **S2: the fallback covers driven scroll containers** (§6, S2, §12).
   - Remove the scroll-container exemption.
   - L-MEAS-14 (a) variant with `overflow: hidden` cards, in Firefox.
6. **S2: the WAAPI engine** (§6, S2).
   - Probe for the WAAPI engine too. Where the probe says a transform moves the anchor, carry
     `overflow-anchor: none` in both keyframes of the node's animation, with no inline style.
   - First check in Firefox that the property animates as a discrete value held across the
     animation. If it does not hold, stop and report.
   - L-MEAS-14 (a) variant with the WAAPI engine.
7. **S2: stats** (§7.1).
   - `stats.probes` counts each probe; its `scrollTop` read is no longer counted in `offsets`.
   - `stats.parents` counts every `offsetParent` read of the viewport-fixed test.
   - `reads` stays `rects + offsets + styles`.
   - Update every consumer of `LayoutStats`, and fix `anchoring.test.ts` to the exact counts.
8. **S2: the slot map** (§4.6).
   - Each pass builds a node-to-slot map once per known closed root. No `querySelectorAll` per
     lookup.
   - A unit test with many slotted participants asserts the number of `assignedNodes` calls per
     pass.
9. **S2: the degraded lead with a presence** (L-HAND-2).
   - Test the case where the new lead has a presence enter: it enters under presence, with no
     flight.
   - Leave the diagnostic as the existing development warning; P3 emits `handoff-scroll-active`.
10. **S3: disarm at the end of the task** (§3.3, §5.8).
    - Check the disarm in a microtask.
    - A lead removed and re-added in one task keeps the listeners and the active state.
    - A real disarm clears the active state.
    - Unit tests for both.
11. **S3 nits.**
    - Drop the redundant `!waapi` check next to `anchorFallback`.
    - Memoize the reparent loop's `containsFlat` within one flush.

The review's finding 11 (an author's plain mid-run write of `overflow-anchor` is used until the
next flush) is conformant to §6 and stays as is.

### Antithesis: what you must not do

- No legacy path, no flag, no dead export. Do not edit `ARCHITECTURE.md`. Report any ambiguity
  with the sentence, and implement the most conservative reading.
- Do not weaken any test or tolerance, and do not edit an existing row's assertions except where
  the amended row requires it.
- Keep every read before the flush's first write. Count every read in `stats`.
- Do not touch P3 (diagnostics, `layoutRuntime`, the focus rule) or P4 (the drive seam).
- Do not push, and do not touch any remote. Commit in your worktree with plain messages and no
  model names.

### Synthesis: done means

- Unit, `pnpm ts:typecheck` and biome (0 errors) are clean.
- Browser: in Chromium, Firefox and WebKit, these modules pass with empty `knownFailures`:
  `layout_meas`, `layout`, `layout_spring`, `react_layout`, `react_layout_r18`, `waapi`,
  `showcase` and `regressions`. The one exception is `layout:COST`, which waits on the owner's
  cost decision.
- Final reply:
  - worktree path, branch and commit hashes;
  - files changed;
  - for each item, the test that failed before its fix;
  - test counts per suite and engine;
  - every ambiguity;
  - each deviation with its reason.
