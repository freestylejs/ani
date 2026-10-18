# Bundle size budget

Measures tree-shaken and minified bundle sizes across key ANI usage scenarios.
This tool enforces ANI V2 values: **⑤ cost proportional to active work**
(users pay only for what they import) and **⑪ provability** (deterministic,
automated budget enforcement in CI).

## Requirements

- Node 24 (the runner is TypeScript executed with native type stripping).
- `esbuild` (root devDependency).
- Built core package (`pnpm --filter @freestylejs/ani-core build`).

## Run

Run the benchmark (builds `@freestylejs/ani-core` first):

```sh
pnpm size
```

If the packages are already built, run the runner directly:

```sh
node bench/size/run.ts
```

The runner exits with code `0` when every scenario is within its budget, and code
`1` if any scenario exceeds its budget or if `budget.json` is missing.

## Update budget

To update `bench/size/budget.json` to the current measurements:

```sh
node bench/size/run.ts --update
```

This rewrites `bench/size/budget.json` according to the 1.10 rule: each limit
is set to the measured gzip size times 1.10, rounded up to the next 100 bytes:

$$\text{budget} = \left\lceil \frac{\text{gzipBytes} \times 1.10}{100} \right\rceil \times 100$$

## Scenarios

| Scenario | What runs |
| :--- | :--- |
| `raf-minimal` | Minimal RAF timeline: `import { ani, rafTimeline } from 'core'` |
| `raf-composition` | Full composition tree: `ani`, `sequence`, `parallel`, `stagger`, `rafTimeline`, `timing` |
| `waapi-minimal` | Web Animations API timeline: `ani`, `waapiTimeline` (no RAF loop overhead) |
| `group` | Multi-target RAF group driving N targets with one clock subscription: `ani`, `rafGroup` |
| `follow` | Spring follower preserving velocity across target updates: `follow` |
| `states` | State machine controller managing transitions: `ani`, `createStates` |
| `values-color` | Color codec from `@freestylejs/ani-core/values`: `color` (zero engine overhead) |
| `everything` | The entire root entry: `import * as all from 'core'` and reference `all` |

## Measurement method

For each scenario in `bench/size/scenarios.ts`:
1. `esbuild` bundles an entry that imports the named exports and references them
   so that dead-code elimination does not drop them.
2. Bundling options: `bundle: true, minify: true, treeShaking: true, format: 'esm', platform: 'browser', write: false`.
3. The minified output is measured in bytes.
4. Gzip compression is performed in memory using `node:zlib` `gzipSync` with level 9.
5. The measured gzip size is checked against the budget in `bench/size/budget.json`.
