# ani-layout final — phase plan

## FINAL GOAL

Ship `@freestylejs/ani-layout` 0.2.0 and `@freestylejs/ani-react/layout` exactly as
`packages/layout/ARCHITECTURE.md` specifies (one pure solver on the core clock, exact
nested projection, automatic per-commit React authoring, Motion E1–E5 + reduced 2D Gallery),
with **every architectural claim proven from code level to test level**: pure property tests,
deterministic frame-level browser tests in Chromium, Firefox and WebKit, real-clock
regression tests and cost gates. Hard migration: no 0.1.0 code, bridge, alias or shim
survives. The repository's full `pnpm test:ci` passes on a fresh clone.

Done means: every checkpoint below has a PASS from the Chief Justice (or its failures were
carried forward and passed in a later checkpoint), and the final checkpoint passes.

## 1. Task charter

- **Goal:** implement the approved layout architecture and prove it objectively.
- **Constraints:** Core V2 public API unchanged; layout uses Core's public API only; never
  include `packages/ui-kit` (none exists in this repository; nothing may add it); no push or
  publish without the Human Engineer; heavy runs on `june-wsl` (`~/ani-v2/lay` mirror),
  never in the `~/ani-v2/repo` checkout; Gemini never reviews or judges.
- **Non-goals:** Vue/Svelte/Solid layout adapters; 3D/drag/loop gallery; `layoutScroll`,
  `layoutRoot`, arc, shadow correction, SVG/inline, rotation/skew projection; any Core change.
- **Accepted side effects:** root dev dependencies for tests (React 18.3 alias, React
  Compiler for the S1 spike); browser runner module list and flags; turbo/tsconfig only if a
  gate requires it.

## 2. Boundary map

| Allowed | Blocked |
|---|---|
| `packages/layout/**` | `packages/core/src/**` (public API frozen; read only) |
| `packages/react/src/layout/**`, `packages/react/package.json` (peer range) | `packages/{vue,solid,svelte}/**` |
| `tests/browser/**` (runner, bundle, cases for layout) | Core/binding browser cases' assertions |
| `packages/web/content/docs/{guides,showcase}/layout.mdx`, `packages/web/src/components/layout_showcase.tsx` | Unrelated docs pages |
| `.changeset/ani-layout.md`, root `package.json` dev dependencies and scripts, `pnpm-lock.yaml` | Publishing, pushing, tags |
| `.trace/ani_layout_final/**`; deletion of `.trace/ani_layout_v1`, `.trace/ani_layout_cpc_v1` | Other `.trace` folders |

Integration points: `@freestylejs/ani-core` clock/timing/error exports; React 18.3/19 render
and commit semantics; the browser runner (`tests/browser/run.ts`); vitest root config.

## 3. Execution environment

- Local worktree `/Users/june/Documents/project/freestylejs/ani-layout`, branch `layout/final`
  from `v2/main` `4aade58`. Edits and commits happen here.
- Remote mirror `june-wsl:~/ani-v2/lay` (rsync, node_modules installed). Every test, build and
  browser run happens there. WebKit runs need `source ~/ani-v2/sysroot/webkit-env.sh`.
- Chief Justice trials: a frozen judge worktree `/Users/june/Documents/project/freestylejs/ani-judge`
  at the checkpoint commit, mirrored to `june-wsl:~/ani-v2/lay-judge`; Codex CLI
  `gpt-6.1-sol`, `model_reasoning_effort = "xhigh"`, `workspace-write` sandbox with network
  (to run tests over ssh).

## 4. Phase plan

| CP | Objective | Planned changes | Verification | Rollback point |
|---:|---|---|---|---|
| 1 | Single authority | New `ARCHITECTURE.md`; delete both old architecture docs and old layout `.trace` folders; this plan; drift matrix | Judge: authority consistent with the approved decision and the two answers; no stale authority left in the repo | `4aade58` |
| 2 | P0 spikes S1–S4 (hard gates) | Spike browser modules, React 18.3 alias, React Compiler build variant | S1–S4 stop conditions in three browsers; no production code before all pass | CP1 commit |
| 3 | Pure core | `geometry.ts`, `motion.ts`, `plan.ts`, `solve.ts` + property tests with an independent oracle | vitest property suites; typecheck; no DOM/clock imports | CP2 commit |
| 4 | Engine + vanilla API + hard deletion | `dom.ts`, `scope.ts`, `realize/raf.ts`, `presence_link.ts`, new `types.ts`/`index.ts`; delete `layout_group.ts`, `projection/*`, CPC tests/harness, FLIP writer; deterministic browser module | Unit tests; browser tests (flat, nesting depth 3, anchor, interruption + velocity, every snap reason, reduced motion, dispose/finish, read counts) ×3 browsers; S4 re-measured on the engine | CP3 commit |
| 5 | React adapter + presence composition | Rewrite `use_layout.ts`, `layout_group.tsx`, `context.ts`, presence edits (popLayout containing block, opacity rule, release hold), implicit root scope, dev MutationObserver | React unit tests; browser: StrictMode, `startTransition`, `useDeferredValue`, Suspense, trigger warning, E5 ×3 browsers | CP4 commit |
| 6 | Acceptance + product surface | E1–E5 + Gallery fixtures and frame-level tests; regression tests; seeded fuzz; cost gates; showcase rebuilt; README, docs guide, showcase page, changeset | Every row of `ARCHITECTURE.md` §11 ×3 browsers; docs examples typecheck; web build | CP5 commit |
| 7 | P4 WAAPI engine (optional, gated) | `realize/waapi.ts` + engine option, or a recorded no-ship decision | Differential ≤ 0.5 px/frame; 120 ms block ≤ 6 %; compositor trace | CP6 commit |
| 8 | Final | Cleanup, size, fresh-clone `pnpm test:ci`, `test:browser` ×3, final review | Final tribunal | CP7 commit |

