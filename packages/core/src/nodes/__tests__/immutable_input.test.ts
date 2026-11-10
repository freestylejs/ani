import { afterEach, describe, expect, it } from 'vitest'
import * as a from '../../index'
import { createManualClock } from '../../testing'

const cleanup: Array<() => void> = []
afterEach(() => {
    for (const stop of cleanup.splice(0).reverse()) stop()
})

describe('animation descriptions own their input containers', () => {
    it('snapshots and freezes a numeric record, without freezing the caller', () => {
        const to: Record<string, number> = { x: 100 }
        const node = a.ani({ to, duration: 1 })
        to.x = 900
        to.y = 20
        expect(node.props.to).toEqual({ x: 100 })
        expect(node.props.to).not.toBe(to)
        expect(Object.isFrozen(to)).toBe(false)
        expect(Object.isFrozen(node.props.to)).toBe(true)
        expect(Object.isFrozen(node.props)).toBe(true)
    })

    it('snapshots positional numeric arrays without changing their shape', () => {
        const to = [10, 20]
        const node = a.ani({ to, duration: 1 })
        to[0] = 99
        to.push(30)
        expect(node.props.to).toEqual([10, 20])
        expect(Array.isArray(node.props.to)).toBe(true)
        expect(Object.isFrozen(node.props.to)).toBe(true)
        expect(Object.isFrozen(to)).toBe(false)
    })

    it('keeps the sequence plan consistent when the original children array changes', () => {
        const first = a.ani({ to: { x: 100 }, duration: 1 })
        const children = [first]
        const root = a.sequence(children)
        children.push(a.ani({ to: { x: 900 }, duration: 2 }))
        const plan: Parameters<typeof root.construct>[0] = []
        root.construct(plan, 0)
        expect(root.children).toEqual([first])
        expect(root.duration).toBe(1)
        expect(plan).toHaveLength(1)
        expect(Object.isFrozen(root.children)).toBe(true)
        expect(Object.isFrozen(children)).toBe(false)
    })

    it('owns nested timing-rewritten arrays but still shares immutable leaves', () => {
        const first = a.ani({ to: { x: 100 }, duration: 1 })
        const children = [first]
        const inner = a.sequence(children)
        const root = a.sequence([inner], { timing: a.timing.linear() })
        children.push(a.ani({ to: { x: 200 }, duration: 1 }))
        expect(inner.children).toEqual([first])
        expect(Object.isFrozen(inner.children)).toBe(true)
        const adjusted = root.children[0]!
        expect(adjusted.children).toHaveLength(1)
        expect(Object.isFrozen(adjusted.children)).toBe(true)
        expect(first.props.timing).toBeUndefined()
        const unchanged = a.sequence([inner])
        expect(unchanged.children[0]).toBe(inner)
    })

    it('reused RAF execution remains stable before and after caller mutation', async () => {
        const mc = createManualClock()
        const to = { x: 100 }
        const children = [a.ani({ to, duration: 1, timing: a.timing.linear() })]
        const root = a.sequence(children)
        const line = a.rafTimeline(root, { clock: mc.clock })
        cleanup.push(
            () => mc.clock.dispose(),
            () => line.dispose()
        )
        const first = line.play({ from: { x: 0 } })
        line.seek(0.5)
        expect(line.value?.x).toBeCloseTo(50)
        to.x = 900
        children.push(a.ani({ to: { x: 1000 }, duration: 1 }))
        line.seek(1)
        expect(line.value?.x).toBe(100)
        const second = line.play({ from: { x: 0 } })
        line.seek(0.5)
        expect(line.value?.x).toBeCloseTo(50)
        expect(line.duration).toBe(1)
        const fresh = a.rafTimeline(root, { clock: mc.clock })
        cleanup.push(() => fresh.dispose())
        void fresh.play({ from: { x: 0 } })
        fresh.seek(1)
        expect(fresh.value?.x).toBe(100)
        expect(fresh.duration).toBe(1)
        line.dispose()
        await first
        await second
    })
})
