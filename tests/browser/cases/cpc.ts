import { createLayoutGroup } from '@freestylejs/ani-layout'
import { expectClose, expectEqual } from './assert'
import {
    blockMainThread,
    boxOf,
    resumeAnimations,
    runPausedOracle,
    sampleBoxes,
} from './cpc_harness'

export const pageOptions = {}
export const knownFailures: Record<string, string> = {}

interface GuardCounts {
    resize: number
    mutation: number
    intersection: number
    raf: number
}

function installGuards(): { counts: GuardCounts; restore: () => void } {
    const counts: GuardCounts = {
        resize: 0,
        mutation: 0,
        intersection: 0,
        raf: 0,
    }
    const restores: Array<() => void> = []
    const wrap = (name: string, key: keyof GuardCounts): void => {
        const original = (window as unknown as Record<string, unknown>)[name]
        if (typeof original !== 'function') return
        class Spy extends (original as new (...args: unknown[]) => object) {
            constructor(...args: unknown[]) {
                super(...args)
                counts[key] += 1
            }
        }
        ;(window as unknown as Record<string, unknown>)[name] = Spy
        restores.push(() => {
            ;(window as unknown as Record<string, unknown>)[name] = original
        })
    }
    wrap('ResizeObserver', 'resize')
    wrap('MutationObserver', 'mutation')
    wrap('IntersectionObserver', 'intersection')
    const originalRaf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        counts.raf += 1
        return originalRaf(callback)
    }
    restores.push(() => {
        window.requestAnimationFrame = originalRaf
    })
    return {
        counts,
        restore: () => {
            for (const restore of restores) restore()
        },
    }
}

export async function P0(): Promise<string> {
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:200px;height:100px;'
    const first = document.createElement('div')
    first.style.cssText =
        'width:40px;height:20px;background:#222;margin-bottom:0;'
    const second = document.createElement('div')
    second.style.cssText = 'width:40px;height:20px;background:#444;'
    root.append(first, second)
    document.body.append(root)

    const guards = installGuards()
    const group = createLayoutGroup({ motion: { duration: 0.24 } })
    const removeFirst = group.add(first)
    const removeSecond = group.add(second)
    try {
        const snapshot = group.capture()
        const before = boxOf(second)
        const run = await runPausedOracle(group, [second], snapshot, () => {
            first.style.height = '0px'
            first.style.marginBottom = '0px'
        })
        expectEqual(run.result, 'ended', 'oracle resumes to completion')
        const firstSample = run.first.boxes[0]!
        const target = run.target[0]!
        const middle = run.middle.boxes[0]!
        for (const key of ['left', 'top', 'width', 'height'] as const) {
            expectClose(firstSample[key], before[key], 1, `first-frame ${key}`)
        }
        for (const key of ['left', 'top', 'width', 'height'] as const) {
            expectClose(run.final[0]![key], target[key], 0.6, `final ${key}`)
            if (key !== 'top') {
                expectClose(
                    middle[key],
                    target[key],
                    1,
                    `interior invariant ${key}`
                )
            }
        }
        expectClose(target.top, before.top - 20, 0.6, 'target top')
        if (!(middle.top < firstSample.top && middle.top > target.top)) {
            throw new Error('oracle interior sample is nonterminal')
        }
        expectEqual(guards.counts.resize, 0, 'no ResizeObserver')
        expectEqual(guards.counts.mutation, 0, 'no MutationObserver')
        expectEqual(guards.counts.intersection, 0, 'no IntersectionObserver')
        expectEqual(guards.counts.raf, 0, 'no layout-owned rAF')

        const started = performance.now()
        blockMainThread(25)
        const elapsed = performance.now() - started
        expectEqual(elapsed >= 20, true, 'jank harness blocks main thread')
        return 'CPC P0 baseline: paused oracle, zero observers/rAF, 25ms block harness'
    } finally {
        guards.restore()
        removeFirst()
        removeSecond()
        group.dispose()
        root.remove()
    }
}

