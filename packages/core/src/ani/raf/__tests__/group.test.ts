import { describe, expect, it } from 'vitest'
import { ManualClock } from '~/ani/core/__tests__/manual_clock'
import { ani } from '~/nodes'
import { T } from '~/timing'
import { rafGroup } from '../group'

const linear = T.linear()
const tree = (duration = 1) => ani({ to: { x: 100 }, duration, timing: linear })

function xs(group: ReturnType<typeof rafGroup<{ x: number }>>): number[] {
    const out: number[] = []
    for (let i = 0; i < group.count; i++) out.push(group.valueAt(i)!.x)
    return out
}

describe('rafGroup', () => {
    it('rejects an invalid stagger number when created', () => {
        const clock = new ManualClock()
        expect(() => rafGroup(tree(), { clock, stagger: -1 })).toThrow(
            RangeError
        )
        expect(() => rafGroup(tree(), { clock, stagger: Number.NaN })).toThrow(
            RangeError
        )
    })

    it('throws a TypeError synchronously for an element without a style', () => {
        const clock = new ManualClock()
        const group = rafGroup(tree(), { clock })
        expect(() =>
            group.bind([{} as unknown as { style: CSSStyleDeclaration }])
        ).toThrow(TypeError)
    })

    it('validates velocity and from shapes without touching the group', () => {
        const clock = new ManualClock()
        const group = rafGroup(tree(), { clock })
        expect(() =>
            group.play({ from: { x: 0 }, count: 2, velocity: [1] as never })
        ).toThrow(TypeError)
        expect(() =>
            group.play({
                from: (i) => (i === 0 ? { x: 0 } : { y: 0 }) as never,
                count: 2,
            })
        ).toThrow(TypeError)
        expect(group.status).toBe('IDLE')
        expect(clock.size).toBe(0)
    })

    it('applies the target of a zero-length plan at the first frame', () => {
        const clock = new ManualClock()
        const group = rafGroup(tree(0), { clock })
        const results: string[] = []
        group.play({ from: { x: 0 }, count: 2 }).then((r) => results.push(r))
        clock.tick(0.016)
        expect(xs(group)).toEqual([100, 100])
        expect(group.status).toBe('ENDED')
    })

    it('ends early when every target is a settled spring', () => {
        const clock = new ManualClock()
        const group = rafGroup(
            ani({
                to: { x: 100 },
                duration: 30,
                timing: T.dynamicSpring({ m: 1, k: 170, c: 26 }),
            }),
            { clock, stagger: 0.1 }
        )
        group.play({ from: { x: 0 }, count: 3 })
        clock.run(600, 1 / 60)
        expect(group.status).toBe('ENDED')
        expect(xs(group)).toEqual([100, 100, 100])
        expect(clock.size).toBe(0)
    })

    it('applies keyframes overrides to the shared plan', () => {
        const clock = new ManualClock()
        const group = rafGroup(tree(), { clock })
        group.play({ from: { x: 0 }, count: 2, keyframes: [{ x: 50 }] })
        clock.tick(1)
        expect(xs(group)).toEqual([50, 50])
    })

    it('holds the start for delay seconds, then runs', () => {
        const clock = new ManualClock()
        const group = rafGroup(tree(), { clock })
        group.play({ from: { x: 0 }, count: 2, delay: 0.5 })
        clock.tick(0.25)
        expect(xs(group)).toEqual([0, 0])
        clock.tick(0.5)
        expect(xs(group)[0]).toBeCloseTo(25, 9)
    })

    it('does not inherit velocity from targets that already finished', () => {
        const clock = new ManualClock()
        const spring = T.dynamicSpring({ m: 1, k: 100, c: 10 })
        const node = ani({ to: { x: 800 }, duration: 2, timing: spring })
        const group = rafGroup(node, { clock, stagger: 0.5 })
        group.play({ from: { x: 0 }, count: 2 })
        clock.run(10, 1 / 60)
        // target 1 has not started: it must start from rest
        group.play({ from: { x: 5 }, count: 2 })
        clock.tick(1 / 60)
        const second = group.valueAt(1)!.x
        const moved = group.valueAt(0)!.x
        expect(moved).toBeGreaterThan(second)
    })

    it('settles every promise once across interrupt, reset and dispose', async () => {
        const clock = new ManualClock()
        const group = rafGroup(tree(), { clock })
        const results: string[] = []
        const track = (p: Promise<string>) => p.then((r) => results.push(r))
        track(group.play({ from: { x: 0 }, count: 1 }))
        track(group.play({ from: { x: 0 }, count: 1 }))
        group.reset()
        track(group.play({ from: { x: 0 }, count: 1 }))
        group.dispose()
        track(group.play({ from: { x: 0 }, count: 1 }))
        await Promise.resolve()
        await Promise.resolve()
        expect(results).toEqual([
            'interrupted',
            'reset',
            'disposed',
            'disposed',
        ])
    })

    it('returns a no-op unbind when bindAt is called on a disposed group', () => {
        const clock = new ManualClock()
        const group = rafGroup(tree(), { clock })
        group.dispose()
        const el = { style: {} as CSSStyleDeclaration }
        const unbind = group.bindAt(0, el)
        expect(typeof unbind).toBe('function')
        expect(() => unbind()).not.toThrow()
    })

    it('supports multiple bindAt targets on the same index', () => {
        const clock = new ManualClock()
        const node = ani({
            to: { translateX: 100 },
            duration: 1,
            timing: linear,
        })
        const group = rafGroup(node, { clock })
        const el1 = { style: {} as Record<string, unknown> }
        const el2 = { style: {} as Record<string, unknown> }
        const unbind1 = group.bindAt(0, el1 as unknown as HTMLElement)
        const unbind2 = group.bindAt(0, el2 as unknown as HTMLElement)
        group.play({ from: { translateX: 0 }, count: 1 })
        clock.tick(0.5)
        expect(el1.style.transform).toBe('translateX(50px)')
        expect(el2.style.transform).toBe('translateX(50px)')
        unbind1()
        clock.tick(0.5)
        expect(el1.style.transform).toBe('translateX(50px)')
        expect(el2.style.transform).toBe('translateX(100px)')
        unbind2()
    })

    it('drops positional array bindings and reports error via microtask in bindAt', () => {
        const clock = new ManualClock()
        const arrayGroup = rafGroup(ani({ to: [100], duration: 1 }), { clock })
        const el = { style: {} as Record<string, unknown> }
        const reported: unknown[] = []
        const originalQueueMicrotask = globalThis.queueMicrotask
        globalThis.queueMicrotask = (task: () => void) => {
            try {
                task()
            } catch (err) {
                reported.push(err)
            }
        }
        try {
            arrayGroup.bindAt(0, el as unknown as HTMLElement)
            arrayGroup.play({ from: [0], count: 1 })
            expect(reported.length).toBeGreaterThan(0)
            expect(reported[0]).toBeInstanceOf(TypeError)
        } finally {
            globalThis.queueMicrotask = originalQueueMicrotask
        }
    })

    it('scales with active work when targets are bound individually with bindAt', () => {
        const clock = new ManualClock()
        const node = ani({
            to: { translateX: 100 },
            duration: 1,
            timing: linear,
        })
        const group = rafGroup(node, { clock, stagger: 1 })
        const writes: number[] = []
        for (let i = 0; i < 50; i++) {
            const index = i
            const el = {
                style: {
                    setProperty() {
                        // no-op
                    },
                    set transform(_val: string) {
                        writes.push(index)
                    },
                } as unknown as CSSStyleDeclaration,
            }
            group.bindAt(i, el)
        }
        group.play({ from: { translateX: 0 }, count: 50 })
        writes.length = 0
        clock.tick(0.5)
        expect(writes).toEqual([0])
    })
})