## 5. Checkpoint tasks and validations

### CP1 — Authority
- T1.1 Write `packages/layout/ARCHITECTURE.md` from the approved decision + answers; record clarifications K1–K11.
- T1.2 Delete `packages/layout/ARCHITECTURE_CPC.md`, `.trace/ani_layout_v1/`, `.trace/ani_layout_cpc_v1/`.
- T1.3 Write `00_documentation_drift.md` and this plan.
- V1: the new document covers decision, model, commit/frame, solver, ownership, API, modules,
  failure, WAAPI gate, acceptance, risks; no other file claims layout authority.

### CP2 — Spikes (hard gates before any production code)
- T2.1 **S1 render capture:** prototype scope with the §4.1 lifetime (task-stamped capture,
  layout-effect-scheduled flush microtask); a `getSnapshotBeforeUpdate` probe gives the true
  before-mutation boxes of every probed commit. Scenarios, all under StrictMode: sync and
  batched updates; `startTransition` renders time-sliced over several tasks and pre-empted by
  a sync commit outside the scope; `useDeferredValue`; Suspense (fallback and transition).
  Builds: React 19 and 18.3, each plain and React Compiler-compiled. Must show: zero flushes
  using a B other than the probe's; zero commits without a capture; a no-refresh control run
  that does use stale B (sensitivity).
- T2.2 **S2 first frame:** React commit → flush in microtask → 120 ms block → first painted frame
  progress ≤ 6 % (RAF on the core clock with first `dt` = 0); control without the forced 0.
- T2.3 **S3 composition:** a toast mid presence-enter (`transform: translateY(14px) scaleX(.8)`,
  origin centre-bottom) with a scaled child, a `scale: 1.05; translate: 10% 4px` card, and a
  three-level chain with a participant-ancestor presence transform: dividing out the inner maps
  gives every layout box within 0.5 px of the truth (transforms removed).
- T2.4 **S4 cost:** reads of one commit at 1,000 participants ≤ 4 ms; steady frame
  (solve + writes) at 300 nested movers ≤ 2 ms p95.
- V2: each spike's numbers per browser in `cp2_spikes.md`. **Gate:** a spike that misses its stop
  condition blocks CP3; its named fallback must be applied to the architecture and re-validated
  by the same spike before CP3 starts. A recorded failure never closes the gate.

### CP3 — Pure core
- T3.1 `geometry.ts`: axis maps, compose/invert, element map from inner values, pose from box.
- T3.2 `motion.ts`: defaults, validation (`ANI_INVALID_OPTIONS`), stateless check, `e`, `e′(0)`,
  reduced-motion clamp.
- T3.3 `solve.ts`: track channels, unclamped velocity term with the size floor, delay rule
  (moving nodes ignore it), anchor rule, modes, crossfade opacity, radius, top-down projection.
- T3.4 `plan.ts`: movers by threshold, keep vs retarget with velocity, layoutId lead/follower,
  handoff, crossfade gating, culling, cap, unsupported subtree propagation, layoutDependency.
- V3: property tests (seeded) — random trees depth ≤ 5, random timings/delays: composed drawn
  boxes (random inner maps on every level) equal the independent oracle within 1e-9; identity
  poses at settle; c(0)=B, c(1)=A, c′(0)=v for every retarget
  (including fast, short ones), size floor only when it binds; keep vs retarget;
  every snap reason; validation errors carry the code. No DOM or clock import in these files.

### CP4 — Engine and vanilla API
- T4.1 `dom.ts` (reads, inner maps, scroll containers, owned style save/write/restore,
  unsupported detection), `presence_link.ts`, `realize/raf.ts` (first `dt` = 0), `scope.ts`
  (registry, capture refresh, flush, runs, finish, dispose, stats, warnings).
- T4.2 Public `types.ts`/`index.ts`; delete `layout_group.ts`, `projection/*`, `easing.ts` users
  other than View Transitions, old tests and the CPC browser harness. The layout package, the
  browser tests of the `layout` module and every other package typecheck. The React adapter's
  layout module (`packages/react/src/layout`, browser module `react_layout`) still targets the
  deleted engine; CP5 replaces it, and its typecheck is a V5 gate.
