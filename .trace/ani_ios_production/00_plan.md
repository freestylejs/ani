# ani iOS-grade production program — phase plan

## FINAL GOAL

### Teleology — the essential purpose

The only frame that exists is the one the user actually sees. A layout box, a planned trajectory,
a React render and a promised spring are models; none of them proves that the screen moved
correctly. This program exists to make the painted frame the ground truth of web layout motion:

1. **Measure the presented state.** The engine reads what is actually on screen now — the presented
   geometry `B` and its velocity `v` — rather than trusting what the previous model intended.
2. **Continue from it exactly.** Every new commit starts from `(B, v)` and moves toward the new
   layout `A` with the specified physics. Interruption, scroll, re-layout, concurrent rendering,
   shadow DOM, reparenting and reduced motion are the normal conditions of the web, not exceptions
   to be handled after the design.
3. **Never draw a plausible lie.** When the authority cannot prove that the next frame is exact, the
   engine snaps to `A` and reports a typed reason. "Snap, never wrong motion" is the first law; a
   visually pleasant but wrong trajectory is a failure.
4. **Keep motion truth in the engine.** Framework adapters and applications consume the engine's
   truth; they do not own it, and they cannot redefine correctness through scheduling convenience.
5. **Prove, do not assert.** Every claim is judged frame by frame against an independent oracle on
   the pinned instrument. A demo, a subjective impression, or a separate complex product is not
   evidence.

The resulting hierarchy is: **frame correctness > continuity > physical fidelity > performance >
visual convenience**. The deliverable is the ani motion/layout kernel and its certification
instrument — not a whiteboard, diagram editor or other application built as a proxy for proof.

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
| D8 | Commit-cost gate | Retire the legacy absolute `layout:COST` 4 ms row. P5 gates the whole commit at ≤ 2× the measured required-work floor on the certification instrument; the absolute steady-frame p95 ≤ 2 ms, sustained-commit and held-frame gates and the exact read counts remain. Owner approval: the 2026-10-28 DECISION approving the recommendations, recorded in `gate_amendment_20261028.md` |
| D9 | Certification instrument | The original Ubuntu/Xeon P0/P1 instrument is unreachable. P5 certifies on the recorded macOS instrument: MacBook Pro `Mac14,9`, Apple M2 Pro 10-core, 32 GB, macOS 27.0.1 arm64, Node 24.19.0, pnpm 10.20.0, Playwright 1.55.0, `chromium_headless_shell-1187` / `webkit-2203` / `firefox-1490` (advisory). Old cost reports are historical and advisory; frame-scoring authority is unchanged. Firefox is advisory: if its pinned build cannot launch on the instrument, the checkpoint records the exception and Chromium/WebKit decide |
| D10 | Sustained-commit gate | The absolute 2 ms G11 gate is below the audited required-work floor (2.81–3.00 ms/commit; floor p95 3.215 ms). Owner ruling 2026-10-29: G11 is ≤ 2× the audited floor on the same 60 Hz shape (per-run p95 ratio, median of 5); the absolute 2 ms steady-frame gate remains for non-commit frames. D12 supersedes the original WebKit clause: Chromium decides G11; WebKit cost is BLOCK/advisory and no ratio is fabricated. Recorded in `gate_amendment_g11_20261029.md` |
| D11 | Held-frame gate | The literal G12 total-frame ÷ held count is dominated by the scene's fixed baseline (0.37–0.60 ms at 1–10 held; marginal held cost ~0.02–0.03). Owner ruling 2026-10-29: G12 is the baseline-subtracted incremental per-held cost, `(p95(held) − p95(no-hold))/held`, ≤0.1 ms at 1 and 10; absolute total-frame G8 unchanged. Recorded in `gate_amendment_g12_20261029.md` |
| D12 | WebKit cost evidence | The Playwright WebKit 1 ms timer cannot decide G9/G11/G12 p95 without changing the measured shape. Owner ruling 2026-10-29: Chromium decides the cost gates; WebKit remains a required frame/scoring/shape/status engine and its cost rows are BLOCK/advisory, reported without a fabricated ratio. Recorded in `gate_amendment_webkit_cost_20261029.md` |

## Roles

