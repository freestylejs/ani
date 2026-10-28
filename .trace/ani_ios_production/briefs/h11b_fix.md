# H11b fix round — transactional correctness (2026-10-29)

Source: independent defect-first review of `6a99da2..206b50a` (reviewer OPS-01..OPS-20). No S0.
The review verdict was "do not merge yet": OPS-01 and OPS-02 are direct §9.2/§9.3 violations,
and OPS-03 is a second transactional leak. This fix round closes them and the actionable S2/S3
items before P3a is accepted.

## Authority

- `packages/layout/ARCHITECTURE.md` §7.1, §7.2, §9.1–§9.4, §11.2 L-OPS-1/2/2b.
- `.trace/ani_ios_production/p3_authority_clarifications.md` C1–C4 (normative):
  - C1 per-node stale events; count = events.
  - C2 engine faults → `'failed'`; user callbacks → `callback-error`, state unchanged.
  - C3 P3 hold states only; drive-hold kill switch is L-DRIVE-4 in P4.
  - C4 `measurement-unsupported` has no emitter until the S1 fallback exists.

## Must fix

### OPS-01 (S1) — settled drives are never restored on a later fault

`settle()` sets `p.drive = null` and queues the restore in `pending`; `abort()` only re-queues
drives still in `p.drive`, then drops `pending`. A write fault after a track settles leaves the
layout-owned `translate`/`scale` inline style applied.

Fix: keep transaction-owned saved declarations for every drive detached by `settle()` until the
frame/flush commit succeeds; restore them in `abort()`. Do not discard queued restores. Add rows:
- track-finish frame + write fault
- `cappedFlush()` + write fault
- `setMode('snap')` + write fault

### OPS-02 (S1) — reports resolve before the commit

`settle()` resolves `'ended'`; `finishAll()` resolves `'disabled'`/`'ended'`/`'disposed'` before
`commitWrites()`. A later write fault cannot change a resolved report, so `'failed'` precedence is
violated. The frame `internal-error.run` can be `null` because the boundary recomputes `active`
after `step()` cleared the drives.

Fix: resolve runs only after the transaction's writes succeed, or defer end resolution through the
commit. On abort, fail every affected run before it can be observed as ended/disabled; carry the
active run id into the commit boundary. Add engine-level precedence tests, not only the pure
function:
- track-finish + write fault → `failed`, not `ended`
- kill switch + write fault → `failed`, not `disabled`
- `internal-error.run` is the active run

### OPS-03 (S2) — abort swallows secondary failures

The whole cleanup is inside one `try` with an empty `catch`; a throw in `queueRestore()`,
`drainWrites()`, `d.release()` or `stopAnimation()` skips `frame=[]`, `disarm()`,
`realizer.stop()` and `diagnose('internal-error')`.

Fix: guard each cleanup step independently; always disarm, stop the realizer and emit
`internal-error` with the first failure; never leak a clock subscription/listener.

### OPS-04 (S2) — lifecycle writes outside the boundary

`finish()`, `dispose()`, `remove()`, `set(layoutKey)` and capture→`documentMismatch()` call
`settle()`/`commitWrites()` without the transaction. A write fault can throw out of a public API,
leave styles unrestored, and leave `disposed === false` / the runtime scope registered.

Fix: wrap these write paths in the same boundary or make them non-throwing and self-cleaning.
At minimum, `dispose()` must finish cleanup and unregister even if a write fails.

### OPS-05 (S2) — L-OPS-1 mid-hold is vacuous

The crossfade-follower block is not a §5.10 drive hold; after 384 ms the lead has settled, so no
new `runtime-disabled` is emitted and the `.at(-1)` assertion sees an earlier event.

Fix under C3: do not claim a drive hold in P3. Rename/relabel the row as the P3 crossfade/presence
hold, and assert the event count delta for the `setMode()` call plus element, scope, run, action.
The drive-hold kill switch remains L-DRIVE-4 in P4.

### OPS-06 (S2) — L-OPS-2 cleanup assertions incomplete

For `onSnap` and diagnostic-listener faults, assert byte-identical styles, `mc.clock.size === 0`,
listener add/remove balance (including shadow roots where relevant), no
`document.getAnimations()`, and the exact `callback-error` payload. For engine faults, assert the
exact `internal-error` payload.

### OPS-10 (S2) — registered-after-capture node is treated as measured

`unmeasured` requires `fresh.registered.has(p)`, so a node added between capture and flush is
`measured: true` with `before = null`, no stale report/onSnap. Fix `unmeasured` for a participant
registered after the capture and add a fresh-capture row. Also handle an author-replaced owned
declaration's fresh-capture diagnostic path consistently.

### OPS-11 (S3) — abort over-reports

Report only the affected participants/run nodes, not every connected participant. Keep the
conservative whole-scope style restore; narrow `snapped`/`onSnap` to affected.

### OPS-12 (S3) — cap diagnostics consistency

Decide capture-time vs flush-time and make both caps consistent under `'disabled'`. Prefer the
winning condition: when the kill switch wins, emit `runtime-disabled`; do not emit a cap event for
a condition that no longer holds. Add tests for both caps under the kill switch and for a capped
capture followed by a smaller flush.

### OPS-13 (S3) — capture-aged double event

Define cardinality for capture-time + flush-time triggers; test the in-frame + aged-flush case.

### OPS-14 (S3) — stale `metrics.participants`

Recompute the connected count before `runtime-disabled` in `snapToDisabled()` and
`document-mismatch` in `evictAdopted()`, or document the metric as the last-pass count.

### OPS-15 (S3) — callback-error ordering

Dispatch buffered diagnostics before `onSnap`, or buffer callback-error in the same transaction, so
the listener sees the original degradation before `callback-error`. Add an order assertion for the
`onSnap` case.

### OPS-16 (S3) — weak tests

Add engine-level status precedence tests; assert exact `settleMs`; make the `maxParticipants` range
row discriminating; add a React `maxParticipants`/`maxParticipants: 0` test; assert payload
construction only when listeners exist.

### OPS-18 (S3) — reentrancy

A user callback can call `flush()`, `capture()`, `setMode()` or `dispose()` while a flush
transaction is open; `buffered`/`runId` are single values. Guard reentrant engine entry or use a
transaction stack/queue, and test `onSnap` calling `flush()`, `dispose()` and `setMode()`.

### OPS-19 (S3) — capped flush resolves existing runs `'ended'`

Define the displaced-run lifecycle under cap/snap; use `'interrupted'` if the later flush replaced
its tracks, and test the visible promise.

### OPS-20 (S3) — duplicate diagnostic subscriptions

Use reference counting (`Map<listener, count>`) or explicitly document and test the collapse.

## Accepted as authority, not code

- OPS-07: C1 resolves cardinality (per-node events; count = events). Main authority is already
  amended; this worktree may not contain it. Do not re-litigate.
- OPS-08: C2 resolves user-callback vs engine-fault semantics.
- OPS-09: C4 defers `measurement-unsupported` until the S1 fallback exists; docs may say
  "reserved by C4".
- OPS-17: update docs after OPS-01/OPS-11 are true; mark hold invalidation as P4 if no drive hold
  exists in P3.

## Gate

- Every fix test must fail before its fix.
- Unit, typecheck, biome 0 errors.
- Full Chromium and WebKit suites, empty `knownFailures`; Firefox advisory exception.
- No tolerance weakening, no legacy path, no push. Commit in `ani-h11b` with conventional messages.
- Final reply: commit hashes, files, per-defect test and result, counts, remaining ambiguities.
