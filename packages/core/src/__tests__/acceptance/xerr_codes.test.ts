import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as a from '../../index'
import { AniError, isAniError } from '../../index'
import { createManualClock } from '../../testing'

const lin = a.timing.linear()
const n = () => a.ani({ to: { x: 1 }, duration: 1, timing: lin })
const clock = () => createManualClock().clock
const line = () => a.rafTimeline(n(), { clock: clock() })
const loose = (fn: unknown) => fn as (...args: unknown[]) => unknown

type Kind = typeof TypeError | typeof RangeError
const cases: Array<[string, string, Kind, () => unknown]> = [
    [
        'node duration',
        'ANI_INVALID_NODE',
        RangeError,
        () => a.ani({ to: { x: 1 }, duration: -1 }),
    ],
    [
        'node to',
        'ANI_INVALID_NODE',
        TypeError,
        () => a.ani({ to: null as never, duration: 1 }),
    ],
    ['loop count', 'ANI_INVALID_NODE', RangeError, () => a.loop(n(), -1)],
    [
        'stagger offset',
        'ANI_INVALID_NODE',
        RangeError,
        () => a.stagger([n()], { offset: -1 }),
    ],
    [
        'bezier points',
        'ANI_INVALID_NODE',
        RangeError,
        () => a.timing.bezier({ p2: { x: 2, y: 0 }, p3: { x: 0, y: 0 } }),
    ],
    [
        'unreachable',
        'ANI_UNREACHABLE_NODE',
        RangeError,
        () => a.sequence([a.loop(n(), Number.POSITIVE_INFINITY), n()]),
    ],
    [
        'play without from',
        'ANI_INVALID_CONFIG',
        TypeError,
        () => line().play({} as never),
    ],
    [
        'play shape',
        'ANI_INVALID_CONFIG',
        TypeError,
        () => line().play({ from: { y: 0 } } as never),
    ],
    [
        'play delay',
        'ANI_INVALID_CONFIG',
        RangeError,
        () => line().play({ from: { x: 0 }, delay: -1 }),
    ],
    [
        'seek NaN',
        'ANI_INVALID_CONFIG',
        RangeError,
        () => {
            const t = line()
            t.play({ from: { x: 0 } })
            t.seek(Number.NaN)
        },
    ],
    [
        'group without count',
        'ANI_INVALID_CONFIG',
        RangeError,
        () => a.rafGroup(n(), { clock: clock() }).play({ from: { x: 0 } }),
    ],
    [
        'unknown state',
        'ANI_UNKNOWN_STATE',
        RangeError,
        () =>
            a
                .createStates({
                    initial: 'idle',
                    initialValue: { x: 0 },
                    states: { idle: n() },
                    clock: clock(),
                })
                .transitionTo('nope' as never),
    ],
    [
        'unknown initial state',
        'ANI_UNKNOWN_STATE',
        RangeError,
        () =>
            a.createStates({
                initial: 'nope' as never,
                initialValue: { x: 0 },
                states: { idle: n() },
            }),
    ],
    [
        'clock configure',
        'ANI_INVALID_OPTIONS',
        RangeError,
        () => clock().configure({ maxDeltaTime: -1 }),
    ],
    [
        'createClock',
        'ANI_INVALID_OPTIONS',
        RangeError,
        () => a.createClock({ lagThreshold: -1 }),
    ],
    [
        'bind target',
        'ANI_INVALID_OPTIONS',
        TypeError,
        () => line().bind(null as never),
    ],
    [
        'bindAt index',
        'ANI_INVALID_OPTIONS',
        TypeError,
        () =>
            a
                .rafGroup(n(), { clock: clock() })
                .bindAt(-1, { style: {} } as never),
    ],
    [
        'follow initial',
        'ANI_INVALID_OPTIONS',
        TypeError,
        () => a.follow({ x: Number.NaN }),
    ],
    [
        'reducedMotion policy',
        'ANI_INVALID_OPTIONS',
        TypeError,
        () =>
            a.rafTimeline(n(), {
                clock: clock(),
                reducedMotion: 'bogus' as never,
            }),
    ],
    [
        'positional timing',
        'ANI_REMOVED_API',
        TypeError,
        () => loose(a.sequence)([n()], lin),
    ],
    [
        'clock in place of options',
        'ANI_REMOVED_API',
        TypeError,
        () => loose(a.rafTimeline)(n(), clock()),
    ],
    [
        'initialFrom',
        'ANI_REMOVED_API',
        TypeError,
        () =>
            loose(a.createStates)({
                initial: 'idle',
                initialFrom: { x: 0 },
                states: { idle: n() },
            }),
    ],
]

