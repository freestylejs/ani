# Soak test

Unit tests check one behavior at a time. A product that runs ANI for hours
mixes thousands of plays, interrupts, binds, unbinds and disposals across every
primitive. The soak runner does that on purpose: a seeded random run drives a
population of `rafTimeline`, `rafGroup`, `follow` and `createStates` objects on
a manual clock and checks global invariants after every frame. A leak or a
lifecycle bug shows up as a failing seed you can replay.

It enforces ANI V2 values **④ failure containment**, **⑤ cost proportional to
active work**, **⑥ explicit ownership** and **⑪ provability** (no real timers:
time is injected).

## Requirements

- Node 24 (TypeScript is run directly, with erasable syntax only).
- The built core: the runner imports `packages/core/dist/index.js` and
  `packages/core/dist/testing.js`, like `bench/size`.
- `--expose-gc` (the memory check needs `gc()`).

## Run

```sh
pnpm soak                          # builds core, then 30 s
pnpm soak -- --seconds 120
node --expose-gc bench/soak/run.ts --smoke --seed 1   # what CI runs, ~seconds
```

| Option | Meaning |
| :--- | :--- |
| `--seconds <n>` | Wall time budget (default 30). |
| `--frames <n>` | Fixed number of frames; overrides `--seconds`. |
| `--seed <n>` | Seed (default random). Always printed first. |
| `--max <n>` | Most live objects (default 300). |
| `--checkpoints <n>` | Heap checkpoints (default 5, `0` turns I6 off). |
| `--smoke` | `--frames 3000 --max 100`. |
| `--replay <file>` | Run the ops of a JSON file instead of generating them. |

The exit code is `1` on any invariant violation or uncaught error, `2` on bad
usage or a missing build, else `0`.

## Replay a seed

A failure prints the seed, the frame, the last 20 operations and a command:

```
replay: node --expose-gc bench/soak/run.ts --seed 1234 --max 300 --frames 4821
```

The same seed, `--max` and frame count perform exactly the same operations, so
the same failure happens at the same frame. Everything printed is identical
between runs of one seed, except the lines that start with `heap` and `time`
(measurements). With `--seconds` the number of frames depends on the machine;
the report shows how many ran, replay with `--frames`. I6 is a measurement of
the heap, not of the operations: replay it with the original arguments.

Operations are plain data and never consult the RNG while they execute (even
the choice "does this listener call throw" is a hash of the listener's seed and
call count), so a list of ops replays by itself. A replay file is
`{ "name": "...", "description": "...", "max": 100, "ops": [ ... ] }` where `ops`
are the objects shown in the failure report (`{"k":"play","s":12,...}`; see
`ops.ts`). An op that names an object that no longer exists does nothing, so an
op list can be shortened by deleting ops.

## What a run does

One frame is 16 ms of manual-clock time. Per frame the generator

1. moves the population toward a target in bounded steps,
2. performs 0 to 5 random operations (below),
3. advances the clock one frame,
4. with probability 1/200 does one of: `advance(2000)` without a frame,
   `setHidden(true/false)`, `setReducedMotion(true/false)` (reduced motion
   switches itself off again after 30 frames, so it does not dominate).

The population churns between 0 and `--max` for the first 1000 frames, then
holds at `--max`: a random `dispose` is followed by a `create`. The heap
checkpoints are spread evenly over that steady phase.

Every object gets nodes built from `ani`, `sequence`, `parallel`, `stagger`,
`delay` and `loop` (counts 1 to 3) over 1 to 3 numeric properties, durations
0.01 to 0.5 s, timings linear / bezier / spring. `waapiTimeline` is out (no
WAAPI in Node). Bind targets are fake elements `{ style }` whose style records
the last value written per property (core's style writer assigns camelCase
keys and calls `setProperty` for hyphenated ones).

### Operations

| Op | What it calls |
| :--- | :--- |
| `create` | `rafTimeline`, `rafGroup` (2 to 20 targets), `follow`, `createStates` (2 to 4 states). Most objects also get a listener that never throws, so I4 can watch them. |
| `play` | `timeline.play` / `group.play` with random `from`, `keyframes`, `repeat` 0 to 2, `interrupt` (timeline), `delay` 0 to 0.2 s. A group `from` is sometimes a function of the index. |
| `transition` | `states.transitionTo` with the same options (`from` sometimes). |
| `set`, `add`, `jump` | `follower.set`, a `set` to `target + delta` (the documented way to add), `follower.jump`. |
| `pause`, `resume`, `seek`, `reset` | On the timeline / group; on the current `timeline()` of a state machine. A follower has none of these. |
| `bind`, `unbind` | A fresh fake target: `bind` (timeline, follow, states), `bindAt` and `bind([...])` (group). `unbind` calls the returned function twice (idempotent). |
| `sub`, `unsub` | `onUpdate` listeners; about 1 call in 50 throws on purpose. |
| `dispose` | `dispose()`, twice (idempotent). |
| `frame`, `advance`, `hidden`, `rm` | Clock: one frame, `advance(2000)`, `setHidden`, `setReducedMotion`. |

