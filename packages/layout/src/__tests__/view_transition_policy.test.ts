// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    retimeViewTransition,
    shareElement,
    viewTransition,
} from '../view_transition'

let start: ReturnType<typeof vi.fn>
let skip: ReturnType<typeof vi.fn>
let updateTiming: ReturnType<typeof vi.fn>
let animations: ReturnType<typeof vi.fn>

beforeEach(() => {
    skip = vi.fn()
    updateTiming = vi.fn()
    animations = vi.fn(() => [
        {
            effect: {
                pseudoElement: '::view-transition-group(root)',
                updateTiming,
            },
        },
    ])
    start = vi.fn((update: () => Promise<void>) => ({
        ready: Promise.resolve().then(update),
        finished: Promise.resolve(),
        skipTransition: skip,
    }))
    Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: start,
    })
    Object.defineProperty(document, 'getAnimations', {
        configurable: true,
        value: animations,
    })
    vi.spyOn(document.documentElement, 'matches').mockReturnValue(false)
})

afterEach(() => {
    delete (document as unknown as { startViewTransition?: unknown })
        .startViewTransition
    delete (document as unknown as { getAnimations?: unknown }).getAnimations
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
})

describe('View Transition motion policy', () => {
    for (const maxDuration of [0.05, 0.2]) {
        it.each([
            undefined,
            { duration: 0.4 },
        ])(`caps every native effect at ${maxDuration}s with motion %j`, async (motion) => {
            const update = vi.fn()
            await expect(
                viewTransition(update, {
                    clock: { reducedMotion: true },
                    reducedMotion: { maxDuration },
                    ...(motion && { motion }),
                })
            ).resolves.toBe('finished')
            expect(update).toHaveBeenCalledTimes(1)
            expect(updateTiming).toHaveBeenCalledWith(
                expect.objectContaining({
                    duration: maxDuration * 1000,
                    delay: 0,
                    endDelay: 0,
                    iterations: 1,
                })
            )
        })
    }

    it('zero reduced cap runs the update exactly once without starting a transition', async () => {
        const update = vi.fn()
        await expect(
            viewTransition(update, {
                clock: { reducedMotion: true },
                reducedMotion: { maxDuration: 0 },
            })
        ).resolves.toBe('reduced')
        expect(update).toHaveBeenCalledTimes(1)
        expect(start).not.toHaveBeenCalled()
        expect(animations).not.toHaveBeenCalled()
    })

    it('does not apply a configured cap when reduced motion is off', async () => {
        await viewTransition(() => undefined, {
            clock: { reducedMotion: false },
            reducedMotion: { maxDuration: 0.05 },
            motion: { duration: 0.4 },
        })
        expect(updateTiming).toHaveBeenCalledWith(
            expect.objectContaining({ duration: 400 })
        )
    })

    it.each([
        { type: 'spring', duration: 0.4, bounce: 0.3 },
        { duration: -1 },
        { duration: Number.NaN },
        { duration: Number.POSITIVE_INFINITY },
        { delay: 0.1 },
        { bounce: 0.2 },
    ])('rejects unsupported/invalid motion before side effects: %j', async (motion) => {
        const update = vi.fn()
        await expect(
            viewTransition(update, { motion: motion as never })
        ).rejects.toMatchObject({
            code: 'ANI_INVALID_OPTIONS',
        })
        expect(update).not.toHaveBeenCalled()
        expect(start).not.toHaveBeenCalled()
        expect(() => retimeViewTransition(motion as never)).toThrow()
        expect(animations).not.toHaveBeenCalled()
    })

    it.each([
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
    ])('validates reduced cap before the unsupported-API fallback (%s)', async (maxDuration) => {
        delete (document as unknown as { startViewTransition?: unknown })
            .startViewTransition
        const update = vi.fn()
        await expect(
            viewTransition(update, {
                reducedMotion: { maxDuration },
            })
        ).rejects.toMatchObject({ code: 'ANI_INVALID_OPTIONS' })
        expect(update).not.toHaveBeenCalled()
    })

    it('caps root effects as well as shared names, leaving unrelated animations alone', async () => {
        const el = document.createElement('div')
        document.body.append(el)
        const unshare = shareElement(el, 'hero')
        const sharedTiming = vi.fn()
        const unrelated = vi.fn()
        animations.mockImplementation(() => [
            {
                effect: {
                    pseudoElement: '::view-transition-group(root)',
                    updateTiming,
                },
            },
            {
                effect: {
                    pseudoElement: `::view-transition-new(${el.style.getPropertyValue('view-transition-name')})`,
                    updateTiming: sharedTiming,
                },
            },
            { effect: { pseudoElement: null, updateTiming: unrelated } },
        ])
        try {
            await viewTransition(() => undefined, {
                share: ['hero'],
                clock: { reducedMotion: true },
                reducedMotion: { maxDuration: 0.05 },
                motion: { duration: 0.4 },
            })
            expect(updateTiming).toHaveBeenCalledWith(
                expect.objectContaining({ duration: 50 })
            )
            expect(sharedTiming).toHaveBeenCalledWith(
                expect.objectContaining({ duration: 50 })
            )
            expect(unrelated).not.toHaveBeenCalled()
            expect(el.style.getPropertyValue('view-transition-name')).toBe('')
        } finally {
            unshare()
        }
    })

    it.each([
        'empty',
        'unrelated',
    ] as const)('skips a reduced transition when observable native effects are %s', async (kind) => {
        const el = document.createElement('div')
        document.body.append(el)
        el.style.setProperty('view-transition-name', 'authored', 'important')
        const unshare = shareElement(el, 'hero')
        animations.mockImplementation(() =>
            kind === 'empty'
                ? []
                : [{ effect: { pseudoElement: '::before', updateTiming } }]
        )
        const update = vi.fn()
        try {
            await expect(
                viewTransition(update, {
                    share: ['hero'],
                    clock: { reducedMotion: true },
                    reducedMotion: { maxDuration: 0.05 },
                })
            ).resolves.toBe('reduced')
            expect(update).toHaveBeenCalledTimes(1)
            expect(start).toHaveBeenCalledTimes(1)
            expect(skip).toHaveBeenCalledTimes(1)
            expect(updateTiming).not.toHaveBeenCalled()
            expect(el.style.getPropertyValue('view-transition-name')).toBe(
                'authored'
            )
            expect(el.style.getPropertyPriority('view-transition-name')).toBe(
                'important'
            )
        } finally {
            unshare()
        }
    })

    it('keeps the ordinary zero-effect retiming fallback without an accessibility cap', () => {
        animations.mockReturnValue([])
        expect(retimeViewTransition({ duration: 0.4 })).toBe(0)
        expect(skip).not.toHaveBeenCalled()
    })

    it('skips rather than violating a reduced cap when an effect cannot be retimed', async () => {
        updateTiming.mockImplementation(() => {
            throw new Error('unsupported effect')
        })
        const update = vi.fn()
        await expect(
            viewTransition(update, {
                clock: { reducedMotion: true },
                reducedMotion: { maxDuration: 0.05 },
            })
        ).resolves.toBe('reduced')
        expect(skip).toHaveBeenCalledTimes(1)
        expect(update).toHaveBeenCalledTimes(1)
    })

    it('restores shared names when the native skip operation throws', async () => {
        const el = document.createElement('div')
        document.body.append(el)
        el.style.setProperty('view-transition-name', 'authored', 'important')
        const unshare = shareElement(el, 'hero')
        updateTiming.mockImplementation(() => {
            throw new Error('cannot retime')
        })
        skip.mockImplementation(() => {
            throw new Error('cannot skip')
        })
        const update = vi.fn()
        try {
            await expect(
                viewTransition(update, {
                    share: ['hero'],
                    clock: { reducedMotion: true },
                    reducedMotion: { maxDuration: 0.05 },
                })
            ).rejects.toThrow('cannot skip')
            expect(update).toHaveBeenCalledTimes(1)
            expect(el.style.getPropertyValue('view-transition-name')).toBe(
                'authored'
            )
            expect(el.style.getPropertyPriority('view-transition-name')).toBe(
                'important'
            )
        } finally {
            unshare()
        }
    })

    it('a zero-cap invocation interrupts its own older transition', async () => {
        let finish!: () => void
        const finished = new Promise<void>((resolve) => {
            finish = resolve
        })
        const oldSkip = vi.fn(() => finish())
        start.mockImplementation((update: () => Promise<void>) => ({
            ready: Promise.resolve().then(update),
            finished,
            skipTransition: oldSkip,
        }))
        const firstUpdate = vi.fn()
        const secondUpdate = vi.fn()
        const first = viewTransition(firstUpdate)
        try {
            await expect(
                viewTransition(secondUpdate, {
                    clock: { reducedMotion: true },
                    reducedMotion: { maxDuration: 0 },
                })
            ).resolves.toBe('reduced')
            expect(oldSkip).toHaveBeenCalledTimes(1)
            await expect(first).resolves.toBe('interrupted')
            expect(firstUpdate).toHaveBeenCalledTimes(1)
            expect(secondUpdate).toHaveBeenCalledTimes(1)
            expect(start).toHaveBeenCalledTimes(1)
        } finally {
            finish()
            await first
        }
    })

    it('does not retime after ready rejects, and still updates exactly once', async () => {
        start.mockImplementation(() => ({
            ready: Promise.reject(new Error('skipped')),
            finished: Promise.resolve(),
            skipTransition: skip,
        }))
        const update = vi.fn()
        await expect(
            viewTransition(update, {
                clock: { reducedMotion: true },
                reducedMotion: { maxDuration: 0.05 },
            })
        ).resolves.toBe('skipped')
        expect(update).toHaveBeenCalledTimes(1)
        expect(animations).not.toHaveBeenCalled()
    })
})
