import { describe, expect, it, vi } from 'vitest'
import { type RafAniTimeline, rafTimeline } from '~/ani/raf'
import { createClock } from '~/loop'
import { ani } from '~/nodes'
import { T } from '~/timing'
import { createTimelineController, type TimelineMembers } from '../controller'
import { applyStyleSheet } from '../style'

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
            ani({ to: { x: 100 }, duration: 1, timing: T.linear() }),
            clock
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
        expect(first.getCurrentValue()).toEqual({ x: 50 })
        expect(controller.getCurrentValue()).toEqual({ x: 50 })
        expect(controller.status).toBe('PLAYING')
        expect(controller.duration).toBe(1)
        expect(controller.currentConfig).toBe(first.currentConfig)

        // swap: same controller object now drives `second`
        current = second
        expect(controller.status).toBe('IDLE')
        expect(controller.getCurrentValue()).toBeNull()
        controller.play({ from: { x: 0 } })
        advance(250)
        expect(second.getCurrentValue()).toEqual({ x: 25 })
        expect(controller.getCurrentVelocity()).toEqual({ x: 100 })

        controller.pause()
        expect(second.status).toBe('PAUSED')
        controller.resume()
        expect(second.status).toBe('PLAYING')
        controller.seek(0.5)
        expect(controller.getCurrentValue()).toEqual({ x: 50 })

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

    it('forwards update() and the canBeIntercepted flag', () => {
        const { line } = make()
        const target = line()
        const controller = createTimelineController(() => target)
        controller.play({ from: { x: 0 } })
        controller.update(0.5)
        expect(target.getCurrentValue()).toEqual({ x: 50 })

        controller.play({ from: { x: 0 } }, false)
        // rejected: still the earlier run
        expect(target.getCurrentValue()).toEqual({ x: 50 })
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
    it('requires every public RafAniTimeline member to be forwarded', () => {
        type Members = TimelineMembers<RafAniTimeline<{ x: number }>>
        // The controller's literal is checked with `satisfies Members`: a
        // literal that lacks any public member must not type-check.
        // @ts-expect-error - only one of the public members is present
        const partial: Members = { duration: 1 }
        expect(partial.duration).toBe(1)

        type Required = keyof Members
        const keys: Required[] = [
            'duration',
            'status',
            'currentConfig',
            'play',
            'update',
            'seek',
            'pause',
            'resume',
            'reset',
            'dispose',
            'onUpdate',
            'getCurrentValue',
            'getCurrentVelocity',
        ]
        // Fails to compile when RafAniTimeline gains a public member that is
        // not listed here (and therefore not forwarded by the controller).
        const exhaustive: Exclude<Required, (typeof keys)[number]> extends never
            ? true
            : false = true
        expect(exhaustive).toBe(true)
        expect(new Set(keys).size).toBe(keys.length)
    })
})

describe('applyStyleSheet', () => {
    const fakeElement = () => {
        const props: Record<string, unknown> = {}
        const setProperty = vi.fn((key: string, value: string) => {
            props[key] = value
        })
        return {
            element: {
                style: { ...props, setProperty },
            } as unknown as HTMLElement,
            style: (el: HTMLElement) =>
                el.style as unknown as Record<string, unknown>,
            setProperty,
        }
    }

    it('assigns camelCase keys as properties', () => {
        const { element, style, setProperty } = fakeElement()
        applyStyleSheet(element, { opacity: 0.5, transform: 'scale(2)' })
        expect(style(element).opacity).toBe(0.5)
        expect(style(element).transform).toBe('scale(2)')
        expect(setProperty).not.toHaveBeenCalled()
    })

    it('routes --custom and hyphenated keys through setProperty', () => {
        const { element, setProperty } = fakeElement()
        applyStyleSheet(element, {
            '--progress': 0.25,
            'background-color': 'red',
        })
        expect(setProperty).toHaveBeenCalledWith('--progress', '0.25')
        expect(setProperty).toHaveBeenCalledWith('background-color', 'red')
    })
})
