import { describe, expect, it } from 'vitest'
import { ManualClock } from '~/ani/core/__tests__/manual_clock'
import type { ExecutionPlan, Groupable } from '~/ani/core/interface/core_types'
import { rafTimeline } from '~/ani/raf/timeline'
import { compileToKeyframes } from '~/ani/waapi/compiler'
import { ani, sequence } from '~/nodes'
import { timing } from '~/timing'

// Found by the A4 property tests (seed 10764340): a zero-length segment makes
// the value jump; the compiled keyframes ramped across the jump instead.

const planOf = (node: { construct: (plan: any, start: number) => void }) => {
    const plan: ExecutionPlan<Groupable> = []
    node.construct(plan, 0)
    return plan
}

/**
 * Web Animations semantics for linear keyframes: the value at `offset` is
 * interpolated between the last keyframe at or before it and the first one
 * after it; with several keyframes at the same offset, the last one applies
 * from that offset on (the earlier ones are the left-hand limit).
 */
function sample(
    keyframes: ReadonlyArray<Record<string, unknown>>,
    offset: number,
    key: string
): number {
    let lo = 0
    for (let i = 0; i < keyframes.length; i++) {
        if ((keyframes[i]!.offset as number) <= offset) lo = i
    }
    const a = keyframes[lo]!
    const b = keyframes[lo + 1]
    const va = Number.parseFloat(String(a[key]))
    if (!b) return va
    const oa = a.offset as number
    const ob = b.offset as number
    if (ob === oa) return va
    const vb = Number.parseFloat(String(b[key]))
    return va + ((vb - va) * (offset - oa)) / (ob - oa)
}

function agree(
    node: Parameters<typeof rafTimeline>[0],
    from: { y: number },
    times: number[]
) {
    const plan = planOf(node)
    const duration = Math.max(...plan.map((s) => s.endTime))
    const keyframes = compileToKeyframes(plan, from)
    for (const k of keyframes) {
        expect(
            k.easing === undefined || k.easing === 'linear',
            `easing ${k.easing}`
        ).toBe(true)
    }
    const line = rafTimeline(node, { clock: new ManualClock() })
    line.play({ from })
    for (const t of times) {
        line.seek(t)
        const raf = line.value!.y!
        const waapi = sample(keyframes, t / duration, 'y')
        expect(
            Math.abs(waapi - raf),
            `t=${t} raf=${raf} waapi=${waapi}`
        ).toBeLessThanOrEqual(1e-6)
    }
    return keyframes
}

describe('FX2: zero-length segments compile to a jump', () => {
    it('A1: a trailing zero-length segment', () => {
        const node = sequence([
            ani({ to: { y: 100 }, duration: 1, timing: timing.linear() }),
            ani({ to: { y: 0 }, duration: 0, timing: timing.linear() }),
        ])
        const keyframes = agree(node, { y: 0 }, [0, 0.25, 0.5, 0.999])
        const last = keyframes[keyframes.length - 1]!
        expect(last.offset).toBe(1)
        expect(Number.parseFloat(String(last.y))).toBe(0)
    })

    it('A2: a zero-length segment in the middle', () => {
        const node = sequence([
            ani({ to: { y: 100 }, duration: 1, timing: timing.linear() }),
            ani({ to: { y: 0 }, duration: 0, timing: timing.linear() }),
            ani({ to: { y: 50 }, duration: 1, timing: timing.linear() }),
        ])
        agree(node, { y: 0 }, [0.5, 0.999, 1, 1.001, 1.5, 2])
    })

    it('A3: a leading zero-length segment', () => {
        const node = sequence([
            ani({ to: { y: 40 }, duration: 0, timing: timing.linear() }),
            ani({ to: { y: 100 }, duration: 1, timing: timing.linear() }),
        ])
        agree(node, { y: 0 }, [0, 0.5, 1])
    })

    it('A4: offsets never decrease and stay within [0, 1]', () => {
        const node = sequence([
            ani({ to: { y: 100 }, duration: 0.5, timing: timing.linear() }),
            ani({ to: { y: 10 }, duration: 0, timing: timing.linear() }),
            ani({ to: { y: 20 }, duration: 0, timing: timing.linear() }),
            ani({ to: { y: 0 }, duration: 0.5, timing: timing.linear() }),
        ])
        const keyframes = compileToKeyframes(planOf(node), { y: 0 })
        for (let i = 0; i < keyframes.length; i++) {
            const o = keyframes[i]!.offset as number
            expect(o).toBeGreaterThanOrEqual(0)
            expect(o).toBeLessThanOrEqual(1)
            if (i > 0)
                expect(o).toBeGreaterThanOrEqual(
                    keyframes[i - 1]!.offset as number
                )
        }
    })
})