export async function P1(): Promise<string> {
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:240px;height:80px;'
    const element = document.createElement('div')
    element.style.cssText =
        'position:absolute;left:0;top:0;width:20px;height:20px;background:#222;'
    root.append(element)
    document.body.append(root)
    const group = createLayoutGroup({ motion: { duration: 0.2 } })
    const remove = group.add(element)
    try {
        const snapshot = group.capture()
        element.style.left = '80px'
        const firstRun = group.play(snapshot)
        const firstAnimations = element.getAnimations()
        if (firstAnimations.length === 0) {
            throw new Error('P1 first run has no animations')
        }
        const starts = new Set(firstAnimations.map((a) => a.startTime))
        expectEqual(starts.size, 1, 'one group startTime')
        const sample90 = sampleBoxes([element], firstAnimations, 90).boxes[0]!
        const sample100 = sampleBoxes([element], firstAnimations, 100).boxes[0]!
        const beforeRetarget = sample100
        const oldVelocity = (sample100.left - sample90.left) / 10
        let reads = 0
        const originalRect = element.getBoundingClientRect.bind(element)
        element.getBoundingClientRect = () => {
            reads += 1
            return originalRect()
        }
        const retargetSnapshot = group.capture()
        element.style.left = '140px'
        const secondRun = group.play(retargetSnapshot)
        expectEqual(reads <= 2, true, `retarget reads ${reads} <= 2N`)
        element.getBoundingClientRect = originalRect
        const secondAnimations = element.getAnimations()
        if (secondAnimations.length === 0) {
            throw new Error('P1 retarget has no animations')
        }
        const retargetFirst = sampleBoxes([element], secondAnimations, 0)
            .boxes[0]!
        const retargetEarly = sampleBoxes([element], secondAnimations, 1)
            .boxes[0]!
        const newVelocity = retargetEarly.left - retargetFirst.left
        expectClose(
            retargetFirst.left,
            beforeRetarget.left,
            1.5,
            `retarget first-frame continuity active=${group.active} n=${secondAnimations.length} frames=${JSON.stringify(
                secondAnimations.map((a) => a.effect?.getKeyframes?.())
            )}`
        )
        expectEqual(
            Math.abs(newVelocity - oldVelocity) <=
                Math.max(Math.abs(oldVelocity) * 0.1, 0.1),
            true,
            `retarget velocity continuity ${oldVelocity} -> ${newVelocity}`
        )
        const retargetStarts = new Set(secondAnimations.map((a) => a.startTime))
        expectEqual(retargetStarts.size, 1, 'retarget has one startTime')
        resumeAnimations(secondAnimations)
        await secondRun
        const origin = root.getBoundingClientRect().left
        expectClose(
            boxOf(element).left - origin,
            140,
            0.6,
            'retarget final left'
        )
        group.finish()
        expectEqual(
            element.getAnimations().length,
            0,
            'finish releases animations'
        )
        await firstRun.catch(() => undefined)
        return 'P1 plan retarget: shared startTime, first-frame continuity, exact final'
    } finally {
        remove()
        group.dispose()
        root.remove()
    }
}

export async function P2(): Promise<string> {
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:240px;height:80px;'
    const element = document.createElement('div')
    element.style.cssText =
        'position:absolute;left:0;top:0;width:20px;height:20px;background:#222;'
    root.append(element)
    document.body.append(root)
    const group = createLayoutGroup({ motion: { duration: 0.03 } })
    const remove = group.add(element)
    try {
        let previous = boxOf(element)
        for (let index = 0; index < 100; index++) {
            const snapshot = group.capture()
            element.style.left = index % 2 === 0 ? '100px' : '20px'
            void group.play(snapshot)
            const animations = element.getAnimations()
            if (animations.length === 0) {
                throw new Error(`P2 interrupt ${index} has no animation`)
            }
            const first = sampleBoxes([element], animations, 0).boxes[0]!
            expectClose(
                first.left,
                previous.left,
                1.5,
                `P2 interrupt ${index} continuity`
            )
            previous = first
        }
        const finalSnapshot = group.capture()
        element.style.left = '100px'
        const finalRun = group.play(finalSnapshot)
        group.finish()
        await finalRun
        const origin = root.getBoundingClientRect().left
        expectClose(
            boxOf(element).left - origin,
            100,
            0.6,
            '100 interrupts final'
        )
        return 'P2: 100 synchronous retargets remain coherent and finish exactly'
    } finally {
        remove()
        group.dispose()
        root.remove()
    }
}

export async function P3(): Promise<string> {
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:240px;height:80px;'
    const first = document.createElement('div')
    first.style.cssText =
        'position:absolute;left:0;top:0;width:20px;height:20px;background:#222;'
    const second = document.createElement('div')
    second.style.cssText =
        'position:absolute;left:0;top:30px;width:20px;height:20px;background:#444;'
    root.append(first, second)
    document.body.append(root)
    const group = createLayoutGroup({ motion: { duration: 0.12 } })
    const removeFirst = group.add(first)
    const removeSecond = group.add(second)
    try {
        const snapshot = group.capture()
        first.style.left = '100px'
        second.style.left = '60px'
        const run = group.play(snapshot)
        const animations = [...first.getAnimations(), ...second.getAnimations()]
        expectEqual(animations.length >= 2, true, 'two participants animate')
        expectEqual(
            new Set(animations.map((a) => a.startTime)).size,
            1,
            'participants share a startTime'
        )
        group.finish()
        await run
        return 'P3: multiple participants share one group clock'
    } finally {
        removeFirst()
        removeSecond()
        group.dispose()
        root.remove()
    }
}