- T4.3 Browser module `layout` (manual clock): flat move, nested depth 3 with mixed modes,
  anchor, delay, interruption with velocity, layoutId handoff and crossfade with presence,
  a participant ancestor with a constant and with an animating presence transform (§3.1),
  a constantly scaled parent and a delayed child on different timelines (CP2 trial J-001 DOM),
  a running retarget whose flush reads before any write,
  every snap reason, reduced motion (jump / maxDuration / ignore / toggle), finish, dispose,
  byte-identical restore, reads per commit and zero reads per frame.
- T4.4 S4 cost: commit reads at 1,000 participants; steady frame at 300 nested movers (p95).
- V4: all of the above green in Chromium, Firefox, WebKit; vitest green; typecheck green.

### CP5 — React
- T5.1 `useLayout` (render capture, layout-effect flush, ref, options), `LayoutGroup` (outermost
  scope, nesting, namespacing, defaults, recreation), implicit root scope per `(clock, document)`
  with independent disposal, `useLayoutGroup`,
  `AnimatePresence` toucher, dev `MutationObserver`.
- T5.2 Presence: popLayout containing block, opacity ownership registration, release hold.
- T5.3 Tests: jsdom unit tests for the adapter contract (including root-scope isolation per
  clock and per document); browser module `react_layout`: list
  reorder, StrictMode, transition, deferred value, Suspense, memoized-subtree warning,
  `useLayoutGroup().update`, unrelated re-render identical trajectory, E5.
- V5: green ×3 browsers; no 0.1.0 symbol (`LayoutConfig`, `deps`, `maxBoxes`, `play(`,
  `LayoutSnapshot`, `'preserve-aspect'`, `'box'`) left in package sources or tests (the user
  docs are rewritten in T6.4 and checked by V6).

### CP6 — Acceptance and product
- T6.1 Fixtures and frame-level tests for E1–E5 and the reduced Gallery (parameters below).
- T6.2 Regression tests (late start, unrelated re-render, crossfade, velocity under jank, reduced
  motion, showcase honesty) and seeded fuzz invariants.
- T6.3 Cost gates recorded at 50, 300 and 1,000 participants.
- T6.4 Showcase rebuilt on the fixtures (CSS-flow toasts); README, docs guide, showcase page,
  changeset rewritten; docs examples typecheck.
- V6: every row green ×3 browsers; web build green; docs examples green; no 0.1.0 symbol left
  anywhere in the repository (sources, tests, README, docs, showcase, changeset); no `spike*`
  browser module remains.

Row parameters (from the 2026-10-22 Motion research):
- **E1** parent 150 → 300 px; child 70 → 100 px, `layoutAnchor {0.5, 0.5}`, delay 0.8 s; crosshair grandchild.
- **E2** trigger and menu share wrapper/label/icon `layoutId`s; `AnimatePresence mode="popLayout"`; spring; label glyph 11 ± 1 px; close/reopen at 100 ms and 500 ms.
- **E3** 25 → 68 px shared tiles; `popLayout`; spring; non-shared items enter from the measured folder origin at scale 0.2 with a stagger; reopen at 500 ms.
- **E4** grid card ↔ detail with nested ids (surface, image, title `'position'`); overlay; close/reopen.
- **E5** add/remove list; `layout: 'position'`; `popLayout`; enter y 14 px / scaleX 0.8 / opacity 0; exit y 10 px / scaleX 0.9 / 0.2 s; spring; origin centre-bottom; five adds 80 ms apart.
- **Gallery** 16 tiles grid ↔ list + a detail view with a shared id.

### CP7 — WAAPI (optional)
- T7.1 Spike the gate first: compositor trace during a 120 ms block for a depth-0 `'position'`
  move created in the flush without `startTime`. If it fails, record the no-ship decision and
  stop the phase.
- T7.2 If the trace passes: `realize/waapi.ts` behind an explicit engine option, throws for
  unsupported shapes, differential test vs RAF, block test.
- V7: gates met (ship) or a recorded, evidenced no-ship.

### CP8 — Final
- T8.1 Final review rubric (dead code, unused exports, size of the layout core ≈ 900 lines).
- T8.2 Fresh clone: `pnpm install`, `pnpm test:ci`, `pnpm test:browser` ×3, `pnpm size`.
- V8: all green; final report.

## 6. Trial protocol

1. At each checkpoint I run the *judging-checkpoint-completion* review myself and write
   `.trace/ani_layout_final/cpN_<part>.md` (verdict, evidence, fixes applied).
2. I freeze the checkpoint commit into the judge worktree and launch the Chief Justice
   (Codex `gpt-6.1-sol`, xhigh) in the background. It writes
   `.trace/ani_layout_final/cpN_<part>_trial_result.md`: verdict, findings, and a fix directive
   for the implementer.
3. I continue with the next checkpoint while the trial runs. A FAIL adds its failed tasks to the
   next checkpoint; that checkpoint's trial re-judges them.
4. A spike failure (CP2) is never carried forward: CP3 starts only after every spike passes.
5. Sub-agents: at most three live at once (the Chief Justice counts as one). Helpers are reused
   for related work and shut down when their context no longer fits.
