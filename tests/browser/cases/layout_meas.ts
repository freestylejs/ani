// Browser rows for v3 measured presentation (ARCHITECTURE §3.2, §4.2–§4.7, §5.7, §5.8, §11.2):
// L-MEAS-1..4, L-MEAS-6..13, L-HAND-1..2, L-KEY-1, L-DOC-1.
import {
    createClock,
    isAniError,
    type TimingFunction,
    timing,
} from '@freestylejs/ani-core'
import {
    createLayoutGroup,
    createPresence,
    type LayoutOptions,
    type SnapReason,
} from '@freestylejs/ani-layout'
import {
    expectedBox,
    maxDiff,
    type OBox,
    type OTrackSpec,
} from '../../../packages/layout/src/__tests__/oracle'
import { expectEqual } from './assert'
import {
    expectViewAt,
    frames,
    harness,
    node,
    report,
    settleMicrotasks,
    shiftBox,
    silenceWarnings,
    viewBox,
} from './layout_kit'

export const pageOptions = {}

type KeyedLayoutOptions = LayoutOptions & {
    readonly layoutKey?: unknown
}

const assert = {
    ok(cond: boolean, message: string): void {
        if (!cond) throw new Error(message)
    },
    equal<T>(actual: T, expected: T, message: string): void {
        expectEqual(actual, expected, message)
    },
    notEqual<T>(actual: T, unexpected: T, message: string): void {
        if (Object.is(actual, unexpected)) {
            throw new Error(
                `${message}: expected value not equal to ${String(unexpected)}`
            )
        }
    },
}

const EASE_OUT: TimingFunction = timing.easeOut
const LINEAR: TimingFunction = timing.linear

function spec(
    before: OBox,
    after: OBox,
    velocity: OBox | null = null,
    duration = 0.24,
    timingFn: TimingFunction = EASE_OUT,
    fx = 0.5,
    fy = 0.5
): OTrackSpec {
    return {
        before,
        after,
        velocity,
        fx,
        fy,
        mode: true,
        duration,
        delay: 0,
        timing: timingFn,
    }
}

function trackBox(s: OTrackSpec, elapsed: number): OBox {
    return expectedBox(s, elapsed)
}

function trackVelocity(s: OTrackSpec, elapsed: number): OBox {
    const h = 1e-6
    const t0 = Math.max(0, elapsed - h)
    const t1 = Math.min(s.duration, elapsed + h)
    const dt = t1 - t0
    const b0 = expectedBox(s, t0)
    const b1 = expectedBox(s, t1)
    return {
        x: (b1.x - b0.x) / dt,
        y: (b1.y - b0.y) / dt,
        w: (b1.w - b0.w) / dt,
        h: (b1.h - b0.h) / dt,
    }
}

/** Elapsed time on a track started from rest at `startedAt` (`dt = 0` on its first frame). */
function since(startedAt: number, elapsed: number): number {
    return Math.max(0, elapsed - startedAt - 0.016)
}

/** Wait one native animation frame so browser scroll/anchoring state settles when needed. */
function nextRaf(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/**
 * L-MEAS-1: chat delete under scroll anchoring (page scroller and inner panel scroller).
 * Deleting an off-screen message above the viewport while scroll-anchored leaves
 * every visible message within 0.5 px at every frame and produces no stale snap.
 */
export async function L_MEAS_1(): Promise<string> {
    let worst = 0

    // Part 1: Inner panel scroller
    const hPanel = harness({
        motion: { duration: 0.24, timing: timing.easeOut },
    })
    try {
        const panel = document.createElement('div')
        panel.style.cssText =
            'position: relative; width: 320px; height: 220px; overflow-y: auto; overflow-anchor: auto; box-sizing: border-box;'
        hPanel.root.append(panel)

        const messages: HTMLElement[] = []
        for (let i = 0; i < 10; i++) {
            const msg = document.createElement('div')
            msg.style.cssText =
                'position: relative; width: 280px; height: 60px; margin-bottom: 10px; box-sizing: border-box;'
            msg.textContent = `msg-${i}`
            panel.append(msg)
            hPanel.add(msg)
            messages.push(msg)
        }

        // Baseline flush and scroll down so messages 0..1 are above the panel viewport
        await hPanel.group.update(() => {})
        panel.scrollTop = 210
        await nextRaf()

        const visiblePanel = messages.slice(3, 6)
        const beforePanel = visiblePanel.map((el) => viewBox(el))

        hPanel.group.capture()
        const removedPanel = messages[0]!
        hPanel.group.remove(removedPanel)
        removedPanel.remove()
        // Trigger layout so CSS Scroll Anchoring (when supported by the engine) applies;
        // if the engine does not implement CSS overflow-anchor (WebKit), apply the 70px
        // anchor scroll adjustment in the same commit task.
        void panel.getBoundingClientRect()
        if (Math.abs(panel.scrollTop - 210) < 1) {
            panel.scrollTop = 140
        }
        const quietPanel = silenceWarnings()
        let panelResult: Awaited<ReturnType<typeof hPanel.group.flush>>
        try {
            const panelRun = hPanel.group.flush()
            visiblePanel.forEach((el, idx) => {
                worst = Math.max(
                    worst,
                    expectViewAt(
                        el,
                        beforePanel[idx]!,
                        `L_MEAS_1 panel frame 0 msg[${idx + 3}]`
                    )
                )
            })
            await frames(hPanel.mc, 18, (elapsed, frameIdx) => {
                visiblePanel.forEach((el, idx) => {
                    worst = Math.max(
                        worst,
                        expectViewAt(
                            el,
                            beforePanel[idx]!,
                            `L_MEAS_1 panel frame ${frameIdx + 1} (t=${elapsed.toFixed(3)}) msg[${idx + 3}]`
                        )
                    )
                })
            })
            panelResult = await panelRun
        } finally {
            quietPanel.restore()
        }
        assert.equal(
            panelResult.status,
            'no-change',
            `L_MEAS_1 panel status: expected 'no-change', got '${panelResult.status}'`
        )
        assert.equal(
            panelResult.snapped.length,
            0,
            'L_MEAS_1 panel snapped empty'
        )
    } finally {
        hPanel.dispose()
    }

    // Part 2: Page scroller
    const hPage = harness({
        motion: { duration: 0.24, timing: timing.easeOut },
    })
    try {
        hPage.root.style.height = '2200px'
        const stack = document.createElement('div')
        stack.style.cssText =
            'position: relative; width: 320px; overflow-anchor: auto;'
        hPage.root.append(stack)

        const messages: HTMLElement[] = []
        for (let i = 0; i < 12; i++) {
            const msg = document.createElement('div')
            msg.style.cssText =
                'position: relative; width: 280px; height: 70px; margin-bottom: 10px; box-sizing: border-box;'
            msg.textContent = `page-msg-${i}`
            stack.append(msg)
            hPage.add(msg)
            messages.push(msg)
        }

        await hPage.group.update(() => {})
        window.scrollTo(0, 240)
        await nextRaf()

        const visiblePage = messages.slice(3, 6)
        const beforePage = visiblePage.map((el) => viewBox(el))

        hPage.group.capture()
        const removedPage = messages[0]!
        hPage.group.remove(removedPage)
        removedPage.remove()
        void document.body.getBoundingClientRect()
        if (Math.abs(window.scrollY - 240) < 1) {
            window.scrollTo(0, 160)
        }
        const quietPage = silenceWarnings()
        let pageResult: Awaited<ReturnType<typeof hPage.group.flush>>
        try {
            const pageRun = hPage.group.flush()
            visiblePage.forEach((el, idx) => {
                worst = Math.max(
                    worst,
                    expectViewAt(
                        el,
                        beforePage[idx]!,
                        `L_MEAS_1 page frame 0 msg[${idx + 3}]`
                    )
                )
            })
            await frames(hPage.mc, 18, (elapsed, frameIdx) => {
                visiblePage.forEach((el, idx) => {
                    worst = Math.max(
                        worst,
                        expectViewAt(
                            el,
                            beforePage[idx]!,
                            `L_MEAS_1 page frame ${frameIdx + 1} (t=${elapsed.toFixed(3)}) msg[${idx + 3}]`
                        )
                    )
                })
            })
            pageResult = await pageRun
        } finally {
            quietPage.restore()
        }
        assert.equal(
            pageResult.status,
            'no-change',
            `L_MEAS_1 page status: expected 'no-change', got '${pageResult.status}'`
        )
        assert.equal(
            pageResult.snapped.length,
            0,
            'L_MEAS_1 page snapped empty'
        )
    } finally {
        window.scrollTo(0, 0)
        hPage.dispose()
    }

    return report('L_MEAS_1', worst, 'page + panel anchoring')
}

/**
 * L-MEAS-2: kanban card moves between columns while the target column auto-scrolls
 * in the same task as the mutation.
 */
export async function L_MEAS_2(): Promise<string> {
    const duration = 0.24
    const h = harness({
        motion: { duration, timing: timing.easeOut },
    })
    try {
        const colA = node(
            h.root,
            'left: 0; top: 0; width: 160px; height: 220px; overflow-y: auto;'
        )
        const colB = node(
            h.root,
            'left: 200px; top: 0; width: 160px; height: 220px; overflow-y: auto;'
        )

        const makeCard = (col: HTMLElement, label: string): HTMLElement => {
            const card = document.createElement('div')
            card.style.cssText =
                'position: relative; width: 140px; height: 60px; margin-bottom: 10px; box-sizing: border-box;'
            card.textContent = label
            col.append(card)
            h.add(card)
            return card
        }

        const a0 = makeCard(colA, 'a0')
        const a1 = makeCard(colA, 'a1')
        const a2 = makeCard(colA, 'a2')
        const bCards = [
            makeCard(colB, 'b0'),
            makeCard(colB, 'b1'),
            makeCard(colB, 'b2'),
            makeCard(colB, 'b3'),
            makeCard(colB, 'b4'),
        ]
        const allCards = [a0, a1, a2, ...bCards]

        await h.group.update(() => {})
        const bBoxes = new Map<HTMLElement, OBox>(
            allCards.map((c) => [c, viewBox(c)])
        )

        // Expected rest boxes after moving a1 to bottom of colB and scrolling colB by 120px:
        const b0Before = bBoxes.get(bCards[0]!)!
        const aBoxes = new Map<HTMLElement, OBox>()
        aBoxes.set(a0, bBoxes.get(a0)!)
        aBoxes.set(a2, shiftBox(bBoxes.get(a2)!, 0, -70))
        bCards.forEach((c) => {
            aBoxes.set(c, shiftBox(bBoxes.get(c)!, 0, -120))
        })
        // a1 becomes the 6th card (index 5) in colB: y = b0.y + 5 * 70 - 120
        aBoxes.set(a1, {
            x: b0Before.x,
            y: b0Before.y + 5 * 70 - 120,
            w: b0Before.w,
            h: b0Before.h,
        })

        const quiet = silenceWarnings()
        let worst = 0
        try {
            h.group.capture()
            colB.append(a1)
            colB.scrollTop = 120
            const run = report(h.group.flush())

            for (const c of allCards) {
                const want =
                    c === a0
                        ? aBoxes.get(c)!
                        : trackBox(
                              spec(
                                  bBoxes.get(c)!,
                                  aBoxes.get(c)!,
                                  null,
                                  duration
                              ),
                              0
                          )
                worst = Math.max(
                    worst,
                    expectViewAt(
                        c,
                        want,
                        `L_MEAS_2 frame 0 (${c.textContent ?? ''})`
                    )
                )
            }

            await frames(
                h.mc,
                30,
                (elapsed, frameIdx) => {
                    const t = since(0, elapsed)
                    for (const c of allCards) {
                        const want =
                            c === a0
                                ? aBoxes.get(c)!
                                : trackBox(
                                      spec(
                                          bBoxes.get(c)!,
                                          aBoxes.get(c)!,
                                          null,
                                          duration
                                      ),
                                      t
                                  )
                        worst = Math.max(
                            worst,
                            expectViewAt(
                                c,
                                want,
                                `L_MEAS_2 frame ${frameIdx + 1} (t=${elapsed.toFixed(3)}, ${c.textContent ?? ''})`
                            )
                        )
                    }
                },
                () => run.value !== null
            )

            assert.ok(run.value !== null, 'L_MEAS_2 run settled')
            assert.equal(
                run.value.status,
                'ended',
                `L_MEAS_2 status: expected 'ended', got '${run.value.status}'`
            )
            assert.equal(run.value.snapped.length, 0, 'L_MEAS_2 no snaps')
        } finally {
            quiet.restore()
        }

        return report('L_MEAS_2', worst, 'kanban move + auto-scroll')
    } finally {
        h.dispose()
    }
}

/**
 * L-MEAS-3: accordion opens, then instant `scrollIntoView` in the same task.
 * Participants start where seen; non-participants follow the scroll immediately; exact settle.
 */
export async function L_MEAS_3(): Promise<string> {
    const duration = 0.24
    const h = harness({
        motion: { duration, timing: timing.easeOut },
    })
    try {
        h.root.style.height = '2400px'
        window.scrollTo(0, 0)

        const nonParticipant = node(
            h.root,
            'left: 20px; top: 180px; width: 240px; height: 40px;'
        )
        const header = node(
            h.root,
            'left: 20px; top: 260px; width: 240px; height: 50px;'
        )
        const body = node(
            h.root,
            'left: 20px; top: 310px; width: 240px; height: 0px; overflow: hidden;'
        )
        const footer = node(
            h.root,
            'left: 20px; top: 310px; width: 240px; height: 60px;'
        )
        h.add(header)
        h.add(footer)

        await h.group.update(() => {})
        const bNon = viewBox(nonParticipant)
        const bHeader = viewBox(header)
        const bFooter = viewBox(footer)

        h.group.capture()
        // Open accordion (+240px) and scroll footer to top of viewport in the same task
        body.style.height = '240px'
        footer.style.top = '550px'
        footer.scrollIntoView({ behavior: 'instant', block: 'start' })
        const scrollDelta = window.scrollY
        assert.ok(
            scrollDelta > 100,
            `L_MEAS_3 scrollIntoView scrolled page (${scrollDelta}px)`
        )

        const aNon = shiftBox(bNon, 0, -scrollDelta)
        const aHeader = shiftBox(bHeader, 0, -scrollDelta)
        const aFooter = shiftBox(bFooter, 0, 240 - scrollDelta)

        const run = report(h.group.flush())
        let worst = 0

        // Frame 0: participants start where seen (bHeader, bFooter); non-participant is at aNon
        worst = Math.max(
            worst,
            expectViewAt(header, bHeader, 'L_MEAS_3 frame 0 header'),
            expectViewAt(footer, bFooter, 'L_MEAS_3 frame 0 footer'),
            expectViewAt(
                nonParticipant,
                aNon,
                'L_MEAS_3 frame 0 nonParticipant'
            )
        )

        await frames(
            h.mc,
            30,
            (elapsed, frameIdx) => {
                const t = since(0, elapsed)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        header,
                        trackBox(spec(bHeader, aHeader, null, duration), t),
                        `L_MEAS_3 frame ${frameIdx + 1} (t=${elapsed.toFixed(3)}) header`
                    ),
                    expectViewAt(
                        footer,
                        trackBox(spec(bFooter, aFooter, null, duration), t),
                        `L_MEAS_3 frame ${frameIdx + 1} (t=${elapsed.toFixed(3)}) footer`
                    ),
                    expectViewAt(
                        nonParticipant,
                        aNon,
                        `L_MEAS_3 frame ${frameIdx + 1} (t=${elapsed.toFixed(3)}) nonParticipant`
                    )
                )
            },
            () => run.value !== null
        )

        assert.ok(run.value !== null, 'L_MEAS_3 run settled')
        assert.equal(run.value.status, 'ended', 'L_MEAS_3 status ended')
        assert.equal(run.value.snapped.length, 0, 'L_MEAS_3 no snaps')
        worst = Math.max(
            worst,
            expectViewAt(header, aHeader, 'L_MEAS_3 settle header'),
            expectViewAt(footer, aFooter, 'L_MEAS_3 settle footer')
        )

        return report('L_MEAS_3', worst, `scrollY=${scrollDelta.toFixed(0)}px`)
    } finally {
        window.scrollTo(0, 0)
        h.dispose()
    }
}

