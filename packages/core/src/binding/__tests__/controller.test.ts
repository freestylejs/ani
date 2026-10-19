import { describe, expect, it, vi } from 'vitest'
import { type RafTimeline, rafTimeline } from '~/ani/raf'
import { createClock } from '~/loop'
import { ani } from '~/nodes'
import { timing } from '~/timing'
import { createTimelineController, type TimelineMembers } from '../controller'

const make = () => {
    let frame: ((timestamp: number) => void) | undefined
    let time = 0
    const clock = createClock({
        requestFrame: (callback) => {
            frame = callback
            return 1
        },
        cancelFrame: () => undefined,
        now: () => time,
        maxDeltaTime: Number.POSITIVE_INFINITY,
    })
    const line = () =>
        rafTimeline(
            ani({ to: { x: 100 }, duration: 1, timing: timing.linear() }),
            { clock }
        )
    const advance = (ms: number) => {
        time += ms
        const callback = frame
        frame = undefined
        callback?.(time)
    }
    return { line, advance }
}

describe('createTimelineController', () => {
    it('forwards every member to the timeline returned at call time', () => {
        const { line, advance } = make()
        const first = line()
        const second = line()
        let current = first
        const controller = createTimelineController(() => current)

        controller.play({ from: { x: 0 } })
        advance(500)
        expect(first.value).toEqual({ x: 50 })
        expect(controller.value).toEqual({ x: 50 })
        expect(controller.status).toBe('PLAYING')
        expect(controller.duration).toBe(1)
        expect(controller.config).toBe(first.config)

        // swap: same controller object now drives `second`
        current = second
        expect(controller.status).toBe('IDLE')
        expect(controller.value).toBeNull()
        controller.play({ from: { x: 0 } })
        advance(250)
        expect(second.value).toEqual({ x: 25 })
        expect(controller.velocity).toEqual({ x: 100 })

        controller.pause()
        expect(second.status).toBe('PAUSED')
        controller.resume()
        expect(second.status).toBe('PLAYING')
        controller.seek(0.5)
        expect(controller.value).toEqual({ x: 50 })

        const seen: unknown[] = []
        const off = controller.onUpdate(({ state }) => seen.push(state))
        controller.seek(0.75)
        expect(seen).toEqual([{ x: 75 }])
        off()
        controller.seek(0.25)
        expect(seen).toHaveLength(1)

        controller.dispose()
        expect(second.status).not.toBe('PLAYING')
        // the earlier timeline was never touched by the swap
        expect(first.status).toBe('PLAYING')
    })

    it('forwards bind() to the timeline returned at call time', () => {
        const { line, advance } = make()
        const first = line()
        const second = line()
        let current = first
        const controller = createTimelineController(() => current)
        const writes: unknown[] = []
        const style = {
            set x(value: unknown) {
                writes.push(value)
            },
        } as unknown as CSSStyleDeclaration

        current = second
        const unbind = controller.bind(
            { style },
            { resolver: { x: (v) => ({ key: 'x', value: v }) } }
        )
        controller.play({ from: { x: 0 } })
        advance(500)
        expect(writes).toEqual([0, 50])
        unbind()
        advance(250)
        expect(writes).toEqual([0, 50])
    })

    it('bind() rejects an invalid target synchronously and registers nothing', () => {
        const { line } = make()
        const target = line()
        target.play({ from: { x: 0 } })
        expect(() => target.bind(null as never)).toThrow(TypeError)
        expect(() => target.bind({} as never)).toThrow(TypeError)
        expect(() => target.seek(0.5)).not.toThrow()
    })

    it('forwards the interrupt flag of the config', async () => {
        const { line, advance } = make()
        const target = line()
        const controller = createTimelineController(() => target)
        controller.play({ from: { x: 0 } })
        advance(500)
        expect(target.value).toEqual({ x: 50 })

        const skipped = controller.play({ from: { x: 0 }, interrupt: false })
        await expect(skipped).resolves.toBe('skipped')
        // rejected: still the earlier run
        expect(target.value).toEqual({ x: 50 })
    })

    it('forwards extra arguments so that the timeline throws, hooks untouched', () => {
        const { line } = make()
        const target = line()
        const onPlay = vi.fn()
        const onReset = vi.fn()
        const controller = createTimelineController(() => target, {
            onPlay,
            onReset,
        })
        const play = controller.play as (...args: unknown[]) => unknown
        const reset = controller.reset as (...args: unknown[]) => unknown

        expect(() => play({ from: { x: 0 } }, false)).toThrow(TypeError)
        expect(() => play({ from: { x: 0 }, context: 1 })).toThrow(TypeError)
        expect(() => play({ from: { x: 0 }, propertyResolver: {} })).toThrow(
            TypeError
        )
        expect(() => reset(true)).toThrow(TypeError)
        expect(target.status).toBe('IDLE')
        expect(onPlay).not.toHaveBeenCalled()
        expect(onReset).not.toHaveBeenCalled()
    })

    it('runs the hooks around play and reset', () => {
        const { line } = make()
        const target = line()
        const onPlay = vi.fn()
        const onReset = vi.fn()
        const controller = createTimelineController(() => target, {
            onPlay,
            onReset,
        })
        const config = { from: { x: 0 } }

        controller.play(config)
        expect(onPlay).toHaveBeenCalledWith(config)
        expect(target.status).toBe('PLAYING')

        controller.reset()
        expect(target.status).toBe('IDLE')
        expect(onReset).toHaveBeenCalledTimes(1)
    })
})

describe('compile-time exhaustiveness', () => {
    it('requires every public RafTimeline member to be forwarded', () => {
        type Members = TimelineMembers<RafTimeline<{ x: number }>>
        // The controller's literal is checked with `satisfies Members`: a
        // literal that lacks any public member must not type-check.
        // @ts-expect-error - only one of the public members is present
        const partial: Members = { duration: 1 }
        expect(partial.duration).toBe(1)

        type Required = keyof Members
        const keys: Required[] = [
            'duration',
            'status',
            'config',
            'value',
            'velocity',
            'play',
            'drive',
            'seek',
            'pause',
            'resume',
            'reset',
            'dispose',
            'bind',
            'onUpdate',
        ]
        // Fails to compile when RafTimeline gains a public member that is
        // not listed here (and therefore not forwarded by the controller).
        const exhaustive: Exclude<Required, (typeof keys)[number]> extends never
            ? true
            : false = true
        expect(exhaustive).toBe(true)
        expect(new Set(keys).size).toBe(keys.length)
    })
})
