# CP7: WAAPI engine, implementer's checkpoint review

- Authority: `plan.md` CP7 (T7.1, T7.2, V7); `ARCHITECTURE.md` §10 (rewritten from "optional,
  gated" to the shipped engine), §7.1 (`engine`), §8, §12; drift K19.

## T7.1 Gate first: compositor trace

`pnpm test:waapi-trace` (`tests/browser/waapi_trace.ts`, page `waapi_trace_page.ts`): headless
Chromium, CDP tracing. A depth-0 `'position'` move on the real engine (`engine: 'waapi'`) is
running; the page then blocks its main thread for 120 ms. Counted on the threads other than
the blocked one, inside the block:

| Engine | Play state at the block | `AnimationHost::TickAnimations` | `DrawFrame` | `Display::DrawAndSwap` | `compositeFailed` |
|---|---|---|---|---|---|
| WAAPI | running | 6 | 5 | 5 | none |
| RAF (control) | running | 6 | 0 | 0 | — |

The compositor keeps drawing the WAAPI animation while the main thread is blocked; the same
move on the RAF engine draws nothing (the gate discriminates). Three consecutive runs gave
the same counts. The first spike (raw `Element.animate`) gave 6 / 6 / 6.

## T7.2 Engine

`realize/waapi.ts` and the `engine` group option (§10). One `translate` animation per track;
the curve sampled into `linear()` (stops from the curve's bend so a move is drawn within
0.05 px); delay with `fill: 'backwards'`; created in the flush, held at τ = 0 and played from
the next animation frame without a `startTime`; no inline style; elapsed time read from
`currentTime`; cancelled on settle, finish, dispose, removal and reduced motion. Unsupported
shapes throw at `add`/`set`.

Found while gating: creating the animation running (pending play) passed the 120 ms block
gate in Chromium (0.00 %) but not in Firefox (29.37 %) or WebKit (30.25 %), which count a
block right after creation as elapsed time. Holding it paused at τ = 0 and playing it from
the next animation frame gives 0.00 % in all three (K19).

| Gate / test | Chromium / Firefox / WebKit |
|---|---|
| (1) `waapi:W1` RAF vs WAAPI per frame, linear / ease-out / spring, with and without delay, animation paused and seeked to each frame's time (≤ 0.5 px) | max 0.0322 / 0.0333 / 0.0322 px; no inline style written |
| (2) `waapi:W3` first painted frame after a 120 ms block (≤ 6 %) | 0.00 / 0.00 / 0.00 % |
| (3) compositor trace | above (Chromium) |
| `waapi:W2` retarget from the drawn box, no velocity term, on the oracle | 0.0095 / 0.0163 / 0.0095 px |
| `waapi:W4` unsupported shapes (default layout, `true`, `'size'`, `layoutId`, `layoutAnchor`, `radius`, an unknown engine, a nested participant, `set`) | 9 throws `ANI_INVALID_OPTIONS` |
| `waapi:W5` finish, removal, reduced motion, dispose | animations cancelled, reports `ended` / `ended` / `reduced` / `disposed`, inline style untouched |
| `waapi.test.ts` sampled easing within 0.05 px over 600 px (linear, ease-out, spring, stiff spring) | pass |

## V7

Gates met: the engine ships behind `engine: 'waapi'` (vanilla API).

## Residual risks

- B of a retarget is read from `currentTime` on the main thread; under jank the compositor
  may have drawn ahead (§12).
- The engine runs on the document timeline, not the Ani clock (no time scale).
- The trace gate is Chromium-only (no tracing in Firefox or WebKit through Playwright);
  Firefox and WebKit pass gates (1) and (2).
- The React adapter does not expose `engine` yet.
