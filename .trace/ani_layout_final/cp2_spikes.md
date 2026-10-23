# CP2 — P0 spikes: implementer's checkpoint review

- Authority: `plan.md` CP2 (T2.1–T2.4, V2), `ARCHITECTURE.md` §4.1, §4.3, §3.1, §11 cost gates,
  `source_decision.md` "P0 spikes" table.
- Code: `tests/browser/cases/spike.ts` (S1 React 19 plain, S2, S3, S4), `spike_r18.ts`,
  `spike_rc.ts`, `spike_r18c.ts` (S1 in the other builds), `spike_s1.ts` (scenarios),
  `spike_s1_fixture.ts` (components; compiled by the React Compiler in the `rc` builds),
  `spike_s1_support.ts`, `spike_proto.ts` (prototype capture/flush scope).
- Runner: `tests/browser/bundle.ts` gains build variants (`react18`: `react`/`react-dom` aliased to
  18.3.1; `compiler`: `*_fixture.ts` files compiled with `babel-plugin-react-compiler`, target 18
  or 19, `panicThreshold: 'all_errors'`); `tests/browser/run.ts` registers the modules and
  variants. Root dev dependencies: `@babel/core`, `babel-plugin-react-compiler`,
  `react-compiler-runtime`, `react-18`, `react-dom-18`, and `react`/`react-dom` 19.2.1 pinned at
  the root (pnpm otherwise hoisted React 18 to the root `node_modules/react`).
- Command (june-wsl `~/ani-v2/lay`): `pnpm test:browser --browser <b> --case 'spike*:*'`
  (WebKit after `source ~/ani-v2/sysroot/webkit-env.sh`). Result: 19/19 PASS in each of
  Chromium, Firefox, WebKit (57/57).

## S1 — render capture (stop: a capture consumed by the wrong commit; stale > 1 in 20)

Truth: a `Probe` class component's `getSnapshotBeforeUpdate` reads every participant's rect in
the before-mutation phase of each commit it renders in; each flush compares the B it used with
the truth of the first probed commit since the previous flush (0.5 px). All runs under
StrictMode; every scenario is run twice: with the §4.1 lifetime rule and as a no-refresh
control.

| Scenario | Builds × browsers | Flushes compared | Violations (rule) | Violations (control) | Missing captures |
|---|---|---|---|---|---|
| sync + batched updates (20) | 4 × 3 | 180 boxes each | 0 | 0 | 0 |
| `startTransition`, time-sliced (12 × 3 ms), each pre-empted by a `flushSync` commit outside the scope while its capture is pending (10) or by an urgent in-scope update (10) | 4 × 3 | 180–270 boxes | **0** | **81–90, max 37.3 px** | 0 |
| `useDeferredValue` (12 keystrokes, slow deferred render, banner toggles) | 4 × 3 | 58–117 boxes | 0 | 0 | 0 |
| Suspense: transition suspend, sync fallback, resolve (6 rounds) | 4 × 3 | 210–216 boxes | 0 | 0 | 0 |

Builds: React 19.2.1 plain, React 19.2.1 compiled, React 18.3.1 plain, React 18.3.1 compiled; the
module checks that the fixture is (or is not) compiled. "Updates interleaved into a pending
capture: 20" in every transition run proves each pre-emption happened while a capture was
pending. Stale rate under the rule: 0 of 600+ flushes. **Stop condition not met → PASS.**

Finding used by the architecture: a default-priority update does not pre-empt a running
transition render in React 18/19 (the transition commits first), so only a sync commit can land
between a capture and its consumer; the task-stamped refresh (§4.1) covers it.

## S2 — first painted frame after a 120 ms block (stop: > one frame of progress)

React commit → flush microtask (t = 0 pose, subscribe) → 120 ms busy block → first frame.

| Browser | First painted frame (rule: first `dt` = 0) | Control (no forced 0) |
|---|---|---|
| Chromium | 0.00 % (engine 0.00 %) | 26.75 % |
| Firefox | 0.00 % (engine 0.00 %) | 0.00 % |
| WebKit | 0.00 % (engine 0.00 %) | 30.00 % |

0.1.0 measured 73–89 %. **PASS.**

## S3 — composition (stop: error > 0.5 px)

Layout box from dividing out every inner map along the chain vs. the truth (every transform
property removed): toast mid-enter (`translateY(14px) scaleX(.8)`, origin centre-bottom), its
scaled child, a second toast, a `scale: 1.05; translate: 10% 4px` card, and a three-level chain
card (authored) › inner (inline `translate(5px,7px) scale(1.2)`, origin 0 0) › leaf (`scale: .9`),
with page scroll 37 px and sub-pixel margins.

| Browser | Max error |
|---|---|
| Chromium | 0.0001 px |
| Firefox | 0.0093 px |
| WebKit | 0.0297 px |

Computed `transform-origin` is resolved to px in all three browsers; computed `translate` keeps
`%` (`10% 4px`), resolved against the box. **PASS.**

## S4 — cost (stop: commit reads at 1,000 > 4 ms or steady frame at 300 nested movers > 2 ms p95)

Reads: capture (1,000 rects + inline transform) and flush (1,000 rects + inline transform +
`getComputedStyle` translate/scale/rotate/origin for 300 active nodes), medians of 15 rounds,
the commit's own forced layout timed separately. Frame: 100 parents × 2 children, per frame
bezier evaluation, inverse parent map, pose, `translate`/`scale` strings and writes, measured from
`update` start to `commit` end on the real clock.

| Browser | Capture + flush reads | Commit's own layout (not ours) | Frame p50 / p95 |
|---|---|---|---|
| Chromium | 0.80 + 1.50 = 2.30 ms | 0.70 ms | 0.50 / 0.70 ms |
| Firefox | 1.00 + 1.00 = 2.00 ms | 2.00 ms | 1.00 / 2.00 ms |
| WebKit | 1.00 + 1.00 = 2.00 ms | 2.00 ms | 1.00 / 1.00 ms |

Firefox and WebKit clamp `performance.now()` to 1 ms in these pages, so their figures are
quantized; Firefox's frame p95 sits on the 2 ms bound at that resolution. S4 is re-measured on the
real engine in CP4 (T4.4) with many frames per sample to remove the quantization. **PASS.**

## CP1 carried rows

J-001–J-007 are answered in `cp1_authority.md` ("Trial 1 result and fix proof report") and the
changed documents; they are re-judged with this checkpoint.

## Spike code lifetime

The spike modules are prototypes. They are replaced and deleted: S3/S4 by the CP4 engine tests,
S1 by the CP5 React adapter tests (which keep the React 18.3 / React Compiler build variants), S2
by the CP6 late-start regression. V6 requires that no `spike*` module remains.

## Verdict

PASS (implementer review): every spike meets its stop condition in all three browsers. CP3 may
start.
