// v4 contract regressions: real DOM and native transition effects. These
// observations are not physical-display or input-to-photon certification.
import { timing } from '@freestylejs/ani-core'
import { createManualClock } from '@freestylejs/ani-core/testing'
import {
    createLayoutGroup,
    shareElement,
    viewTransition,
} from '@freestylejs/ani-layout'
import { expectClose, expectEqual, nextFrame } from './assert'
import { node, viewBox } from './layout_kit'

/** A timing jump does not need a frame, including the compositor backend. */
export async function L_OPS_ZERO_SYNC(): Promise<string> {
    for (const engine of ['raf', 'waapi'] as const) {
        for (const mode of ['running', 'frozen', 'paused'] as const) {
            const mc = createManualClock({
                timeScale: mode === 'frozen' ? 0 : 1,
            })
            if (mode === 'paused') mc.clock.pause()
            const group = createLayoutGroup({
                clock: mc.clock,
                engine,
                motion: { duration: 0 },
            })
            const el = node(
                document.body,
                'left:0;top:0;width:40px;height:40px;transform-origin:0 0;opacity:.7'
            )
            try {
                group.add(el, { layout: 'position' })
                group.capture()
                el.style.left = '200px'
                const authored = el.style.cssText
                const run = group.flush()
                expectClose(
                    viewBox(el).x,
                    200,
                    0.01,
                    `${engine}/${mode} synchronous x`
                )
                expectEqual(
                    el.style.cssText,
                    authored,
                    'owned styles restored before return'
                )
                expectEqual(group.stats.tracks, 0, 'no track')
                expectEqual(mc.clock.size, 0, 'no subscriber')
                expectEqual(
                    el.getAnimations().length,
                    0,
                    'no paused native zero animation'
                )
                let result = ''
                void run.then((report) => {
                    result = report.status
                })
                await Promise.resolve()
                expectEqual(
                    result,
                    'ended',
                    'report resolves without delivering a frame'
                )
            } finally {
                group.dispose()
                mc.clock.dispose()
                el.remove()
            }
        }
    }
    return 'RAF/WAAPI zero jumps restore synchronously on running/frozen/paused clocks'
}

/** Parent landing cannot discard a longer child residual. */
export async function L_OPS_RELEASE_RESIDUAL(): Promise<string> {
    for (const duration of [0, 0.05]) {
        const mc = createManualClock()
        const group = createLayoutGroup({ clock: mc.clock })
        const parent = node(
            document.body,
            'left:0;top:0;width:100px;height:40px;transform-origin:0 0'
        )
        const child = node(
            parent,
            'left:20px;top:0;width:40px;height:40px;transform-origin:0 0'
        )
        try {
            group.add(parent, { motion: { duration, timing: timing.linear() } })
            group.add(child, {
                layout: 'position',
                motion: { duration: 0.4, timing: timing.linear() },
            })
            group.capture()
            await group.flush()
            const hold = group.take(parent)
            hold.move({ x: 50, y: 0 })
            void group.update(() => {
                child.style.left = '80px'
            })
            mc.frame(0)
            mc.frame(100)
            expectClose(
                viewBox(child).x,
                85,
                0.05,
                'held child residual at 100ms'
            )
            hold.release({ x: 0, y: 0 })
            if (duration > 0) {
                mc.frame(0)
                mc.frame(duration * 1000)
            }
            expectClose(viewBox(parent).x, 0, 0.01, 'parent landing')
            expectClose(
                viewBox(child).x,
                35 + duration * 150,
                0.05,
                'child keeps independent elapsed time'
            )
            expectEqual(mc.clock.size, 1, 'residual keeps the scope alive')
            mc.frames(30, 16)
            expectClose(viewBox(child).x, 80, 0.01, 'child final layout')
            expectEqual(parent.style.translate, '', 'parent pose restored')
            expectEqual(child.style.translate, '', 'child pose restored')
            expectEqual(group.stats.holds, 0, 'no hold left')
            expectEqual(mc.clock.size, 0, 'no subscriber left')
        } finally {
            group.dispose()
            mc.clock.dispose()
            parent.remove()
        }
    }
    return 'zero and short parent landings preserve longer descendant motion on real DOM'
}