/**
 * L-MEAS-4: user scroll mid-run (inner and page), then a commit:
 * - with parent at rest -> §5.7 path 2 (translate, no restart);
 * - under a live-scaling parent at 0.5 and 2 -> §5.7 path 3 (retarget from measured B, velocity continuous);
 * - a sub-0.01 px rest displacement under a live ancestor scale of 300 -> §5.7 path 3, never path 1.
 */
export async function L_MEAS_4(): Promise<string> {
    let worst = 0
    const duration = 0.32

    // 1. Parent at rest -> §5.7 path 2 (no restart; matches original track translated by scroll)
    {
        const h = harness({
            motion: { duration, timing: timing.easeOut },
        })
        try {
            h.root.style.height = '2000px'
            window.scrollTo(0, 0)

            const parent = node(
                h.root,
                'left: 20px; top: 120px; width: 420px; height: 320px; transform-origin: 0 0;'
            )
            const scroller = node(
                parent,
                'left: 0; top: 0; width: 400px; height: 220px; overflow-y: auto;'
            )
            const spacer = node(
                scroller,
                'left: 0; top: 0; width: 1px; height: 600px;'
            )
            void spacer
            const innerChild = node(
                scroller,
                'left: 10px; top: 80px; width: 80px; height: 40px; transform-origin: 0 0;'
            )
            const pageChild = node(
                parent,
                'left: 10px; top: 250px; width: 80px; height: 40px; transform-origin: 0 0;'
            )
            const trigger = node(
                h.root,
                'left: 500px; top: 120px; width: 60px; height: 40px;'
            )
            h.add(parent)
            h.add(innerChild)
            h.add(pageChild)
            h.add(trigger)

            await h.group.update(() => {})
            const bInner1 = viewBox(innerChild)
            const bPage1 = viewBox(pageChild)

            h.group.capture()
            innerChild.style.left = '170px'
            pageChild.style.left = '170px'
            const aInner1 = shiftBox(bInner1, 160, 0)
            const aPage1 = shiftBox(bPage1, 160, 0)
            const specInner1 = spec(bInner1, aInner1, null, duration)
            const specPage1 = spec(bPage1, aPage1, null, duration)
            const run1 = report(h.group.flush())

            // Advance 5 frames (t = 4 * 0.016 = 0.064s)
            await frames(h.mc, 5, (elapsed, idx) => {
                const t = since(0, elapsed)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        innerChild,
                        trackBox(specInner1, t),
                        `L_MEAS_4 rest pre-scroll frame ${idx + 1} innerChild`
                    ),
                    expectViewAt(
                        pageChild,
                        trackBox(specPage1, t),
                        `L_MEAS_4 rest pre-scroll frame ${idx + 1} pageChild`
                    )
                )
            })

            // Mid-run user scroll (inner scroller +40px, page scroller +50px)
            scroller.scrollTop = 40
            window.scrollTo(0, 50)
            const tAtScroll = since(0, 4 * 0.016)
            worst = Math.max(
                worst,
                expectViewAt(
                    innerChild,
                    shiftBox(trackBox(specInner1, tAtScroll), 0, -90),
                    'L_MEAS_4 rest immediately after user scroll innerChild'
                ),
                expectViewAt(
                    pageChild,
                    shiftBox(trackBox(specPage1, tAtScroll), 0, -50),
                    'L_MEAS_4 rest immediately after user scroll pageChild'
                )
            )

            // Commit while scrolled: innerChild and pageChild keep their tracks on path 2 (no restart)
            h.group.capture()
            trigger.style.left = '580px'
            const quiet = silenceWarnings()
            try {
                void h.group.flush()
            } finally {
                quiet.restore()
            }

            // Remaining 16 frames of the original 0.32s track (frames 5..20):
            for (let step = 5; step <= 20; step++) {
                h.mc.frame(16)
                await settleMicrotasks()
                const elapsed = step * 0.016
                const t = since(0, elapsed)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        innerChild,
                        shiftBox(trackBox(specInner1, t), 0, -90),
                        `L_MEAS_4 path2 frame ${step} (t=${elapsed.toFixed(3)}) innerChild`
                    ),
                    expectViewAt(
                        pageChild,
                        shiftBox(trackBox(specPage1, t), 0, -50),
                        `L_MEAS_4 path2 frame ${step} (t=${elapsed.toFixed(3)}) pageChild`
                    )
                )
            }
            // At t = 0.32s (step 20), run1 has ended and innerChild/pageChild have restored styles (no restart!)
            assert.ok(
                run1.value !== null && run1.value.status === 'ended',
                'L_MEAS_4 path2 original run1 ended on schedule without restart'
            )
            assert.equal(
                innerChild.style.translate,
                '',
                'L_MEAS_4 path2 innerChild settled at original duration'
            )
            assert.equal(
                pageChild.style.translate,
                '',
                'L_MEAS_4 path2 pageChild settled at original duration'
            )
        } finally {
            window.scrollTo(0, 0)
            h.dispose()
        }
    }

    // 2. Under a live-scaling parent at 0.5 and 2 -> §5.7 path 3 (retarget from measured B, velocity continuous)
    for (const parentScale of [0.5, 2] as const) {
        const h = harness({
            motion: { duration, timing: timing.easeOut },
        })
        try {
            h.root.style.height = '2000px'
            window.scrollTo(0, 0)

            const startW = parentScale === 2 ? 400 : 200
            const endW = parentScale === 2 ? 200 : 400
            const parent = node(
                h.root,
                `left: 20px; top: 100px; width: ${startW}px; height: ${startW}px; transform-origin: 0 0;`
            )
            const scroller = node(
                parent,
                'left: 0; top: 0; width: 180px; height: 160px; overflow-y: auto;'
            )
            const tall = node(
                scroller,
                'left: 0; top: 0; width: 1px; height: 500px;'
            )
            void tall
            const child = node(
                scroller,
                'left: 10px; top: 60px; width: 60px; height: 30px; transform-origin: 0 0;'
            )
            const trigger = node(
                h.root,
                'left: 500px; top: 100px; width: 60px; height: 40px;'
            )
            h.add(parent)
            h.add(child)
            h.add(trigger)

            await h.group.update(() => {})
            const bParent1 = viewBox(parent)
            const bChild1 = viewBox(child)

            h.group.capture()
            parent.style.width = `${endW}px`
            parent.style.height = `${endW}px`
            child.style.left = '90px'
            const aParent1: OBox = {
                x: bParent1.x,
                y: bParent1.y,
                w: endW,
                h: endW,
            }
            const aChild1: OBox = {
                x: bParent1.x + 90,
                y: bChild1.y,
                w: 60,
                h: 30,
            }
            const specParent1 = spec(
                bParent1,
                aParent1,
                null,
                duration,
                EASE_OUT,
                0,
                0
            )
            const specChild1 = spec(
                bChild1,
                aChild1,
                null,
                duration,
                EASE_OUT,
                0,
                0
            )
            void h.group.flush()

            // Advance 5 frames (t = 0.064s)
            await frames(h.mc, 5, (elapsed, idx) => {
                const t = since(0, elapsed)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        parent,
                        trackBox(specParent1, t),
                        `L_MEAS_4 scale=${parentScale} pre-scroll frame ${idx + 1} parent`
                    ),
                    expectViewAt(
                        child,
                        trackBox(specChild1, t),
                        `L_MEAS_4 scale=${parentScale} pre-scroll frame ${idx + 1} child`
                    )
                )
            })

            // Mid-run user scroll (inner +24px, page +30px)
            scroller.scrollTop = 24
            window.scrollTo(0, 30)
            const bChildAtCommit = viewBox(child)
            const bParentAtCommit = viewBox(parent)
            const tCommit = since(0, 4 * 0.016)
            const vChildAtCommit = trackVelocity(specChild1, tCommit)
            const vParentAtCommit = trackVelocity(specParent1, tCommit)

            const aParent2 = shiftBox(aParent1, 0, -30)
            const aChild2 = shiftBox(aChild1, 0, -24 - 30)

            h.group.capture()
            trigger.style.left = '580px'
            const quiet = silenceWarnings()
            let run2: ReturnType<typeof report>
            try {
                run2 = report(h.group.flush())
            } finally {
                quiet.restore()
            }

            // First frame after commit must equal measured B within 0.5 px
            worst = Math.max(
                worst,
                expectViewAt(
                    child,
                    bChildAtCommit,
                    `L_MEAS_4 scale=${parentScale} path3 commit frame 0 child`
                ),
                expectViewAt(
                    parent,
                    bParentAtCommit,
                    `L_MEAS_4 scale=${parentScale} path3 commit frame 0 parent`
                )
            )

            const specChild2 = spec(
                bChildAtCommit,
                aChild2,
                vChildAtCommit,
                duration,
                EASE_OUT,
                0,
                0
            )
            await frames(
                h.mc,
                30,
                (elapsed, idx) => {
                    const t2 = (idx + 1) * 0.016
                    worst = Math.max(
                        worst,
                        expectViewAt(
                            child,
                            trackBox(specChild2, t2),
                            `L_MEAS_4 scale=${parentScale} path3 frame ${idx + 1} (t2=${t2.toFixed(3)}) child`
                        )
                    )
                    void vParentAtCommit
                    void elapsed
                },
                () => run2.value !== null
            )
            worst = Math.max(
                worst,
                expectViewAt(
                    child,
                    aChild2,
                    `L_MEAS_4 scale=${parentScale} path3 settle child`
                )
            )
        } finally {
            window.scrollTo(0, 0)
            h.dispose()
        }
    }

    // 3. Sub-0.01 px rest displacement under a live ancestor scale of 300 -> §5.7 path 3, never path 1
    {
        const h = harness({
            motion: { duration, timing: timing.easeOut },
        })
        try {
            const anc = node(
                h.root,
                'left: 0; top: 0; width: 3000px; height: 3000px; transform: scale(0.1); transform-origin: 0 0;'
            )
            const wrap = node(
                anc,
                'left: 0; top: 0; width: 100px; height: 100px; transform-origin: 0 0;'
            )
            const child = node(
                wrap,
                'left: 1000px; top: 0; width: 200px; height: 200px; transform-origin: 0 0;'
            )
            const trigger = node(
                h.root,
                'left: 400px; top: 0; width: 50px; height: 50px;'
            )
            h.add(anc)
            h.add(child)
            h.add(trigger)

            await h.group.update(() => {})
            // Flush 1: anc shrinks 30x (300 -> 10 in view space under scale(0.1), pose = 30, innerPlanned = 0.1);
            // child moves x: 100 -> 0 (w: 20 -> 20).
            h.group.capture()
            anc.style.width = '100px'
            anc.style.height = '100px'
            child.style.left = '0px'
            void h.group.flush()

            // Advance 1 frame (dt = 0, anc pose = 30, child at x = 100)
            h.mc.frame(16)
            await settleMicrotasks()

            // Switch anc inner scale to 1 (with width 10px so anc's rest box stays 10x10 and drawn box stays 300x300,
            // giving rho = pose(30) * innerNow(1) / innerPlanned(0.1) = 300), and shift wrap by 0.005px (< 0.01px!).
            anc.style.width = '10px'
            anc.style.height = '10px'
            anc.style.transform = 'scale(1)'
            child.style.width = '20px'
            child.style.height = '20px'
            wrap.style.transform = 'translateX(0.005px)'

            const bChild300 = viewBox(child)
            const rootBox = viewBox(h.root)
            const aChild300: OBox = {
                x: rootBox.x + 0.005,
                y: rootBox.y,
                w: 20,
                h: 20,
            }

            h.group.capture()
            trigger.style.left = '480px'
            const quiet = silenceWarnings()
            let run300: ReturnType<typeof report>
            try {
                run300 = report(h.group.flush())
            } finally {
                quiet.restore()
            }

            // Path 3 retargets from bChild300 (error <= 0.5 px on frame 0; path 1 would jump by > 0.5 px)
            worst = Math.max(
                worst,
                expectViewAt(
                    child,
                    bChild300,
                    'L_MEAS_4 scale=300 sub-0.01px path3 frame 0 child'
                )
            )
            await frames(
                h.mc,
                30,
                (elapsed, idx) => {
                    const t2 = (idx + 1) * 0.016
                    worst = Math.max(
                        worst,
                        expectViewAt(
                            child,
                            trackBox(
                                spec(
                                    bChild300,
                                    aChild300,
                                    null,
                                    duration,
                                    EASE_OUT,
                                    0,
                                    0
                                ),
                                t2
                            ),
                            `L_MEAS_4 scale=300 sub-0.01px path3 frame ${idx + 1} (t2=${t2.toFixed(3)}) child`
                        )
                    )
                    void elapsed
                },
                () => run300.value !== null
            )
        } finally {
            h.dispose()
        }
    }

    return report('L_MEAS_4', worst, 'path 2 at rest; path 3 at 0.5, 2, 300')
}

