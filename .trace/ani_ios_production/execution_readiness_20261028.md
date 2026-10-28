# Execution readiness — 2026-10-28

> **Status update (2026-10-28 22:55 KST).** The combined P0/P1/P2 tribunal returned
> **TRIBUNAL PASS** at anchor `6a99da2` with 53/53 authority rows and no open defects
> (`.trace/ani_ios_production/p2_measured_trial_result.md`). P0, P1 and P2 are now formally closed.
> P3a (H11b) is running in `ani-h11b`; P3b/P4/P5a briefs are prepared. The section below is the
> pre-tribunal snapshot and remains as the dispatch record.

Status snapshot and dispatch record for the iOS Native Grade program. This file is a status record,
not an authority: `00_plan.md`, `packages/layout/ARCHITECTURE.md` and the owner decisions in
`00_plan.md` decide. It exists so no future agent has to reconstruct the position from chat.

Snapshot basis: `origin/dev/ecstatic-ramanujan-1mjr9q` at `2c34085` plus the two preparation
commits `9997552` (teleology, D8/D9, COST retirement, docs-test mapping) and `4ac1224` (H11a/H11b
split). Worktree: `/Users/june/Documents/project/freestylejs/ani-ios-scope-correction` (branch
`fix/ios-native-grade-scope`).

## 1. Where the program actually is

The active line is **not** `/Users/june/Documents/project/freestylejs/ani` (that worktree is on
`release/v1-hardening` at `ce45eb2`, an older line) and **not** `freestyle-root` (the
`freestylejs/freestyle` repository). The active work is the `ani-ios-scope-correction` worktree of
`freestylejs/ani`. `ani-h1`…`ani-h4`, `ani-trial`, `ani-p2-brief` are helper/tribunal worktrees;
they are not the authority.

### 1.1 Checkpoint ledger

| CP | Implementation | Self-judgment | Tribunal | Actual state |
|---|---|---|---|---|
| P0 Authority | v3 authority, physics API note, drift matrix; J-001/J-004/P0-N002 later code-fixed in `aaa642a` | `p0_authority.md` exists | `p0_authority_trial_result.md`: **FAIL**; re-judgment also **FAIL** in `p1_spring_rejudgment_result.md` | **OPEN** — code remediation landed, no re-judgment |
| P1 Spring | physics, motion merge, validation, spring tracks, reduced motion, settle cap; P1-001..005 fixed | `p1_spring.md` exists | `p1_spring_trial_result.md`, `p1_spring_rejudgment_result.md`: **FAIL** | **OPEN** — P1-001..005 closed; J-001/J-004/P0-N002 code-fixed; P1-N001 closed by D8 pending a green remaining suite |
| P2 Measured | H6/H6b integrated; unit 1,798; all modules green except COST and RL3 at the H6b gate | **missing** (`p2_measured.md` does not exist) | **none** | **NOT CLOSED** — implementation near complete; RL3 under load is the only functional failure; COST is retired |
| P3 Safety | only `briefs/h11.md`; no `layoutRuntime`, diagnostics, transactional boundary or statuses in code | none | none | **NOT STARTED** |
| P4 Drive | none | none | none | **NOT STARTED** |
| P5 Bench | only `briefs/h9.md`; `bench/layout/` does not exist; no §11.6 scene | none | none | **NOT STARTED** |
| P6 Release | none | none | none | **NOT STARTED** |

There is **no `TRIBUNAL PASS` anywhere** in this program yet. The `layout/final` CP8 PASS is the
previous ani-layout 0.2.0 program, not this one. The program is complete only when every checkpoint
has a PASS (`00_plan.md`, Pipeline).

### 1.2 What is actually achieved

- One v3 layout authority and a hard migration: `packages/layout/ARCHITECTURE.md`; no page-box,
  inner-scroll stale or field-merge legacy path.
- Pure physics and spring tracks, validation, reduced-motion grid, settle cap, WAAPI rejection.
- Measured-presentation engine: capture, view-space planning, pose inversion, keep test, support
  check, capture-less/aged flush, flat-tree/shadow-root ancestry, document affinity, `layoutKey`,
  active-scroll handoff, retained view boxes.
- H6b closed eleven independent-review findings; each fix has a test that failed before it.
- Board scope removed: no `app/board`, no H10 brief, no board phases. `00_plan.md` D7 and
  `scope_correction_20261028.md` make the non-regression rule explicit.
- Evidence at the H6b gate (`logs/p2-h6b/`): unit 1,798/1,798, typecheck 11/11, Chromium 195 pass /
  1 fail (`layout:COST`), Firefox all modules green, WebKit 19/20 in `react_layout_r18` (`RL3` under
  load).
- The H6b review's WebKit RL3 failure is an **aging-correct** engine outcome and a **test-assumption**
  defect, not an engine defect: the row assumes motion after a render-to-commit yield, while §4.4
  correctly snaps and warns. The fix is test-only.
- J-001/J-004/P0-N002 are code-fixed in `aaa642a` with SC-7 (3- and 1,999-level skew chains), KP-1
  (measured jump decides path 1) and ST-3 (screen-space β bound). They still need a tribunal.

