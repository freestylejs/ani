# Real-browser binding tests

Mounts each binding (React, Vue, Solid, Svelte) and the core in headless
Chromium on the **real** default clock (real `requestAnimationFrame`) and
checks what the DOM actually shows. jsdom and happy-dom fake rAF, style
serialization and layout; these tests do not.

## Requirements

- Node 24 (the runner is TypeScript executed with native type stripping, so
  only erasable syntax: no enums, namespaces or parameter properties).
- Chromium for Playwright (`pnpm exec playwright install chromium` if missing).

No build is needed: the packages are bundled from their sources. No HTTP server
and no ports: Playwright request interception serves everything from memory
under `http://ani.test/`.

## Run

```sh
pnpm test:browser                      # every case
pnpm test:browser --case 'react:*'     # one module
pnpm test:browser --case core:C1 --case vue:B3
pnpm test:browser --list               # print the case ids
pnpm test:browser --headed             # show the browser window
```

`--case <glob>` is repeatable; `*` and `?` are the wildcards, and a glob
without a colon matches the case name in every module (`--case B1`).

One line per case, then a summary. The exit code is `1` when any case fails.

```
PASS react:B1 (412 ms)
FAIL vue:B3 (631 ms)
    style mutations after unmount: expected 5, received 7
KNOWN solid:B2 (390 ms)
    known failure: <reason>
    <the message the case failed with>
```

`KNOWN` is a case listed in its module's `knownFailures`: it still runs, is
reported, and does not fail the exit code. A known failure that starts passing
prints `PASS` with a note to remove the entry.

## How a case runs

**Node side** (`run.ts`, `bundle.ts`, `ssr.ts`):

1. Bundles `cases/<module>.ts` once with esbuild (`bundle: true`, ESM,
   `conditions: ['browser']`, development `process.env.NODE_ENV`). The
   `@freestylejs/ani-*` packages are aliased to `packages/*/src`.
2. Opens the module in a probe page to learn the exported cases, `pageOptions`
   and `knownFailures`.
3. For every case opens a **fresh context and page**, serves the page and the
   bundle with `page.route`, calls the case and waits at most 10 s.
4. Collects every `console.error`, `console.warn` and `pageerror` of the page.
   **Any of them fails the case**, whatever the case itself returned (this is
   what catches hydration warnings and ANI development warnings).
5. Takes the measurements only Node can take through CDP and hands them to the
   page (`window.aniHeapUsed()`, `window.aniLayoutCount()`).

**Page side** (`cases/*.ts`): each exported function is one case. It runs in the
page, uses the real clock, and throws to fail. A string it returns is printed
under the `PASS` line (C1 and C2 report their numbers this way).

`cases/assert.ts` is the in-page helper: `expectEqual`, `expectClose`,
`waitFor(predicate, timeoutMs)`, `nextFrame()`, `frames(n)`, `styleLog(elements)`
(a `MutationObserver` on `style` that records, per mutation, the element and a
frame counter bumped by a rAF loop) and `host.heapUsed()` / `host.layoutCount()`.

The B cases are written once in `cases/shared.ts`. A framework module only
provides a `Driver`, which mounts that framework's components with that
framework's primitives (no JSX and no framework compilers: `createElement`,
`h`, Solid's `createComponent` / `render` with plain DOM, and Svelte's runtime
with the binding's actions applied by hand).

## Add a case

1. Export an async function from the module's `cases/<module>.ts`; its export
   name is the case id (`react:B8`). Throw to fail. Use the real clock, wait on
   frames or `waitFor`, never on a fixed sleep.
2. For a behavior every framework must have, add the body to `cases/shared.ts`
   (extend `Driver` in `cases/fixtures.ts` if it needs a new component) and
   export one-liners from the four framework modules.
3. Needs a page setup before load? Add `pageOptions = { B8: { ... } }`:
   `reducedMotion: 'reduce' | 'no-preference'` (`page.emulateMedia` before the
   page loads) or `ssr: true` (react and vue: the B1 component is rendered to a
   string in Node and put in `#root`).
