// @vitest-environment jsdom

import * as a from '@freestylejs/ani-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import { createPresence } from '../presence'
import type { PresenceMotion } from '../types'

type Shape = {
    opacity: number
    translateY: number
}

const motion = {
    present: { opacity: 1, translateY: 0 },
    initial: { opacity: 0, translateY: 8 },
    enter: a.ani({
        to: { opacity: 1, translateY: 0 },
        duration: 0.2,
        timing: a.timing.linear(),
    }),
    exit: a.ani({
        to: { opacity: 0, translateY: 8 },
        duration: 0.2,
        timing: a.timing.linear(),
    }),
} satisfies PresenceMotion<Shape>

function element(): HTMLElement {
    const node = document.createElement('div')
    document.body.append(node)
    return node
}

afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
})

describe('createPresence', () => {
    it('does not write styles on mount', () => {
        const clock = createManualClock()
        const node = element()
        const presence = createPresence(node, motion, { clock: clock.clock })
        expect(node.style.length).toBe(0)
        expect(presence.phase).toBe('present')
        presence.dispose()
        expect(clock.clock.size).toBe(0)
    })

    it('enters from initial values and exits to the exit target', async () => {
        const clock = createManualClock()
        const node = element()
        const presence = createPresence(node, motion, { clock: clock.clock })

        const enter = presence.enter()
        expect(presence.phase).toBe('entering')
        clock.frames(20)
        expect(await enter).toBe('ended')
        expect(presence.phase).toBe('present')
        expect(node.style.opacity).toBe('1')

        const exit = presence.exit()
        clock.frames(20)
        expect(await exit).toBe('exited')
        expect(node.style.opacity).toBe('0')
        expect(presence.phase).toBe('exited')
        expect(clock.clock.size).toBe(0)
        presence.dispose()
    })

    it('re-enters from the current value and interrupts the exit', async () => {
        const clock = createManualClock()
        const node = element()
        const presence = createPresence(node, motion, { clock: clock.clock })

        const enter = presence.enter()
        clock.frames(20)
        await enter

        const exit = presence.exit()
        clock.frames(5)
        const reenter = presence.enter()
        expect(await exit).toBe('interrupted')
        clock.frames(20)
        expect(await reenter).toBe('ended')
        expect(node.style.opacity).toBe('1')
        expect(presence.phase).toBe('present')
        presence.dispose()
    })

    it('releases on the wall-clock watchdog', async () => {
        vi.useFakeTimers()
        const clock = createManualClock()
        const node = element()
        const presence = createPresence(node, motion, {
            clock: clock.clock,
            maxExitMs: 10,
        })

        const exit = presence.exit()
        vi.advanceTimersByTime(11)
        expect(await exit).toBe('timeout')
        expect(presence.phase).toBe('exited')
        expect(clock.clock.size).toBe(0)
        presence.dispose()
    })

    it('uses exit duration + 1s for a long finite exit by default', async () => {
        vi.useFakeTimers()
        const clock = createManualClock()
        const node = element()
        const long = {
            ...motion,
            exit: a.ani({
                to: motion.initial,
                duration: 20,
                timing: a.timing.linear(),
            }),
        } satisfies PresenceMotion<Shape>
        const presence = createPresence(node, long, { clock: clock.clock })
        const exit = presence.exit()

        vi.advanceTimersByTime(20_999)
        expect(presence.phase).toBe('exiting')
        vi.advanceTimersByTime(1)
        expect(await exit).toBe('timeout')
        expect(presence.phase).toBe('exited')
        expect(clock.clock.size).toBe(0)
        presence.dispose()
    })

    it('re-enters from the live exit value when no enter ran first', async () => {
        const clock = createManualClock()
        const node = element()
        const presence = createPresence(node, motion, { clock: clock.clock })

        const exit = presence.exit()
        clock.frames(5)
        const before = Number.parseFloat(node.style.opacity || '0')
        expect(before).toBeGreaterThan(0)
        expect(before).toBeLessThan(1)

        const enter = presence.enter()
        expect(Number.parseFloat(node.style.opacity || '0')).toBe(before)
        expect(await exit).toBe('interrupted')
        clock.frames(20)
        expect(await enter).toBe('ended')
        expect(node.style.opacity).toBe('1')
        presence.dispose()
    })

    it('ignores a late completion from an older exit', async () => {
        const clock = createManualClock()
        const node = element()
        const presence = createPresence(node, motion, { clock: clock.clock })

        const firstExit = presence.exit()
        clock.frames(2)
        const enter = presence.enter()
        clock.frames(2)
        const secondExit = presence.exit()
        clock.frames(30)

        expect(await secondExit).toBe('exited')
        expect(await firstExit).toBe('interrupted')
        expect(await enter).toBe('interrupted')
        expect(presence.phase).toBe('exited')
        expect(clock.clock.size).toBe(0)
        presence.dispose()
    })

    it('does not let a stale enter completion clear a newer entering phase', async () => {
        const clock = createManualClock()
        const node = element()
        const presence = createPresence(node, motion, { clock: clock.clock })

        const firstEnter = presence.enter()
        clock.frames(2)
        const exit = presence.exit()
        const secondEnter = presence.enter()
        expect(await firstEnter).toBe('interrupted')
        expect(await exit).toBe('interrupted')
        expect(presence.phase).toBe('entering')

        clock.frames(20)
        expect(await secondEnter).toBe('ended')
        expect(presence.phase).toBe('present')
        presence.dispose()
    })

    it('disposes idempotently and resolves exit as disposed', async () => {
        const clock = createManualClock()
        const node = element()
        const presence = createPresence(node, motion, { clock: clock.clock })
        const exit = presence.exit()
        presence.dispose()
        presence.dispose()
        expect(await exit).toBe('disposed')
        expect(clock.clock.size).toBe(0)
    })

    it('lets core reduced-motion jump complete the exit without frames', async () => {
        const clock = createManualClock({ reducedMotion: true })
        const node = element()
        const presence = createPresence(node, motion, { clock: clock.clock })
        expect(await presence.exit()).toBe('exited')
        expect(presence.phase).toBe('exited')
        expect(clock.clock.size).toBe(0)
        presence.dispose()
    })
})