/**
 * L-MEAS-6: sticky engages mid-run: (a) with no later commit, (b) with a later commit.
 */
export async function L_MEAS_6(): Promise<string> {
    let worst = 0
    const duration = 0.24

    for (const withCommit of [false, true] as const) {
        const h = harness({
            motion: { duration, timing: timing.easeOut },
        })
        try {
            const scroller = node(
                h.root,
                'left: 20px; top: 20px; width: 320px; height: 220px; overflow-y: auto;'
            )
            const flow = document.createElement('div')
            flow.style.cssText =
                'position: relative; width: 300px; height: 700px; padding-top: 80px; box-sizing: border-box;'
            scroller.append(flow)

            const stickyEl = document.createElement('div')
            stickyEl.style.cssText =
                'position: sticky; top: 12px; margin-left: 10px; width: 100px; height: 40px; box-sizing: border-box;'
            flow.append(stickyEl)

            const trigger = node(
                h.root,
                'left: 400px; top: 20px; width: 60px; height: 40px;'
            )
            h.add(stickyEl)
            h.add(trigger)

            await h.group.update(() => {})
            const scrollerBox = viewBox(scroller)
            const b1 = viewBox(stickyEl)

            h.group.capture()
            stickyEl.style.marginLeft = '150px'
            const a1 = shiftBox(b1, 140, 0)
            const spec1 = spec(b1, a1, null, duration)
            const run1 = report(h.group.flush())

            // Advance 5 frames (t = 0.064s) before sticky engages
            await frames(h.mc, 5, (elapsed, idx) => {
                const t = since(0, elapsed)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        stickyEl,
                        trackBox(spec1, t),
                        `L_MEAS_6 (${withCommit ? 'b' : 'a'}) pre-sticky frame ${idx + 1}`
                    )
                )
            })

            // Scroll scroller by 120px: stickyEl was at scrollerBox.y + 80, engages sticky at scrollerBox.y + 12
            // (so its y shifts by -68px instead of -120px)
            scroller.scrollTop = 120
            const stickyDeltaY = scrollerBox.y + 12 - b1.y

            if (!withCommit) {
                await frames(
                    h.mc,
                    25,
                    (elapsed, idx) => {
                        const totalElapsed = 4 * 0.016 + (idx + 1) * 0.016
                        const want = shiftBox(
                            trackBox(spec1, totalElapsed),
                            0,
                            stickyDeltaY
                        )
                        worst = Math.max(
                            worst,
                            expectViewAt(
                                stickyEl,
                                want,
                                `L_MEAS_6 (a) post-sticky frame ${idx + 1} (t=${totalElapsed.toFixed(3)})`
                            )
                        )
                        void elapsed
                    },
                    () => run1.value !== null
                )
                assert.ok(run1.value !== null, 'L_MEAS_6 (a) run settled')
                assert.equal(
                    run1.value.status,
                    'ended',
                    'L_MEAS_6 (a) status ended'
                )
                assert.equal(
                    run1.value.snapped.length,
                    0,
                    'L_MEAS_6 (a) no snaps'
                )
                worst = Math.max(
                    worst,
                    expectViewAt(
                        stickyEl,
                        shiftBox(a1, 0, stickyDeltaY),
                        'L_MEAS_6 (a) final frame exact'
                    )
                )
            } else {
                const bAtCommit = viewBox(stickyEl)
                h.group.capture()
                trigger.style.left = '480px'
                const quiet = silenceWarnings()
                let run2: ReturnType<typeof report>
                try {
                    run2 = report(h.group.flush())
                } finally {
                    quiet.restore()
                }
                worst = Math.max(
                    worst,
                    expectViewAt(
                        stickyEl,
                        bAtCommit,
                        'L_MEAS_6 (b) commit frame 0 continuity'
                    )
                )
                await frames(
                    h.mc,
                    25,
                    (elapsed, idx) => {
                        const totalElapsed = 4 * 0.016 + (idx + 1) * 0.016
                        const want = shiftBox(
                            trackBox(spec1, totalElapsed),
                            0,
                            stickyDeltaY
                        )
                        worst = Math.max(
                            worst,
                            expectViewAt(
                                stickyEl,
                                want,
                                `L_MEAS_6 (b) post-commit frame ${idx + 1} (t=${totalElapsed.toFixed(3)})`
                            )
                        )
                        void elapsed
                    },
                    () => run2.value !== null
                )
                worst = Math.max(
                    worst,
                    expectViewAt(
                        stickyEl,
                        shiftBox(a1, 0, stickyDeltaY),
                        'L_MEAS_6 (b) final settle'
                    )
                )
            }
        } finally {
            h.dispose()
        }
    }

    return report('L_MEAS_6', worst, 'sticky (a) no commit, (b) with commit')
}

/**
 * L-MEAS-7: browser layout change mid-run (an element above grows), then a commit;
 * flat (takes §5.7 path 2) and nested with a child under a live-scaling parent (takes §5.7 path 3).
 */
