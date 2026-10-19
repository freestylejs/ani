import { describe, expect, it } from 'vitest'
import * as a from '../../index'
import { createManualClock } from '../../testing'

type Loose = (...args: unknown[]) => unknown
const loose = (fn: unknown) => fn as Loose

const linear = a.timing.linear()
const node = () => a.ani({ to: { x: 1 }, duration: 1, timing: linear })

/**
 * Un-migrated JavaScript must fail loudly, never be misread: every 1.x call
 * shape the codemod rewrites throws a TypeError naming the V2 form.
 */
describe('MIG3b: 1.x call shapes throw', () => {
    it('L1: positional node modifiers', () => {
        expect(() => loose(a.sequence)([node()], linear)).toThrow(TypeError)
        expect(() => loose(a.parallel)([node()], linear)).toThrow(TypeError)
        expect(() => loose(a.sequence)([node()], undefined, 'id')).toThrow(
            TypeError
        )
        expect(() => loose(a.loop)(node(), 2, linear)).toThrow(TypeError)
        expect(() => loose(a.stagger)([node()], 0.1)).toThrow(TypeError)
        expect(() => loose(a.ani)({ to: { x: 1 }, duration: 1 }, 'id')).toThrow(
            TypeError
        )
        expect(() => loose(a.delay)(1, 'id')).toThrow(TypeError)
    })

    it('L2: the V2 forms of the same calls work', () => {
        expect(() =>
            a.sequence([node()], { timing: linear, id: 's' })
        ).not.toThrow()
        expect(() => a.parallel([node()], { timing: linear })).not.toThrow()
        expect(() => a.loop(node(), 2, { timing: linear })).not.toThrow()
        expect(() => a.stagger([node()], { offset: 0.1 })).not.toThrow()
        expect(() =>
            a.ani({ to: { x: 1 }, duration: 1, id: 'n' })
        ).not.toThrow()
        expect(() => a.delay(1, { id: 'd' })).not.toThrow()
    })

    it('L3: a clock in place of the options object', () => {
        const m = createManualClock()
        expect(() => loose(a.rafTimeline)(node(), m.clock)).toThrow(TypeError)
        expect(() =>
            loose(a.rafTimeline)(node(), { clock: m.clock })
        ).not.toThrow()
    })

    it('L4: extra play / reset / transitionTo arguments, 1.x config keys', () => {
        const m = createManualClock()
        const line = a.rafTimeline(node(), { clock: m.clock })
        expect(() =>
            loose(line.play.bind(line))({ from: { x: 0 } }, false)
        ).toThrow(TypeError)
        expect(line.status).toBe('IDLE')
        for (const key of ['context', 'propertyResolver']) {
            expect(
                () => line.play({ from: { x: 0 }, [key]: {} } as never),
                key
            ).toThrow(TypeError)
        }
        expect(line.status).toBe('IDLE')
        expect(() => loose(line.reset.bind(line))(true)).toThrow(TypeError)

        const machine = a.createStates({
            initial: 'idle',
            initialValue: { x: 0 },
            states: { idle: node(), active: node() },
            clock: m.clock,
        })
        expect(() =>
            loose(machine.transitionTo.bind(machine))('active', {}, false)
        ).toThrow(TypeError)
        expect(machine.state()).toBe('idle')
        line.dispose()
        machine.dispose()
    })

    it('L5: createStates({ initialFrom })', () => {
        const m = createManualClock()
        expect(() =>
            loose(a.createStates)({
                initial: 'idle',
                initialFrom: { x: 0 },
                states: { idle: node() },
                clock: m.clock,
            })
        ).toThrow(TypeError)
    })
})
