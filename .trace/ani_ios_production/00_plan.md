# ani iOS-grade production program — phase plan

## FINAL GOAL

1. **ani-layout v3 shipped as the single authority.** `packages/layout/ARCHITECTURE.md` is rewritten
   to the approved v3 design (`.trace/ani_layout_ios/architecture.md`, reviewers' sign-off
   `3ae7dc7`, owner's decisions 2026-10-27). Code, tests and docs implement exactly that
   authority. The migration is hard: no legacy path, bridge or compatibility shim survives (page
   boxes, the inner-scroll `'stale'` snap and the field-by-field motion merge are deleted, not
   kept beside the new ones).
2. **Proof at code level and test level.** Unit (pure modules, property tests), integration
   (jsdom and browser engine rows on the frame oracle) and e2e (Playwright, real pages) prove
   every authority claim in Chromium and WebKit (Firefox where the row exists today).
3. **iOS-native-grade example set and bench harness.** A set of real iOS interaction scenes runs
   under a Playwright harness (Chromium and WebKit) that scores each scene frame by frame:
   oracle error, first-frame continuity, velocity continuity, spring fidelity, settle exactness and
   frame cost. It runs in iterations ("validate → improve") until every scene meets its gate. The
   performance gates are proven on this harness (owner's decision D5: Safari and Chrome under
   Playwright).
4. **A production-grade diagram and whiteboard tool** (the class of FigJam, draw.io, tldraw),
   built on ani-layout v3 and its drive seam, that a user would choose to use. It has its own
   authority document and unit, integration and e2e tests.

> Owner's rule: "디테일이 생명" (the details are everything). Every visible motion is judged
> frame by frame.

## Owner's decisions (2026-10-27)

| # | Decision | Ruling |
|---|---|---|
| D1 | Spring as the default motion | Deferred: the spring ships opt-in; the 0.35 s ease-out default stays |
| D2 | Core additions | Approved: the pure `physics` module (plus the read-only `Clock.inFrame` flag that §3.3-5 of the design needs; additive) |
| D3 | Visual continuity | Approved |
| D4 | Clip-aware crossfade | Deferred |
| D5 | Device gate | Chromium and WebKit under Playwright, on the harness of goal 3 |
| D6 | New public surface | Approved: `layoutKey`, `maxParticipants`, `layoutRuntime`, diagnostics, `'failed'`/`'disabled'` |

## Roles

| Role | Who | Use |
|---|---|---|
| Orchestrator, director, top-level judge | Claude (this session) | Plans; implements P0–P1 (the foundation) itself; from P2 on writes no product code: slices each phase, briefs the helpers, reviews and judges every patch, runs every gate, self-judges each checkpoint, commits and pushes to `dev/ecstatic-ramanujan-1mjr9q` (owner's instruction, 2026-10-27) |
| Chief Justice | MonkeyGPT `gpt-5.6-sol`, thinking high (one reused task) | Tribunal per checkpoint under `judging-checkpoint-completion`; writes `{part}_trial_result.md` |
| Helper, mid level | MonkeyGPT `opencode-go/deepseek-v4.1-flash`, thinking max | From P2: writes the code and tests of bounded, fully specified slices |
| Helper, high level | Argon4 (`agy --model gemini-4-argon-high`, via MonkeyGPT bash) | From P2: writes the code and tests of the hardest slices (solver, measurement, drive) |

At most six sub-agents are live at once. Each sub-agent receives three prerequisites:

1. the current authority documents;
2. the authority's essential purpose ("snap, never wrong motion": every visible frame is either
   the exact specified motion or a defined, reported degradation);
3. its exact task boundary.

## Machines

- **Helpers write code** in their own clone on the Mac (`~/Documents/project/freestylejs/ani-h<n>`,
  reset to the pushed checkpoint), with light checks only (edits, `git diff`), and may run unit tests on
  june-wsl (`~/ani-v2/h<n>`, an rsync mirror). The orchestrator pulls each patch into this
  container, reviews it and runs every gate here.
- **Every gate run** happens in this container. Chromium 1187, WebKit 2203 and
  Firefox 1490 are installed under `/home/user/.pw-extra` (`PLAYWRIGHT_BROWSERS_PATH`), with
  WebKit's system libraries installed. Runs use 4 cores.
- **The Chief Justice** works read-only in `~/Documents/project/freestylejs/ani-trial` on the Mac,
  a clone of this branch pulled before each trial. It can re-run light checks on june-wsl
  (`~/ani-v2/trial`), never on the Mac.

## Pipeline

Each phase ends at a checkpoint:

1. The orchestrator executes the phase and runs its gates.
2. The orchestrator writes `.trace/ani_ios_production/{part}.md`: the self-judgment under
   `judging-checkpoint-completion`, with the evidence matrix and the logs in `logs/`. It fixes
   every self-found defect first.
3. The orchestrator commits, pushes, and dispatches the tribunal to the Chief Justice.
4. **The next phase starts at once.** The tribunal runs in parallel.
5. On a `TRIBUNAL FAIL`, its remediation order joins the next checkpoint's scope, and the next
   tribunal re-judges both.
6. The program is complete only when every checkpoint has a `TRIBUNAL PASS`.

## Phase plan

| Phase / CP | Part | Objective | Gate |
|---|---|---|---|
| P0 | `p0_authority` | Documentation drift analysis; layout `ARCHITECTURE.md` rewritten to v3 (single authority); core API doc for `physics`; this plan | Drift matrix closed; every v3 decision placed in the authority; no contradiction with the signed-off design |
| P1 | `p1_spring` | Core `physics`; the discriminated `LayoutMotion` and kind-level merge (layout and React); validation; spring tracks; perceptual timeline for crossfade, radius and presence release; reduced-motion grid; settle cap; WAAPI rejection | Unit and property tests against an independent oracle (1e-9); L-SPRING-1..4 in Chromium, Firefox, WebKit; existing suites green |
| P2 | `p2_measured` | Measured presentation: capture of all participants, aging marker and the rendering-callback bound, view-space planning, pose inversion and the keep test, layout-size support check, capture-less and aged flush, flat-tree ancestry, document affinity, `layoutKey`, the active-scroll handoff rule, retained view boxes. Page boxes and the scroll `'stale'` path are removed | L-MEAS-1..13, L-HAND-1..2, L-KEY-1, L-DOC-1 ×3 engines; every existing row updated to the new authority and green |
| P3 | `p3_safety` | Transactional flush and frames, callback isolation, the `'failed'`/`'disabled'` statuses and their precedence, `maxParticipants`, `layoutRuntime` and diagnostics, the crossfade `inert` and focus rule, model-based lifecycle fuzz, mutation tests | L-OPS-1..2, L-A11Y-1, fuzz and mutation suite ×3 engines |
| P4 | `p4_drive` | The drive seam: `take`/`move`/`release`/`cancel`, the state machine, the held read, reduced-motion rules, React `useLayoutDrive` | L-DRIVE-1..6 ×3 engines; React adapter tests |
| P5 | `p5_bench` | iOS-grade example set and harness (Chromium, WebKit): per-scene frame scoring, perf gates (commit, steady frame, sustained commits, held frame), iterations until every scene passes | Bench report all green in both engines; cost gates met; iteration log |
| P6 | `p6_board_core` | The board tool's authority document and its core: document model, history, infinite canvas, shapes, selection, keyboard, persistence | Unit and integration tests; e2e smoke in Chromium and WebKit |
| P7 | `p7_board_motion` | Board interaction and motion: drag through the drive seam with snapping, resize, connectors, frames with auto-layout, the layer panel reorder, align and distribute, undo and redo motion, presence of shapes | e2e flows; frame-level motion rows on the bench harness |
| P8 | `p8_board_product` | Board product completeness: styles panel, text editing, export (SVG, PNG, JSON), import, context menu, minimap, accessibility, reduced motion, performance at 1,000 shapes | e2e suite; a11y checks; perf gate |
| P9 | `p9_release` | Docs site, READMEs, migration notes, changesets and versions; the final full gate on a fresh clone; final review and cleanup | Full gate green on a fresh clone; final tribunal PASS on every checkpoint |