export async function L_MEAS_7(): Promise<string> {
    let worst = 0
    const duration = 0.32

    // Part 1: Flat -> takes §5.7 path 2 (translate, no restart)
    {
        const h = harness({
            motion: { duration, timing: timing.easeOut },
        })
        try {
            const stack = node(
                h.root,
                'left: 20px; top: 20px; width: 360px; height: 400px;'
            )
            const banner = document.createElement('div')
            banner.style.cssText =
                'position: relative; width: 300px; height: 40px;'
            stack.append(banner)

            const card = document.createElement('div')
            card.style.cssText =
                'position: relative; margin-left: 0px; width: 100px; height: 50px; box-sizing: border-box;'
            stack.append(card)

            const trigger = node(
                h.root,
                'left: 420px; top: 20px; width: 60px; height: 40px;'
            )
            h.add(card)
            h.add(trigger)

            await h.group.update(() => {})
            const b1 = viewBox(card)

            h.group.capture()
            card.style.marginLeft = '160px'
            const a1 = shiftBox(b1, 160, 0)
            const spec1 = spec(b1, a1, null, duration)
            const run1 = report(h.group.flush())

            await frames(h.mc, 5, (elapsed, idx) => {
                worst = Math.max(
                    worst,
                    expectViewAt(
                        card,
                        trackBox(spec1, since(0, elapsed)),
                        `L_MEAS_7 flat pre-grow frame ${idx + 1}`
                    )
                )
            })

            // Unregistered banner above grows by +60px mid-run
            banner.style.height = '100px'
            const tAtGrow = since(0, 4 * 0.016)
            worst = Math.max(
                worst,
                expectViewAt(
                    card,
                    shiftBox(trackBox(spec1, tAtGrow), 0, 60),
                    'L_MEAS_7 flat immediately after banner grow'
                )
            )

            // Commit: card takes §5.7 path 2 (no restart)
            h.group.capture()
            trigger.style.left = '500px'
            void h.group.flush()

            for (let step = 5; step <= 20; step++) {
                h.mc.frame(16)
                await settleMicrotasks()
                const elapsed = step * 0.016
                worst = Math.max(
                    worst,
                    expectViewAt(
                        card,
                        shiftBox(trackBox(spec1, since(0, elapsed)), 0, 60),
                        `L_MEAS_7 flat path2 frame ${step} (t=${elapsed.toFixed(3)})`
                    )
                )
            }
            assert.ok(
                run1.value !== null && run1.value.status === 'ended',
                'L_MEAS_7 flat run1 ended without restart'
            )
            assert.equal(
                card.style.translate,
                '',
                'L_MEAS_7 flat card restored styles on original schedule'
            )
        } finally {
            h.dispose()
        }
    }

    // Part 2: Nested child under a live-scaling parent -> takes §5.7 path 3 (retarget)
    {
        const h = harness({
            motion: { duration, timing: timing.easeOut },
        })
        try {
            const stack = node(
                h.root,
                'left: 20px; top: 20px; width: 420px; height: 500px;'
            )
            const banner = document.createElement('div')
            banner.style.cssText =
                'position: relative; width: 300px; height: 40px;'
            stack.append(banner)

            const parent = document.createElement('div')
            parent.style.cssText =
                'position: relative; width: 320px; height: 200px; transform-origin: 0 0; box-sizing: border-box;'
            stack.append(parent)

            const child = node(
                parent,
                'left: 10px; top: 20px; width: 80px; height: 40px; transform-origin: 0 0;'
            )
            const trigger = node(
                h.root,
                'left: 460px; top: 20px; width: 60px; height: 40px;'
            )
            h.add(parent)
            h.add(child)
            h.add(trigger)

            await h.group.update(() => {})
            const bParent1 = viewBox(parent)
            const bChild1 = viewBox(child)

            h.group.capture()
            parent.style.width = '160px'
            parent.style.height = '100px'
            child.style.left = '90px'
            const aParent1: OBox = {
                x: bParent1.x,
                y: bParent1.y,
                w: 160,
                h: 100,
            }
            const aChild1 = shiftBox(bChild1, 80, 0)
            const specParent1 = spec(
                bParent1,
                aParent1,
                null,
                duration,
                EASE_OUT,
                0,
                0
            )
            const specChild1 = spec(
                bChild1,
                aChild1,
                null,
                duration,
                EASE_OUT,
                0,
                0
            )
            void h.group.flush()

            await frames(h.mc, 5, (elapsed, idx) => {
                const t = since(0, elapsed)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        parent,
                        trackBox(specParent1, t),
                        `L_MEAS_7 nested pre-grow frame ${idx + 1} parent`
                    ),
                    expectViewAt(
                        child,
                        trackBox(specChild1, t),
                        `L_MEAS_7 nested pre-grow frame ${idx + 1} child`
                    )
                )
            })

            // Banner above grows by +50px mid-run
            banner.style.height = '90px'
            const bChildAtCommit = viewBox(child)
            const tCommit = since(0, 4 * 0.016)
            const vChildAtCommit = trackVelocity(specChild1, tCommit)
            const aChild2 = shiftBox(aChild1, 0, 50)

            h.group.capture()
            trigger.style.left = '520px'
            const run2 = report(h.group.flush())

            worst = Math.max(
                worst,
                expectViewAt(
                    child,
                    bChildAtCommit,
                    'L_MEAS_7 nested path3 frame 0 child'
                )
            )

            const specChild2 = spec(
                bChildAtCommit,
                aChild2,
                vChildAtCommit,
                duration,
                EASE_OUT,
                0,
                0
            )
            await frames(
                h.mc,
                30,
                (elapsed, idx) => {
                    const t2 = (idx + 1) * 0.016
                    worst = Math.max(
                        worst,
                        expectViewAt(
                            child,
                            trackBox(specChild2, t2),
                            `L_MEAS_7 nested path3 frame ${idx + 1} (t2=${t2.toFixed(3)}) child`
                        )
                    )
                    void elapsed
                },
                () => run2.value !== null
            )
            worst = Math.max(
                worst,
                expectViewAt(child, aChild2, 'L_MEAS_7 nested settle child')
            )
        } finally {
            h.dispose()
        }
    }

    return report('L_MEAS_7', worst, 'flat path 2 + nested path 3')
}

/**
 * L-MEAS-8: fixed sheet with nested participants while the page scrolls.
 * No motion from the page scroll; inner layout animates cleanly in view space.
 */
export async function L_MEAS_8(): Promise<string> {
    const duration = 0.24
    const h = harness({
        motion: { duration, timing: timing.easeOut },
    })
    try {
        h.root.style.height = '2400px'
        window.scrollTo(0, 100)

        const sheet = document.createElement('div')
        sheet.style.cssText =
            'position: fixed; left: 40px; top: 60px; width: 260px; height: 180px; box-sizing: border-box;'
        h.root.append(sheet)
        const inner = node(
            sheet,
            'left: 16px; top: 24px; width: 100px; height: 44px;'
        )
        h.add(sheet)
        h.add(inner)

        await h.group.update(() => {})
        const bSheet0 = viewBox(sheet)
        const bInner0 = viewBox(inner)

        // Phase 1: Page scrolls between capture and flush with no sheet mutation -> zero motion
        h.group.capture()
        window.scrollTo(0, 380)
        const noChangeRun = await h.group.flush()
        let worst = Math.max(
            expectViewAt(sheet, bSheet0, 'L_MEAS_8 scroll-only sheet'),
            expectViewAt(inner, bInner0, 'L_MEAS_8 scroll-only inner')
        )
        assert.equal(
            noChangeRun.status,
            'no-change',
            `L_MEAS_8 scroll-only status: expected 'no-change', got '${noChangeRun.status}'`
        )
        assert.equal(
            noChangeRun.snapped.length,
            0,
            'L_MEAS_8 scroll-only snapped empty'
        )

        // Phase 2: Inner layout animates while the page scrolls both at flush and mid-run
        h.group.capture()
        window.scrollTo(0, 620)
        sheet.style.width = '320px'
        inner.style.left = '136px'
        const aSheet: OBox = { ...bSheet0, w: 320 }
        const aInner = shiftBox(bInner0, 120, 0)
        const specSheet = spec(bSheet0, aSheet, null, duration)
        const specInner = spec(bInner0, aInner, null, duration)
        const animRun = report(h.group.flush())

        worst = Math.max(
            worst,
            expectViewAt(sheet, bSheet0, 'L_MEAS_8 anim frame 0 sheet'),
            expectViewAt(inner, bInner0, 'L_MEAS_8 anim frame 0 inner')
        )

        await frames(
            h.mc,
            25,
            (elapsed, idx) => {
                if (idx === 4) window.scrollTo(0, 900)
                if (idx === 9) window.scrollTo(0, 150)
                const t = since(0, elapsed)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        sheet,
                        trackBox(specSheet, t),
                        `L_MEAS_8 anim frame ${idx + 1} (t=${elapsed.toFixed(3)}) sheet`
                    ),
                    expectViewAt(
                        inner,
                        trackBox(specInner, t),
                        `L_MEAS_8 anim frame ${idx + 1} (t=${elapsed.toFixed(3)}) inner`
                    )
                )
            },
            () => animRun.value !== null
        )

        assert.ok(animRun.value !== null, 'L_MEAS_8 anim run settled')
        assert.equal(animRun.value.status, 'ended', 'L_MEAS_8 anim ended')

        return report('L_MEAS_8', worst, 'fixed sheet immune to page scroll')
    } finally {
        window.scrollTo(0, 0)
        h.dispose()
    }
}

/**
 * L-MEAS-9: nested driven parent and child:
 * (a) fresh capture mid-run -> no shear, exact (B, v);
 * (b) a frame advanced between capture() and flush() -> aged, §4.4 outcome, no rewind.
 */
export async function L_MEAS_9(): Promise<string> {
    let worst = 0
    const duration = 0.32

    // (a) Fresh capture mid-run
    {
        const h = harness({
            motion: { duration, timing: timing.easeOut },
        })
        try {
            const parent = node(
                h.root,
                'left: 20px; top: 20px; width: 200px; height: 120px; transform-origin: 0 0;'
            )
            const child = node(
                parent,
                'left: 10px; top: 15px; width: 60px; height: 40px; transform-origin: 0 0;'
            )
            h.add(parent)
            h.add(child)

            await h.group.update(() => {})
            const bParent1 = viewBox(parent)
            const bChild1 = viewBox(child)

            h.group.capture()
            parent.style.left = '140px'
            parent.style.width = '300px'
            child.style.left = '90px'
            child.style.width = '100px'
            const aParent1: OBox = {
                x: bParent1.x + 120,
                y: bParent1.y,
                w: 300,
                h: 120,
            }
            const aChild1: OBox = {
                x: aParent1.x + 90,
                y: bChild1.y,
                w: 100,
                h: 40,
            }
            const specParent1 = spec(
                bParent1,
                aParent1,
                null,
                duration,
                EASE_OUT,
                0,
                0
            )
            const specChild1 = spec(
                bChild1,
                aChild1,
                null,
                duration,
                EASE_OUT,
                0,
                0
            )
            void h.group.flush()

            // Advance 6 frames (t = 5 * 0.016 = 0.080s)
            await frames(h.mc, 6, (elapsed, idx) => {
                const t = since(0, elapsed)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        parent,
                        trackBox(specParent1, t),
                        `L_MEAS_9 (a) pre-retarget frame ${idx + 1} parent`
                    ),
                    expectViewAt(
                        child,
                        trackBox(specChild1, t),
                        `L_MEAS_9 (a) pre-retarget frame ${idx + 1} child`
                    )
                )
            })

            const tRetarget = since(0, 5 * 0.016)
            const bParent2 = viewBox(parent)
            const bChild2 = viewBox(child)
            const vParent2 = trackVelocity(specParent1, tRetarget)
            const vChild2 = trackVelocity(specChild1, tRetarget)

            h.group.capture()
            parent.style.left = '60px'
            parent.style.top = '80px'
            parent.style.width = '240px'
            child.style.left = '40px'
            child.style.top = '35px'
            child.style.width = '80px'
            const rootBox = viewBox(h.root)
            const aParent2: OBox = {
                x: rootBox.x + 60,
                y: rootBox.y + 80,
                w: 240,
                h: 120,
            }
            const aChild2: OBox = {
                x: aParent2.x + 40,
                y: aParent2.y + 35,
                w: 80,
                h: 40,
            }
            const specParent2 = spec(
                bParent2,
                aParent2,
                vParent2,
                duration,
                EASE_OUT,
                0,
                0
            )
            const specChild2 = spec(
                bChild2,
                aChild2,
                vChild2,
                duration,
                EASE_OUT,
                0,
                0
            )
            const run2 = report(h.group.flush())

            worst = Math.max(
                worst,
                expectViewAt(
                    parent,
                    bParent2,
                    'L_MEAS_9 (a) retarget frame 0 parent'
                ),
                expectViewAt(
                    child,
                    bChild2,
                    'L_MEAS_9 (a) retarget frame 0 child'
                )
            )

            await frames(
                h.mc,
                30,
                (elapsed, idx) => {
                    const t2 = (idx + 1) * 0.016
                    worst = Math.max(
                        worst,
                        expectViewAt(
                            parent,
                            trackBox(specParent2, t2),
                            `L_MEAS_9 (a) retarget frame ${idx + 1} (t2=${t2.toFixed(3)}) parent`
                        ),
                        expectViewAt(
                            child,
                            trackBox(specChild2, t2),
                            `L_MEAS_9 (a) retarget frame ${idx + 1} (t2=${t2.toFixed(3)}) child`
                        )
                    )
                    void elapsed
                },
                () => run2.value !== null
            )
            assert.ok(run2.value !== null, 'L_MEAS_9 (a) settled')
            assert.equal(
                run2.value.status,
                'ended',
                'L_MEAS_9 (a) status ended'
            )
        } finally {
            h.dispose()
        }
    }

    // (b) Aged capture: a frame advances between capture() and flush()
    {
        const snappedCalls: { element: HTMLElement; reason: SnapReason }[] = []
        const h = harness({
            motion: { duration, timing: timing.linear },
            onSnap(element, reason) {
                snappedCalls.push({ element, reason })
            },
        })
        try {
            const parent = node(
                h.root,
                'left: 0; top: 0; width: 200px; height: 100px; transform-origin: 0 0;'
            )
            const child = node(
                parent,
                'left: 0; top: 0; width: 80px; height: 40px; transform-origin: 0 0;'
            )
            h.add(parent)
            h.add(child)

            await h.group.update(() => {})
            const bParent1 = viewBox(parent)
            const bChild1 = viewBox(child)

            h.group.capture()
            parent.style.left = '160px'
            child.style.left = '160px'
            const aParent1 = shiftBox(bParent1, 160, 0)
            const aChild1 = shiftBox(bChild1, 320, 0)
            const specParent1 = spec(
                bParent1,
                aParent1,
                null,
                duration,
                LINEAR,
                0,
                0
            )
            const specChild1 = spec(
                bChild1,
                aChild1,
                null,
                duration,
                LINEAR,
                0,
                0
            )
            const run1 = report(h.group.flush())

            // Advance 4 frames (t = 3 * 0.016 = 0.048s -> 15% of 0.32s)
            await frames(h.mc, 4, (elapsed, idx) => {
                const t = since(0, elapsed)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        parent,
                        trackBox(specParent1, t),
                        `L_MEAS_9 (b) pre-capture frame ${idx + 1} parent`
                    ),
                    expectViewAt(
                        child,
                        trackBox(specChild1, t),
                        `L_MEAS_9 (b) pre-capture frame ${idx + 1} child`
                    )
                )
            })

            // Capture at frame 4, then advance 4 more frames BEFORE flush() so capture is aged!
            h.group.capture()
            const agedCaptureChildBox = viewBox(child)
            await frames(h.mc, 4, () => {})
            const preFlushChildBox = viewBox(child)
            assert.ok(
                preFlushChildBox.x > agedCaptureChildBox.x + 25,
                'L_MEAS_9 (b) child advanced > 25px after capture before flush'
            )

            // Mutate parent (+40px) and child (+20px, total +60px in view space) and flush with aged capture
            parent.style.left = '200px'
            child.style.left = '180px'
            const aParent2 = shiftBox(aParent1, 40, 0)
            const aChild2 = shiftBox(aChild1, 60, 0)

            const quiet = silenceWarnings()
            let agedReport: Awaited<ReturnType<typeof h.group.flush>>
            try {
                agedReport = await h.group.flush()
            } finally {
                quiet.restore()
            }

            // §4.4: status is 'stale'; both driven nodes keep their tracks (translated by delta, NEVER rewound to agedCaptureChildBox)
            assert.equal(
                agedReport.status,
                'stale',
                `L_MEAS_9 (b) aged flush status: expected 'stale', got '${agedReport.status}'`
            )
            assert.equal(
                agedReport.snapped.length,
                2,
                'L_MEAS_9 (b) both driven nodes reported stale'
            )
            assert.equal(
                snappedCalls.length,
                2,
                'L_MEAS_9 (b) onSnap called for both driven nodes'
            )

            // Verify no rewind toward agedCaptureChildBox: drawn box is translated by +60px from the ongoing track
            const tAtFlush = since(0, 7 * 0.016)
            worst = Math.max(
                worst,
                expectViewAt(
                    parent,
                    shiftBox(trackBox(specParent1, tAtFlush), 40, 0),
                    'L_MEAS_9 (b) frame 0 after aged flush parent (no rewind)'
                ),
                expectViewAt(
                    child,
                    shiftBox(trackBox(specChild1, tAtFlush), 60, 0),
                    'L_MEAS_9 (b) frame 0 after aged flush child (no rewind)'
                )
            )

            await frames(
                h.mc,
                20,
                (elapsed, idx) => {
                    const totalElapsed = (7 + idx + 1) * 0.016
                    const t = since(0, totalElapsed)
                    worst = Math.max(
                        worst,
                        expectViewAt(
                            parent,
                            shiftBox(trackBox(specParent1, t), 40, 0),
                            `L_MEAS_9 (b) post-aged frame ${idx + 1} parent`
                        ),
                        expectViewAt(
                            child,
                            shiftBox(trackBox(specChild1, t), 60, 0),
                            `L_MEAS_9 (b) post-aged frame ${idx + 1} child`
                        )
                    )
                    void elapsed
                },
                () => run1.value !== null
            )
            worst = Math.max(
                worst,
                expectViewAt(parent, aParent2, 'L_MEAS_9 (b) settle parent'),
                expectViewAt(child, aChild2, 'L_MEAS_9 (b) settle child')
            )
        } finally {
            h.dispose()
        }
    }

    return report('L_MEAS_9', worst, '(a) fresh retarget, (b) aged no-rewind')
}

