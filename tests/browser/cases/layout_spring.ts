// L-SPRING rows (ARCHITECTURE §5.1–§5.3, §5.8, §5.9, §9.4, §10): the physical
// spring in real browsers on a manual clock, every frame against the
// independent closed-form oracle.
import { ani, isAniError, timing } from '@freestylejs/ani-core'
import {
    createLayoutGroup,
    createPresence,
    type LayoutReport,
} from '@freestylejs/ani-layout'
import {
    crossfadeAt,
    maxDiff,
    type OBox,
    perceptualOracle,
    reducedSpringOracle,
    springOracle,
} from '../../../packages/layout/src/__tests__/oracle'
import { expectEqual } from './assert'
import {
    expectAt,
    frames,
    harness,
    node,
    pageBox,
    report,
    screenRadii,
    silenceWarnings,
} from './layout_kit'

export const pageOptions = {}

export const knownFailures: Record<string, string> = {}

const BOUNCES = [-0.8, -0.3, 0, 0.2, 0.4, 0.9] as const

/** Channels x, y, w, h (transform origin 0 0) of a spring from `b` to `a` with incoming `v`. */
function springBox(
    b: OBox,
    a: OBox,
    v: OBox | null,
    D: number,
    bounce: number,
    t: number
): { box: OBox; velocity: OBox } {
    const keys = ['x', 'y', 'w', 'h'] as const
    const box = { x: 0, y: 0, w: 0, h: 0 }
    const velocity = { x: 0, y: 0, w: 0, h: 0 }
    for (const k of keys) {
        if (t <= 0) {
            box[k] = b[k]
            velocity[k] = v?.[k] ?? 0
            continue
        }
        const o = springOracle(D, bounce, b[k] - a[k], v?.[k] ?? 0, t)
        box[k] = a[k] + o.d
        velocity[k] = o.v
    }
    return { box, velocity }
}

/** The oracle's settle: the last frame time after which every channel stays within 0.1 px and 1 px/s. */
function oracleSettle(
    b: OBox,
    a: OBox,
    v: OBox | null,
    D: number,
    bounce: number,
    step: number
): number {
    let last = 0
    for (let t = 0; t < 12; t += step) {
        const { box, velocity } = springBox(b, a, v, D, bounce, t)
        const out =
            maxDiff(box, a) > 0.1 ||
            Math.max(...Object.values(velocity).map(Math.abs)) >= 1
        if (out) last = t
    }
    return last
}

