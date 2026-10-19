import { describe, expect, it } from 'vitest'
import { ManualClock } from '~/ani/core/__tests__/manual_clock'
import { ani } from '~/nodes'
import { timing } from '~/timing'
import { createStates } from '../states'
import { rafTimeline } from '../timeline'

type Loose = (...args: unknown[]) => unknown
const loose = (fn: unknown) => fn as Loose

const node = () => ani({ to: { x: 100 }, duration: 1, timing: timing.linear() })

/** A playing timeline half way through its run. */
function playing() {
    const clock = new ManualClock()
    const line = rafTimeline(node(), { clock })
    const config = { from: { x: 0 } }
    void line.play(config)
    clock.tick(0.5)
    return { clock, line, config }
}

describe('rafTimeline options', () => {
    it('rejects a clock in place of the options object', () => {
        expect(() => loose(rafTimeline)(node(), new ManualClock())).toThrow(
            /\{ clock \}/
        )
    })

    it('rejects options that are not an object', () => {
        expect(() => loose(rafTimeline)(node(), 'clock')).toThrow(TypeError)
        expect(() => loose(rafTimeline)(node(), null)).toThrow(TypeError)
    })
})

describe('removed play / reset arguments', () => {
    it('play() rejects removed config keys and leaves the run untouched', () => {
        const { line, config } = playing()
        const before = line.value

        for (const key of ['context', 'propertyResolver']) {
            expect(() =>
                line.play({ from: { x: 0 }, [key]: {} } as never)
            ).toThrow(TypeError)
        }
        expect(() => loose(line.play)({ from: { x: 0 } }, false)).toThrow(
            TypeError
        )

        expect(line.status).toBe('PLAYING')
        expect(line.config).toBe(config)
        expect(line.value).toBe(before)
    })

    it('the propertyResolver error points to bind()', () => {
        const { line } = playing()
        expect(() =>
            line.play({ from: { x: 0 }, propertyResolver: {} } as never)
        ).toThrow(/bind/)
    })

    it('drive() rejects removed config keys', () => {
        const { line } = playing()
        expect(() =>
            loose(line.drive)(() => 0, { from: { x: 0 }, context: 1 })
        ).toThrow(TypeError)
        expect(line.status).toBe('PLAYING')
    })

    it('a disposed timeline still rejects them', () => {
        const { line } = playing()
        line.dispose()
        expect(() => loose(line.play)({ from: { x: 0 } }, false)).toThrow(
            TypeError
        )
    })

    it('reset() rejects arguments and keeps the run', () => {
        const { line } = playing()
        expect(() => loose(line.reset)(false)).toThrow(TypeError)
        expect(() => loose(line.reset)(true, true)).toThrow(TypeError)
        expect(line.status).toBe('PLAYING')
        expect(line.value).not.toBeNull()
    })
})

describe('removed createStates members', () => {
    const make = (clock: ManualClock) =>
        createStates({
            initial: 'idle',
            initialValue: { x: 0 },
            states: {
                idle: node(),
                active: ani({
                    to: { x: 50 },
                    duration: 1,
                    timing: timing.linear(),
                }),
            },
            clock,
        })

    it('initialFrom names initialValue in the error', () => {
        const clock = new ManualClock()
        expect(() =>
            loose(createStates)({
                initial: 'idle',
                initialFrom: { x: 0 },
                states: { idle: node() },
                clock,
            })
        ).toThrow(/initialValue/)
    })

    it('a missing initialValue throws', () => {
        const clock = new ManualClock()
        expect(() =>
            loose(createStates)({
                initial: 'idle',
                states: { idle: node() },
                clock,
            })
        ).toThrow(/initialValue/)
    })

    it('transitionTo() rejects a third argument and changes nothing', () => {
        const clock = new ManualClock()
        const machine = make(clock)
        const timeline = machine.timeline()

        expect(() =>
            loose(machine.transitionTo)('active', undefined, false)
        ).toThrow(TypeError)
        expect(machine.state()).toBe('idle')
        expect(machine.timeline()).toBe(timeline)
        expect(clock.size).toBe(0)
    })

    it('transitionTo() rejects a removed config key and keeps the machine', () => {
        const clock = new ManualClock()
        const machine = make(clock)
        const timeline = machine.timeline()

        expect(() =>
            machine.transitionTo('active', { propertyResolver: {} } as never)
        ).toThrow(TypeError)
        expect(machine.state()).toBe('idle')
        expect(machine.timeline()).toBe(timeline)
    })

    it('transitionTo() rejects a third argument after dispose, too', () => {
        const machine = make(new ManualClock())
        machine.dispose()
        expect(() =>
            loose(machine.transitionTo)('active', undefined, true)
        ).toThrow(TypeError)
    })
})