/**
 * L-MEAS-10: participants in an open and in a closed shadow root inside an outer scroller, as L-MEAS-4.
 */
export async function L_MEAS_10(): Promise<string> {
    let worst = 0
    const duration = 0.32
    const h = harness({
        motion: { duration, timing: timing.easeOut },
    })
    try {
        const scroller = node(
            h.root,
            'left: 20px; top: 20px; width: 400px; height: 260px; overflow-y: auto;'
        )
        const content = document.createElement('div')
        content.style.cssText =
            'position: relative; width: 380px; height: 700px;'
        scroller.append(content)

        const openHost = node(
            content,
            'left: 10px; top: 80px; width: 320px; height: 120px;'
        )
        const openRoot = openHost.attachShadow({ mode: 'open' })
        const openParent = document.createElement('div')
        openParent.style.cssText =
            'position: absolute; left: 0; top: 0; width: 300px; height: 100px; transform-origin: 0 0; box-sizing: border-box;'
        openRoot.append(openParent)
        const openChild = document.createElement('div')
        openChild.style.cssText =
            'position: absolute; left: 10px; top: 10px; width: 60px; height: 30px; transform-origin: 0 0; box-sizing: border-box;'
        openParent.append(openChild)

        const closedHost = node(
            content,
            'left: 10px; top: 220px; width: 320px; height: 120px;'
        )
        const closedRoot = closedHost.attachShadow({ mode: 'closed' })
        const closedParent = document.createElement('div')
        closedParent.style.cssText =
            'position: absolute; left: 0; top: 0; width: 150px; height: 50px; transform-origin: 0 0; box-sizing: border-box;'
        closedRoot.append(closedParent)
        const closedChild = document.createElement('div')
        closedChild.style.cssText =
            'position: absolute; left: 10px; top: 10px; width: 60px; height: 30px; transform-origin: 0 0; box-sizing: border-box;'
        closedParent.append(closedChild)

        const trigger = node(
            h.root,
            'left: 460px; top: 20px; width: 60px; height: 40px;'
        )

        h.add(openParent)
        h.add(openChild)
        h.add(closedParent)
        h.add(closedChild)
        h.add(trigger)

        await h.group.update(() => {})
        const bOpenChild1 = viewBox(openChild)
        const bClosedChild1 = viewBox(closedChild)

        // Flush 1: openParent shrinks 2x (300 -> 150), closedParent grows 0.5x (150 -> 300), both children move +100px
        h.group.capture()
        openParent.style.width = '150px'
        openParent.style.height = '50px'
        openChild.style.left = '110px'
        closedParent.style.width = '300px'
        closedParent.style.height = '100px'
        closedChild.style.left = '110px'

        const aOpenChild1 = shiftBox(bOpenChild1, 100, 0)
        const aClosedChild1 = shiftBox(bClosedChild1, 100, 0)
        const specOpen1 = spec(
            bOpenChild1,
            aOpenChild1,
            null,
            duration,
            EASE_OUT,
            0,
            0
        )
        const specClosed1 = spec(
            bClosedChild1,
            aClosedChild1,
            null,
            duration,
            EASE_OUT,
            0,
            0
        )
        void h.group.flush()

        await frames(h.mc, 5, (elapsed, idx) => {
            const t = since(0, elapsed)
            worst = Math.max(
                worst,
                expectViewAt(
                    openChild,
                    trackBox(specOpen1, t),
                    `L_MEAS_10 pre-scroll frame ${idx + 1} openChild`
                ),
                expectViewAt(
                    closedChild,
                    trackBox(specClosed1, t),
                    `L_MEAS_10 pre-scroll frame ${idx + 1} closedChild`
                )
            )
        })

        // Scroll outer scroller mid-run by 50px, then commit
        scroller.scrollTop = 50
        const bOpenCommit = viewBox(openChild)
        const bClosedCommit = viewBox(closedChild)
        const tCommit = since(0, 4 * 0.016)
        const vOpenCommit = trackVelocity(specOpen1, tCommit)
        const vClosedCommit = trackVelocity(specClosed1, tCommit)
        const aOpen2 = shiftBox(aOpenChild1, 0, -50)
        const aClosed2 = shiftBox(aClosedChild1, 0, -50)

        h.group.capture()
        trigger.style.left = '540px'
        const quiet = silenceWarnings()
        let run2: ReturnType<typeof report>
        try {
            run2 = report(h.group.flush())
        } finally {
            quiet.restore()
        }

        worst = Math.max(
            worst,
            expectViewAt(
                openChild,
                bOpenCommit,
                'L_MEAS_10 commit frame 0 openChild'
            ),
            expectViewAt(
                closedChild,
                bClosedCommit,
                'L_MEAS_10 commit frame 0 closedChild'
            )
        )

        const specOpen2 = spec(
            bOpenCommit,
            aOpen2,
            vOpenCommit,
            duration,
            EASE_OUT,
            0,
            0
        )
        const specClosed2 = spec(
            bClosedCommit,
            aClosed2,
            vClosedCommit,
            duration,
            EASE_OUT,
            0,
            0
        )

        await frames(
            h.mc,
            30,
            (elapsed, idx) => {
                const t2 = (idx + 1) * 0.016
                worst = Math.max(
                    worst,
                    expectViewAt(
                        openChild,
                        trackBox(specOpen2, t2),
                        `L_MEAS_10 post-commit frame ${idx + 1} openChild`
                    ),
                    expectViewAt(
                        closedChild,
                        trackBox(specClosed2, t2),
                        `L_MEAS_10 post-commit frame ${idx + 1} closedChild`
                    )
                )
                void elapsed
            },
            () => run2.value !== null
        )

        worst = Math.max(
            worst,
            expectViewAt(openChild, aOpen2, 'L_MEAS_10 settle openChild'),
            expectViewAt(closedChild, aClosed2, 'L_MEAS_10 settle closedChild')
        )

        return report('L_MEAS_10', worst, 'open + closed shadow roots')
    } finally {
        h.dispose()
    }
}

/**
 * L-MEAS-11: the §4.4 table: capture-less flush and aged capture (with an async gap
 * between capture() and flush() that lets a frame pass); undriven moved, undriven unmoved,
 * newly registered, driven with |delta| above and below threshold, and a driven node with
 * a sub-0.01 px delta under a live ancestor scale of 300.
 */