/** Move and resize on a spring for every bounce at 60 and 120 Hz; then a retarget carrying velocity. */
export async function L_SPRING_1(): Promise<string> {
    const lines: string[] = []
    for (const hz of [60, 120]) {
        const frameMs = 1000 / hz
        for (const bounce of BOUNCES) {
            const D = 0.5
            const h = harness({
                motion: { type: 'spring', duration: D, bounce },
            })
            try {
                const el = node(
                    h.root,
                    'left: 20px; top: 30px; width: 80px; height: 40px; transform-origin: 0 0; background: #345;'
                )
                h.add(el)
                const before = pageBox(el)
                h.group.capture()
                el.style.left = '320px'
                el.style.top = '130px'
                el.style.width = '160px'
                el.style.height = '60px'
                const after = pageBox(el)
                const style = el.style.cssText
                const done = report(h.group.flush())
                let worst = 0
                let lastFrame = 0
                const count = await frames(
                    h.mc,
                    Math.ceil(12 * hz),
                    (elapsed) => {
                        lastFrame = elapsed
                        const want = springBox(
                            before,
                            after,
                            null,
                            D,
                            bounce,
                            elapsed
                        ).box
                        worst = Math.max(
                            worst,
                            expectAt(
                                el,
                                want,
                                `${hz} Hz b=${bounce} t=${elapsed.toFixed(4)}`
                            )
                        )
                    },
                    () => done.value !== null,
                    frameMs
                )
                expectEqual(
                    done.value,
                    { status: 'ended', snapped: [] },
                    'report'
                )
                expectEqual(el.style.cssText, style, 'inline style restored')
                expectEqual(h.mc.clock.size, 0, 'no subscriber after settle')
                expectAt(el, after, 'final box', 0.01)
                // the run ends at the physical settle, within one frame
                const settle = oracleSettle(
                    before,
                    after,
                    null,
                    D,
                    bounce,
                    frameMs / 1000
                )
                if (
                    !(
                        lastFrame >= settle - 1e-9 &&
                        lastFrame <= settle + (2 * frameMs) / 1000
                    )
                ) {
                    throw new Error(
                        `${hz} Hz b=${bounce}: ended at ${lastFrame.toFixed(4)} s, oracle settle ${settle.toFixed(4)} s`
                    )
                }
                lines.push(
                    `${hz}Hz b=${bounce}: ${count} frames ≤ ${worst.toFixed(3)} px`
                )
            } finally {
                h.dispose()
            }
        }
    }
    // retarget mid-flight: the new spring starts from the presented box with
    // the presented velocity (c(0) = B, c′(0) = v)
    {
        const D = 0.45
        const bounce = 0.2
        const h = harness({ motion: { type: 'spring', duration: D, bounce } })
        try {
            const el = node(
                h.root,
                'left: 0px; top: 0px; width: 60px; height: 60px; transform-origin: 0 0;'
            )
            h.add(el)
            const b1 = pageBox(el)
            h.group.capture()
            el.style.left = '400px'
            const a1 = pageBox(el)
            void h.group.flush()
            const k = 9
            await frames(h.mc, k + 1, (elapsed) => {
                expectAt(
                    el,
                    springBox(b1, a1, null, D, bounce, elapsed).box,
                    `first t=${elapsed}`
                )
            })
            const shown = springBox(b1, a1, null, D, bounce, k * 0.016)
            h.group.capture()
            el.style.left = '100px'
            el.style.top = '200px'
            // the layout box at rest: the drawn box still carries the old pose
            const origin = pageBox(h.root)
            const a2 = { x: origin.x + 100, y: origin.y + 200, w: 60, h: 60 }
            const done = report(h.group.flush())
            let worst = 0
            let prev: OBox | null = null
            let jump = 0
            await frames(
                h.mc,
                400,
                (elapsed) => {
                    // a moving node continues the last painted frame's time
                    const want = springBox(
                        shown.box,
                        a2,
                        shown.velocity,
                        D,
                        bounce,
                        elapsed + 0.016
                    ).box
                    worst = Math.max(
                        worst,
                        expectAt(el, want, `retarget t=${elapsed}`)
                    )
                    if (prev === null) {
                        // the first frame after the retarget is the carried
                        // velocity's, measurably not a restart from rest
                        const rest = springBox(
                            shown.box,
                            a2,
                            null,
                            D,
                            bounce,
                            elapsed + 0.016
                        ).box
                        jump = maxDiff(pageBox(el), rest)
                    }
                    prev = pageBox(el)
                },
                () => done.value !== null
            )
            if (!(jump > 5))
                throw new Error(
                    `the retarget's first frame is ${jump.toFixed(3)} px from a restart at rest: velocity dropped`
                )
            expectAt(el, a2, 'final box', 0.01)
            lines.push(
                `retarget ≤ ${worst.toFixed(3)} px (${jump.toFixed(1)} px from a rest restart)`
            )
        } finally {
            h.dispose()
        }
    }
    return lines.join('; ')
}

