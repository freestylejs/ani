# Ani Layout — Native interaction and quality qualification

This is the product-profile and qualification contract delegated by `ARCHITECTURE.md` v4.
It does not replace the engine equations or create a second implementation. The goal is
native-grade-capable web interaction, not an unconditional claim of iOS device certification.

## Profiles and ownership

The native-interaction showcase uses the full RAF layout engine with an explicit physical
`{ type: 'spring', duration, bounce }` profile. The engine's general default remains the timing
kind (ease-out, 0.35 s). Perceptual duration is not physical settle: input, focus and follow-up
UI must not be locked until a spring's completion promise resolves. Core `timing.spring` is
still a finite timing curve, suitable only where that authored timing behavior is intended.
It is not the native layout showcase's alternative/legacy backend.

A gesture owns pointer identity/capture, timestamped velocity estimation, coalesced-event
fallback, final pointer-up sampling, cancellation and keyboard operation. Layout owns
`take → move → release(velocity)` and `cancel`, projection and landing. There is one drag path:
no extra authored `transform` writer competes with the layout drive. Cancel, lost capture,
unmount, runtime disable and invalidation must terminate idempotently and leave no live hold.

Surface owns geometry and radius. Size-invariant text/icons participate with `layout: 'position'`.
Image regions reserve dimensions/aspect ratio and choose an explicit crop. Hover/press transform
belongs to an inner layer, not layout's `translate`/`scale` declarations. A shared transition
with incompatible clipping must use a documented bounded recipe, not an unimplemented claim
of arbitrary CSS mask/clip/shadow correction. The current solver does not become clip-aware.

## Commit boundary

Automatic React layout requires a participant, `LayoutGroup` or presence owner to render in
the changing commit. Use `useLayoutGroup().update(fn)` for an otherwise invisible mutation.
A browser-driven reflow can move a running transformed box with its layout; that does not
mean an uncaptured image/font/resize shift is itself interpolated. Reserve intrinsic size or
use an explicit transaction. A ResizeObserver notification is not a historical presentation
snapshot. Aged/missing capture must continue to degrade truthfully rather than guessing B.

## Independent qualification dimensions

| Dimension | Required evidence | What it cannot prove |
|---|---|---|
| Geometry / continuity / lifetime | Existing independent oracle, real DOM geometry, analytic limits, exact restore/read-count tests | Physical pixels displayed at a deadline |
| Script cost | Existing real-clock callback/commit instrumentation, bounded workload and environment | Paint, raster, compositor and display cost |
| Browser frame/input proxy | Production-path real-rAF cadence and event-to-observed DOM update, identified as proxies | Input-to-photon latency or physical 120 Hz presentation |
| Actual presentation/input | Real iOS Safari device, OS/browser/build identity, actual cadence, presentation-capable trace/video method with limitations | Other unmeasured devices or unrestricted main-thread stalls |
| Content/accessibility | Real scene glyph/crop/clip/radius/coverage, focus/inert, reduced motion and keyboard checks | Arbitrary unsupported CSS geometry |

Keep existing G1–G7/G13 numerical/lifecycle thresholds and script-cost gates unchanged. A
physical spring's settle tolerance remains 0.1 px / 1 px/s; a 0.05 px oracle error compares the
implemented law against the reference, not a replacement settle tolerance.

A qualification record identifies revision (including uncommitted diff), source/dist path,
production/development mode, engine/version, OS/device, DPR, actual observed cadence, input,
scene and load. Use the same product components for browser tests and showcase. Separate
single-scene invocations from the complete existing benchmark's five-run certification.

No native-device PASS is issued when actual device presentation or input evidence is missing.
Record BLOCK and the unavailable measurement. Desktop Playwright WebKit is not branded Safari
on an iPhone. Browser rAF/DOM observations are useful proxies and must stay labeled as such.
The tentative input target is p95 within two observed refresh intervals, only when the
measurement can actually establish input-to-visible response; it is not an Apple web standard.

## Required interaction matrix

Switch/tabs: rest start, repeated reversal and unequal distances. Create/folder/card: nested
surfaces, invariant content, radius, rapid open-close-open, explicit crop and scroll. Drag:
zero-speed release, flick, catch while moving, reorder/release race, other pointer ignored,
up/cancel/lost capture/unmount, runtime snap, reduced motion and keyboard reorder. Transactions:
React 18/19, StrictMode, late registration, memoized descendants, explicit update and documented
external-size changes. VT: timing-only validation, reduced caps including zero, default motion,
ready failure, interruption, exactly-once update and restoration.

## Release and hard migration

The current typed adapter port replaces the hidden symbol protocol; do not keep a fallback.
The native showcase replaces manual-transform drag and finite-timing layout spring examples;
no runtime flag re-enables them. Historical traces remain evidence only. Legitimate public
core timing APIs are not compatibility bridges and are not removed by this migration.

Report code/test readiness separately from device qualification. Failures must name the
requirement and the smallest repair. Profile before optimization: do not add workers, WASM,
new managers, stale geometry caches or a broad solver rewrite without a measured causal need.
