import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import type { CoreModules } from './core_api.ts'
import { FILL_FRAMES, generate, RAMP_FRAMES } from './generator.ts'
import { OP_KINDS, type Op } from './ops.ts'
import { createRng } from './rng.ts'
import { World } from './world.ts'

const DEFAULT_SECONDS = 30
const DEFAULT_MAX = 300
const DEFAULT_CHECKPOINTS = 5
const SMOKE_FRAMES = 3000
const SMOKE_MAX = 100
/** Heap may deviate from the first checkpoint by this fraction. */
const HEAP_TOLERANCE = 0.1
/** Fewest frames between checkpoints for the heap comparison to mean anything. */
const MIN_CHECKPOINT_SPACING = 50

const USAGE = `usage: node --expose-gc bench/soak/run.ts [options]

  --seconds <n>      wall time budget (default ${DEFAULT_SECONDS})
  --frames <n>       fixed number of frames; overrides --seconds
  --seed <n>         seed of the run (default random, printed first)
  --max <n>          most live objects (default ${DEFAULT_MAX})
  --checkpoints <n>  heap checkpoints while the population holds at --max (default ${DEFAULT_CHECKPOINTS})
  --smoke            --frames ${SMOKE_FRAMES} --max ${SMOKE_MAX}
  --replay <file>    run the ops of a JSON file (see bench/soak/README.md)
`

function out(line = ''): void {
    process.stdout.write(`${line}\n`)
}

function usageError(message: string): never {
    process.stderr.write(`${message}\n\n${USAGE}`)
    process.exit(2)
}

function integer(name: string, text: string | undefined, min: number) {
    if (text === undefined) return undefined
    const value = Number(text)
    if (!Number.isInteger(value) || value < min) {
        usageError(`--${name} must be an integer >= ${min}, received ${text}.`)
    }
    return value
}

function megabytes(bytes: number): string {
    return `${(bytes / 1048576).toFixed(2)} MB`
}

interface Config {
    seed: number
    max: number
    checkpoints: number
    frames: number | undefined
    seconds: number
    replay: Op[] | null
}

function readConfig(): Config {
    let parsed: ReturnType<typeof parseArgs>
    try {
        parsed = parseArgs({
            // `pnpm soak -- --seconds 5` forwards the separator
            args: process.argv.slice(2).filter((arg) => arg !== '--'),
            options: {
                seconds: { type: 'string' },
                frames: { type: 'string' },
                seed: { type: 'string' },
                max: { type: 'string' },
                checkpoints: { type: 'string' },
                smoke: { type: 'boolean' },
                replay: { type: 'string' },
                help: { type: 'boolean' },
            },
            strict: true,
        })
    } catch (error) {
        usageError(error instanceof Error ? error.message : String(error))
    }
    const values = parsed.values as Record<string, string | boolean | undefined>
    if (values.help) {
        process.stdout.write(USAGE)
        process.exit(0)
    }
    const text = (name: string) => values[name] as string | undefined
    const smoke = values.smoke === true
    const seed = integer('seed', text('seed'), 0) ?? randomInt(0, 2 ** 32)
    let max =
        integer('max', text('max'), 1) ?? (smoke ? SMOKE_MAX : DEFAULT_MAX)
    const file = text('replay')
    let replay: Op[] | null = null
    if (file !== undefined) {
        const document = JSON.parse(readFileSync(file, 'utf8')) as {
            ops: Op[]
            max?: number
        }
        replay = document.ops
        if (text('max') === undefined && document.max) max = document.max
    }
    return {
        seed,
        max,
        checkpoints:
            replay === null
                ? (integer('checkpoints', text('checkpoints'), 0) ??
                  DEFAULT_CHECKPOINTS)
                : 0,
        frames:
            integer('frames', text('frames'), 1) ??
            (smoke ? SMOKE_FRAMES : undefined),
        seconds: integer('seconds', text('seconds'), 1) ?? DEFAULT_SECONDS,
        replay,
    }
}

async function loadCore(): Promise<CoreModules> {
    const dist = new URL('../../packages/core/dist/', import.meta.url)
    try {
        const index = await import(new URL('index.js', dist).href)
        const testing = await import(new URL('testing.js', dist).href)
        return { a: index, createManualClock: testing.createManualClock }
    } catch (error) {
        process.stderr.write(
            `Cannot load the built core (${error instanceof Error ? error.message : String(error)}).\nBuild it first: pnpm --filter @freestylejs/ani-core build\n`
        )
        process.exit(2)
    }
}

