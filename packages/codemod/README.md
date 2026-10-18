# @freestylejs/ani-codemod

Migrates code from ANI 1.x to ANI 2. Call sites that can be rewritten safely are rewritten in place; everything else is reported with file, line and column.

## Usage

```sh
npx @freestylejs/ani-codemod [--dry] <file-or-dir>...
```

- Directories are walked recursively (`node_modules`, `dist`, `.git` and `.next` are skipped). Supported files: `.ts .mts .cts .tsx .js .mjs .cjs .jsx .vue .svelte`.
- `--dry` prints the warnings and the summary without writing any file.
- Each warning is printed as `file:line:column [rule] message`, followed by `N files changed, M warnings`.
- Exit code `0`, or `1` on a usage, IO or syntax error (other files are still processed).

**Run the codemod once, on 1.x code, and commit before you do.** It is idempotent except for the `delay` conversion below: it cannot tell seconds that were already converted from milliseconds, so a second run divides again.

Only files that import `@freestylejs/ani-core` or `@freestylejs/ani-{react,vue,solid,svelte}` are touched. Edits are made at the exact source positions, so untouched code, comments and formatting stay identical. In `.vue` and `.svelte` files only the content of `<script>` blocks is transformed (each block on its own; templates are not).

Node-builder rewrites (`sequence`, `ani`, ...) apply only to ANI's functions: `a.<name>(...)` where `a` is bound by the ANI import, or a bare `<name>(...)` imported by name from `@freestylejs/ani-core`. Member rewrites (`play`, `reset`, `getCurrentValue`, ...) apply to any receiver in such a file.

## Rewrites

| 1.x | 2 |
| --- | --- |
| `import { a, x } from '@freestylejs/ani-core'` | `import * as a from ...` plus `import { x } from ...` |
| `a.dynamicTimeline(n)` | `a.rafTimeline(n)` |
| `a.timeline(n)`, `a.webTimeline(n)` | `a.waapiTimeline(n)` (named imports and their call sites are renamed too) |
| `a.sequence(c, timing, id)`, `a.parallel(...)` | `a.sequence(c, { timing, id })` |
| `a.loop(n, count, timing, id)` | `a.loop(n, count, { timing, id })` |
| `a.delay(seconds, id)` | `a.delay(seconds, { id })` |
| `a.stagger(c, offset, timing, id)` | `a.stagger(c, { offset, timing, id })` |
| `a.ani(props, id)` | `a.ani({ ...props, id })` (the id is added to an object literal directly) |
| `a.rafTimeline(n, clock)` | `a.rafTimeline(n, { clock })` |
| `a.createStates({ initialFrom })` | `a.createStates({ initialValue })` |
| `s.onTimelineChange((t) => ...)` | `s.onTransition((_state, t) => ...)` (other callbacks are wrapped) |
| `t.getCurrentValue()` / `t.getCurrentVelocity()` | `t.value` / `t.velocity` |
| `t.currentConfig` | `t.config` |
| `w.nativeAnimation` | `w.animations[0]` |
| `t.play(config, interruptible)` | `t.play({ ...config, interrupt })` |
| `s.transitionTo(state, config, interruptible)` | `s.transitionTo(state, { ...config, interrupt })` |
| `delay: 500` in a `play` / `transitionTo` config | `delay: 0.5` (milliseconds to seconds) |
| `w.play(el, { propertyResolver, keyframeEffect })` | `w.play(el, { resolver, effect })` |
| `t.reset(a, b)` | `t.reset()` (with a warning) |
| `AnimationClock.configure(0.1)` | `defaultClock.configure({ maxDeltaTime: 0.1 })` |
| `AnimationClock.create()` | `defaultClock` |

Notes:

- `delay`: number literals are divided exactly; other expressions become `expr / 1000`, parenthesized unless they are an identifier or a property access. Only object literals written inline in the `play` / `transitionTo` call are converted; a config held in a variable must be converted by hand.
- `play` is told apart by its arguments. The WAAPI form is two arguments whose second is an object literal (`play(el, { ... })`); the RAF form is `play(config)` or `play(config, true | false)`.
- `AnimationClock.configure(x)` is wrapped as `{ maxDeltaTime: x }` only when `x` is a numeric literal; any other argument is passed through unchanged, because ANI 2 accepts the same union.
- The `AnimationClock` import specifier is replaced by `defaultClock`, and kept only while other references to it remain.
- Renamed named imports (`webTimeline`, `timeline`, `dynamicTimeline`) are renamed at every reference, including values, `typeof`, shorthand properties and `export { ... }` (the exported name is kept with `as`). References inside a scope that declares the same name (a parameter or local variable) are left alone.

## Warnings

Nothing is changed silently: whatever the codemod cannot decide is left as it was and reported.

| Rule | Meaning | What to do |
| --- | --- | --- |
| `ambiguous-play` | A `play` / `transitionTo` call whose arguments do not match a known 1.x shape (for example `t.play(x, y)`). | Decide whether it is RAF or WAAPI: for RAF pass `{ ...config, interrupt }`, for WAAPI pass `(target, config)`. |
| `reset-arguments` | `reset` was called with arguments; they were removed. | Check that the removed arguments are not needed any more. |
| `property-resolver` | A RAF `play` / `transitionTo` config has `propertyResolver`. | Remove it from the config and set the resolver where the timeline is created. |
| `context-removed` | A RAF config has `context`. | Remove it and pass the values through the timeline or its nodes. |
| `clock-reset` | `AnimationClock.reset()` has no equivalent. | Dispose the clocks and timelines you created instead. |
| `clock-create` | `AnimationClock.create(maxDeltaTime)` was called with an argument; the call was left as it was. | Use `defaultClock.configure({ maxDeltaTime })`, or create a clock with `createClock`. |
| `react-use-ani-ref` | `useAniRef(ref, props)` changed signature. | Update the call to the ANI 2 signature by hand. |

A file with a syntax error that imports ANI is not modified; the error is printed with its position and the exit code is `1`.

## API

```ts
import { transform } from '@freestylejs/ani-codemod'

const { code, warnings } = transform(source, 'file.tsx')
// warnings: { rule, message, line, column }[]  (line and column are 1-based)
```
