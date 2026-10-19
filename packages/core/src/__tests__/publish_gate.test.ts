import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rafTimeline } from '~/ani/raf/timeline'
import { compileToKeyframes } from '~/ani/waapi/compiler'
import { resolveStateAt } from '~/ani/waapi/compiler/resolver'
import { defaultClock, resetDefaultClock } from '~/loop/clock'
import { ani, loop, parallel, sequence, stagger } from '~/nodes'
import { BezierTimingFunction, timing } from '~/timing'
import { DynamicSpringTimingFunction } from '~/timing/dynamic_spring'

describe('[Publish Gate] Regression Suite', () => {
    let rafCallbacks: Array<(ts: number) => void>
    let now: number
    let rafSpy: ReturnType<typeof vi.fn>

    const tick = (ms: number) => {
        now += ms
        const cbs = [...rafCallbacks]
        rafCallbacks = []
        for (const cb of cbs) cb(now)
    }

    beforeEach(() => {
        resetDefaultClock()
        rafCallbacks = []
        now = 0
        rafSpy = vi.fn((cb: (ts: number) => void) => {
            rafCallbacks.push(cb)
            return rafCallbacks.length
        })
        vi.stubGlobal('window', {
            requestAnimationFrame: rafSpy,
            cancelAnimationFrame: vi.fn(),
        })
        vi.stubGlobal('performance', { now: () => now * 1 })
    })

    afterEach(() => {
        resetDefaultClock()
        vi.unstubAllGlobals()
    })

    it('[L2-1] loop propagates its timing into constructed segments', () => {
        const ease = timing.bezier({
            p2: { x: 0.3, y: 0 },
            p3: { x: 0.7, y: 1 },
        })
        const root = sequence([
            ani({ to: [1], duration: 1 }),
            loop(ani({ to: [10], duration: 1 }), 2, { timing: ease }),
        ])
        const plan: any[] = []
        root.construct(plan, 0)
        const loopSegments = plan.slice(1)
        expect(loopSegments).toHaveLength(2)
        expect(loopSegments[0].node.props.timing).toBe(ease)
        expect(loopSegments[1].node.props.timing).toBe(ease)
    })

    it('[L3-1/L4A-6] durations override updates effective duration -> ENDED', () => {
        const root = ani({ to: [100], duration: 1, timing: timing.linear() })
        const line = rafTimeline(root)
        const onUpdate = vi.fn()
        line.onUpdate(onUpdate)
        line.play({ from: [0], durations: [0] })
        tick(16)
        expect(onUpdate).toHaveBeenLastCalledWith({
            state: [100],
            status: 'ENDED',
        })
    })

    it('[L4A-2] dynamic spring restarts from new `from` on re-play', () => {
        const spring = new DynamicSpringTimingFunction({
            m: 1,
            k: 120,
            c: 12,
        })
        const root = ani({ to: [100], duration: 5, timing: spring })
        const line = rafTimeline(root)

        line.play({ from: [0] })
        tick(16)
        tick(3000)
        // settle first run
        for (let i = 0; i < 40; i++) tick(16)
        const endedValue = line.value

        line.play({ from: [0] })
        tick(16)
        const restartValue = line.value

        expect(endedValue).not.toBeNull()
        expect(Math.abs(restartValue![0]! - 0)).toBeLessThan(
            Math.abs(endedValue![0]!)
        )
    })

    it('[L4B-1] split bezier intervals are sampled, not re-eased', () => {
        const root = stagger(
            [
                ani({ to: { x: 100 }, duration: 1, timing: timing.ease() }),
                ani({ to: { x: 200 }, duration: 1 }),
            ],
            { offset: 0.5 }
        )
        const plan: any[] = []
        root.construct(plan as never, 0)
        const keyframes = compileToKeyframes(plan as never, { x: 0 }, undefined)
        // RAF reference at t=0.25s
        const rafState = resolveStateAt(plan as never, { x: 0 }, 0.25, 1 / 60)

        // WAAPI render: interpolate keyframes at normalized time 0.25 / 1.5
        const targetOffset = 0.25 / 1.5
        const sorted = [...keyframes].sort((a, b) => a.offset - b.offset)
        let interpolated: number | null = null
        for (let i = 0; i < sorted.length - 1; i++) {
            const k0 = sorted[i]!
            const k1 = sorted[i + 1]!
            if (targetOffset >= k0.offset && targetOffset <= k1.offset) {
                const span = k1.offset - k0.offset || 1
                const local = (targetOffset - k0.offset) / span
                const v0 = Number(k0.x)
                const v1 = Number(k1.x)
                const eased =
                    k0.easing && k0.easing !== 'linear'
                        ? sampleBezier(k0.easing, local)
                        : local
                interpolated = v0 + (v1 - v0) * eased
                break
            }
        }
        expect(interpolated).not.toBeNull()
        expect(Math.abs(interpolated! - (rafState as any).x)).toBeLessThan(2)
    })

    it('[L4A-1] clock stops rescheduling rAF after last subscriber self-unsubscribes', () => {
        const clock = defaultClock
        const animatable = {
            update: () => clock.unsubscribe(animatable),
        }
        clock.subscribe(animatable)
        expect(rafSpy).toHaveBeenCalledTimes(1)
        tick(16)
        expect(rafSpy).toHaveBeenCalledTimes(1)
    })

    it('[L4A-2] one failing animation never stops the shared clock', () => {
        vi.stubGlobal('queueMicrotask', () => undefined)
        const clock = defaultClock
        const bad = {
            update: () => {
                throw new Error('bad animation')
            },
        }
        const good = rafTimeline(
            ani({ to: { x: 100 }, duration: 1, timing: timing.linear() })
        )
        good.play({ from: { x: 0 } })
        clock.subscribe(bad)

        expect(() => tick(100)).not.toThrow()
        tick(100)
        expect(rafCallbacks.length).toBe(1)
        expect((good.value as { x: number }).x).toBeCloseTo(20)
    })

    it('[L4A-3] seek bypasses pending delay on resume', () => {
        const root = ani({ to: [100], duration: 1, timing: timing.linear() })
        const line = rafTimeline(root)
        line.play({ from: [0], delay: 1 })
        line.seek(0.5)
        line.resume()
        tick(100)
        expect(line.value).toEqual([60])
    })

    it('[L5-1/2] spring endOfAnimation works for negative/zero targets', () => {
        const critical = timing.spring({ m: 1, k: 1, c: 2 })
        const resultCritical = critical.step(7, {
            dt: 0,
            from: 0,
            to: -100,
            duration: 7,
        })
        expect(resultCritical.endOfAnimation).toBe(true)

        const over = timing.spring({ m: 1, k: 1, c: 4 })
        const resultOver = over.step(7, {
            dt: 0,
            from: 0,
            to: 0,
            duration: 7,
        })
        expect(resultOver.endOfAnimation).toBe(true)
    })

    it('[L5-4] under-damped spring endOfAnimation is sticky past settling time', () => {
        const spring = timing.spring({ m: 1, k: 1, c: 0.5 })
        // zeta=0.25 -> settlingTime ~= 27.63 (natural time). With duration=30
        // the scaled clock reaches settling at t=30.
        const before = spring.step(25, {
            dt: 0,
            from: 0,
            to: 100,
            duration: 30,
        })
        const after: boolean[] = []
        for (let t = 30.5; t <= 36; t += 0.5) {
            after.push(
                spring.step(t, { dt: 0, from: 0, to: 100, duration: 30 })
                    .endOfAnimation
            )
        }
        expect(before.endOfAnimation).toBe(false)
        expect(after.length).toBeGreaterThan(5)
        expect(after.every((r) => r === true)).toBe(true)
    })

    it('[L2-3] nested overlap plan is chronological in TimelineBase', () => {
        const root = parallel([
            sequence([
                ani({ to: { a: 1 }, duration: 2 }),
                ani({ to: { b: 1 }, duration: 1 }),
            ]),
            sequence([ani({ to: { c: 1 }, duration: 1.5 })]),
        ])
        const line = rafTimeline(root)
        const plan = (line as any)._baseExecutionPlan as Array<{
            startTime: number
        }>
        const starts = plan.map((s) => s.startTime)
        const sorted = [...starts].sort((a, b) => a - b)
        expect(starts).toEqual(sorted)
    })

    it('[L2-4] stagger duration covers longest child span', () => {
        const root = stagger(
            [ani({ to: [1], duration: 10 }), ani({ to: [1], duration: 1 })],
            { offset: 0.5 }
        )
        expect(root.duration).toBe(10)
    })

    it('[L4B-3] WAAPI compiler rejects array-shape from with clear error', () => {
        const root = ani({ to: [100], duration: 1 })
        const plan: any[] = []
        root.construct(plan, 0)
        expect(() =>
            compileToKeyframes(plan as never, [0] as never, undefined)
        ).toThrow(TypeError)
    })

    it('[L4B-4/L5-9] bezier control point x outside [0,1] is rejected', () => {
        expect(
            () =>
                new BezierTimingFunction({
                    p2: { x: 1.2, y: 0 },
                    p3: { x: 0.2, y: 1 },
                })
        ).toThrow(RangeError)
    })
})

function sampleBezier(cssEasing: string, t: number): number {
    const match = cssEasing.match(
        /cubic-bezier\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/
    )
    if (!match) return t
    const [, x1, y1, x2, y2] = match.map(Number) as unknown as number[]
    const bez = (a: number, b: number, u: number) =>
        3 * a * (1 - u) ** 2 * u + 3 * b * (1 - u) * u ** 2 + u ** 3
    let lo = 0
    let hi = 1
    let ut = t
    for (let i = 0; i < 24; i++) {
        ut = (lo + hi) / 2
        const xu = bez(x1!, x2!, ut)
        if (Math.abs(xu - t) < 1e-6) break
        if (xu < t) lo = ut
        else hi = ut
    }
    return bez(y1!, y2!, ut)
}
