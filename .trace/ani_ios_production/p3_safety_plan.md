# P3 Safety — phase plan and review checklist

Authority: `packages/layout/ARCHITECTURE.md` §7.1, §7.2, §7.3, §9.1–§9.4, §11.2 L-OPS-1/2 and
L-A11Y-1, §11.3. Plan: `00_plan.md` P3. Teleology: `00_plan.md` Teleology.

## Slice A — H11b (running)

Files expected: `packages/layout/src/runtime.ts`, `fault.ts`, `scope.ts`, `plan.ts`, `solve.ts`,
`dom.ts`, `types.ts`, `index.ts`, React adapter wiring, `layout_ops` browser rows, layout README and
docs guide.

Checklist:

| # | Requirement | Evidence to demand | Review question |
|---|---|---|---|
| A1 | `layoutRuntime` module singleton: `mode`, `setMode`, `onDiagnostic` | unit test; public export; React wiring only if §7.3 says so | Is the runtime the installed package copy, not a second state? |
| A2 | Kill switch synchronous in every explicit/implicit scope | L-OPS-1: mid-run and mid-hold; styles restored; holds invalidated; pending reports `'disabled'` | Does `setMode('snap')` act before the next frame, without waiting for a flush? |
| A3 | Diagnostics table and exact payload | one test per code; payload version/scope/run/engine/action/element/reason/metrics | Are payloads built only when a listener exists? |
| A4 | Keep §9.1 dev warnings once per scope for `unsupported`/`capped`/`stale`; replace others with diagnostics | warning tests; no duplicate warnings | Does `focus-in-follower` stay typed but unemitted until P3b? |
| A5 | Listener/onSnap isolation | throwing listener/onSnap tests; `callback-error` to other listeners only; async dev rethrow | Can a user callback corrupt engine state or recurse? |
| A6 | Transactional flush and frame boundary | fault-injection tests for measure/write/animate/onSnap/listener; five §9.2 steps in order | Is cleanup idempotent? styles byte-identical, listeners/subscriptions/markers released, reports resolved? |
| A7 | `flush()` never rejects; status `'failed'`; affected nodes `snapped:'failed'`; `internal-error` | L-OPS-2; fault seam compiled out/inert in production and not publicly exported | Does a failed frame leave the runtime usable? |
| A8 | `'failed'`/`'disabled'` precedence | every co-occurring status pair resolves to the earlier §9.3 row | Is `'failed'` before `'disposed'`, then `'disabled'`, `'capped'`, ...? |
| A9 | `maxParticipants` before any read | stats prove zero reads over cap; whole flush `'capped'` + `participant-cap` | Does the cap count connected participants, not registry entries? |
| A10 | Mover cap emits `mover-cap`; option validation `ANI_INVALID_OPTIONS` | boundary tests; no state change on throw | Are both options validated at the public boundary? |
| A11 | L-OPS-1/2 in `layout_ops` | Chromium + WebKit green; Firefox advisory exception | Do the rows assert exact status, reason, styles and listener cleanup? |
| A12 | Docs | README and docs guide updated in existing style | Is the public surface documented without claiming P4/P5? |

Forbidden: legacy path/flag/shim, editing `ARCHITECTURE.md`, changing measurement/planning/solving
beyond the safety requirements, weakening a row, a broad catch that hides failures.

## Slice B — H12 (after A)

- Crossfade follower `inert` and byte-exact restore.
- Focus ownership; focus-in-follower skip + diagnostic; L-A11Y-1.
- Model-based lifecycle fuzz with the §11.3 event set and invariants.
- Mutation tests, each failing a named row.
- Failure-path fuzz / cap / status adversarial cases.
- Docs.

## Gate

- Unit, `pnpm ts:typecheck`, biome 0 errors.
- Chromium and WebKit: `layout_ops`, `layout`, `layout_meas`, `layout_spring`, `react_layout`,
  `react_layout_r18`, `waapi`, `showcase`, `regressions`, plus L-A11Y-1; empty `knownFailures`.
- Firefox advisory only; record the launch exception on macOS 27.
- Logs under `logs/p3/`.

## Checkpoint

1. Write `p3_safety.md` self-judgment with the evidence matrix and all carried P2 findings (none).
2. Commit/push.
3. Dispatch the P3 tribunal (Chief Justice) and start P4 in parallel.
4. On FAIL, the remediation joins P4's checkpoint and is re-judged there.

## Final P3 exit

No safety failure leaves a wrong frame or corrupted runtime state: styles byte-identical, no
listener/subscription/marker left, every promise resolved, every handle terminal, every report
resolved, and the kill switch/caps/status precedence exact in Chromium and WebKit.
