# Final Chief Justice ratification: P4 `p4_drive` / J-001

## Verdict and finality

- **Final P4 J-001 ratification: TRIBUNAL FAIL.**
- **Technical J-001 repair: PASS.** No remaining kill-switch/abort landing-state defect was found. The failure is the unfulfilled, explicit unit-regression item in the original tribunal's Remediation Order, not a newly demonstrated engine defect.
- Finding: **J-P4R-001, S2 — prescribed unit regression coverage absent.** No new S0/S1 implementation defect found in this ratification.
- **P5 J-P5-001 is NOT closed. P5 may not be re-judged as unblocked on the strength of this report.**
- Judge: **`openai/gpt-6.1-sol#high`**, the owner-authorized superseding final Chief Justice route; 2026-10-30. This is a final ruling of this ratification, **not an acting verdict** and not an impersonation of the unavailable historical route.
- Worktree: `/Users/june/Documents/project/freestylejs/ani-trial-p4-final`, detached at **`7ccd83cf584b2aab1804a1fa0f67ff3f4838931c`**; initial working tree clean.
- Only this report was written. No source, test, authority, gate, scene, tolerance, prior evidence, dependency link or commit was changed or created. No deciding cost gate or full bench was run.

The route authorization was read first: `reviews/chief_justice_route_supersession_20261030.md`. It supersedes the route reservation in `reviews/chief_justice_substitution_20261029.md`, **not the evidence standard**. The acting PASS was inspected but was not accepted as proof of final completion. The source and browser evidence establish the essential behavioral correction; they do not establish that the separately ordered unit regression was added.

All unprefixed trace paths below are relative to `.trace/ani_ios_production/`.

## Authority coverage

| Authority/evidence | Role and coverage | Result |
|---|---|---|
| `reviews/chief_justice_route_supersession_20261030.md` | Owner-approved final-route authority, read before substantive inspection | Covered; final authority valid |
| `reviews/chief_justice_substitution_20261029.md` | Historical acting substitution and reservation | Covered; route reservation superseded, no automatic PASS |
| `p4_drive_trial_result.md` | Original 41-row judgment, J-001 disposition, required tests, Remediation Order and re-entry criteria | Covered; original P4-21/24/31 repaired, Remediation Order item 3 unmet |
| `p4_drive_rejudgment_result.md` | Acting PASS and technical assertions | Independently checked; not silently promoted |
| `p4_drive_plan.md` | D1-D10, required engines, unit/types/Biome, restoration and exit requirements | Covered against source, raw gates and focused reruns |
| `p4_authority_clarifications.md` | C1-C11, especially C3 live landings | All covered in matrix below |
| `packages/layout/ARCHITECTURE.md` §5.10 | Surface/state machine, held reads, descendants, release and reduced policy | Source trace plus all drive acceptance exports |
| Same §7.2 | Synchronous kill switch, diagnostics and callback isolation | Source trace, L_OPS_1/L_OPS_2 and L_DRIVE_4 |
| Same §9.1-§9.3 | Degradation, byte-exact styles/inert cleanup, failed/disabled statuses | Source trace, L_OPS_2/CAPS_STATUS/L_A11Y_1/FUZZ/EDGES |
| Same §11.1-§11.3, especially §11.2 L-DRIVE-1..6 | Independent frame oracle, acceptance, fuzz and mutation controls | Fresh unchanged cases in Chromium and WebKit; raw full gates |
| `p4_drive.md` | Implementer proof claim and residual bounds | Evidence only; exact commit roles corrected below |
| `logs/j001/{red.md,unit.log,typecheck.log,biome.log,chromium.log,webkit.log}` | Historical repair evidence | Directly inspected, not relabelled as current-revision full-suite results |
| P5 `p5_bench_trial_result.md` | Exact J-P5-001 prerequisite/disposition | Covered from sibling trial copy; remains unsatisfied |

### P5 artifact location

The requested P5 tribunal report does not exist in this detached revision. Its actual read-only copy was inspected at:

`/Users/june/Documents/project/freestylejs/ani-trial-p5/.trace/ani_ios_production/p5_bench_trial_result.md`

SHA-256: `5e377520e82c22ea645a6ed9b043470e050dd4c4652e4885d7abab6643905e10`.

It returns BLOCK on A03/J-P5-001 and explicitly permits an owner-approved superseding route **plus a final P4 ratification** as the smallest correction. It accepts the P5 technical bridge separately and does not require a fresh full bench merely for that bridge. This report neither reopens that technical decision nor supplies a successful P4 ratification.