### 1.3 What is not achieved

- No formal P0/P1 PASS; no P2 self-judgment or tribunal.
- No P3 runtime/diagnostics/transaction/status/cap implementation; no accessibility/fuzz/mutation.
- No P4 drive seam.
- No P5 harness, no §11.6 scenes, no iteration 0, no frame-by-frame native-grade report.
- No P6 release work, fresh-clone gate or final tribunal.
- No iOS-device or Mobile Safari certification; D5's claim is Playwright Chromium/WebKit only.

## 2. Authority corrections made in this preparation

1. **Teleology.** `00_plan.md` now states the essential purpose: the painted frame is the only
   ground truth; continue from presented `(B, v)`; never draw a plausible lie; the engine owns
   motion truth; proof is frame-by-frame and independent. The priority order is correctness >
   continuity > fidelity > performance > convenience.
2. **Cost gate (D8).** The legacy absolute `layout:COST` 4 ms row is retired. P5 owns a whole-commit
   gate at ≤ 2× the measured required-work floor on the certification instrument; steady-frame
   p95 ≤ 2 ms, sustained, held and exact-read gates remain. Rationale and floor audit:
   `gate_amendment_20261028.md`; normative text: layout §11.5.
3. **Certification instrument (D9).** The original Ubuntu/Xeon container is unreachable from this
   execution environment. The P5 instrument is the recorded macOS host (MacBook Pro Mac14,9, M2
   Pro 10-core, 32 GB, macOS 27.0.1 arm64, Node 24.19.0, pnpm 10.20.0, Playwright 1.55.0,
   chromium-1187 / webkit-2203 / firefox-1490). Old cost reports are historical/advisory. Frame
   scoring is unchanged.
4. **Fresh-install docs test.** The docs-example typecheck now maps `@freestylejs/ani-layout`
   explicitly, so a fresh `pnpm install` does not depend on a hoisted symlink.
5. **P2/P3 boundary.** H11 is split into H11a (RL3 test robustness, P2 closure) and H11b (P3a
   safety). H11b must not start from a base that still fails RL3.

## 3. Execution order (dependency-correct)

Each step ends with evidence; no step may claim a later step's PASS.

### Step 0 — Preparation (these commits)

- Authority/plan/readiness edits; COST row removed from the browser cases; docs test mapping.
- Verify: `pnpm test`, `pnpm ts:typecheck`, `pnpm check`, `git diff --check`; run the `layout` browser
  module in Chromium and WebKit. Run Firefox if its pinned build launches; on macOS 27 the pinned
  `firefox-1490` currently aborts at launch, so record the exception and use a supported host for
  advisory Firefox evidence.
- Exit: all unit/typecheck/biome clean; `layout` module green in Chromium and WebKit without COST.

### Step 1 — H11a: RL3 under load (P2 closure, test-only)

- Base: the pushed head that contains this brief (`git fetch` + `git reset --hard
  origin/dev/ecstatic-ramanujan-1mjr9q`).
- Write scope: `tests/browser/cases/react_layout.ts` and, only if unavoidable, its shared test
  helper. No `packages/*/src` change.
- Reproduce the failure under induced load first. Then implement the L_MEAS_5a pattern: if the
  commit lands after a yield, assert the exact aged outcome (`'stale'` set, every node at A, the
  expected warning), then retry the intended sequence up to 3 attempts; fail if the intended
  sequence never happens.
- Prove React 18.3 and 19 × Chromium and WebKit, under load; Firefox advisory where it launches.
  No tolerance weakening; RL4/RL5 unchanged.
- Exit: the RL3 row is robust and green in all required combinations; log under `logs/p2-close/`.

### Step 2 — P2 gate

- Run unit, typecheck, biome, and every browser module in Chromium and WebKit, with empty
  `knownFailures`, except the retired COST row. Firefox is advisory (D5/D9); record its exception
  when its pinned build cannot launch.
- Required modules: `layout`, `layout_spring`, `layout_meas`, `react_layout`,
  `react_layout_r18`, `waapi`, `showcase`, `regressions`, `acceptance` variants used by the gate.
- Exit: all green; no COST reference in the gate; logs in `logs/p2-close/`.
- Then write `p2_measured.md` (self-judgment) with the evidence matrix and the carried P0/P1 defect
  table (J-001, J-004, P0-N002, P1-N001, P1-001..005). This is the checkpoint self-judgment, not a
  tribunal verdict.

### Step 3 — Combined P0/P1/P2 tribunal; start H11b in parallel

- Commit/push the P2 self-judgment; dispatch the Chief Justice for P0 + P1 + P2 together.
- At the same time, dispatch H11b (P3a safety) from the P2 closure head. H11b implements
  `layoutRuntime`, diagnostics, callback isolation, transactional flush/frames, `'failed'`/
  `'disabled'` precedence, `maxParticipants`, mover cap, validation, L-OPS-1/2 and docs. It does not
  include RL3, focus/inert, fuzz or mutation.
- On a tribunal FAIL, its remediation joins the next checkpoint (P3) exactly as the pipeline says.