| Role | Who | Use |
|---|---|---|
| Orchestrator, director, top-level judge | The executing agent (this session) | Plans; implements P0–P1 (the foundation) itself; from P2 on writes no product code: slices each phase, briefs the helpers, reviews and judges every patch, runs every gate, self-judges each checkpoint, commits and pushes to `dev/ecstatic-ramanujan-1mjr9q` (owner's instruction, 2026-10-27) |
| Chief Justice | MonkeyGPT `gpt-5.6-sol`, thinking high (one reused task) | Tribunal per checkpoint under `judging-checkpoint-completion`; writes `{part}_trial_result.md` |
| Helper, mid level | MonkeyGPT `opencode-go/deepseek-v4.1-flash`, thinking max | From P2: writes the code and tests of bounded, fully specified slices |
| Helper, high level | Argon4 (`agy --model gemini-4-argon-high`, via MonkeyGPT bash) | From P2: writes the code and tests of the hardest slices (solver, measurement, drive) |

At most six sub-agents are live at once. Each sub-agent receives three prerequisites:

1. the current authority documents;
2. the authority's essential purpose ("snap, never wrong motion": every visible frame is either
   the exact specified motion or a defined, reported degradation);
3. its exact task boundary.

## Machines

- **The active working tree** is `~/Documents/project/freestylejs/ani-ios-scope-correction` on the
  Mac, branch `fix/ios-native-grade-scope`, tracking `origin/dev/ecstatic-ramanujan-1mjr9q`. The
  older `ani` checkout is on `release/v1-hardening` and is not this program; `freestyle-root` is a
  different repository.
- **Every gate run** happens on the certification instrument of §11.5 (D9): this Mac, macOS 27.0.1
  arm64, Apple M2 Pro, 32 GB, Node 24.19.0, pnpm 10.20.0, Playwright 1.55.0, with
  `chromium_headless_shell-1187`, `webkit-2203` and `firefox-1490`. The old Ubuntu/Xeon container
  paths (`/home/user/...`, `/home/user/.pw-extra`) are historical and must not be used.
- **Helpers write code** in their own worktree on the Mac, reset to the exact pushed checkpoint in
  their brief. They may run the focused checks their brief names; the orchestrator reviews the patch
  and runs the deciding gates on the certification instrument.
- **The Chief Justice** works read-only in `~/Documents/project/freestylejs/ani-trial`, a clone of
  this branch pulled before each trial. It may re-run light checks on `june-wsl`, never a deciding
  cost gate.

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
| P1 | `p1_spring` | Core `physics`; the discriminated `LayoutMotion` and kind-level merge (layout and React); validation; spring tracks; perceptual timeline for crossfade, radius and presence release; reduced-motion grid; settle cap; WAAPI rejection | Unit and property tests against an independent oracle (1e-9); L-SPRING-1..4 in Chromium and WebKit (Firefox advisory, D5/D9); existing suites green except the retired `layout:COST` row (D8; P5 owns commit cost) |
| P2 | `p2_measured` | Measured presentation: capture of all participants, aging marker and the rendering-callback bound, view-space planning, pose inversion and the keep test, layout-size support check, capture-less and aged flush, flat-tree ancestry, document affinity, `layoutKey`, the active-scroll handoff rule, retained view boxes. Page boxes and the scroll `'stale'` path are removed | L-MEAS-1..13, L-HAND-1..2, L-KEY-1, L-DOC-1 in Chromium and WebKit (Firefox advisory, D5/D9); every existing row updated to the new authority and green; the retired `layout:COST` row is not a P2 gate (D8); RL3 is green under load in React 18.3 and 19 |
| P3 | `p3_safety` | Transactional flush and frames, callback isolation, the `'failed'`/`'disabled'` statuses and their precedence, `maxParticipants`, `layoutRuntime` and diagnostics, the crossfade `inert` and focus rule, model-based lifecycle fuzz, mutation tests | L-OPS-1 (run and P3 hold states) / L-OPS-2 / L-OPS-2b, L-A11Y-1, fuzz and mutation suite in Chromium and WebKit (Firefox advisory, D5/D9); drive-hold invalidation is L-DRIVE-4 in P4 |
| P4 | `p4_drive` | The drive seam: `take`/`move`/`release`/`cancel`, the state machine, the held read, reduced-motion rules, React `useLayoutDrive`; L-DRIVE-4 includes the kill switch mid-drive-hold | L-DRIVE-1..6 in Chromium and WebKit (Firefox advisory, D5/D9); React adapter tests |
| P5 | `p5_bench` | **iOS Native Grade certification:** the §11.6 interaction set and harness (Chromium, WebKit), including the P4-dependent direct-manipulation scenes; independent per-frame scoring; perf gates (commit ≤ 2× required-work floor, steady frame, sustained commits, held frame); validation → improvement iterations until every required metric passes | Native-grade report all green in both required engines; no weakened tolerance; commit ≤ 2× floor, steady p95 ≤ 2 ms, sustained/held gates and exact read counts met; iteration log records failures and fixes |
| P6 | `p6_release` | Docs site, READMEs, migration notes, changesets and versions; state the iOS-native-grade claim only from the complete P1–P5 evidence body; final full gate on a fresh clone; final review and cleanup | Full gate green on a fresh clone; P5 certification green; final tribunal PASS on every checkpoint |