/** A shared handoff on a spring lead: opacities and radius on p(t), coverage 1, release at t = D, settle later. */
export async function L_SPRING_2(): Promise<string> {
    const D = 0.3
    const bounce = 0.2
    const h = harness({ motion: { type: 'spring', duration: D, bounce } })
    try {
        const card = node(
            h.root,
            'left: 20px; top: 20px; width: 80px; height: 80px; transform-origin: 0 0; border-radius: 40px; background: #366;'
        )
        h.add(card, { layoutId: 'hero' })
        const presence = createPresence(
            card,
            {
                present: { translateY: 0 },
                exit: ani({
                    to: { translateY: 0 },
                    duration: 0.05,
                    timing: timing.linear(),
                }),
            },
            { clock: h.mc.clock }
        )
        h.group.capture()
        await h.group.flush()
        const cardBox = pageBox(card)
        h.group.capture()
        let exited: string | null = null
        let now = 0
        let exitedAt = -1
        void presence.exit().then((r) => {
            exited = r
            exitedAt = now
        })
        const detail = node(
            h.root,
            'left: 300px; top: 100px; width: 400px; height: 300px; transform-origin: 0 0; border-radius: 8px; background: #663;'
        )
        const detailStyle = detail.style.cssText
        h.add(detail, { layoutId: 'hero' })
        const detailBox = pageBox(detail)
        let settledAt = -1
        const done = report(
            h.group.flush().then((r: LayoutReport) => {
                settledAt = now
                return r
            })
        )
        let opacityError = 0
        let coverageError = 0
        let radiusError = 0
        let worst = 0
        await frames(
            h.mc,
            400,
            (elapsed) => {
                now = elapsed
                const want = springBox(
                    cardBox,
                    detailBox,
                    null,
                    D,
                    bounce,
                    elapsed
                ).box
                worst = Math.max(
                    worst,
                    expectAt(detail, want, `lead t=${elapsed}`)
                )
                const p = perceptualOracle(elapsed, D)
                const lead = Number(getComputedStyle(detail).opacity)
                const follower = Number(getComputedStyle(card).opacity)
                if (elapsed < D) {
                    worst = Math.max(
                        worst,
                        expectAt(card, want, `follower t=${elapsed}`)
                    )
                    const fade = crossfadeAt(p)
                    opacityError = Math.max(
                        opacityError,
                        Math.abs(lead - fade.lead),
                        Math.abs(follower - fade.follower)
                    )
                    coverageError = Math.max(
                        coverageError,
                        Math.abs(1 - (1 - lead) * (1 - follower) - 1)
                    )
                }
                // the on-screen corner shape blends 40 → 8 on p(t)
                const rho = 40 + (8 - 40) * p
                for (const r of screenRadii(detail)) {
                    radiusError = Math.max(radiusError, Math.abs(r - rho))
                }
            },
            () => done.value !== null && exited !== null
        )
        expectEqual(done.value!.status, 'ended', 'status')
        expectEqual(exited, 'exited', 'presence exit')
        if (opacityError > 1e-4)
            throw new Error(`opacity off by ${opacityError}`)
        if (coverageError > 1e-4)
            throw new Error(`coverage off by ${coverageError}`)
        const radiusTol = navigator.userAgent.includes('Firefox') ? 0.05 : 0.02
        if (radiusError > radiusTol)
            throw new Error(`radius off by ${radiusError}`)
        // presence is released when the fade ends at t = D, not at the settle
        if (!(exitedAt >= D - 1e-9 && exitedAt <= D + 0.016 + 1e-9)) {
            throw new Error(
                `presence released at ${exitedAt} s; the fade ends at ${D} s`
            )
        }
        if (!(settledAt > exitedAt)) {
            throw new Error(
                `the run resolved at ${settledAt} s, not after the release at ${exitedAt} s`
            )
        }
        expectEqual(card.style.opacity, '0', 'follower held invisible')
        expectEqual(detail.style.cssText, detailStyle, 'lead restored')
        presence.dispose()
        return `max ${worst.toFixed(3)} px; opacity ${opacityError.toExponential(1)}; radius ${radiusError.toFixed(4)}; release ${exitedAt.toFixed(3)} s; settle ${settledAt.toFixed(3)} s`
    } finally {
        h.dispose()
    }
}

function code(fn: () => unknown): string | null {
    try {
        fn()
        return null
    } catch (error) {
        return isAniError(error)
            ? error.code
            : `not an AniError: ${String(error)}`
    }
}

/** Merge, validation, WAAPI rejection and the settle cap at the scope, before any state change. */
export async function L_SPRING_3(): Promise<string> {
    const lines: string[] = []
    // the WAAPI engine rejects springs, on the group and on a participant
    expectEqual(
        code(() =>
            createLayoutGroup({ engine: 'waapi', motion: { type: 'spring' } })
        ),
        'ANI_INVALID_OPTIONS',
        'waapi group spring'
    )
    {
        const group = createLayoutGroup({ engine: 'waapi' })
        const el = node(
            document.body,
            'left: 0; top: 0; width: 10px; height: 10px;'
        )
        expectEqual(
            code(() =>
                group.add(el, {
                    layout: 'position',
                    motion: { type: 'spring' },
                })
            ),
            'ANI_INVALID_OPTIONS',
            'waapi participant spring'
        )
        expectEqual(group.stats.tracks, 0, 'nothing registered')
        // the add was refused: a later add of the same element is a first add
        const remove = group.add(el, { layout: 'position' })
        remove()
        group.dispose()
        el.remove()
        lines.push('waapi rejects springs')
    }
    // the merged spring needs duration > 0: the group's spring and a child's 0
    {
        const h = harness({ motion: { type: 'spring', bounce: 0.1 } })
        try {
            const el = node(
                h.root,
                'left: 0; top: 0; width: 10px; height: 10px;'
            )
            expectEqual(
                code(() => h.group.add(el, { motion: { duration: 0 } })),
                'ANI_INVALID_OPTIONS',
                'spring duration 0'
            )
            // a curve layer switches to timing, where 0 jumps
            h.add(el, { motion: { timing: timing.linear(), duration: 0 } })
            expectEqual(
                code(() =>
                    h.group.set(el, { motion: { bounce: 0.2 } as never })
                ),
                'ANI_INVALID_OPTIONS',
                'bounce without type'
            )
            lines.push('validation before any state change')
        } finally {
            h.dispose()
        }
    }
    // `duration` never switches the kind: a child's 0.3 under a group spring is a 0.3 s spring
    {
        const h = harness({ motion: { type: 'spring', bounce: 0 } })
        try {
            const el = node(
                h.root,
                'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
            )
            h.add(el, { motion: { duration: 0.3 } })
            const b = pageBox(el)
            h.group.capture()
            el.style.left = '250px'
            const a = pageBox(el)
            const done = report(h.group.flush())
            await frames(
                h.mc,
                200,
                (elapsed) => {
                    expectAt(
                        el,
                        springBox(b, a, null, 0.3, 0, elapsed).box,
                        `t=${elapsed}`
                    )
                },
                () => done.value !== null
            )
            lines.push('duration keeps the spring kind')
        } finally {
            h.dispose()
        }
    }
    // the settle cap: a spring longer than 10 s snaps 'unsupported', reported and warned
    {
        const warnings = silenceWarnings()
        const snaps: string[] = []
        const h = harness({
            motion: { type: 'spring', duration: 4, bounce: 0.99 },
            onSnap: (_el, reason) => snaps.push(reason),
        })
        try {
            const el = node(
                h.root,
                'left: 0; top: 0; width: 40px; height: 40px;'
            )
            h.add(el)
            h.group.capture()
            el.style.left = '500px'
            const r = await h.group.flush()
            expectEqual(
                r.snapped.map((s) => s.reason),
                ['unsupported'],
                'snapped'
            )
            expectEqual(snaps, ['unsupported'], 'onSnap')
            expectEqual(h.mc.clock.size, 0, 'no subscriber')
            if (!warnings.messages.some((m) => m.includes('10 s'))) {
                throw new Error(
                    `no settle-cap warning: ${warnings.messages.join(' | ')}`
                )
            }
            lines.push('settle cap snaps unsupported')
        } finally {
            warnings.restore()
            h.dispose()
        }
    }
    return lines.join('; ')
}