function report(world: World, config: Config, replayFrames: number): void {
    const violation = world.violation!
    out()
    out(`FAIL ${violation.invariant}`)
    out(violation.message)
    out()
    out(`seed ${config.seed}, frame ${world.frameNo}, op #${world.seq}`)
    out('last 20 operations:')
    for (const line of world.recentOps()) out(`  ${line}`)
    out()
    if (config.replay === null) {
        out(
            `replay: node --expose-gc bench/soak/run.ts --seed ${config.seed} --max ${config.max} --frames ${replayFrames}`
        )
    }
}

async function main(): Promise<number> {
    const config = readConfig()
    out(`seed ${config.seed}`)
    const fixed = config.frames !== undefined
    out(
        `${config.replay === null ? (fixed ? `frames ${config.frames}` : `seconds ${config.seconds}`) : `replay ${config.replay.length} ops`}, max ${config.max}, checkpoints ${config.checkpoints}`
    )
    const gc = (globalThis as { gc?: () => void }).gc
    if (config.checkpoints > 0 && gc === undefined) {
        usageError('Run with --expose-gc: node --expose-gc bench/soak/run.ts')
    }

    const world = new World({ core: await loadCore() })
    process.on('uncaughtException', (error) => world.onUncaught(error))
    process.on('unhandledRejection', (error) =>
        world.fail('uncaught', `unhandled rejection: ${String(error)}`)
    )
    const step = async (op: Op): Promise<void> => {
        world.exec(op)
        await world.settleAfter(op)
    }

    const started = performance.now()
    const deadline = started + config.seconds * 1000
    const heaps: number[] = []
    const steadyStart = RAMP_FRAMES + FILL_FRAMES
    let steadyAt = 0
    let frames = 0

    const takeCheckpoint = (): void => {
        gc?.()
        gc?.()
        const heap = process.memoryUsage().heapUsed
        heaps.push(heap)
        const first = heaps[0]!
        const drift = ((heap - first) / first) * 100
        out(
            `heap ${heaps.length}/${config.checkpoints} frame ${frames} ${megabytes(heap)} (${drift >= 0 ? '+' : ''}${drift.toFixed(1)}%)`
        )
        if (heap - first > HEAP_TOLERANCE * first) {
            world.fail(
                'I6 memory',
                `heap at checkpoint ${heaps.length} is ${megabytes(heap)}, +${drift.toFixed(1)}% above the first checkpoint (${megabytes(first)}) with ${world.population} live objects; the limit is +${HEAP_TOLERANCE * 100}%`
            )
        }
    }

    // Share of the steady phase that has passed, 0 to 1.
    const steadyProgress = (): number => {
        if (frames < steadyStart) return 0
        if (fixed)
            return (frames - steadyStart) / (config.frames! - steadyStart)
        return (performance.now() - steadyAt) / (deadline - steadyAt)
    }
    const checkpointsPossible =
        config.checkpoints > 0 &&
        (!fixed ||
            config.frames! - steadyStart >=
                MIN_CHECKPOINT_SPACING * config.checkpoints)

    let done = false
    if (config.replay === null) {
        const ops = generate(createRng(config.seed), world, config.max)
        while (!done && world.violation === null) {
            const op = ops.next().value
            await step(op)
            if (op.k !== 'frame' || world.violation !== null) continue
            frames++
            if (frames === steadyStart) steadyAt = performance.now()
            if (
                checkpointsPossible &&
                heaps.length < config.checkpoints &&
                world.population === config.max &&
                steadyProgress() >= (heaps.length + 1) / config.checkpoints
            ) {
                takeCheckpoint()
            }
            done = fixed
                ? frames >= config.frames!
                : performance.now() >= deadline
        }
    } else {
        for (const op of config.replay) {
            await step(op)
            if (world.violation !== null) break
        }
    }

    if (world.violation === null) await world.teardown(step)

    if (world.violation !== null) {
        report(world, config, fixed ? config.frames! : frames + 1)
        return 1
    }

    out()
    out(`frames ${frames}`)
    out(
        `operations ${OP_KINDS.map((kind) => `${kind}=${world.stats[kind]}`).join(' ')}`
    )
    out(`peak population ${world.peak}`)
    if (config.checkpoints > 0 && heaps.length < config.checkpoints) {
        out(
            `I6 memory: not checked, the population did not hold at ${config.max} long enough for ${config.checkpoints} checkpoints`
        )
    }
    out(`time ${((performance.now() - started) / 1000).toFixed(1)} s`)
    out('result PASS')
    return 0
}

main().then(
    (code) => {
        process.exitCode = code
    },
    (error: unknown) => {
        process.stderr.write(
            `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
        )
        process.exitCode = 1
    }
)