### Step 4 — P3b and P3 checkpoint

- P3b: crossfade follower `inert`, focus ownership, focus-in-follower (L-A11Y-1), model-based
  lifecycle fuzz, mutation tests, failure-path fuzz, cap/status adversarial cases.
- Run unit/typecheck/biome and `layout_ops`, `layout`, `layout_meas`, React and accessibility rows in
  Chromium and WebKit (Firefox advisory).
- Write `p3_safety.md`; dispatch the P3 tribunal.
- Exit: no safety failure leaves a wrong frame or corrupted runtime state; styles byte-identical,
  no listener/subscription left, every promise resolved.

### Step 5 — P4 drive seam

- `take`/`move`/`release`/`cancel`, held state machine, held rect read, descendant inheritance,
  scroll/ancestor-scale while held, release velocity continuity, reduced motion, invalidation,
  React `useLayoutDrive`.
- Rows L-DRIVE-1..6 in Chromium and WebKit (Firefox advisory); React adapter tests.
- Write `p4_drive.md`; dispatch the P4 tribunal.

### Step 6 — P5 native-grade certification

- Build `bench/layout/` (independent oracle, manual-clock frame scoring, real-clock cost, pinned
  fingerprint, negative controls, report/compare, `--check`).
- Build the §11.6 scenes: S-CARD, S-PHOTO, S-SEG, S-ACC (R), S-STACK, S-ISLAND, S-INSERT (R),
  S-DELETE (R), S-BULK, S-REORDER, S-SHEET. S-REORDER and S-SHEET use the P4 seam.
- Iteration 0 → N: record every failing metric and root-cause hypothesis; fix engine or scene; never
  weaken a tolerance; repeat until every required scene is green in Chromium and WebKit. Firefox is
  advisory.
- Gate: commit ≤ 2× floor, steady p95 ≤ 2 ms, sustained, held, exact reads, all §11.6 frame gates.
- Write `p5_bench.md`; dispatch the P5 tribunal.

### Step 7 — P6 release and final tribunal

- Docs site, READMEs, migration notes, changesets, versions; no obsolete 0.2.0 wording; no legacy or
  bridge code.
- Fresh clone: install, build, unit, typecheck, biome, browser, e2e; re-run P5 certification.
- Final review and cleanup; final tribunal PASS on every checkpoint (including carried remediations).

## 4. Gate commands on the certification instrument

```sh
pnpm install --frozen-lockfile --offline
pnpm test
pnpm ts:typecheck
pnpm check
pnpm test:browser --browser chromium --case 'layout:*'
pnpm test:browser --browser webkit   --case 'layout:*'
# advisory only; firefox-1490 currently aborts on macOS 27:
pnpm test:browser --browser firefox  --case 'layout:*'
```

For the full P2 gate, repeat per module rather than only `layout`. Logs go under
`.trace/ani_ios_production/logs/<checkpoint>/`, one file per command, with the commit hash, command,
environment fingerprint and exit code at the top. Cost runs require a 1-minute load average below
1.0; functional runs do not, but the RL3 proof deliberately adds load.

## 5. Open decisions and risks

1. **D9 instrument ratification.** The macOS pin is the only instrument reachable from this session.
   If the owner restores the original Linux container, either re-pin and re-run P5 or keep the macOS
   report as advisory; do not mix fingerprints in one certification.
2. **Firefox launch.** `firefox-1490` aborts on macOS 27 (`sandbox_extension_issue_file_to_process`
   for `plugin-container.app`), headless and headed. Chromium and WebKit decide per D5; Firefox is
   advisory. Run advisory Firefox on a supported host or after a Playwright re-pin. A launch failure
   is an environment exception, never an engine failure and never a silent gate pass.
3. **P0/P1 re-judgment.** The code fixes are strong but not yet judged. If the tribunal finds a new
   S0/S1, its remediation joins P3; do not start P5 with an open S0.
4. **RL3 under load.** The fix is test-only; if the intended sequence cannot be made reliable in 3
   attempts under load, report the aged outcome as the row's evidence and fail the row only if the
   engine draws wrong motion. Do not weaken the engine's §4.4 behavior.
5. **COST floor audit.** The P5 harness must prove the floor performs exactly the authority's
   reads/writes. A floor that does extra work makes the ratio too lenient and is a harness failure.
6. **Parallelism.** The tribunal runs while the next phase starts, but an open S0 blocks P5. The
   Chief Justice's verdict is the gate, not the orchestrator's self-judgment.
7. **Sub-agent availability.** This session's Anthropic-backed sub-agents were unavailable (credit
   balance), so this preparation was verified directly. Helper dispatch must re-check the route
   before promising parallelism.

## 6. Immediate next action

Dispatch **H11a** at the Step 0 head. It is the only remaining functional blocker to P2 closure. When
its three-engine, React-18/19, under-load proof is green, run the Step 2 P2 gate and write
`p2_measured.md`; dispatch the combined P0/P1/P2 tribunal and H11b in parallel.

Until then, do not describe P2 as complete, do not call any checkpoint TRIBUNAL PASS, and do not
start P5 certification.