export async function L_MEAS_11(): Promise<string> {
    let worst = 0
    const duration = 0.32

    for (const mode of ['capture-less', 'aged'] as const) {
        const snappedCalls: { element: HTMLElement; reason: SnapReason }[] = []
        const h = harness({
            motion: { duration, timing: timing.linear },
            onSnap(element, reason) {
                snappedCalls.push({ element, reason })
            },
        })
        try {
            const undrivenMoved = node(
                h.root,
                'left: 0; top: 20px; width: 80px; height: 30px;'
            )
            const undrivenUnmoved = node(
                h.root,
                'left: 0; top: 60px; width: 80px; height: 30px;'
            )
            const drivenAbove = node(
                h.root,
                'left: 0; top: 100px; width: 80px; height: 30px; transform-origin: 0 0;'
            )
            const drivenBelow = node(
                h.root,
                'left: 0; top: 140px; width: 80px; height: 30px; transform-origin: 0 0;'
            )
            const anc300 = node(
                h.root,
                'left: 0; top: 200px; width: 3000px; height: 3000px; transform: scale(0.1); transform-origin: 0 0;'
            )
            const wrap300 = node(
                anc300,
                'left: 0; top: 0; width: 100px; height: 100px; transform-origin: 0 0;'
            )
            const drivenAmplified = node(
                wrap300,
                'left: 1000px; top: 0; width: 200px; height: 200px; transform-origin: 0 0;'
            )

            h.add(undrivenMoved)
            h.add(undrivenUnmoved)
            h.add(drivenAbove)
            h.add(drivenBelow)
            h.add(anc300)
            h.add(drivenAmplified)

            // Establish baseline
            await h.group.update(() => {})
            const bAbove1 = viewBox(drivenAbove)
            const bBelow1 = viewBox(drivenBelow)

            // Flush 1: start tracks on drivenAbove, drivenBelow, anc300 (30x shrink under scale(0.1)), and drivenAmplified
            h.group.capture()
            drivenAbove.style.left = '160px'
            drivenBelow.style.left = '160px'
            anc300.style.width = '100px'
            anc300.style.height = '100px'
            drivenAmplified.style.left = '0px'
            const aAbove1 = shiftBox(bAbove1, 160, 0)
            const aBelow1 = shiftBox(bBelow1, 160, 0)
            const specAbove1 = spec(bAbove1, aAbove1, null, duration, LINEAR)
            const specBelow1 = spec(bBelow1, aBelow1, null, duration, LINEAR)
            void h.group.flush()

            // Advance 1 frame (dt = 0)
            h.mc.frame(16)
            await settleMicrotasks()

            if (mode === 'aged') {
                // Take capture, then let an async gap and a frame pass before flush()
                h.group.capture()
                await Promise.resolve()
                h.mc.frame(16)
                await settleMicrotasks()
            }

            // Register a brand-new participant with no last known box
            const newlyRegistered = node(
                h.root,
                'left: 0; top: 260px; width: 80px; height: 30px;'
            )
            h.add(newlyRegistered)

            // Apply mutations for the §4.4 flush:
            // 1. undrivenMoved: moves by 80px >= threshold (1px) -> reported 'stale'
            undrivenMoved.style.left = '80px'
            // 2. undrivenUnmoved: moves by 0px < threshold -> NOT reported
            // 3. newlyRegistered: no last known box -> reported 'stale'
            // 4. drivenAbove: delta = +40px >= threshold -> keeps track (translated), reported 'stale'
            drivenAbove.style.left = '200px'
            // 5. drivenBelow: delta = +0.4px < threshold (exact translation) -> keeps track, NOT reported
            drivenBelow.style.left = '160.4px'
            // 6. anc300 + drivenAmplified: anc300 switches to width 10px, transform scale(1)
            //    (so A_anc stays 10x10, delta_anc = 0 -> NOT reported; rho = 30 * (1 / 0.1) = 300),
            //    while drivenAmplified shifts by delta = 0.005px < 0.01px (|delta| * rho = 1.5px >= threshold) -> reported 'stale'!
            anc300.style.width = '10px'
            anc300.style.height = '10px'
            anc300.style.transform = 'scale(1)'
            drivenAmplified.style.width = '20px'
            drivenAmplified.style.height = '20px'
            wrap300.style.transform = 'translateX(0.005px)'

            const quiet = silenceWarnings()
            let res: Awaited<ReturnType<typeof h.group.flush>>
            try {
                res = await h.group.flush()
            } finally {
                quiet.restore()
            }

            assert.equal(
                res.status,
                'stale',
                `L_MEAS_11 (${mode}) status: expected 'stale', got '${res.status}'`
            )

            const expectedSnapped = [
                undrivenMoved,
                drivenAbove,
                drivenAmplified,
                newlyRegistered,
            ]
            assert.equal(
                res.snapped.length,
                expectedSnapped.length,
                `L_MEAS_11 (${mode}) snapped count: expected ${expectedSnapped.length}, got ${res.snapped.length}`
            )
            for (const el of expectedSnapped) {
                assert.ok(
                    res.snapped.some(
                        (s) => s.element === el && s.reason === 'stale'
                    ),
                    `L_MEAS_11 (${mode}) expected element in report.snapped with 'stale'`
                )
                assert.ok(
                    snappedCalls.some(
                        (s) => s.element === el && s.reason === 'stale'
                    ),
                    `L_MEAS_11 (${mode}) expected element in onSnap calls with 'stale'`
                )
            }
            assert.ok(
                !res.snapped.some((s) => s.element === undrivenUnmoved),
                `L_MEAS_11 (${mode}) undrivenUnmoved must NOT be reported stale`
            )
            assert.ok(
                !res.snapped.some((s) => s.element === drivenBelow),
                `L_MEAS_11 (${mode}) drivenBelow must NOT be reported stale`
            )
            assert.ok(
                !res.snapped.some((s) => s.element === anc300),
                `L_MEAS_11 (${mode}) anc300 (delta=0) must NOT be reported stale`
            )

            // Verify geometry outcomes: undriven nodes are at A immediately; driven nodes keep their tracks
            const rootBox = viewBox(h.root)
            worst = Math.max(
                worst,
                expectViewAt(
                    undrivenMoved,
                    { x: rootBox.x + 80, y: rootBox.y + 20, w: 80, h: 30 },
                    `L_MEAS_11 (${mode}) undrivenMoved at A`
                ),
                expectViewAt(
                    undrivenUnmoved,
                    { x: rootBox.x, y: rootBox.y + 60, w: 80, h: 30 },
                    `L_MEAS_11 (${mode}) undrivenUnmoved at A`
                ),
                expectViewAt(
                    newlyRegistered,
                    { x: rootBox.x, y: rootBox.y + 260, w: 80, h: 30 },
                    `L_MEAS_11 (${mode}) newlyRegistered at A`
                )
            )

            const framesBefore = mode === 'aged' ? 1 : 0
            for (let step = 1; step <= 6; step++) {
                h.mc.frame(16)
                await settleMicrotasks()
                const t = (framesBefore + step) * 0.016
                worst = Math.max(
                    worst,
                    expectViewAt(
                        drivenAbove,
                        shiftBox(trackBox(specAbove1, t), 40, 0),
                        `L_MEAS_11 (${mode}) frame ${step} drivenAbove kept track`
                    ),
                    expectViewAt(
                        drivenBelow,
                        shiftBox(trackBox(specBelow1, t), 0.4, 0),
                        `L_MEAS_11 (${mode}) frame ${step} drivenBelow kept track`
                    )
                )
            }
        } finally {
            h.dispose()
        }
    }

    return report('L_MEAS_11', worst, 'capture-less + aged §4.4 table')
}

/**
 * L-MEAS-12: author rotation:
 * (a) box-changing rotation added mid-run -> subtree snaps 'unsupported';
 * (b) box-changing rotation present at capture and removed by the commit -> subtree snaps 'unsupported';
 * (c) a 180° rotation removed by the commit -> box moves exactly.
 */
export async function L_MEAS_12(): Promise<string> {
    let worst = 0
    const duration = 0.24

    // (a) Box-changing rotation added mid-run -> subtree snaps 'unsupported'
    {
        const snappedCalls: { element: HTMLElement; reason: SnapReason }[] = []
        const h = harness({
            motion: { duration, timing: timing.easeOut },
            onSnap(element, reason) {
                snappedCalls.push({ element, reason })
            },
        })
        try {
            const parent = node(
                h.root,
                'left: 20px; top: 20px; width: 160px; height: 60px; transform-origin: 50% 50%;'
            )
            const child = node(
                parent,
                'left: 10px; top: 10px; width: 60px; height: 30px;'
            )
            h.add(parent)
            h.add(child)

            await h.group.update(() => {})
            h.group.capture()
            parent.style.left = '140px'
            child.style.left = '50px'
            void h.group.flush()

            await frames(h.mc, 4, () => {})

            // Add box-changing rotation mid-run, then commit
            parent.style.transform = 'rotate(35deg)'
            const quiet = silenceWarnings()
            let resA: Awaited<ReturnType<typeof h.group.flush>>
            try {
                h.group.capture()
                parent.style.left = '240px'
                child.style.left = '80px'
                resA = await h.group.flush()
            } finally {
                quiet.restore()
            }

            assert.ok(
                resA.snapped.some(
                    (s) => s.element === parent && s.reason === 'unsupported'
                ),
                'L_MEAS_12 (a) parent snapped unsupported'
            )
            assert.ok(
                resA.snapped.some(
                    (s) => s.element === child && s.reason === 'unsupported'
                ),
                'L_MEAS_12 (a) child in subtree snapped unsupported'
            )
            assert.ok(
                snappedCalls.some(
                    (s) => s.element === parent && s.reason === 'unsupported'
                ),
                'L_MEAS_12 (a) onSnap parent unsupported'
            )
            assert.equal(
                parent.style.translate,
                '',
                'L_MEAS_12 (a) parent styles restored'
            )
            assert.equal(
                child.style.translate,
                '',
                'L_MEAS_12 (a) child styles restored'
            )
        } finally {
            h.dispose()
        }
    }

    // (b) Box-changing rotation present at capture and removed by the commit -> subtree snaps 'unsupported'
    {
        const snappedCalls: { element: HTMLElement; reason: SnapReason }[] = []
        const h = harness({
            motion: { duration, timing: timing.easeOut },
            onSnap(element, reason) {
                snappedCalls.push({ element, reason })
            },
        })
        try {
            const parent = node(
                h.root,
                'left: 20px; top: 20px; width: 200px; height: 60px; transform: rotate(45deg); transform-origin: 50% 50%;'
            )
            const child = node(
                parent,
                'left: 10px; top: 10px; width: 60px; height: 30px;'
            )
            h.add(parent)
            h.add(child)

            const quiet = silenceWarnings()
            let resB: Awaited<ReturnType<typeof h.group.flush>>
            try {
                // Capture while rotated 45deg (rect width ~183.85px vs offsetWidth 200px)
                h.group.capture()
                // Remove rotation in the commit and move both nodes
                parent.style.transform = ''
                parent.style.left = '180px'
                child.style.left = '70px'
                resB = await h.group.flush()
            } finally {
                quiet.restore()
            }

            assert.ok(
                resB.snapped.some(
                    (s) => s.element === parent && s.reason === 'unsupported'
                ),
                'L_MEAS_12 (b) parent with rotation at capture snapped unsupported'
            )
            assert.ok(
                resB.snapped.some(
                    (s) => s.element === child && s.reason === 'unsupported'
                ),
                'L_MEAS_12 (b) child under rotated parent at capture snapped unsupported'
            )
            assert.ok(
                snappedCalls.some(
                    (s) => s.element === parent && s.reason === 'unsupported'
                ),
                'L_MEAS_12 (b) onSnap parent unsupported'
            )
            const rootBox = viewBox(h.root)
            worst = Math.max(
                worst,
                expectViewAt(
                    parent,
                    { x: rootBox.x + 180, y: rootBox.y + 20, w: 200, h: 60 },
                    'L_MEAS_12 (b) parent at rest box A'
                ),
                expectViewAt(
                    child,
                    { x: rootBox.x + 250, y: rootBox.y + 30, w: 60, h: 30 },
                    'L_MEAS_12 (b) child at rest box A'
                )
            )
        } finally {
            h.dispose()
        }
    }

    // (c) A 180° rotation removed by the commit -> the box moves exactly
    {
        const h = harness({
            motion: { duration, timing: timing.easeOut },
        })
        try {
            const card = node(
                h.root,
                'left: 20px; top: 20px; width: 140px; height: 50px; transform: rotate(180deg); transform-origin: 50% 50%;'
            )
            h.add(card)

            const bCard = viewBox(card)
            h.group.capture()
            card.style.transform = ''
            card.style.left = '200px'
            const aCard = shiftBox(bCard, 180, 0)
            const specCard = spec(bCard, aCard, null, duration)
            const runC = report(h.group.flush())

            worst = Math.max(
                worst,
                expectViewAt(card, bCard, 'L_MEAS_12 (c) frame 0')
            )

            await frames(
                h.mc,
                25,
                (elapsed, idx) => {
                    const t = since(0, elapsed)
                    worst = Math.max(
                        worst,
                        expectViewAt(
                            card,
                            trackBox(specCard, t),
                            `L_MEAS_12 (c) frame ${idx + 1} (t=${elapsed.toFixed(3)})`
                        )
                    )
                },
                () => runC.value !== null
            )

            assert.ok(runC.value !== null, 'L_MEAS_12 (c) run settled')
            assert.equal(runC.value.status, 'ended', 'L_MEAS_12 (c) ended')
            assert.equal(
                runC.value.snapped.length,
                0,
                'L_MEAS_12 (c) no snaps'
            )
            worst = Math.max(
                worst,
                expectViewAt(card, aCard, 'L_MEAS_12 (c) settle')
            )
        } finally {
            h.dispose()
        }
    }

    return report('L_MEAS_12', worst, 'rotation (a), (b) snap; (c) 180deg exact')
}