Inputs are always valid, so an operation that throws is itself a violation.

## Invariants

A violation stops the run and prints the seed, the frame number, the last 20
operations and the invariant.

| | Checked | Rule |
| :--- | :--- | :--- |
| **I1** settle once | after every op | Every `play` / `transition` / `set` promise gets a `then` callback. It must settle with a valid `RunResult`, and only because of an op that ends it: `'ended'` during a frame in which the object was `PLAYING` (or at once under reduced motion / a `set` that changes nothing), `'interrupted'` by a later `play` / `transition` / `set` / `jump` on the same object (when the new call has `interrupt: false` and the object was `PLAYING` at the moment of the call, the new promise must settle `'skipped'` and the running run's promise must not settle in that op), `'skipped'` by the op that created it with `interrupt: false` when the object was `PLAYING`, `'reset'` by `reset` on that object, `'disposed'` by `dispose` on that object. Promises are drained after every op, so the op that settled one is known. After `dispose()` no promise of the object may be pending. At teardown every pending promise belongs to a live object, which is disposed and must then settle `'disposed'`. |
| **I2** subscription accounting | after every frame, and at teardown | See the rule below. |
| **I3** values | after every frame | Every live object's `value` (and `velocity`, and each `valueAt(i)` of a group) has only finite numbers. Every bound target holds the numbers of its object's current `value` (parsed back from the written text; the `transform` string is split into its functions). Compared when the value is not `null`. |
| **I4** containment | after every frame | Calls are counted per listener per frame (reset each frame); for an object that was `PLAYING` at frame start and past its delay (including the frame in which it ends), each of its live listeners must have been called exactly once; a second call in the same frame is a violation, however many other listeners threw. An object with a start `delay` that has not elapsed does not notify; the runner mirrors the engine's arithmetic for that. The clock's `onError` must never fire. At teardown, listeners threw N times and N errors surfaced. |
| **I5** disposal | continuously | After `dispose()` no target of the object is written and no listener is called. The same holds after `unbind` / `unsub`. Each fake target and listener carries a `dead` flag that is set when its owner lets go; a write or call on a dead one is a violation. |
| **I6** memory | at `--checkpoints` points | Spread evenly over the steady phase, with the population at `--max`: `gc()` twice, read `heapUsed`. After the first checkpoint the heap must not exceed the first checkpoint by more than 10 % (lower values are fine; the baseline is always the first checkpoint). |

### The subscription rule (I2)

`clock.size` equals the number of live objects whose status is `PLAYING`:

- `rafTimeline`: its own `status`.
- `rafGroup`: its own `status`.
- `follow`: its `status` (`PLAYING` while moving).
- `createStates`: the `status` of the current `timeline()`. Replaced timelines
  are disposed, so only the current one can be subscribed.

Each engine subscribes exactly while `PLAYING`: `play` (except a reduced-motion
jump, which ends at once) and `resume` subscribe; `pause`, `seek`, `reset`, the
end of a run and `dispose` unsubscribe. A start `delay` is still `PLAYING` and
subscribed. `size` is never negative, and 0 after teardown. The clock is
created with `createManualClock`, so nothing else subscribes to it.

### Teardown

Everything is disposed, frames run until the clock is idle (no subscriber, no
pending frame), then I1, I2 and I5 are checked once more.

## Output

```
seed 1
frames 3000, max 100, checkpoints 5

frames 3000
operations create=... play=... (every kind, executed ops)
peak population 100
heap 1/5 frame 1440 11.52 MB (+0.0%)
...
time 4.1 s
result PASS
```

## Files

| File | Role |
| :--- | :--- |
| `run.ts` | CLI, main loop, heap checkpoints, report. |
| `generator.ts` | The stream of ops: phases, weights, population control. |
| `world.ts` | Executes ops against the built core; the invariants. |
| `spec.ts`, `ops.ts` | Plain-data node trees, subjects and ops; building them. |
| `fake_element.ts` | The bind target. |
| `rng.ts` | mulberry32 and a pure hash. |
| `core_api.ts` | The slice of the built core the runner uses. |