## Repair chain and independent source findings

`fa95fdc` is the **evidence commit**, not itself the source repair. Git inspection resolves the chain:

| Commit | Actual role |
|---|---|
| `86e889fc753a4e55626e8a6b308235a25543430d` | Source correction in `packages/layout/src/scope.ts` and `runtime.ts` |
| `3516e61f6072fe44fb641162c3c8ab4509bdfc15` | Adds 170 lines to `tests/browser/cases/layout_drive.ts`; no unit-test file changed |
| `f43e211` | Documents landing invalidation/listener resume |
| `fa95fdc302a31a40baaf34d16653f0fe96ad078c` | Records the six `logs/j001/` artifacts |
| `7a9badf` / `3992a6d` | Merge and self-judgment update |

Before the correction, `invalidateHold()` assigned `invalidated` only for `hold.state === 'held'`. Thus a live `released`/`cancelled` landing could be removed while its public handle retained that state. The raw red record reports the released kill-switch and abort failures with exactly that stale state; cancelled coverage is supplied by the added green cases, not misrepresented as a separately recorded red run.

At inspected HEAD:

1. `scope.ts:2125` changes every non-invalidated attached hold to `invalidated` **before** clearing `p.hold`, the release track and riding descendants.
2. `finishAll('disabled')` invalidates frame participants before settling/restoring them; `snapToDisabled()` recognizes live landings as movers and emits `runtime-disabled`.
3. `abort()` invalidates attached holds, clears writes/attributes, restores saved declarations and inert state, disarms listeners/markers, stops the realizer, resolves affected reports `failed`, and emits `internal-error`. Direct browser fault cases exercise this boundary.
4. Natural completion uses `finishHold()` (`scope.ts:2674`), which detaches/settles without changing the public released/cancelled state. The normal-completion controls inside L_DRIVE_4 assert both states, zero holds and exact styles.
5. Removal/adoption/key reset, cap and disposal cleanup reach the shared invalidation/settle paths; actively held support failure is marked invalidated before cleanup. The correction is not a test-specific kill-switch branch.
6. Disabled completion calls `disarm()`; `RuntimeScope.resume()` calls `syncListeners()` when animate mode returns. Fresh FUZZ and L_OPS_1 cover listener balance, re-enablement and later handoff-scroll detection.

`git diff 3992a6d..HEAD -- tests/browser/cases/layout_drive.ts packages/layout/src/runtime.ts` is empty. Later planner/engine changes do exist in `scope.ts`; they were not assumed harmless merely because the old logs passed. The relevant unchanged browser cases were rerun against **this trial's current source**. `git diff --name-only ea1475c..HEAD -- packages tests` is empty, so the product/test identity relevant to the P5 bridge is unchanged.

## Judgment matrix

