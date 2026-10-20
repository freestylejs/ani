import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as a from '../../index'
import { createManualClock } from '../../testing'

function element() {
    const current: Record<string, unknown> = {}
    const style = new Proxy({} as Record<string, unknown>, {
        set(_t, prop, value) {
            current[String(prop)] = value
            return true
        },
        get(_t, prop) {
            if (prop === 'setProperty') {
                return (name: string, value: unknown) => {
                    current[name] = value
                }
            }
            return current[String(prop)]
        },
    })
    return { style: style as unknown as CSSStyleDeclaration, current }
}

const lin = a.timing.linear()
const warns = () =>
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
const codes = (spy: ReturnType<typeof warns>) =>
    spy.mock.calls.map((call) => String(call[0]).match(/ANI_DEV_[A-Z_]+/)?.[0])

afterEach(() => {
    vi.restoreAllMocks()
})

describe('XDEV: dev warnings (sources run as development)', () => {
    it('W1: two bindings writing one property of one element warn once', () => {
        const spy = warns()
        const m = createManualClock()
        const el = element()
        const one = a.rafTimeline(
            a.ani({ to: { translateX: 100 }, duration: 1, timing: lin }),
            { clock: m.clock }
        )
        const two = a.rafTimeline(
            a.ani({ to: { translateX: 50 }, duration: 1, timing: lin }),
            { clock: m.clock }
        )
        one.bind(el)
        two.bind(el)
        one.play({ from: { translateX: 0 } })
        two.play({ from: { translateX: 0 } })
        m.frames(5, 16)
        const conflicts = codes(spy).filter(
            (c) => c === 'ANI_DEV_CONFLICTING_WRITERS'
        )
        expect(conflicts).toHaveLength(1)
        expect(String(spy.mock.calls[0]?.[0])).toMatch(/transform/)
        one.dispose()
        two.dispose()
    })

    it('W2: bindings writing different properties do not warn', () => {
        const spy = warns()
        const m = createManualClock()
        const el = element()
        const one = a.rafTimeline(
            a.ani({ to: { translateX: 100 }, duration: 1, timing: lin }),
            { clock: m.clock }
        )
        const two = a.rafTimeline(
            a.ani({ to: { opacity: 1 }, duration: 1, timing: lin }),
            { clock: m.clock }
        )
        one.bind(el)
        two.bind(el)
        one.play({ from: { translateX: 0 } })
        two.play({ from: { opacity: 0 } })
        m.frames(5, 16)
        expect(codes(spy)).not.toContain('ANI_DEV_CONFLICTING_WRITERS')
        one.dispose()
        two.dispose()
    })

    it('W3: using a disposed timeline is a no-op that warns once per method', async () => {
        const spy = warns()
        const m = createManualClock()
        const line = a.rafTimeline(
            a.ani({ to: { x: 1 }, duration: 1, timing: lin }),
            { clock: m.clock }
        )
        line.dispose()
        await expect(line.play({ from: { x: 0 } })).resolves.toBe('disposed')
        await expect(line.play({ from: { x: 0 } })).resolves.toBe('disposed')
        line.pause()
        const disposed = codes(spy).filter((c) => c === 'ANI_DEV_DISPOSED_USE')
        expect(disposed).toHaveLength(2)
    })
})

const coreRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const pkg = JSON.parse(readFileSync(join(coreRoot, 'package.json'), 'utf8'))

type Core = typeof import('../../index')
async function load(file: string): Promise<Core> {
    return (await import(pathToFileURL(join(coreRoot, file)).href)) as Core
}

describe('XDEV: production and development builds', () => {
    it('B1: the development condition points at existing files', () => {
        const root = pkg.exports['.']
        const dev = root.development
        expect(dev, 'exports["."].development').toBeDefined()
        const files =
            typeof dev === 'string'
                ? [dev]
                : Object.values(dev).flatMap((v) =>
                      typeof v === 'string' ? [v] : Object.values(v as object)
                  )
        for (const file of files as string[]) {
            expect(existsSync(join(coreRoot, file)), file).toBe(true)
        }
    })

    function devFile(): string {
        const dev = pkg.exports['.'].development
        if (typeof dev === 'string') return dev
        const esm = dev.import ?? dev.default
        return typeof esm === 'string' ? esm : esm.default
    }
    function prodFile(): string {
        const esm = pkg.exports['.'].import
        return typeof esm === 'string' ? esm : esm.default
    }

    function failure(core: Core) {
        try {
            core.ani({ to: { x: 1 }, duration: -1 })
        } catch (error) {
            return error as Error & { code?: string; docs?: string }
        }
        throw new Error('expected a throw')
    }

    it('B2: production throws the same class and code with a short message', async () => {
        const prod = failure(await load(prodFile()))
        const dev = failure(await load(devFile()))
        for (const error of [prod, dev]) {
            expect(error).toBeInstanceOf(RangeError)
            expect(error.code).toBe('ANI_INVALID_NODE')
            expect(error.message.startsWith('[ANI_INVALID_NODE]')).toBe(true)
        }
        expect(prod.message).toContain(prod.docs as string)
        expect(prod.message).not.toMatch(/finite number/)
        expect(dev.message).toMatch(/finite number/)
    })

    it('B3: the production build never warns', async () => {
        const spy = warns()
        const prod = await load(prodFile())
        const line = prod.rafTimeline(prod.ani({ to: { x: 1 }, duration: 1 }), {
            clock: prod.createClock({
                requestFrame: () => 1,
                cancelFrame: () => undefined,
                now: () => 0,
            }),
        })
        line.dispose()
        await line.play({ from: { x: 0 } })
        line.pause()
        expect(spy).not.toHaveBeenCalled()
    })
})
