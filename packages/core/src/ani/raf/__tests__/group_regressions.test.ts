import { describe, expect, it } from 'vitest'
import { ManualClock } from '~/ani/core/__tests__/manual_clock'
import { ani } from '~/nodes'
import { timing } from '~/timing'
import { rafGroup } from '../group'

const linear = timing.linear()
const tree = () => ani({ to: { translateX: 100 }, duration: 1, timing: linear })

type Element = { style: Record<string, unknown> }

function element(): Element {
    return { style: {} }
}

type GroupState = {
    _atBindings: unknown[]
    _atWriters: Array<unknown>
}

function state(group: object): GroupState {
    return group as unknown as GroupState
}

describe('rafGroup binding ownership regressions', () => {
    it('keeps a later resolver binding on the resolver path after a double unbind', () => {
        const clock = new ManualClock()
        const group = rafGroup(tree(), { clock })
        const resolver = {
            translateX: (value: number) => ({
                key: 'left',
                value: `${value}px`,
            }),
        }
        const unbind = group.bindAt(0, element() as unknown as HTMLElement, {
            resolver,
        })
        unbind()
        unbind()

        const second = element()
        group.bindAt(1, second as unknown as HTMLElement, { resolver })
        group.play({ from: { translateX: 0 }, count: 2 })
        clock.tick(0.5)

        expect(second.style.left).toBe('50px')
        expect(second.style.transform).toBeUndefined()
    })

    it('releases every bindAt writer on dispose', () => {
        const clock = new ManualClock()
        const group = rafGroup(tree(), { clock })
        for (let i = 0; i < 10; i++)
            group.bindAt(i, element() as unknown as HTMLElement)
        group.play({ from: { translateX: 0 }, count: 10 })
        clock.tick(0.5)

        const internals = state(group)
        expect(
            internals._atWriters.filter((writer) => writer !== undefined)
        ).toHaveLength(10)

        group.dispose()

        expect(internals._atBindings).toHaveLength(0)
        expect(internals._atWriters).toHaveLength(0)
        expect(
            internals._atWriters.filter((writer) => writer !== undefined)
        ).toHaveLength(0)
    })

    it('drops every positional binding once for array values', () => {
        const clock = new ManualClock()
        const group = rafGroup(ani({ to: [100], duration: 1 }), { clock })
        for (let i = 0; i < 4; i++)
            group.bindAt(i, element() as unknown as HTMLElement)

        const reported: unknown[] = []
        const originalQueueMicrotask = globalThis.queueMicrotask
        globalThis.queueMicrotask = (task: () => void) => {
            try {
                task()
            } catch (error) {
                reported.push(error)
            }
        }
        try {
            group.play({ from: [0], count: 4 })
            const internals = state(group)
            expect(internals._atBindings).toHaveLength(0)
            expect(
                internals._atWriters.filter((writer) => writer !== undefined)
            ).toHaveLength(0)
            expect(reported).toHaveLength(4)

            clock.tick(0.5)
            expect(reported).toHaveLength(4)
        } finally {
            globalThis.queueMicrotask = originalQueueMicrotask
        }
    })
})
