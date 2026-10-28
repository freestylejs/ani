# ani iOS-grade production program — phase plan

## FINAL GOAL

### Top-level owner scope correction — 2026-10-28

The owner explicitly withdraws the previously inferred whiteboard/diagram-product deliverable.
The earlier interpretation of "FigJam, draw.io, tldraw etc" as an instruction to build a separate
board/canvas product was scope drift. Those names describe the **production-quality bar** that ani
must be credible enough to serve; they are not products that this program must reproduce.

This ruling is authoritative over every earlier plan/brief that says otherwise:

- `app/board` is not an ani deliverable and must not be implemented by this program;
- the former P6–P8 board phases and H10 board brief are cancelled and removed;
- no document model, generic canvas/editor framework, connector router, persistence layer,
  minimap, export system or other whiteboard-product machinery may be added as proof of ani;
- the final certification surface is the iOS-native-grade interaction set in layout §11.6 plus
  the P4 drive rows, evaluated by the P5 harness frame by frame and backed by the P1–P4 authority
  and acceptance evidence;
- future product applications may consume ani, but they are out of scope unless the owner gives a
  new explicit top-level instruction.

The program's success claim is therefore **not** "we built a complex app with ani". It is:
**"ani itself has been objectively proven to deliver iOS-native-grade interaction semantics and
performance on the specified browser engines, including interruptions, direct manipulation,
scroll/concurrency, failure degradation and production-scale cost."**

1. **ani-layout v3 shipped as the single authority.** `packages/layout/ARCHITECTURE.md` is rewritten
   to the approved v3 design (`.trace/ani_layout_ios/architecture.md`, reviewers' sign-off
   `3ae7dc7`, owner's decisions 2026-10-27). Code, tests and docs implement exactly that
   authority. The migration is hard: no legacy path, bridge or compatibility shim survives (page
   boxes, the inner-scroll `'stale'` snap and the field-by-field motion merge are deleted, not
   kept beside the new ones).
2. **Proof at code level and test level.** Unit (pure modules, property tests), integration
   (jsdom and browser engine rows on the frame oracle) and e2e (Playwright, real pages) prove
   every authority claim in Chromium and WebKit (Firefox where the row exists today).
3. **iOS-native-grade interaction proof and bench harness.** A set of browser scenes reproducing
   native-iOS interaction patterns runs
   under a Playwright harness (Chromium and WebKit) that scores each scene frame by frame:
   oracle error, first-frame continuity, velocity continuity, spring fidelity, settle exactness and
   frame cost. It runs in iterations ("validate → improve") until every scene meets its gate. The
   performance gates are proven on this harness (owner's decision D5: Chromium and WebKit under
   Playwright).
4. **Release ani only after the native-grade claim is earned.** Documentation, migration notes,
   versions and the final fresh-clone gate may call the system iOS-native-grade only after the
   complete P1–P5 evidence body is green, including P3 safety, P4 drive/direct-manipulation and
   every P5 native-grade scene/gate in the required engines, and every carried tribunal defect is
   closed.

> Owner's rule: "디테일이 생명" (the details are everything). Every visible motion is judged
> frame by frame.

## iOS Native Grade proof contract

"iOS Native Grade" is an evidence claim, not a visual adjective. This program may make that claim
only when all of the following are objectively demonstrated:

1. **Frame correctness.** Each §11.6 scene is scored per participant and per frame against an
   independent oracle that shares no solver/physics implementation with production code.
2. **Continuity under interruption.** The first frame starts from what was actually presented;
   geometry continuity and the specified edge-velocity continuity remain within the §11.6 gates
   across retargets, reversals and interrupted springs. Other authored channels obey their own
   authority rows and existing acceptance tests.
3. **Direct-manipulation seam.** P4 `take`/`move`/`release`/`cancel` and the held read prove the
   layout-side hand-off from externally supplied gesture offsets and release velocity. S-REORDER
   and S-SHEET exercise that seam. Pointer capture, `pointerId`, `touch-action`, velocity estimation,
   keyboard operation and announcements remain responsibilities of a gesture/component layer as
   specified by the layout authority; this program does not falsely treat the drive seam as proof
   of a complete pointer subsystem.
4. **Hostile production conditions.** Concurrent React commits, Suspense, scroll, nested scale,
   shadow DOM, document boundaries, reparenting, reduced motion and supported WAAPI paths produce
   the specified frame or the authority-defined outcome: typed degradation/snap,
   invalidation/disposal or validation error as applicable. No unsupported case may silently
   produce wrong motion. The invariant remains "snap, never wrong motion".
5. **Safety and accessibility.** P3 proves transactional failure cleanup, callback isolation,
   runtime disablement, participant caps, focus/inert behavior, lifecycle fuzz and mutation cases.
6. **Performance on the pinned instrument.** Chromium and WebKit under the §11.5 Playwright
   environment meet the authoritative commit, steady-frame, sustained-commit and held-frame gates
   with exact read counts. A fingerprint mismatch makes the §11.5 cost-gate result advisory; the
   §11.6 frame-scoring gates remain deciding as specified by the authority.
7. **Validation → improvement closure.** P5 records every failed metric and root-cause hypothesis,
   iterates the engine or scene implementation without weakening a tolerance, and repeats until
   every required scene is green in both required engines.

Passing ordinary examples, subjective visual inspection, or building an unrelated complex product
is not evidence for this claim.

## Owner's decisions (2026-10-27; amended 2026-10-28)

| # | Decision | Ruling |
|---|---|---|
| D1 | Spring as the default motion | Deferred: the spring ships opt-in; the 0.35 s ease-out default stays |
| D2 | Core additions | Approved: the pure `physics` module (plus the read-only `Clock.inFrame` flag that §3.3-5 of the design needs; additive) |
| D3 | Visual continuity | Approved |
| D4 | Clip-aware crossfade | Deferred |
| D5 | Browser-engine benchmark gate | Chromium and WebKit under Playwright, on the harness of goal 3; this is not iOS-device or Mobile Safari certification |
| D6 | New public surface | Approved: `layoutKey`, `maxParticipants`, `layoutRuntime`, diagnostics, `'failed'`/`'disabled'` |
| D7 | Program scope | Top-level owner correction: remove the standalone board/canvas product entirely; prove iOS Native Grade from the complete P1–P5 evidence body, with P3 safety, P4 drive/direct manipulation and the P5 §11.5/§11.6 certification harness as the final proof stages |

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
| P5 | `p5_bench` | **iOS Native Grade certification:** the §11.6 interaction set and harness (Chromium, WebKit), including the P4-dependent direct-manipulation scenes; independent per-frame scoring; perf gates (commit, steady frame, sustained commits, held frame); validation → improvement iterations until every required metric passes | Native-grade report all green in both required engines; no weakened tolerance; cost gates met; iteration log records failures and fixes |
| P6 | `p6_release` | Docs site, READMEs, migration notes, changesets and versions; state the iOS-native-grade claim only from the complete P1–P5 evidence body; final full gate on a fresh clone; final review and cleanup | Full gate green on a fresh clone; P5 certification green; final tribunal PASS on every checkpoint |
