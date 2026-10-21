// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    retimeViewTransition,
    shareElement,
    viewTransition,
} from '../view_transition'

interface FakeTransition {
    ready: Promise<unknown>
    finished: Promise<unknown>
    types: { add: ReturnType<typeof vi.fn> }
    skipTransition: ReturnType<typeof vi.fn>
}

let start: ReturnType<typeof vi.fn>
let transition: FakeTransition

beforeEach(() => {
    transition = {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
        types: { add: vi.fn() },
        skipTransition: vi.fn(),
    }
    start = vi.fn((callback: () => Promise<void>) => {
        transition.ready = Promise.resolve(callback())
        return transition
    })
    Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: start,
    })
    Object.defineProperty(document.documentElement, 'matches', {
        configurable: true,
        value: () => false,
    })
})

afterEach(() => {
    delete (document as unknown as { startViewTransition?: unknown })
        .startViewTransition
    delete (document as unknown as { activeViewTransition?: unknown })
        .activeViewTransition
    delete (document as unknown as { getAnimations?: unknown }).getAnimations
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('viewTransition', () => {
    it('runs update exactly once and returns finished', async () => {
        const update = vi.fn()
        const result = await viewTransition(update)
        expect(result).toBe('finished')
        expect(update).toHaveBeenCalledTimes(1)
        expect(start).toHaveBeenCalledTimes(1)
    })

    it('runs update and returns unsupported without the API', async () => {
        delete (document as unknown as { startViewTransition?: unknown })
            .startViewTransition
        const update = vi.fn()
        await expect(viewTransition(update)).resolves.toBe('unsupported')
        expect(update).toHaveBeenCalledTimes(1)
        expect(start).not.toHaveBeenCalled()
    })

    it('runs update and returns reduced for reduced motion', async () => {
        const update = vi.fn()
        await expect(
            viewTransition(update, {
                clock: { reducedMotion: true },
                reducedMotion: 'jump',
            })
        ).resolves.toBe('reduced')
        expect(update).toHaveBeenCalledTimes(1)
        expect(start).not.toHaveBeenCalled()
    })

    it('yields to a foreign transition without starting another', async () => {
        Object.defineProperty(document, 'activeViewTransition', {
            configurable: true,
            value: {},
        })
        const update = vi.fn()
        await expect(viewTransition(update)).resolves.toBe('yielded')
        expect(update).toHaveBeenCalledTimes(1)
        expect(start).not.toHaveBeenCalled()
    })

    it('names a shared element only during the transition', async () => {
        const element = document.createElement('div')
        document.body.append(element)
        const unbind = shareElement(element, 'hero')
        let during = ''
        await expect(
            viewTransition(
                () => {
                    during = element.style.getPropertyValue(
                        'view-transition-name'
                    )
                },
                { share: ['hero'], types: ['soft'] }
            )
        ).resolves.toBe('finished')
        expect(during).toMatch(/^ani-hero/)
        expect(element.style.getPropertyValue('view-transition-name')).toBe('')
        expect(transition.types.add).toHaveBeenCalledWith('soft')
        unbind()
    })

    it('deduplicates repeated shared ids and preserves priority', async () => {
        const element = document.createElement('div')
        document.body.append(element)
        element.style.setProperty(
            'view-transition-name',
            'original',
            'important'
        )
        const unbind = shareElement(element, 'hero')
        await expect(
            viewTransition(() => undefined, { share: ['hero', 'hero'] })
        ).resolves.toBe('finished')
        expect(element.style.getPropertyValue('view-transition-name')).toBe(
            'original'
        )
        expect(element.style.getPropertyPriority('view-transition-name')).toBe(
            'important'
        )
        unbind()
    })

    it('caps shared names at 32', async () => {
        const elements = Array.from({ length: 33 }, () => {
            const element = document.createElement('div')
            document.body.append(element)
            return element
        })
        const unbinds = elements.map((element, index) =>
            shareElement(element, `item-${index}`)
        )
        let named = 0
        await expect(
            viewTransition(
                () => {
                    named = elements.filter((element) =>
                        element.style.getPropertyValue('view-transition-name')
                    ).length
                },
                { share: elements.map((_, index) => `item-${index}`) }
            )
        ).resolves.toBe('finished')
        expect(named).toBe(32)
        for (const unbind of unbinds) unbind()
    })

    it('uses collision-safe names for ids that sanitize alike', async () => {
        const first = document.createElement('div')
        const second = document.createElement('div')
        document.body.append(first, second)
        const unbindFirst = shareElement(first, 'a/b')
        const unbindSecond = shareElement(second, 'a?b')
        let names: string[] = []
        await expect(
            viewTransition(
                () => {
                    names = [first, second].map((element) =>
                        element.style.getPropertyValue('view-transition-name')
                    )
                },
                { share: ['a/b', 'a?b'] }
            )
        ).resolves.toBe('finished')
        expect(new Set(names).size).toBe(2)
        unbindFirst()
        unbindSecond()
    })

    it('churns shared names 50 times without residue', async () => {
        const first = document.createElement('div')
        const second = document.createElement('div')
        document.body.append(first, second)
        const unbindFirst = shareElement(first, 'hero')
        const unbindSecond = shareElement(second, 'other')
        for (let i = 0; i < 50; i++) {
            const element = i % 2 === 0 ? first : second
            const id = i % 2 === 0 ? 'hero' : 'other'
            await expect(
                viewTransition(() => undefined, { share: [id] })
            ).resolves.toBe('finished')
            expect(element.style.getPropertyValue('view-transition-name')).toBe(
                ''
            )
        }
        unbindFirst()
        unbindSecond()
    })

    it('disambiguates long-name hash collisions', async () => {
        const prefix = 'x'.repeat(40)
        const first = document.createElement('div')
        const second = document.createElement('div')
        document.body.append(first, second)
        const unbindFirst = shareElement(first, `${prefix}Aa`)
        const unbindSecond = shareElement(second, `${prefix}B@`)
        let names: string[] = []
        await expect(
            viewTransition(
                () => {
                    names = [first, second].map((element) =>
                        element.style.getPropertyValue('view-transition-name')
                    )
                },
                { share: [`${prefix}Aa`, `${prefix}B@`] }
            )
        ).resolves.toBe('finished')
        expect(new Set(names).size).toBe(2)
        unbindFirst()
        unbindSecond()
    })

    it('does not overwrite an original when one element serves two ids', async () => {
        const element = document.createElement('div')
        document.body.append(element)
        element.style.setProperty(
            'view-transition-name',
            'original',
            'important'
        )
        const unbindFirst = shareElement(element, 'a')
        const unbindSecond = shareElement(element, 'b')
        await expect(
            viewTransition(() => undefined, { share: ['a', 'b'] })
        ).resolves.toBe('finished')
        expect(element.style.getPropertyValue('view-transition-name')).toBe(
            'original'
        )
        expect(element.style.getPropertyPriority('view-transition-name')).toBe(
            'important'
        )
        unbindFirst()
        unbindSecond()
    })

    it('returns skipped when ready rejects but finished resolves', async () => {
        Object.defineProperty(document, 'startViewTransition', {
            configurable: true,
            value: vi.fn(() => ({
                ready: Promise.reject(new Error('skip')),
                finished: Promise.resolve(),
                types: { add: vi.fn() },
                skipTransition: vi.fn(),
            })),
        })
        const update = vi.fn()
        await expect(viewTransition(update)).resolves.toBe('skipped')
        expect(update).toHaveBeenCalledTimes(1)
    })

    it('yields when the selector proves a transition exists but ownership is unprovable', async () => {
        Object.defineProperty(document.documentElement, 'matches', {
            configurable: true,
            value: () => true,
        })
        const update = vi.fn()
        await expect(viewTransition(update)).resolves.toBe('yielded')
        expect(update).toHaveBeenCalledTimes(1)
        expect(start).not.toHaveBeenCalled()
    })

    it('warns when update crosses 100ms even from a zero timestamp', async () => {
        const warning = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined)
        const now = vi
            .spyOn(performance, 'now')
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(101)
        await expect(viewTransition(vi.fn())).resolves.toBe('finished')
        expect(warning).toHaveBeenCalledWith(
            expect.stringContaining('more than 100ms')
        )
        now.mockRestore()
        warning.mockRestore()
    })

    it('returns interrupted when a newer transition replaces the current one', async () => {
        const deferred: Array<{
            resolve: () => void
            transition: FakeTransition
        }> = []
        Object.defineProperty(document, 'startViewTransition', {
            configurable: true,
            value: vi.fn((callback: () => Promise<void>) => {
                const ready = Promise.resolve(callback())
                let resolve!: () => void
                const finished = new Promise<void>((done) => {
                    resolve = done
                })
                const current: FakeTransition = {
                    ready,
                    finished,
                    types: { add: vi.fn() },
                    skipTransition: vi.fn(() => resolve()),
                }
                deferred.push({ resolve, transition: current })
                return current
            }),
        })

        const first = viewTransition(vi.fn())
        const second = viewTransition(vi.fn())
        deferred[0]!.resolve()
        deferred[1]!.resolve()
        await expect(first).resolves.toBe('interrupted')
        await expect(second).resolves.toBe('finished')
    })

    it('does not let a late async handoff overwrite restored names', async () => {
        const old = document.createElement('div')
        const next = document.createElement('div')
        document.body.append(old, next)
        old.style.setProperty('view-transition-name', 'original', 'important')
        const unbind = shareElement(old, 'hero')
        let release!: () => void
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const finishes: Array<() => void> = []
        Object.defineProperty(document, 'startViewTransition', {
            configurable: true,
            value: vi.fn((callback: () => Promise<void>) => {
                const ready = Promise.resolve().then(callback)
                let finish!: () => void
                const finished = new Promise<void>((resolve) => {
                    finish = resolve
                })
                finishes.push(finish)
                return {
                    ready,
                    finished,
                    types: { add: vi.fn() },
                    skipTransition: vi.fn(() => finish()),
                }
            }),
        })

        const first = viewTransition(
            async () => {
                await gate
                shareElement(next, 'hero')
            },
            { share: ['hero'] }
        )
        await Promise.resolve()
        const second = viewTransition(() => undefined, { share: ['hero'] })
        finishes[1]!()
        release()
        await expect(first).resolves.toBe('interrupted')
        await expect(second).resolves.toBe('finished')
        expect(old.style.getPropertyValue('view-transition-name')).toBe(
            'original'
        )
        expect(old.style.getPropertyPriority('view-transition-name')).toBe(
            'important'
        )
        expect(next.style.getPropertyValue('view-transition-name')).toBe('')
        unbind()
    })

    it('propagates a thrown undefined and restores names', async () => {
        const element = document.createElement('div')
        document.body.append(element)
        const unbind = shareElement(element, 'hero')
        await expect(
            viewTransition(
                () => {
                    throw undefined
                },
                { share: ['hero'] }
            )
        ).rejects.toBeUndefined()
        expect(element.style.getPropertyValue('view-transition-name')).toBe('')
        unbind()
    })

    it('propagates an update error and restores names', async () => {
        const element = document.createElement('div')
        document.body.append(element)
        const unbind = shareElement(element, 'hero')
        const error = new Error('update failed')
        await expect(
            viewTransition(
                () => {
                    throw error
                },
                { share: ['hero'] }
            )
        ).rejects.toBe(error)
        expect(element.style.getPropertyValue('view-transition-name')).toBe('')
        unbind()
    })
})

describe('retimeViewTransition', () => {
    it('retimes only view-transition pseudo animations', () => {
        const groupUpdate = vi.fn()
        const unrelatedUpdate = vi.fn()
        Object.defineProperty(document, 'getAnimations', {
            configurable: true,
            value: () => [
                {
                    effect: {
                        pseudoElement: '::view-transition-group(ani-hero)',
                        updateTiming: groupUpdate,
                    },
                },
                {
                    effect: {
                        pseudoElement: '::view-transition-group(ani-heroine)',
                        updateTiming: unrelatedUpdate,
                    },
                },
                {
                    effect: {
                        pseudoElement: null,
                        updateTiming: unrelatedUpdate,
                    },
                },
            ],
        })
        expect(retimeViewTransition({ duration: 0.3 }, ['ani-hero'])).toBe(1)
        expect(groupUpdate).toHaveBeenCalledWith({
            duration: 300,
            easing: expect.any(String),
        })
        expect(unrelatedUpdate).not.toHaveBeenCalled()
    })
})