/** Reduced motion { maxDuration }: no overshoot, the run never exceeds maxDuration, exact end. */
export async function L_SPRING_4(): Promise<string> {
    const lines: string[] = []
    for (const [bounce, max] of [
        [0.5, 0.4],
        [0, 0.25],
        [-0.3, 0.6],
        [0.3, 0.02],
    ] as const) {
        const h = harness({
            motion: { type: 'spring', duration: 1, bounce },
            reducedMotion: { maxDuration: max },
        })
        h.mc.setReducedMotion(true)
        try {
            const el = node(
                h.root,
                'left: 0; top: 0; width: 40px; height: 40px; transform-origin: 0 0;'
            )
            h.add(el)
            const b = pageBox(el)
            h.group.capture()
            el.style.left = '300px'
            const a = pageBox(el)
            const style = el.style.cssText
            const expected = reducedSpringOracle(1, bounce, 0, max, [
                { x0: b.x - a.x, v0: 0 },
            ])
            const done = report(h.group.flush())
            let overshoot = 0
            let lastFrame = 0
            let worst = 0
            const count = await frames(
                h.mc,
                200,
                (elapsed) => {
                    lastFrame = elapsed
                    overshoot = Math.max(overshoot, pageBox(el).x - a.x)
                    if (typeof expected === 'object') {
                        const want =
                            elapsed >= expected.settle
                                ? a
                                : springBox(
                                      b,
                                      a,
                                      null,
                                      expected.duration,
                                      expected.bounce,
                                      elapsed
                                  ).box
                        worst = Math.max(
                            worst,
                            expectAt(
                                el,
                                want,
                                `b=${bounce} max=${max} t=${elapsed.toFixed(4)}`
                            )
                        )
                    }
                },
                () => done.value !== null
            )
            if (expected === 'reduced') {
                // nothing fits: the node jumps
                expectEqual(done.value!.status, 'reduced', 'status')
                lines.push(`max ${max}: jump`)
                continue
            }
            if (expected === 'spring-timeout') {
                throw new Error('unexpected spring-timeout in L_SPRING_4')
            }
            expectEqual(done.value!.status, 'ended', 'status')
            if (overshoot > 1e-6)
                throw new Error(
                    `overshoot ${overshoot} px under reduced motion`
                )
            if (lastFrame > max + 0.016 + 1e-9) {
                throw new Error(
                    `run lasted ${lastFrame} s, beyond maxDuration ${max} s`
                )
            }
            void count
            expectAt(el, a, 'final box', 0.01)
            expectEqual(el.style.cssText, style, 'restored')
            lines.push(
                `b=${bounce} max ${max}: factor ${expected.factor}, ${lastFrame.toFixed(3)} s, ≤ ${worst.toFixed(3)} px`
            )
        } finally {
            h.dispose()
        }
    }
    return lines.join('; ')
}
