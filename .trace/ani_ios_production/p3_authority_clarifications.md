# P3 authority clarifications — 2026-10-28

These are documentation-drift corrections, not new owner policy. They resolve contradictions inside
the existing authority before the P3 checkpoint; the Chief Justice re-judges them with P3.

## C1 — stale diagnostic cardinality

**Drift.** §4.4 said the flush emits "one diagnostic ... with the count of reported nodes", but the
§7.2 `LayoutDiagnostic` payload has no count field and carries an optional `element`/`reason`, which
is per-node. A literal aggregate event cannot satisfy L-MEAS-11's exact element/count assertions.

**Ruling.** The flush emits one `capture-less-flush` or `capture-aged` event **per reported node**,
with that node's `element` and `reason: 'stale'`; when no node is reported it emits one element-less
event for the condition. The count of reported nodes is the number of per-node events. This is now
normative in §4.4 and the §7.2 code table.

**Why.** It preserves the exhaustive report, gives the listener the element that moved, and makes
the count testable without adding a field to the public payload. No event is emitted when nothing
listens.

## C2 — engine faults vs user-callback faults

**Drift.** §11.2 L-OPS-2 listed `onSnap` and a diagnostic listener among the injected exceptions
that produce `'failed'`. §9.1/§9.2 say a throwing user callback is isolated as `callback-error` and
must not change engine state; §9.2's `'failed'` transaction is for engine exceptions during a flush
or frame.

**Ruling.** Split the row:

- L-OPS-2: injected **engine** exceptions (`measure`, `write`, `animate`) → status `'failed'`, every
  affected node `snapped: 'failed'`, styles byte-identical, no listener/subscription left,
  `internal-error`.
- L-OPS-2b: injected **user-callback** exceptions (`onSnap`, diagnostic listener) → `callback-error`
  to the other listeners only, engine state unchanged, styles byte-identical, asynchronous
  development rethrow.

**Why.** The distinguishing invariant is ownership: an engine fault must abort transactionally; a
user callback fault must not corrupt engine state. The old row made the two indistinguishable and
contradicted §9.2.

## C3 — P3 vs P4 hold boundary

**Drift.** L-OPS-1 said "mid-hold" without naming which hold. The drive hold does not exist until
P4 (§5.10), so P3 cannot test it.

**Ruling.** P3's L-OPS-1 covers mid-run and the hold states that exist in P3 (crossfade/presence
holds), explicit and implicit scopes. The drive-hold kill switch is L-DRIVE-4 in P4, where the drive
seam and its hold state exist. The P3 gate is not weakened: every hold state implemented in P3 is
tested; the P4 row is added to P4's gate.

**Why.** A phase gate must be executable at that phase. The authority already assigns drive-hold
invalidation to §5.10/L-DRIVE-4; this makes the phase boundary explicit.

## C4 — `measurement-unsupported`

The code table keeps the code, but there is no emitter until the S1 measurement fallback exists.
§11.4 ships that fallback only if the measurement spike fails; the current Chrome/WebKit capture is
valid, so no condition is reachable. The type remains stable for a future engine-specific fallback.
