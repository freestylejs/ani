# Browser frame benchmark

Runs ANI inside real (headless) Chromium and reports frame cost plus layout and
style work. Every number collected so far lives in Node with no DOM; this
benchmark is the browser-side baseline that V2 work such as batched DOM commits
and multi-target groups is measured against.

## Requirements

- Node 24 (the runner is TypeScript executed with native type stripping).
- Chromium for Playwright (`pnpm exec playwright install chromium` if missing).

No HTTP server and no ports are used: Playwright request interception serves
`bench/browser/page.html` and `packages/core/dist/index.js` from disk under
`http://ani.bench/`.

## Run

```sh
pnpm bench:browser --smoke                 # fast sanity run (~10s)
pnpm bench:browser                         # n=1000 and n=5000, 3 repeats each
pnpm bench:browser --scenario raf-shared --n 10000 --repeats 5
pnpm bench:browser --out bench/browser/results/box-a.json
pnpm bench:browser --compare bench/browser/results/box-a.json --out bench/browser/results/box-b.json
```

| Option | Meaning |
| :--- | :--- |
| `--scenario <name>` | scenario to run, repeatable (default: all) |
| `--n <count>` | element count, repeatable (default: `1000`, `5000`) |
| `--repeats <k>` | measured repeats per scenario × N (default: `3`) |
| `--out <file>` | JSON output path (default: `bench/browser/results/latest.json`) |
| `--compare <file>` | adds a delta column per metric against a previous JSON |
| `--smoke` | `n=50`, 0.2s warm-up, 0.5s measure, 1 repeat, all scenarios |

The core package is built automatically before the run. The exit code is `0`
on success and `1` on any page error or bad invocation; page errors and
`console.error` output are forwarded to stderr.

## Scenarios

| Name | What runs |
| :--- | :--- |
| `raf-timelines` | one `rafTimeline` per element, `onUpdate` writes its own element (today's pattern) |
| `raf-shared` | one `rafTimeline` whose `onUpdate` writes all N elements (upper bound for a future group) |
| `raf-deep` | like `raf-timelines`, but each tree is a 20-segment `sequence` with the same total motion |
| `waapi` | one `webTimeline` per element played through `play(el, config)` |
| `raf-thrash` | like `raf-timelines`, but each `onUpdate` reads `el.offsetWidth` before writing (forced layouts) |

Each scenario builds N absolutely positioned `div`s and animates `translateX`
0→200 and `opacity` 0.2→1, linear, 2s, `repeat: Infinity`; RAF scenarios write
styles with `applyStyleSheet(el, createStyleSheet(state))`.

## Metrics

| Column | Meaning |
| :--- | :--- |
| `tick p50` / `tick p95` / `tick max` | duration of each `requestAnimationFrame` callback (ms): ANI's per-frame script time, measured with `performance.now()` |
| `int p50` / `int p95` | interval between consecutive frame timestamps (ms) |
| `long/s` | frames with an interval above 25 ms, per measured second |
| `lay/f` | CDP `LayoutCount` delta per frame |
| `sty/f` | CDP `RecalcStyleCount` delta per frame |
| `script ms/f` | CDP `ScriptDuration` delta per frame (ms) |
| `lay ms/f` | CDP `LayoutDuration` delta per frame (ms) |
| `sty ms/f` | CDP `RecalcStyleDuration` delta per frame (ms) |
| `setup ms` | timeline creation + `play()` for all elements (ms); measured separately, most interesting for `waapi` |

WAAPI animations run off the main thread, so the WAAPI scenario has no rAF
callbacks; its tick and frame columns print `-`.

## Method

1. A fresh browser page is opened per repeat and per scenario × N.
2. Before ANI is imported, `window.requestAnimationFrame` is wrapped so every
   callback is timed and frames are stamped.
3. DOM is built, all timelines are created and started; setup time is recorded.
4. The page runs a warm-up (default 1s), the recorder is reset, then the
   measured window runs (default 3s) while
   `Performance.getMetrics` counters are sampled before and after.
5. Repeats are reduced with the median, element by element.
6. A fixed-width table is printed and the full report is written to JSON.

Stats use nearest-rank percentiles; long frames use the `> 25ms` threshold.

## Output

The JSON report is `{ meta, results }`:

```json
{
  "meta": { "date": "...", "chromium": "...", "node": "...", "cpu": "...", "commit": "..." },
  "results": [
    { "scenario": "raf-timelines", "n": 1000, "repeats": 3, "metrics": { "...": 0 } }
  ]
}
```

`bench/browser/results/` is gitignored; copy reports you want to keep (CI
artifacts, PRs) to a tracked location.

## Comparing

Pass a previous JSON with `--compare <file>`: in addition to the results table,
a delta table is printed with a column per metric (current − baseline), matched
by scenario name and element count. Missing rows print `-`.