| Row / authority | Evidence and independent result | Verdict |
|---|---|---|
| Original P4-21 / J-001: kill switch invalidates all live states | Shared helper plus released/cancelled live-count preconditions, synchronous invalidation, exact styles, zero holds/clock, listener removal, marker drain and runtime-disabled assertions in L_DRIVE_4; both engines | PASS |
| Original P4-24 / J-001: abort invalidates all live states | Released/cancelled write-fault landings in L_DRIVE_EDGES; exact styles, zero holds/clock/marker, listener removal and internal-error; both engines | PASS |
| Original P4-31: complete L-DRIVE-4 state-machine coverage | New landing controls plus preserved stale/nonfinite/lifecycle/scope cases; both engines | PASS |
| Original disposition: preserve normal released/cancelled completion | Separate natural-completion loops in L_DRIVE_4, not forced cleanup; helper separation verified | PASS |
| Original disposition: robust correction rather than redefining live states | C3/isLiveHold remain live-state based; shared helper corrected; no tolerance/authority change | PASS |
| Remediation Order item 2: non-vacuous browser rows for both landing states and both causes | Four forced-invalidations start with state released/cancelled and holds=1; assert cleanup after cause; unchanged source tests rerun | PASS |
| **Remediation Order item 3: add/extend focused UNIT state-machine coverage for the same transitions** | **No unit file changed in 848c9b7..fa95fdc. Current drive.test.ts lifecycle loop takes/moves a held handle but never releases/cancels before snap. Current runtime.test.ts covers ordinary tracks/callbacks, not the four live landing combinations. Repository unit search found no replacement coverage.** | **FAIL J-P4R-001** |
| Remediation Order item 4: drive/React/M7 in required engines | All 8 layout_drive exports, React 19/18 RL_DRIVE/FOLLOWER/STRICT and MUTATION passed in both engines | PASS |
| Remediation Order item 5: historical full unit/types/Biome/browser/coverage gates | Raw j001 gates verified below; not claimed as a new full-suite run | PASS for recorded repair gates |
| L-DRIVE-1 | Held/reorder/release oracle worst 0.0000 px; snap-back/cancel and first-frame/M7 controls execute | PASS |
| L-DRIVE-2 | Caught velocity 566.7 px/s equals oracle; held/release size continuation worst 0.0001 px | PASS |
| L-DRIVE-3 / C11 | Scroll, scaling parent, sticky self and sticky ancestor; maximum reported H error 0.0001 px Chromium, 0.0000 px WebKit | PASS |
| L-DRIVE-4 | Forced invalidation and terminal normal-completion controls described above | PASS |
| L-DRIVE-5 / C8 | jump/maxDuration/ignore, policy changes, no-fit released+reduced, timeout distinction, landing policy | PASS |
| L-DRIVE-6 | Descendant residual + common h: 0.0000 px held, 0.0001 px landing, velocity error 0.00 px/s | PASS |
| L_DRIVE_EDGES / C5/C7 | Take validation, nonfinite input, animated-owned support probe, abort/re-take faults, listener cleanup and refused size track | PASS |
| L_DRIVE_FIX / C1/C9 | Successful and failed re-takes, current take geometry, held/landing size and position re-layout | PASS |
| L_DRIVE_FIX / C4/C6/C10 | Hold+rider mover cap, explicit scope-local nested-hold bound, nearest-ancestor carried velocity and driven-child cases | PASS within declared bounds |
| React / C2 | Explicit/implicit dispatcher routing, unowned throw, follower rejection and non-vacuous StrictMode replay; React 19 and 18 | PASS |
| L-OPS-1/2/2b and §9.1-§9.3 | Exact restored state, failed/disabled status, callback isolation/order/async rethrow; CAPS_STATUS checks precedence and finished-follower lifecycle | PASS |
| Styles/inert/listeners/clock preservation | L_A11Y_1, CAPS_STATUS, FUZZ, mutation control M6 and landing regressions in both engines | PASS |
| P5 A03 / J-P5-001 | Authorized route exists, but this final P4 ratification rejects completion on the missing mandatory regression | NOT CLOSED |

**C1-C11 are all accounted for.** C3 is directly exercised by the holds=1 landing preconditions and holds=0 cleanup. C2 is the follower rejection row; C4/C6/C10 are L_DRIVE_FIX; C5/C7 are EDGES plus existing take cases; C8 is L_DRIVE_5; C9 is FIX; C11 is L_DRIVE_3. No accepted limitation is silently converted into an unrestricted guarantee.

## Independent checks and exact results

All execution used `node --input-type=module -e` with inline code, not a generated project file. Dependencies were loaded from `/Users/june/Documents/project/freestylejs/ani-ios-scope-correction/node_modules`; product source and test bodies came from the detached trial. No install or dependency symlink was used. The exact inline invocations are retained in this ratification's tool transcript.

| Check | Exact scope/method | Result |
|---|---|---|
| Identity and preservation | `git status --short --branch`; `git rev-parse HEAD`; git log/show of 86e889f, 3516e61, fa95fdc and repair merge; source/test diffs noted above | PASS; clean initial tree, exact HEAD above |
| Successful focused unit rerun | Vitest 4.1.2 `startVitest('test', ['layout/src/__tests__/drive.test.ts', 'layout/src/__tests__/runtime.test.ts'], {root: trial+'/packages', config:false, watch:false, maxWorkers:1, fileParallelism:false, cache:false}, viteOverrides)`; process **2749** | **2 files, 28/28 tests PASS, exit 0**: drive 16, runtime 12. Expected stale-handle warning assertions emitted two stderr messages. |
| Successful focused typecheck | TypeScript 6.0.2 Compiler API, parse unchanged `packages/layout/tsconfig.json`; noEmit/skipLibCheck; `getPreEmitDiagnostics`; process **2746** | **0 diagnostics, exit 0; 51 layout root files, 105 trial source files; borrowed product source []** |
| Broad focused browser rerun | Process **2732**; unchanged exports listed below, fresh page/context for each case and engine | **20 existing exports PASS per engine (40 actual passing case executions), no case page/console problems. Invocation exit 1 only because it also attempted nonexistent L_OPS_2b separately in each engine. Those two selection errors are not passes.** |
| Clean requested safety rerun | Process **2747**; `layout_ops:L_OPS_1,L_OPS_2` and `layout_drive:L_DRIVE_4,L_DRIVE_EDGES` in Chromium and WebKit | **4/4 per engine, 8/8 total PASS; exit 0; zero browser problems** |
| Unit-regression inventory | `git diff --numstat 848c9b7..fa95fdc -- packages/layout/src/__tests__`; direct drive/runtime test inspection; unit directory landing/state search | **Missing prescribed new unit cases; J-P4R-001** |
| Read-only boundary | `git diff --exit-code -- packages tests .trace/ani_ios_production` before report write; status checks | Exit 0; no pre-report changes |