4. A new module goes into `MODULES` in `run.ts`.
5. If the case fails because a binding or the core is wrong, do not weaken it:
   add `knownFailures = { B8: '<precise reason>' }` to the module.

## What each case guards

| Case | Guards |
| :--- | :--- |
| B1 `ref` | A component owns a timeline and binds a `div`. The initial inline style is exactly the initial value right after mount; a 0.3 s linear run resolves `'ended'`, the browser computes `matrix(1, 0, 0, 1, 100, 0)` and opacity `1`, and at least 3 distinct intermediate `transform` values were written. |
| B2 `group` | 200 elements bound through the group primitive to one `rafGroup` all show the final value, and in every frame in which any style changed, all 200 changed (one batched commit per frame, never a partial one). |
| B3 `unmount` | Unmounting mid-run: no style mutation for 5 more frames, the owned timeline's `play` resolves `'disposed'`, and `defaultClock.size` is back to its value before mount (explicit ownership, no leaked subscription). |
| B4 `states` | `transitionTo('active')` resolves `'ended'`, the element shows `opacity: 1` and the rendered state text (reactive text node, or a store subscription in Svelte) reads `active`. |
| B5 `follow` | A follower retargeted three frames into its motion settles at 150 in its value and in the element's computed transform. |
| B6 `reducedMotion` | With `prefers-reduced-motion: reduce` emulated before load, a 2 s run under the default policy resolves `'ended'` within 3 frames with the final value shown; with `reducedMotion: 'ignore'` it is still `PLAYING` after 5 frames. |
| B7 `B7` (react, vue) | The B1 component rendered to a string in Node and hydrated in the page logs no warning or error, reuses the server DOM and leaves the inline style unchanged. |
| C1 `core` | Memory gate: one `rafTimeline` playing `repeat: Infinity`, 10,000 fresh `div`s bound, unbound and removed in batches of 100 (one batch per frame). Three `usedSize` measurements (CDP, two forced GCs each): **h0** on the fresh page before anything else, **h1** after 2,000 warm-up cycles, **h2** after the 10,000 measured cycles. Asserts `h2` within 5% of `h1` (the gate: no growth per bind / unbind cycle) and `h2 - h0` at most 512 KiB (an absolute bound on the one-time cost so it cannot grow unnoticed; a percentage of a ~1 MB page is not meaningful). h0, h1, h2, the percentage h2 vs h1 and the bytes h2 - h0 are reported. The warm-up exists because a fresh page's heap grows once during its first ~2,000 cycles (JIT feedback, first-use caches) and is flat afterwards; measured from before the warm-up, that one-time growth would hide or mimic a leak, while a real leak keeps growing past h1 (leaking the unbind closures fails the 5% assertion at about +150%). C1 is not a known failure: both assertions must hold. |
| C2 `core` | Commit-phase layout: 1,000 elements on one group animating `width`, with an `onUpdate` listener that reads `offsetWidth` through `clock.read`. CDP `LayoutCount` grows by at most 60 + 5 over 60 frames: reads in the read phase never force a layout after the writes. |

## Files

| File | Purpose |
| :--- | :--- |
| `run.ts` | CLI, pages, CDP, reporting |
| `bundle.ts` | esbuild configuration (browser and Node) |
| `ssr.ts`, `ssr/*.ts` | Server-side rendering of the B1 component in Node (B7) |
| `cases/assert.ts` | In-page helpers |
| `cases/fixtures.ts` | Shared values, `Driver` and mount interfaces |
| `cases/shared.ts` | The B1 to B6 bodies, shared by all frameworks |
| `cases/{react,vue,solid,svelte}.ts` | Per-framework drivers and exported cases |
| `cases/{react,vue}_box.ts` | The B1 component, also rendered on the server |
| `cases/core.ts` | C1 and C2 |
| `tsconfig.json`, `svelte_internal.d.ts` | Editor and `tsc -p tests/browser` typechecking only |