/**
 * L-MEAS-13: an earlier requestAnimationFrame callback moves an ancestor;
 * a later callback calls update() through the scope clock's frame (clock.inFrame is true).
 * Aged at once (§4.3, §4.4), never using the intermediate unpresented box as B.
 */
export async function L_MEAS_13(): Promise<string> {
    let worst = 0
    const rAFQueue: FrameRequestCallback[] = []
    const customClock = createClock({
        now: () => 0,
        requestFrame: (cb) => {
            rAFQueue.push(cb)
            return rAFQueue.length
        },
        cancelFrame: () => {},
    })

    const snappedCalls: { element: HTMLElement; reason: SnapReason }[] = []
    document.body.style.margin = '0'
    const root = document.createElement('div')
    root.style.cssText = 'position: relative; width: 900px; height: 700px;'
    document.body.append(root)

    const group = createLayoutGroup({
        clock: customClock,
        motion: { duration: 0.24, timing: timing.easeOut },
        onSnap(element, reason) {
            snappedCalls.push({ element, reason })
        },
    })

    try {
        const ancestor = node(
            root,
            'left: 0; top: 0; width: 400px; height: 200px;'
        )
        const card = node(
            ancestor,
            'left: 0; top: 20px; width: 100px; height: 40px;'
        )
        group.add(card)

        await group.update(() => {})
        const rootBox = viewBox(root)

        // Schedule an earlier rAF callback that moves `ancestor` to an unpresented intermediate x = 80px,
        // and a clock.read callback (which runs inside the clock's rAF tick where customClock.inFrame === true)
        // that calls group.update() moving `card` to left = 120px (final rest x = 80 + 120 = 200px).
        let sawInFrame = false
        let updatePromise: Promise<Awaited<ReturnType<typeof group.flush>>> | null =
            null

        rAFQueue.unshift(() => {
            ancestor.style.left = '80px'
        })
        customClock.read(() => {
            sawInFrame = customClock.inFrame
            updatePromise = group.update(() => {
                card.style.left = '120px'
            })
        })

        const quiet = silenceWarnings()
        let res: Awaited<ReturnType<typeof group.flush>>
        try {
            const batch = rAFQueue.splice(0, rAFQueue.length)
            for (const fn of batch) fn(16)
            assert.ok(sawInFrame, 'L_MEAS_13 customClock.inFrame was true')
            assert.ok(updatePromise !== null, 'L_MEAS_13 update() ran')
            res = await updatePromise!
        } finally {
            quiet.restore()
        }

        // Because capture() happened while clock.inFrame === true, it is aged at once (§4.3):
        // card must appear immediately at A (x = 200), NEVER starting a track from the unpresented intermediate x = 80!
        const wantA: OBox = {
            x: rootBox.x + 200,
            y: rootBox.y + 20,
            w: 100,
            h: 40,
        }
        worst = Math.max(
            worst,
            expectViewAt(
                card,
                wantA,
                'L_MEAS_13 card at final A (never at intermediate B x=80)'
            )
        )
        assert.equal(
            res.status,
            'stale',
            `L_MEAS_13 status: expected 'stale', got '${res.status}'`
        )
        assert.equal(res.snapped.length, 1, 'L_MEAS_13 card reported stale')
        assert.equal(res.snapped[0]?.element, card, 'L_MEAS_13 snapped card')
        assert.equal(res.snapped[0]?.reason, 'stale', 'L_MEAS_13 reason stale')
        assert.equal(
            snappedCalls.length,
            1,
            'L_MEAS_13 onSnap called once with stale'
        )
        assert.equal(
            card.style.translate,
            '',
            'L_MEAS_13 no track started from intermediate box'
        )

        return report('L_MEAS_13', worst, 'clock.inFrame aged at once')
    } finally {
        group.dispose()
        customClock.dispose()
        root.remove()
    }
}

/**
 * L-HAND-1: a list item inside a scroller to a fixed detail and back (shared layoutId).
 * Shared handoff; source-over opacity coverage >= 0.99 at every frame.
 */
export async function L_HAND_1(): Promise<string> {
    let worst = 0
    const duration = 0.24
    const h = harness({
        motion: { duration, timing: timing.easeOut },
    })
    const presence = createPresence({ clock: h.mc.clock })
    try {
        const scroller = node(
            h.root,
            'left: 20px; top: 20px; width: 260px; height: 220px; overflow-y: auto;'
        )
        const content = document.createElement('div')
        content.style.cssText =
            'position: relative; width: 240px; height: 600px;'
        scroller.append(content)

        // Scroll scroller BEFORE registering shared layoutId so scroller is settled at scrollTop = 100
        scroller.scrollTop = 100

        const listItem = node(
            content,
            'left: 10px; top: 140px; width: 180px; height: 50px; border-radius: 8px; transform-origin: 0 0;'
        )
        h.add(listItem, { layoutId: 'hand-1-card', radius: true })
        await h.group.update(() => {})
        scroller.dispatchEvent(new Event('scrollend'))

        const bItem = viewBox(listItem)

        // 1. Forward handoff: listItem (exiting under presence) -> fixed detail
        h.group.capture()
        void presence.exit(listItem, () => {
            h.group.remove(listItem)
            listItem.remove()
        })
        const detail = document.createElement('div')
        detail.style.cssText =
            'position: fixed; left: 320px; top: 40px; width: 280px; height: 200px; border-radius: 20px; transform-origin: 0 0; box-sizing: border-box;'
        h.root.append(detail)
        h.add(detail, { layoutId: 'hand-1-card', radius: true })

        const aDetail: OBox = { x: 320, y: 40, w: 280, h: 200 }
        const specForward = spec(bItem, aDetail, null, duration, EASE_OUT, 0, 0)
        const forwardRun = report(h.group.flush())

        const checkCoverage = (
            leadEl: HTMLElement,
            followEl: HTMLElement,
            label: string
        ) => {
            if (!followEl.isConnected) return
            const alphaLead = Number.parseFloat(
                getComputedStyle(leadEl).opacity || '1'
            )
            const alphaFollow = Number.parseFloat(
                getComputedStyle(followEl).opacity || '1'
            )
            const cov = alphaLead + alphaFollow * (1 - alphaLead)
            assert.ok(
                cov >= 0.99 - 1e-6,
                `${label}: source-over coverage ${cov.toFixed(4)} < 0.99 (lead=${alphaLead.toFixed(3)}, follower=${alphaFollow.toFixed(3)})`
            )
        }

        worst = Math.max(
            worst,
            expectViewAt(detail, bItem, 'L_HAND_1 forward frame 0 detail'),
            expectViewAt(listItem, bItem, 'L_HAND_1 forward frame 0 listItem')
        )
        checkCoverage(detail, listItem, 'L_HAND_1 forward frame 0')

        await frames(
            h.mc,
            25,
            (elapsed, idx) => {
                const t = since(0, elapsed)
                const want = trackBox(specForward, t)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        detail,
                        want,
                        `L_HAND_1 forward frame ${idx + 1} (t=${elapsed.toFixed(3)}) detail`
                    )
                )
                if (listItem.isConnected && forwardRun.value === null) {
                    worst = Math.max(
                        worst,
                        expectViewAt(
                            listItem,
                            want,
                            `L_HAND_1 forward frame ${idx + 1} (t=${elapsed.toFixed(3)}) listItem`
                        )
                    )
                    checkCoverage(
                        detail,
                        listItem,
                        `L_HAND_1 forward frame ${idx + 1}`
                    )
                }
            },
            () => forwardRun.value !== null
        )

        assert.ok(forwardRun.value !== null, 'L_HAND_1 forward settled')
        assert.equal(
            forwardRun.value.status,
            'ended',
            'L_HAND_1 forward status ended'
        )
        worst = Math.max(
            worst,
            expectViewAt(detail, aDetail, 'L_HAND_1 forward settle detail')
        )

        // 2. Reverse handoff: fixed detail (exiting under presence) -> listItemBack inside scroller
        const bDetail = viewBox(detail)
        h.group.capture()
        void presence.exit(detail, () => {
            h.group.remove(detail)
            detail.remove()
        })
        const listItemBack = node(
            content,
            'left: 10px; top: 180px; width: 180px; height: 50px; border-radius: 8px; transform-origin: 0 0;'
        )
        h.add(listItemBack, { layoutId: 'hand-1-card', radius: true })
        const aItemBack = shiftBox(bItem, 0, 40)
        const specBack = spec(
            bDetail,
            aItemBack,
            null,
            duration,
            EASE_OUT,
            0,
            0
        )
        const backRun = report(h.group.flush())

        worst = Math.max(
            worst,
            expectViewAt(
                listItemBack,
                bDetail,
                'L_HAND_1 reverse frame 0 listItemBack'
            ),
            expectViewAt(detail, bDetail, 'L_HAND_1 reverse frame 0 detail')
        )
        checkCoverage(listItemBack, detail, 'L_HAND_1 reverse frame 0')

        await frames(
            h.mc,
            25,
            (elapsed, idx) => {
                const t = since(0, elapsed)
                const want = trackBox(specBack, t)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        listItemBack,
                        want,
                        `L_HAND_1 reverse frame ${idx + 1} (t=${elapsed.toFixed(3)}) listItemBack`
                    )
                )
                if (detail.isConnected && backRun.value === null) {
                    worst = Math.max(
                        worst,
                        expectViewAt(
                            detail,
                            want,
                            `L_HAND_1 reverse frame ${idx + 1} (t=${elapsed.toFixed(3)}) detail`
                        )
                    )
                    checkCoverage(
                        listItemBack,
                        detail,
                        `L_HAND_1 reverse frame ${idx + 1}`
                    )
                }
            },
            () => backRun.value !== null
        )

        assert.ok(backRun.value !== null, 'L_HAND_1 reverse settled')
        assert.equal(
            backRun.value.status,
            'ended',
            'L_HAND_1 reverse status ended'
        )
        worst = Math.max(
            worst,
            expectViewAt(
                listItemBack,
                aItemBack,
                'L_HAND_1 reverse settle listItemBack'
            )
        )

        return report('L_HAND_1', worst, 'scroller <-> fixed detail handoff')
    } finally {
        presence.dispose()
        h.dispose()
    }
}

/**
 * L-HAND-2: handoff while the source scroller is active (between scroll and scrollend),
 * then after scrollend.
 */
