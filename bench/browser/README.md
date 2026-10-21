# Browser frame benchmark

Runs ANI inside real (headless) Chromium and reports frame cost plus layout and
style work. Every number collected so far lives in Node with no DOM; this
benchmark is the browser-side baseline that V2 work such as batched DOM commits
and multi-target groups is measured against.

## Requirements

- Node 24 (the runner is TypeScript executed with native type stripping).
- Chromium for Playwright (`pnpm exec playwright install chromium` if missing).

No HTTP server and no ports are used: Playwright request interception serves
`bench/browser/page.html` and `packages/core/dist/index.js` (with the
`chunk-*.js` files it imports) from disk under
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
| `--check` | release gate: runs the budget scenarios at `n=5000` and exits `1` if a budget fails (see [Budgets](#budgets)) |
| `--update-budget` | re-baselines the `raf-timelines` p95, clamps `raf-group` p95 to the hard **4.5 ms**, and preserves the 2.5x guard and 1.05 recalc ceiling |

The core package is built automatically before the run. The exit code is `0`
on success and `1` on any page error or bad invocation; page errors and
`console.error` output are forwarded to stderr.

## Scenarios

| Name | What runs |
| :--- | :--- |
| `raf-timelines` | one `rafTimeline` per element, bound to its own element with `bind(el)` (today's pattern) |
| `raf-shared` | one `rafTimeline` bound to all N elements, one `bind(el)` each (upper bound for a future group) |
| `raf-deep` | like `raf-timelines`, but each tree is a 20-segment `sequence` with the same total motion |
| `waapi` | one `waapiTimeline` per element played through `play(el, config)` |
| `raf-thrash` | like `raf-timelines`, but each `onUpdate` reads `el.offsetWidth` right after the bound write (forced style recalculations) |
| `raf-group` | one `rafGroup` whose N targets are bound with `bindAt(i, el)` (`count: N`) |
| `raf-read` | like `raf-timelines`, plus a per-element `onUpdate` that schedules `clock.read(() => el.offsetWidth)` (layout reads in the read phase) |

`raf-thrash` is the negative control for `raf-read`: it reads layout directly
in `onUpdate`, after the bound write. Both read `offsetWidth`; only the phase
differs. Because the scenarios animate only `transform` and `opacity` (compositor
properties that never dirty layout geometry), `LayoutCount` stays 0 even when
reading `offsetWidth` right after writing: layout is not invalidated, so the
gate cannot fail on layout count. What reading `offsetWidth` against dirty styles
does force is a synchronous style recalculation per element. Forced style
recalculations (`RecalcStyleCount` / `sty/f`), not layouts, are therefore the
right signal for detecting frame thrashing on transform and opacity writes.
Reading in the clock's read phase batches reads before writes, keeping `raf-read`
to ~1 style recalc per frame (the browser's own rendering pass), while `raf-thrash`
forces ~N recalculations per frame.

Each scenario builds N absolutely positioned `div`s and animates `translateX`
0→200 and `opacity` 0.2→1, linear, 2s, `repeat: Infinity`; RAF scenarios write
styles through `timeline.bind(el)`, one bind per element.

The 1.x `applyStyleSheet(el, createStyleSheet(state))` call, which `bind` makes
redundant, was removed from the package, so these scenarios moved from an
`onUpdate` write to `bind`. The animation and the number of writes are the
same. `bind` skips declarations whose value did not change, and writes before
the `onUpdate` listeners run, so `raf-thrash` now reads the layout after the
write instead of before it (still one forced layout per element and frame). The
numbers are not comparable with reports recorded before this change.

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

## Derived metrics

Printed under the results table (and stored as `derived` in the JSON report),
per N:

| Column | Meaning |
| :--- | :--- |
| `groupGain` | median `tick p95` of `raf-timelines` divided by that of `raf-group` |
| `raf-read sty/f` | CDP style recalculations per frame of `raf-read` |
| `raf-thrash sty/f` | CDP style recalculations per frame of `raf-thrash` |
| `raf-read lay/f` | CDP layouts per frame of `raf-read` (informational) |

A value is `-` when the scenarios it needs were not run.

## Budgets

`budget.json` holds the V2 release budgets, measured at `n=5000`:

| Key | Budget |
| :--- | :--- |
| `rafTimelinesP95Ms` | regression guard for `tick p95` of `raf-timelines` (ms) |
| `rafGroupP95Ms` | hard budget for `tick p95` of `raf-group` (ms): **4.5**, target **4.0** |
| `minGroupGain` | guard for the `groupGain` ratio: **2.5x** |
| `maxRafReadStyleRecalcsPerFrame` | maximum `sty/f` of `raf-read` |

**Gate amendment (2026-10-20).** The V2 group gate has three separate numbers:
a **hard budget of 4.5 ms** for `raf-group` `tick p95` at N=5000
(`rafGroupP95Ms` in `budget.json`), a **release target of 4.0 ms**, and a
**groupGain guard of 2.5x** (`minGroupGain`). At 5,000 elements the group
performs 10,000 DOM declarations per frame (`transform` + `opacity`); the
measured floor is p50 3.3-3.4 ms and p95 4.0 ms. The per-timeline baseline is
10.2-11.8 ms, so the retired threefold ratio would require the group to beat the DOM
write floor; it is not a sound release criterion. `groupGain` is still recorded
and guarded at 2.5x so an amortization regression still fails `--check`, while
the absolute 4.0 ms target is reported against the 4.5 ms hard budget.

```sh
pnpm bench:check                           # build core, run the budget scenarios, exit 1 on a miss
node bench/browser/run.ts --update-budget  # re-baseline budget.json on this machine
```

`--check` runs exactly `raf-timelines`, `raf-group` and `raf-read` at `n=5000`
with the default repeats, prints one `ok` / `FAIL` line per budget and names
the failed ones. A budget whose value could not be measured fails.
`--update-budget` runs the same set and writes `budget.json`: it re-baselines
the `raf-timelines` p95 from the measured median × 1.25 (rounded up to 0.1 ms)
and sets `raf-group` p95 to the lower of that measured × 1.25 value and the
hard **4.5 ms** ceiling, so a re-baseline can never raise the approved group
budget above 4.5 ms. It deliberately preserves the amended `minGroupGain` guard
of `2.5` and the `maxRafReadStyleRecalcsPerFrame` ceiling of `1.05`; those are
release gates, not measurements, so `--update-budget` is a measurement
re-baseline, not a release-gate loosening. If any page error
occurs during the run, `--update-budget` refuses to write `budget.json`, prints
the error count, and exits 1 so broken runs cannot pollute the budget file on
disk. Neither flag can be combined with `--scenario`, `--n` or `--smoke`.

The budgets are absolute times, so they only mean something on the machine that
produced them. Run `--update-budget` on the release machine and commit the
result; `--check` runs there before a release. CI is not changed: shared runners
are too noisy for frame budgets, so CI only runs `--smoke` to prove the
scenarios still execute.

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