/** Inspect actual native effects, rather than replacing them with test stubs. */
export async function L_OPS_VT_POLICY_NATIVE(): Promise<string> {
    if (typeof document.startViewTransition !== 'function') {
        throw new Error(
            'native View Transition API unavailable: this proof cannot run'
        )
    }
    const descriptor = Object.getOwnPropertyDescriptor(
        document,
        'startViewTransition'
    )
    const nativeStart = document.startViewTransition.bind(document)
    const seen: Array<{ animation: Animation; effect: AnimationEffect }> = []
    let starts = 0
    let readyFailure = ''
    Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: (update: () => Promise<void>) => {
            starts += 1
            const transition = nativeStart(update)
            void transition.ready.then(
                () => {
                    for (const animation of document.getAnimations()) {
                        if (animation.effect)
                            seen.push({ animation, effect: animation.effect })
                    }
                },
                (error: unknown) => {
                    readyFailure = String(error)
                }
            )
            return transition
        },
    })
    const css = document.createElement('style')
    css.textContent =
        '::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation-duration:800ms;animation-delay:120ms;animation-iteration-count:3}'
    document.head.append(css)
    const el = node(
        document.body,
        'left:10px;top:10px;width:40px;height:40px;background:rgb(20,80,160)'
    )
    const unshare = shareElement(el, 'contract')
    let updates = 0
    const outcomes: string[] = []
    try {
        for (const explicit of [false, true]) {
            // Start independent policy samples after the prior transition's
            // render teardown, not in its finished-promise reaction task.
            await nextFrame()
            seen.length = 0
            const result = await viewTransition(
                () => {
                    updates += 1
                    el.style.left = explicit ? '100px' : '200px'
                },
                {
                    share: ['contract'],
                    clock: { reducedMotion: true },
                    reducedMotion: { maxDuration: 0.05 },
                    ...(explicit && { motion: { duration: 0.4 } }),
                }
            )
            if (seen.length === 0) {
                throw new Error(
                    `native effects missing: result=${result}, starts=${starts}, ready=${readyFailure || 'resolved'}, visibility=${document.visibilityState}`
                )
            }
            if (result === 'finished') {
                for (const { effect } of seen) {
                    const timing = effect.getTiming()
                    expectEqual(
                        Number(timing.duration) <= 50,
                        true,
                        'actual native duration respects cap'
                    )
                    expectEqual(timing.delay, 0, 'native delay removed by cap')
                    expectEqual(
                        timing.endDelay,
                        0,
                        'native end delay removed by cap'
                    )
                    expectEqual(
                        timing.iterations,
                        1,
                        'native repeats bounded by cap'
                    )
                }
            } else {
                expectEqual(
                    result,
                    'reduced',
                    'only an explicit reduced skip is an allowed fallback'
                )
                expectEqual(
                    seen.some(
                        ({ animation }) => animation.playState === 'running'
                    ),
                    false,
                    'skipped effects no longer run'
                )
            }
            expectEqual(
                el.style.getPropertyValue('view-transition-name'),
                '',
                'shared names restored'
            )
            outcomes.push(
                `${explicit ? 'explicit' : 'default'}:${result}/${seen.length} effects`
            )
        }
        const before = starts
        const zero = await viewTransition(
            () => {
                updates += 1
            },
            {
                clock: { reducedMotion: true },
                reducedMotion: { maxDuration: 0 },
            }
        )
        expectEqual(zero, 'reduced', 'zero cap skips')
        expectEqual(starts, before, 'zero cap starts no transition')
        expectEqual(updates, 3, 'every update executes exactly once')
        return `native effect policy: ${outcomes.join('; ')}; zero cap skips`
    } finally {
        unshare()
        css.remove()
        el.remove()
        if (descriptor)
            Object.defineProperty(document, 'startViewTransition', descriptor)
        else Reflect.deleteProperty(document, 'startViewTransition')
    }
}