### Successful execution adaptations

- **Browser:** import esbuild/Playwright from sibling dependencies; bundle original trial modules with `write:false`, `platform:'browser'`, ESM, `conditions:['browser']`, development define, trial-source package aliases and sibling `nodePaths`. React 18 uses the same react/react-dom remapping as `tests/browser/bundle.ts`. Preserve package-local tsconfig resolution. Serve bundles entirely in memory at `http://ani.test`, invoke original exports, wait two additional animation frames, and collect page errors/console warnings/errors. Close every context/browser. Missing installed base-tsconfig bundle warnings were identified explicitly; unexpected bundle warnings were rejected. Engines: **Chromium 140.0.7339.16**, **WebKit 26.0**.
- **Unit:** no original test body was changed. The successful run supplied Vite overrides in the fourth `startVitest` argument, disabled its config-dependent OXC transform, used in-memory esbuild TS-to-ESM transformation, package-local `~/` resolution and trial-source aliases, and aliased Vitest to its ESM `dist/index.js`. Node bare-package fallback borrowed tooling only. This is a focused behavioral unit recheck, not the normal full-monorepo gate.
- **Typecheck:** a read-only compiler host borrowed missing dependency files and the advertised shared base tsconfig; internal core/layout imports resolved to trial source and `~/` to each containing package. Compiler strictness was inherited, not disabled. `getSourceFile` used the same virtual read host; output writes were forbidden. This is a focused layout-source/test typecheck, not a claim of a fresh 11-task Turbo run.

### Browser exports actually exercised

- `layout_ops`: **L_OPS_1, L_OPS_2, CAPS_STATUS, L_A11Y_1, FUZZ, MUTATION** (6).
- `layout_drive`: **L_DRIVE_1, L_DRIVE_2, L_DRIVE_3, L_DRIVE_4, L_DRIVE_5, L_DRIVE_6, L_DRIVE_EDGES, L_DRIVE_FIX** (8).
- `react_layout` and `react_layout_r18`: **RL_DRIVE, RL_DRIVE_FOLLOWER, RL_DRIVE_STRICT** (3 each).

**L-OPS-2b naming:** architecture §11.2 names this authority row, but there is no exported `L_OPS_2b` function. Its onSnap/diagnostic-listener isolation assertions are inside `L_OPS_2`, which ran successfully in both engines twice. The original attempt to call a separate export produced two `missing export L_OPS_2b` selection errors; the clean rerun uses the real export and still covers the authority row. No row or assertion was removed to obtain a pass.

### Failed bootstrap attempts, not clean results

Earlier inline unit bootstraps failed before executing tests: missing base-tsconfig resolution (processes 2736/2739), then accidentally resolving Vitest's CJS entry rather than ESM (2744). An initial inline unit command also had a parsing error. Typecheck bootstrap attempts included a parsing error, a virtual-host mismatch producing 48 missing-dependency/cascading diagnostics (2741), and a host API mismatch. These are not claimed as successful unit/type gates or as product defects; the corrected runs above execute the intended unchanged files and report their actual results. No disk bootstrap was introduced.

## Raw J-001 gate audit

