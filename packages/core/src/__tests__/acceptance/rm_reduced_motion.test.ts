import { describe, expect, it } from 'vitest'
import type { RunResult } from '../../index'
import * as a from '../../index'
import { createManualClock } from '../../testing'

const lin = a.timing.linear()
const move = (duration = 2) =>
    a.ani({ to: { translateX: 100 }, duration, timing: lin })
const from = { translateX: 0 }

function fakeElement() {
    const current: Record<string, unknown> = {}
    const style = new Proxy({} as Record<string, unknown>, {
        set(_t, prop, value) {
            current[String(prop)] = value
            return true
        },
        get(_t, prop) {
            if (prop === 'setProperty') {
                return (name: string, value: unknown) => {
                    current[name] = value
                }
            }
            return current[String(prop)]
        },
    })
    return { style: style as unknown as CSSStyleDeclaration, current }
}

function track(promise: Promise<RunResult>) {
    const seen: { result: RunResult | null } = { result: null }
    promise.then((result) => {
        seen.result = result
    })
    return seen
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const reduced = () =>
    createManualClock({
        reducedMotion: true,
        lagThreshold: Number.POSITIVE_INFINITY,
    })

describe('RM: rafGroup', () => {
    it('G1: the default policy (jump) ends every target in one frame', async () => {
        const m = reduced()
        const group = a.rafGroup(move(), { clock: m.clock, stagger: 0.5 })
        const els = [fakeElement(), fakeElement(), fakeElement()]
        group.bind(els)
        const seen = track(group.play({ from }))
        m.frame(16)
        await flush()
        for (const el of els)
            expect(el.current.transform).toBe('translateX(100px)')
        expect(seen.result).toBe('ended')
        group.dispose()
    })

    it('G2: ignore animates normally', () => {
        const m = reduced()
        const group = a.rafGroup(move(), {
            clock: m.clock,
            reducedMotion: 'ignore',
        })
        const el = fakeElement()
        group.bind([el])
        group.play({ from })
        m.frames(3, 16)
        expect(group.status).toBe('PLAYING')
        expect(el.current.transform).not.toBe('translateX(100px)')
        group.dispose()
    })

    it('G3: maxDuration bounds the whole run, stagger included', async () => {
        const m = reduced()
        const group = a.rafGroup(move(), {
            clock: m.clock,
            stagger: 0.5,
            reducedMotion: { maxDuration: 0.5 },
        })
        const els = [fakeElement(), fakeElement(), fakeElement()]
        group.bind(els)
        const seen = track(group.play({ from }))
        m.frames(15, 20) // 0.3 s
        await flush()
        expect(group.status).toBe('PLAYING')
        m.frames(25, 20) // 0.8 s
        await flush()
        expect(seen.result).toBe('ended')
        for (const el of els)
            expect(el.current.transform).toBe('translateX(100px)')
        group.dispose()
    })

    it('G4: an endless group behaves like an endless timeline under jump', async () => {
        const m = reduced()
        const endless = () => a.loop(move(1), Number.POSITIVE_INFINITY)
        const group = a.rafGroup(endless(), { clock: m.clock })
        group.bind([fakeElement()])
        const line = a.rafTimeline(endless(), { clock: m.clock })
        const g = track(group.play({ from }))
        const t = track(line.play({ from }))
        m.frames(5, 16)
        await flush()
        expect(group.status).toBe(line.status)
        expect(g.result).toBe(t.result)
        group.dispose()
        line.dispose()
    })
})

describe('RM: follow', () => {
    it('F1: the default policy (jump) reaches the target in one frame', async () => {
        const m = reduced()
        const follower = a.follow({ x: 0 }, { clock: m.clock })
        const seen = track(follower.set({ x: 100 }))
        m.frame(16)
        await flush()
        expect(follower.value.x).toBe(100)
        expect(follower.velocity.x).toBe(0)
        expect(seen.result).toBe('ended')
        follower.dispose()
    })

    it('F2: ignore animates normally', () => {
        const m = reduced()
        const follower = a.follow(
            { x: 0 },
            { clock: m.clock, reducedMotion: 'ignore' }
        )
        follower.set({ x: 100 })
        m.frames(2, 16)
        expect(follower.value.x).toBeGreaterThan(0)
        expect(follower.value.x).toBeLessThan(100)
        follower.dispose()
    })

    it('F3: maxDuration is rejected for a follower', () => {
        const m = reduced()
        let error: unknown
        try {
            a.follow({ x: 0 }, {
                clock: m.clock,
                reducedMotion: { maxDuration: 1 },
            } as never)
        } catch (e) {
            error = e
        }
        expect(error).toBeInstanceOf(TypeError)
        expect((error as { code?: string }).code).toBe('ANI_INVALID_OPTIONS')
    })
})

describe('RM: createStates', () => {
    const states = () => ({
        idle: a.ani({ to: { opacity: 0 }, duration: 1, timing: lin }),
        active: a.ani({ to: { opacity: 1 }, duration: 1, timing: lin }),
    })

    it('S1: the policy is forwarded to the state timelines', async () => {
        const m = reduced()
        const jumping = a.createStates({
            initial: 'idle',
            initialValue: { opacity: 0 },
            states: states(),
            clock: m.clock,
        })
        const ignoring = a.createStates({
            initial: 'idle',
            initialValue: { opacity: 0 },
            states: states(),
            clock: m.clock,
            reducedMotion: 'ignore',
        })
        const j = track(jumping.transitionTo('active'))
        ignoring.transitionTo('active')
        m.frame(16)
        await flush()
        expect(j.result).toBe('ended')
        expect(jumping.timeline().value).toEqual({ opacity: 1 })
        expect(ignoring.timeline().value?.opacity).toBeLessThan(1)
        jumping.dispose()
        ignoring.dispose()
    })
})

describe('RM: the preference is read when a run starts', () => {
    it('P1: turning reduced motion on mid-run does not jump a running group or follower', () => {
        const m = createManualClock({ lagThreshold: Number.POSITIVE_INFINITY })
        const group = a.rafGroup(move(), { clock: m.clock })
        group.bind([fakeElement()])
        group.play({ from })
        const follower = a.follow({ x: 0 }, { clock: m.clock })
        follower.set({ x: 100 })
        m.frames(3, 16)
        m.setReducedMotion(true)
        m.frames(2, 16)
        expect(group.status).toBe('PLAYING')
        expect(follower.value.x).toBeLessThan(100)
        group.dispose()
        follower.dispose()
    })
})