export async function L_HAND_2(): Promise<string> {
    let worst = 0
    const duration = 0.24
    const h = harness({
        motion: { duration, timing: timing.easeOut },
    })
    try {
        const scroller = node(
            h.root,
            'left: 20px; top: 20px; width: 240px; height: 180px; overflow-y: auto;'
        )
        const content = document.createElement('div')
        content.style.cssText =
            'position: relative; width: 220px; height: 600px;'
        scroller.append(content)

        const item1 = node(
            content,
            'left: 10px; top: 100px; width: 160px; height: 44px; transform-origin: 0 0;'
        )
        h.add(item1, { layoutId: 'hand-2-card' })
        await h.group.update(() => {})

        // 1. Activate scroller via `scroll` event (without `scrollend`); time passing does NOT clear it
        scroller.scrollTop = 60
        scroller.dispatchEvent(new Event('scroll'))
        await frames(h.mc, 10, () => {})

        // Handoff out of active scroller -> does NOT fly from item1; appears at A_detail1 immediately
        h.group.capture()
        h.group.remove(item1)
        item1.remove()
        const detail1 = node(
            h.root,
            'left: 320px; top: 40px; width: 240px; height: 140px; transform-origin: 0 0;'
        )
        h.add(detail1, { layoutId: 'hand-2-card' })
        const rootBox = viewBox(h.root)
        const aDetail1: OBox = {
            x: rootBox.x + 320,
            y: rootBox.y + 40,
            w: 240,
            h: 140,
        }
        const quiet1 = silenceWarnings()
        let resActive: Awaited<ReturnType<typeof h.group.flush>>
        try {
            const activeRun = h.group.flush()
            // On frame 0, detail1 must already be at aDetail1 (NOT flying from item1 inside active scroller)
            worst = Math.max(
                worst,
                expectViewAt(
                    detail1,
                    aDetail1,
                    'L_HAND_2 active-scroll frame 0 detail1 at A (no fly)'
                )
            )
            resActive = await activeRun
        } finally {
            quiet1.restore()
        }
        assert.equal(
            resActive.status,
            'no-change',
            `L_HAND_2 active-scroll status: expected 'no-change', got '${resActive.status}'`
        )
        assert.equal(
            detail1.style.translate,
            '',
            'L_HAND_2 active-scroll detail1 has no layout track'
        )

        // 2. Now place item2 inside scroller, fire `scrollend` to clear active scroll state, and hand off again
        const item2 = node(
            content,
            'left: 10px; top: 120px; width: 160px; height: 44px; transform-origin: 0 0;'
        )
        h.add(item2, { layoutId: 'hand-2-card-after' })
        await h.group.update(() => {})

        scroller.scrollTop = 80
        scroller.dispatchEvent(new Event('scroll'))
        scroller.dispatchEvent(new Event('scrollend'))

        const bItem2 = viewBox(item2)
        h.group.capture()
        h.group.remove(item2)
        item2.remove()
        const detail2 = node(
            h.root,
            'left: 320px; top: 200px; width: 240px; height: 140px; transform-origin: 0 0;'
        )
        h.add(detail2, { layoutId: 'hand-2-card-after' })
        const aDetail2: OBox = {
            x: rootBox.x + 320,
            y: rootBox.y + 200,
            w: 240,
            h: 140,
        }
        const specAfter = spec(bItem2, aDetail2, null, duration, EASE_OUT, 0, 0)
        const afterRun = report(h.group.flush())

        // After scrollend, shared handoff flies from bItem2 to aDetail2!
        worst = Math.max(
            worst,
            expectViewAt(
                detail2,
                bItem2,
                'L_HAND_2 after-scrollend frame 0 detail2 starts at bItem2'
            )
        )
        await frames(
            h.mc,
            25,
            (elapsed, idx) => {
                const t = since(0, elapsed)
                worst = Math.max(
                    worst,
                    expectViewAt(
                        detail2,
                        trackBox(specAfter, t),
                        `L_HAND_2 after-scrollend frame ${idx + 1} (t=${elapsed.toFixed(3)}) detail2`
                    )
                )
            },
            () => afterRun.value !== null
        )
        assert.ok(afterRun.value !== null, 'L_HAND_2 after-scrollend settled')
        assert.equal(
            afterRun.value.status,
            'ended',
            'L_HAND_2 after-scrollend status ended'
        )
        worst = Math.max(
            worst,
            expectViewAt(
                detail2,
                aDetail2,
                'L_HAND_2 after-scrollend settle detail2'
            )
        )

        return report(
            'L_HAND_2',
            worst,
            'active scroll skips fly; scrollend restores fly'
        )
    } finally {
        h.dispose()
    }
}

/**
 * L-KEY-1: a recycled node whose layoutKey changes under scroll.
 * Changing layoutKey ends any running track, restores owned styles, and establishes
 * a fresh baseline with no interpolation.
 */
export async function L_KEY_1(): Promise<string> {
    let worst = 0
    const duration = 0.24
    const h = harness({
        motion: { duration, timing: timing.easeOut },
    })
    try {
        const scroller = node(
            h.root,
            'left: 20px; top: 20px; width: 260px; height: 180px; overflow-y: auto;'
        )
        const content = document.createElement('div')
        content.style.cssText =
            'position: relative; width: 240px; height: 800px;'
        scroller.append(content)

        const recycled = node(
            content,
            'left: 10px; top: 20px; width: 180px; height: 40px; transform-origin: 0 0;'
        )
        const initialOpts: KeyedLayoutOptions = { layoutKey: 'row-0' }
        h.add(recycled, initialOpts)
        await h.group.update(() => {})

        // 1. Recycle resting node under scroll with a new layoutKey -> fresh baseline, no track
        h.group.capture()
        scroller.scrollTop = 160
        recycled.style.top = '200px'
        recycled.style.width = '200px'
        const secondOpts: KeyedLayoutOptions = { layoutKey: 'row-8' }
        h.group.set(recycled, secondOpts)

        const scrollerBox = viewBox(scroller)
        const aRecycled1: OBox = {
            x: scrollerBox.x + 10,
            y: scrollerBox.y + 200 - 160,
            w: 200,
            h: 40,
        }
        const res1 = await h.group.flush()
        assert.equal(
            res1.status,
            'no-change',
            `L_KEY_1 resting recycle status: expected 'no-change', got '${res1.status}'`
        )
        assert.equal(res1.snapped.length, 0, 'L_KEY_1 resting recycle no snaps')
        assert.equal(
            recycled.style.translate,
            '',
            'L_KEY_1 resting recycle no inline translate'
        )
        worst = Math.max(
            worst,
            expectViewAt(
                recycled,
                aRecycled1,
                'L_KEY_1 resting recycle frame 0 at new A'
            )
        )

        // 2. With the SAME layoutKey ('row-8'), a layout change animates normally from the fresh baseline
        h.group.capture()
        recycled.style.left = '50px'
        const aRecycled2 = shiftBox(aRecycled1, 40, 0)
        const spec2 = spec(
            aRecycled1,
            aRecycled2,
            null,
            duration,
            EASE_OUT,
            0,
            0
        )
        const run2 = report(h.group.flush())

        await frames(h.mc, 4, (elapsed, idx) => {
            const t = since(0, elapsed)
            worst = Math.max(
                worst,
                expectViewAt(
                    recycled,
                    trackBox(spec2, t),
                    `L_KEY_1 same-key anim frame ${idx + 1} (t=${elapsed.toFixed(3)})`
                )
            )
        })
        assert.equal(
            run2.value,
            null,
            'L_KEY_1 run2 still mid-flight at frame 4'
        )

        // 3. Recycle mid-run under scroll with a new layoutKey ('row-16') -> ends running track ('disposed'),
        //    restores styles, and establishes a fresh baseline at new A!
        h.group.capture()
        scroller.scrollTop = 300
        recycled.style.left = '10px'
        recycled.style.top = '360px'
        recycled.style.width = '160px'
        const thirdOpts: KeyedLayoutOptions = { layoutKey: 'row-16' }
        h.group.set(recycled, thirdOpts)
        const aRecycled3: OBox = {
            x: scrollerBox.x + 10,
            y: scrollerBox.y + 360 - 300,
            w: 160,
            h: 40,
        }
        const res3 = await h.group.flush()
        await settleMicrotasks()

        assert.equal(
            res3.status,
            'no-change',
            `L_KEY_1 mid-run recycle status: expected 'no-change', got '${res3.status}'`
        )
        assert.ok(run2.value !== null, 'L_KEY_1 interrupted run2 resolved')
        assert.equal(
            run2.value.status,
            'disposed',
            `L_KEY_1 mid-run recycle resolved previous run as 'disposed', got '${run2.value.status}'`
        )
        assert.equal(
            recycled.style.translate,
            '',
            'L_KEY_1 mid-run recycle restored translate'
        )
        assert.equal(
            recycled.style.scale,
            '',
            'L_KEY_1 mid-run recycle restored scale'
        )
        worst = Math.max(
            worst,
            expectViewAt(
                recycled,
                aRecycled3,
                'L_KEY_1 mid-run recycle at new A'
            )
        )

        return report('L_KEY_1', worst, 'layoutKey recycle at rest + mid-run')
    } finally {
        h.dispose()
    }
}

/**
 * L-DOC-1: document affinity (vanilla parts):
 * - add / set of an element from another document (an iframe's document) throws ANI_INVALID_OPTIONS;
 * - adoption of a registered element into another document ends its track, restores its styles and unregisters it.
 */
export async function L_DOC_1(): Promise<string> {
    let worst = 0
    const duration = 0.24
    const h = harness({
        motion: { duration, timing: timing.easeOut },
    })
    const iframe = document.createElement('iframe')
    iframe.style.cssText =
        'position: absolute; left: 500px; top: 0; width: 200px; height: 150px; border: 0;'
    h.root.append(iframe)
    try {
        const otherDoc = iframe.contentDocument
        assert.ok(otherDoc !== null, 'L_DOC_1 iframe has contentDocument')

        const mainEl = node(
            h.root,
            'left: 20px; top: 20px; width: 100px; height: 40px; translate: 6px 0px;'
        )
        h.add(mainEl)
        await h.group.update(() => {})

        // 1. Adding or setting an element from another document throws ANI_INVALID_OPTIONS
        const foreignEl = otherDoc.createElement('div')
        otherDoc.body.append(foreignEl)

        let addErr: unknown = null
        try {
            h.group.add(foreignEl)
        } catch (err) {
            addErr = err
        }
        assert.ok(
            isAniError(addErr) && addErr.code === 'ANI_INVALID_OPTIONS',
            `L_DOC_1 group.add(foreignEl) must throw ANI_INVALID_OPTIONS, got ${String(addErr)}`
        )

        let setErr: unknown = null
        try {
            h.group.set(foreignEl, {})
        } catch (err) {
            setErr = err
        }
        assert.ok(
            isAniError(setErr) && setErr.code === 'ANI_INVALID_OPTIONS',
            `L_DOC_1 group.set(foreignEl) must throw ANI_INVALID_OPTIONS, got ${String(setErr)}`
        )

        // 2. Start a track on mainEl, then adopt mainEl into otherDoc mid-run
        const bMain = viewBox(mainEl)
        h.group.capture()
        mainEl.style.left = '180px'
        const aMain = shiftBox(bMain, 160, 0)
        const specMain = spec(bMain, aMain, null, duration)
        const runMain = report(h.group.flush())

        await frames(h.mc, 3, (elapsed, idx) => {
            const t = since(0, elapsed)
            worst = Math.max(
                worst,
                expectViewAt(
                    mainEl,
                    trackBox(specMain, t),
                    `L_DOC_1 pre-adopt frame ${idx + 1} (t=${elapsed.toFixed(3)})`
                )
            )
        })
        assert.notEqual(
            mainEl.style.translate,
            '6px 0px',
            'L_DOC_1 mainEl has engine-written translate mid-run'
        )

        // Adopt mainEl into iframe's document
        otherDoc.body.append(otherDoc.adoptNode(mainEl))
        assert.equal(
            mainEl.ownerDocument,
            otherDoc,
            'L_DOC_1 mainEl ownerDocument is otherDoc after adoptNode'
        )

        const quiet = silenceWarnings()
        try {
            h.group.capture()
            await h.group.flush()
            h.mc.frame(16)
            await settleMicrotasks()
        } finally {
            quiet.restore()
        }

        assert.ok(
            runMain.value !== null,
            'L_DOC_1 adopted element run resolved'
        )
        assert.equal(
            runMain.value.status,
            'disposed',
            `L_DOC_1 adopted element run status: expected 'disposed', got '${runMain.value.status}'`
        )
        assert.equal(
            mainEl.style.translate,
            '6px 0px',
            'L_DOC_1 adopted element saved inline translate restored byte-for-byte'
        )
        assert.equal(
            mainEl.style.scale,
            '',
            'L_DOC_1 adopted element inline scale restored'
        )

        // 3. Adopting mainEl back into main document does NOT animate it unless re-added (it was unregistered)
        h.root.append(document.adoptNode(mainEl))
        const afterBack = viewBox(mainEl)
        h.group.capture()
        mainEl.style.left = '260px'
        const unregRes = await h.group.flush()
        assert.equal(
            unregRes.status,
            'no-change',
            'L_DOC_1 adopted element was unregistered and does not animate until re-added'
        )
        worst = Math.max(
            worst,
             maxDiff(viewBox(mainEl), shiftBox(afterBack, 80, 0))
        )

        return report('L_DOC_1', worst, 'cross-doc add throws; adopt disposes')
    } finally {
        iframe.remove()
        h.dispose()
    }
}

export const knownFailures: Record<string, string> = {}