| Artifact | Directly observed historical result |
|---|---|
| `logs/j001/unit.log` | **153 files, 1,892/1,892 tests** |
| `logs/j001/typecheck.log` | **11 successful tasks / 11**, 5 cached |
| `logs/j001/biome.log` | 450 files checked; no fixes; **10 warnings**, 7,337 infos; no errors reported |
| `logs/j001/chromium.log` | **223 passed, 0 failed, 0 known failures, 0 skipped**; new released/cancelled kill-switch and abort details present |
| Same coverage block | **92.27% statements / 80.35% branches / 95.48% functions / 94.76% lines**, above existing 90/80/95/92 floors |
| `logs/j001/webkit.log` | **221 passed, 0 failed, 0 known failures, 2 Chromium-only skips**; same landing details present |
| Both engine logs | All L-DRIVE-1..6/EDGES/FIX, React drive versions, FUZZ 16 seeds, L_OPS_1/2, CAPS_STATUS, L_A11Y_1 and mutation controls pass |

These are genuine repair-period logs, not evidence of 1,892 newly added tests or current full-suite execution. The unit total is unchanged because the J-001 regression additions are browser-only.

## Defect disposition and smallest remediation

### J-P4R-001 — missing mandatory unit regression (S2)

**Essential defect.** `p4_drive_trial_result.md`, Remediation Order item 3, explicitly orders: **“Add/extend focused unit state-machine coverage for the same transitions.”** The repair changes only the browser test file; its unit history has no such addition, and current unit tests still do not exercise released/cancelled landing × kill-switch/abort. Passing existing unit tests cannot establish execution of cases they do not contain.

The shared helper and four real-browser regressions establish that the engine fix is sound. This finding does **not** reject those results, demand an invented harness, or require duplicate evidence files. It enforces a concrete unfinished item already imposed by the original tribunal. Neither the acting PASS nor a route-only supersession waives it.

**Robust correction mandate:**

1. Return only to the J-001 test unit. Add/extend parameterized unit regressions for **released/cancelled landing × runtime snap/transactional abort**. Assert the landing is live before the cause, handle becomes invalidated, holds clear, and the relevant restored state/clock/diagnostic invariants hold. Retain the natural-completion controls; do not change production behavior merely to satisfy a test.
2. Re-run those focused unit tests and the existing required Chromium/WebKit landing rows. Preserve existing full-gate records and all tolerances/known-failure rules. **No fresh deciding cost gate or full bench is ordered.**
3. Submit a proof report naming the test change/commit, exact cases and checks/results, original Remediation Order mapping and residual risks; then obtain authorized final P4 re-ratification. No source change is requested by this finding.

**Forbidden workaround:** describe the browser cases as newly added unit cases, cite 28/28 or 1,892/1,892 as proof of absent transitions, delete the original unit item/acting qualifier, or mark P5 A03 PASS despite a final P4 FAIL.

**Re-entry criteria:** inspectable unit regressions cover all four landing/cause combinations; focused unit and both-engine rows pass; product/evidence identity is stated; final authorized judge verifies closure. Missing access would BLOCK; missing required cases continues FAIL. An explicit owner amendment could change the requirement, but no such amendment was supplied or inferred here.

## Residual risks and limits

- Technical repair evidence is strong: fresh real-browser assertions cover synchronous kill-switch, fault abort, exact styles, live counts and cleanup; natural completion is separately controlled. No remaining functional J-001 defect was observed.
- The unit rerun proves only its 28 existing cases. It does not fill the missing regression inventory; the focused typecheck and browser reruns are not a fresh monorepo-wide certification.
- Existing P4 bounds remain: scope-local nested holds; nearest-animating-ancestor rather than fully composed take velocity; compositor scroll may trail one frame; documented box-preserving rotation/zoom support-classification risk; historical branch floor margin 0.35 percentage points; Firefox advisory.
- Normal listener registration for a mounted, usable scope is distinct from a leaked clock subscription; invalidation/abort/disable cleanup and later re-arming are directly exercised. Finished invisible P3 followers legitimately retain their opacity/inert hold until unmount/dispose; fresh CAPS_STATUS/L_A11Y_1 verify the distinction from restoration after abort/disposal.
- No iOS-device, deciding-cost, P5, P6 or release certification is inferred. The P5 tribunal's separately accepted evidence bridge is left intact.

## Final ruling

**Final P4 `p4_drive` J-001 ratification: FAIL on J-P4R-001 (S2), with J-001's engine behavior technically repaired.** The three original failing behavioral rows now pass independent inspection and execution, but the original mandatory unit-regression repair row is incomplete. The authorized final route cannot turn that missing work into PASS by relying on the acting verdict.

**P5 J-P5-001 remains open.** After the small unit-test-only remediation and an authorized final P4 PASS, P5 A03 may be re-judged with the source/evidence identity check specified by its existing tribunal. This report does not require rerunning the full bench and does not alter its accepted technical findings.