function caught(fn: () => unknown): unknown {
    try {
        fn()
    } catch (error) {
        return error
    }
    return undefined
}

describe('XERR: every thrown error carries a code', () => {
    it.each(cases)('E1 %s -> %s', (_name, code, kind, fn) => {
        const error = caught(fn) as Error & { code?: string; docs?: string }
        expect(error, 'should throw').toBeInstanceOf(kind)
        expect(error).toBeInstanceOf(AniError)
        expect(isAniError(error)).toBe(true)
        expect(error.code).toBe(code)
        expect(error.message.startsWith(`[${code}] `)).toBe(true)
        expect(error.docs).toBe(
            `https://ani.freestylejs.dev/docs/errors#${code.toLowerCase()}`
        )
    })

    it('E4: isAniError rejects plain errors and look-alikes', () => {
        const fake = Object.assign(new TypeError('x'), {
            code: 'ANI_NOT_A_CODE',
            docs: 'https://ani.freestylejs.dev/docs/errors#ani_not_a_code',
        })
        for (const value of [
            new Error('x'),
            new TypeError('x'),
            fake,
            null,
            undefined,
            'ANI_INVALID_NODE',
            { code: 'ANI_INVALID_NODE' },
        ]) {
            expect(isAniError(value)).toBe(false)
            expect(value instanceof AniError).toBe(false)
        }
    })
})

const root = fileURLToPath(new URL('../../../../../', import.meta.url))
const sources = [
    'packages/core/src',
    'packages/react/src',
    'packages/vue/src',
    'packages/solid/src',
    'packages/svelte/src',
]

function walk(dir: string, out: string[]): string[] {
    for (const name of readdirSync(dir)) {
        if (name === '__tests__' || name === 'node_modules') continue
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path, out)
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name))
            out.push(path)
    }
    return out
}

describe('XERR: no uncoded throw is left', () => {
    it('E2: no `throw new TypeError|RangeError|Error(` outside the error module', () => {
        const hits: string[] = []
        for (const dir of sources) {
            for (const file of walk(join(root, dir), [])) {
                const rel = relative(root, file)
                if (rel.startsWith('packages/core/src/error/')) continue
                const lines = readFileSync(file, 'utf8').split('\n')
                lines.forEach((line, i) => {
                    if (/throw new (Type|Range)?Error\(/.test(line)) {
                        hits.push(`${rel}:${i + 1}`)
                    }
                })
            }
        }
        expect(hits).toEqual([])
    })

    it('E3: the errors page documents every code', () => {
        const page = readFileSync(
            join(root, 'packages/web/content/docs/errors.mdx'),
            'utf8'
        )
        const source = readFileSync(
            join(root, 'packages/core/src/error/ani_error.ts'),
            'utf8'
        )
        const codes = [...new Set(source.match(/'ANI_[A-Z_]+'/g) ?? [])].map(
            (code) => code.slice(1, -1)
        )
        for (const code of [
            'ANI_INVALID_NODE',
            'ANI_UNREACHABLE_NODE',
            'ANI_INVALID_CONFIG',
            'ANI_UNKNOWN_STATE',
            'ANI_INVALID_OPTIONS',
            'ANI_REMOVED_API',
            'ANI_CODEC_MISMATCH',
            'ANI_SUBSCRIBER_QUARANTINED',
        ]) {
            expect(codes, `AniErrorCode has ${code}`).toContain(code)
        }
        for (const code of codes) {
            expect(page, `section for ${code}`).toMatch(
                new RegExp(`^##+ .*${code}`, 'm')
            )
        }
    })
})
