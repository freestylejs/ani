import { timing } from '@freestylejs/ani-core'
import { createLayoutGroup } from '@freestylejs/ani-layout'
import { expectClose, expectEqual } from './assert'
import {
    blockMainThread,
    boxOf,
    pauseAt,
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
        const sample100 = sampleBoxes([element], firstAnimations, 100).boxes[0]!
        const beforeRetarget = sample100
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
        expectClose(
            retargetFirst.left,
            beforeRetarget.left,
            1.5,
            `retarget first-frame continuity active=${group.active} n=${secondAnimations.length} frames=${JSON.stringify(
                secondAnimations.map((a) => a.effect?.getKeyframes?.())
            )}`
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
        let seed = 17
        for (let index = 0; index < 100; index++) {
            const snapshot = group.capture()
            element.style.left = index % 2 === 0 ? '50px' : '10px'
            void group.play(snapshot)
            const animations = element.getAnimations()
            if (animations.length === 0) {
                throw new Error(`P2 interrupt ${index} has no animation`)
            }
            const first = sampleBoxes([element], animations, 0).boxes[0]!
            expectClose(
                first.left,
                previous.left,
                0.5,
                `P2 interrupt ${index} continuity`
            )
            seed = (seed * 1664525 + 1013904223) >>> 0
            const interior = 4 + (seed % 18)
            previous = sampleBoxes([element], animations, interior).boxes[0]!
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

export async function P4(): Promise<string> {
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:240px;height:80px;'
    const first = document.createElement('div')
    first.style.cssText =
        'position:absolute;left:0;top:0;width:20px;height:20px;background:#222;'
    const second = document.createElement('div')
    second.style.cssText =
        'position:absolute;left:0;top:30px;width:20px;height:20px;background:#444;'
    root.append(first)
    document.body.append(root)
    const group = createLayoutGroup({ motion: { duration: 0.1 } })
    const removeFirst = group.add(first)
    let removeSecond = () => undefined
    try {
        const firstSnapshot = group.capture()
        first.style.left = '80px'
        void group.play(firstSnapshot)
        second.style.cssText +=
            'position:absolute;left:0;top:30px;width:20px;height:20px;background:#444;'
        root.append(second)
        removeSecond = group.add(second)
        let reads = 0
        const firstRect = first.getBoundingClientRect.bind(first)
        const secondRect = second.getBoundingClientRect.bind(second)
        first.getBoundingClientRect = () => {
            reads += 1
            return firstRect()
        }
        second.getBoundingClientRect = () => {
            reads += 1
            return secondRect()
        }
        const snapshot = group.capture()
        first.style.left = '140px'
        second.style.left = '60px'
        void group.play(snapshot)
        expectEqual(reads <= 4, true, `mixed retarget reads ${reads} <= 2N`)
        group.finish()
        first.getBoundingClientRect = firstRect
        second.getBoundingClientRect = secondRect
        return 'P4: mixed active/inactive retarget stays within 2N reads'
    } finally {
        removeFirst()
        removeSecond()
        group.dispose()
        root.remove()
    }
}

export async function P5(): Promise<string> {
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:300px;height:200px;'
    const parent = document.createElement('div')
    parent.style.cssText =
        'position:absolute;left:0;top:0;width:100px;height:100px;background:#ddd;'
    const child = document.createElement('div')
    child.style.cssText =
        'position:absolute;left:10px;top:10px;width:20px;height:20px;background:#222;'
    parent.append(child)
    root.append(parent)
    document.body.append(root)
    const group = createLayoutGroup({ motion: { duration: 0.2 } })
    const removeParent = group.add(parent, {
        layout: 'box',
        layoutAnchor: { x: 0.5, y: 0.5 },
    })
    const removeChild = group.add(child, { layout: 'box' })
    try {
        const snapshot = group.capture()
        const beforeParent = boxOf(parent)
        const beforeChild = boxOf(child)
        parent.style.left = '60px'
        parent.style.width = '160px'
        const run = group.play(snapshot)
        const animations = [...parent.getAnimations(), ...child.getAnimations()]
        if (animations.length < 2) {
            throw new Error('P5 nested projection did not animate both nodes')
        }
        pauseAt(animations, 0)
        const firstChild = boxOf(child)
        expectClose(
            firstChild.left,
            beforeChild.left,
            1.5,
            'P5 child first-frame projection'
        )
        expectClose(
            firstChild.width,
            beforeChild.width,
            1.5,
            'P5 child first-frame width'
        )
        const firstParent = boxOf(parent)
        expectClose(
            firstParent.left,
            beforeParent.left,
            1.5,
            'P5 parent first-frame'
        )
        resumeAnimations(animations)
        await run
        const finalChild = boxOf(child)
        const finalParent = boxOf(parent)
        expectClose(
            finalChild.left,
            finalParent.left + 10,
            0.6,
            'P5 child final parent-relative left'
        )
        expectClose(finalChild.width, 20, 0.6, 'P5 child final width')
        return 'P5: depth-1 parent projection + layoutAnchor + child counter-scale'
    } finally {
        removeParent()
        removeChild()
        group.dispose()
        root.remove()
    }
}

export async function P6(): Promise<string> {
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
            throw new Error('P6 first run has no animations')
        }
        const sample100 = sampleBoxes([element], firstAnimations, 100).boxes[0]!
        const sample101 = sampleBoxes([element], firstAnimations, 101).boxes[0]!
        const oldVelocity = sample101.left - sample100.left
        const retargetSnapshot = group.capture()
        element.style.left = '140px'
        const secondRun = group.play(retargetSnapshot)
        const secondAnimations = element.getAnimations()
        if (secondAnimations.length === 0) {
            throw new Error('P6 retarget has no animations')
        }
        const first = sampleBoxes([element], secondAnimations, 0).boxes[0]!
        const early = sampleBoxes([element], secondAnimations, 1).boxes[0]!
        const newVelocity = early.left - first.left
        const origin = root.getBoundingClientRect().left
        expectClose(first.left, sample100.left, 1.5, 'P6 first frame')
        expectEqual(
            Math.abs(newVelocity - oldVelocity) <=
                Math.max(Math.abs(oldVelocity) * 0.1, 0.1),
            true,
            `P6 compiled velocity ${oldVelocity} -> ${newVelocity}`
        )
        resumeAnimations(secondAnimations)
        await secondRun
        expectClose(boxOf(element).left - origin, 140, 0.6, 'P6 final')
        group.finish()
        await firstRun.catch(() => undefined)
        return 'P6: live compiled-path velocity handoff <=10%'
    } finally {
        remove()
        group.dispose()
        root.remove()
    }
}

export async function P8(): Promise<string> {
    for (const anchor of [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 1 },
    ]) {
        const root = document.createElement('div')
        root.style.cssText = 'position:relative;width:320px;height:220px;'
        const parent = document.createElement('div')
        parent.style.cssText =
            'position:absolute;left:0;top:0;width:100px;height:100px;background:#ddd;'
        const child = document.createElement('div')
        child.style.cssText =
            'position:absolute;left:10px;top:10px;width:20px;height:20px;background:#222;'
        parent.append(child)
        root.append(parent)
        document.body.append(root)
        const group = createLayoutGroup({ motion: { duration: 0.1 } })
        const removeParent = group.add(parent, {
            layout: 'box',
            layoutAnchor: anchor,
        })
        const removeChild = group.add(child, { layout: 'box' })
        try {
            const snapshot = group.capture()
            const beforeParent = boxOf(parent)
            parent.style.left = '60px'
            parent.style.top = '30px'
            parent.style.width = '160px'
            parent.style.height = '160px'
            const run = group.play(snapshot)
            const animations = [
                ...parent.getAnimations(),
                ...child.getAnimations(),
            ]
            pauseAt(animations, 0)
            const first = boxOf(parent)
            expectClose(
                first.left,
                beforeParent.left,
                1.5,
                `P8 anchor ${anchor.x}/${anchor.y} first left`
            )
            expectClose(
                first.top,
                beforeParent.top,
                1.5,
                `P8 anchor ${anchor.x}/${anchor.y} first top`
            )
            resumeAnimations(animations)
            await run
        } finally {
            removeParent()
            removeChild()
            group.dispose()
            root.remove()
        }
    }
    return 'P8: anchor 0/0.5/1 preserves the first frame'
}

export async function P9(): Promise<string> {
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:320px;height:220px;'
    const parent = document.createElement('div')
    parent.style.cssText =
        'position:absolute;left:0;top:0;width:100px;height:100px;background:#ddd;'
    const child = document.createElement('div')
    child.style.cssText =
        'position:absolute;left:10px;top:10px;width:20px;height:20px;background:#222;'
    parent.append(child)
    root.append(parent)
    document.body.append(root)
    const group = createLayoutGroup({
        motion: { duration: 0.2, timing: timing.linear() },
    })
    const removeParent = group.add(parent, {
        layout: 'box',
        layoutAnchor: { x: 0.5, y: 0.5 },
    })
    const removeChild = group.add(child, { layout: 'box' })
    try {
        const snapshot = group.capture()
        const before = boxOf(child)
        parent.style.left = '60px'
        parent.style.width = '160px'
        const run = group.play(snapshot)
        const animations = [...parent.getAnimations(), ...child.getAnimations()]
        let worst = 0
        for (let index = 0; index <= 60; index++) {
            const q = index / 60
            pauseAt(animations, q * 200)
            const box = boxOf(child)
            const expectedLeft = before.left + 60 * q
            const expectedWidth = before.width
            const error = Math.max(
                Math.abs(box.left - expectedLeft),
                Math.abs(box.width - expectedWidth)
            )
            worst = Math.max(worst, error)
        }
        resumeAnimations(animations)
        await run
        expectEqual(worst <= 0.5, true, `P9 projection sampled error ${worst}`)
        return `P9: 60-offset projection error ${worst.toFixed(3)}px`
    } finally {
        removeParent()
        removeChild()
        group.dispose()
        root.remove()
    }
}

export async function P7(): Promise<string> {
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:320px;height:220px;'
    const parent = document.createElement('div')
    parent.style.cssText =
        'position:absolute;left:0;top:0;width:100px;height:100px;background:#ddd;'
    const child = document.createElement('div')
    child.style.cssText =
        'position:absolute;left:10px;top:10px;width:20px;height:20px;background:#222;'
    parent.append(child)
    root.append(parent)
    document.body.append(root)
    const group = createLayoutGroup({ motion: { duration: 0.2 } })
    const removeParent = group.add(parent, {
        layout: 'box',
        layoutAnchor: { x: 0.5, y: 0.5 },
    })
    const removeChild = group.add(child, { layout: 'box' })
    try {
        const snapshot = group.capture()
        parent.style.left = '60px'
        parent.style.width = '160px'
        const run = group.play(snapshot)
        const firstAnimations = [
            ...parent.getAnimations(),
            ...child.getAnimations(),
        ]
        pauseAt(firstAnimations, 100)
        const beforeRetarget = boxOf(child)
        const retarget = group.capture()
        parent.style.left = '80px'
        parent.style.width = '180px'
        const second = group.play(retarget)
        const secondAnimations = [
            ...parent.getAnimations(),
            ...child.getAnimations(),
        ]
        pauseAt(secondAnimations, 0)
        expectClose(
            boxOf(child).left,
            beforeRetarget.left,
            1.5,
            'P7 projected retarget first frame'
        )
        resumeAnimations(secondAnimations)
        await second
        group.finish()
        await run.catch(() => undefined)
        return 'P7: interrupt/retarget under depth-1 projection'
    } finally {
        removeParent()
        removeChild()
        group.dispose()
        root.remove()
    }
}

export async function P10(): Promise<string> {
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:320px;height:220px;'
    const parent = document.createElement('div')
    parent.style.cssText =
        'position:absolute;left:0;top:0;width:100px;height:100px;background:#ddd;'
    const child = document.createElement('div')
    child.style.cssText =
        'position:absolute;left:10px;top:10px;width:20px;height:20px;background:#222;'
    parent.append(child)
    root.append(parent)
    document.body.append(root)
    const group = createLayoutGroup()
    const removeParent = group.add(parent, {
        layout: 'box',
        motion: {
            duration: 0.2,
            timing: timing.spring({ m: 1, k: 180, c: 12 }),
        },
    })
    const removeChild = group.add(child, {
        layout: 'box',
        motion: {
            duration: 0.35,
            timing: timing.bezier({
                p2: { x: 0.2, y: 0 },
                p3: { x: 0.2, y: 1 },
            }),
        },
    })
    try {
        const snapshot = group.capture()
        const beforeChild = boxOf(child)
        parent.style.left = '60px'
        parent.style.width = '160px'
        const run = group.play(snapshot)
        const parentAnimations = parent.getAnimations()
        const childAnimations = child.getAnimations()
        if (parentAnimations.length === 0 || childAnimations.length === 0) {
            throw new Error('P10 spring/tween participants did not animate')
        }
        const parentOptions = parentAnimations[0]!.effect?.getTiming()
        const childOptions = childAnimations[0]!.effect?.getTiming()
        expectEqual(parentOptions?.duration, 200, 'P10 parent spring duration')
        expectEqual(childOptions?.duration, 350, 'P10 child tween duration')
        const allAnimations = [...parentAnimations, ...childAnimations]
        let worstWidth = 0
        let maxStep = 0
        let previousLeft = beforeChild.left
        for (let index = 0; index <= 60; index++) {
            const q = index / 60
            pauseAt(allAnimations, q * 350)
            const box = boxOf(child)
            worstWidth = Math.max(worstWidth, Math.abs(box.width - 20))
            if (index > 0) {
                maxStep = Math.max(maxStep, Math.abs(box.left - previousLeft))
            }
            previousLeft = box.left
        }
        resumeAnimations(allAnimations)
        await run
        expectEqual(
            worstWidth <= 0.5,
            true,
            `P10 spring/tween width error ${worstWidth}`
        )
        expectEqual(maxStep <= 4, true, `P10 spring/tween step ${maxStep}`)
        return `P10: parent spring + child tween compose (width ${worstWidth.toFixed(3)}, step ${maxStep.toFixed(3)})`
    } finally {
        removeParent()
        removeChild()
        group.dispose()
        root.remove()
    }
}

export async function P11(): Promise<string> {
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:320px;height:220px;'
    const parent = document.createElement('div')
    parent.style.cssText =
        'position:absolute;left:0;top:0;width:100px;height:100px;background:#ddd;'
    const child = document.createElement('div')
    child.style.cssText =
        'position:absolute;left:10px;top:10px;width:20px;height:20px;background:#222;'
    parent.append(child)
    root.append(parent)
    document.body.append(root)
    const group = createLayoutGroup({
        motion: { duration: 0.2, timing: timing.linear() },
    })
    const removeParent = group.add(parent, {
        layout: 'box',
        layoutAnchor: { x: 0.5, y: 0.5 },
    })
    const removeChild = group.add(child, {
        layout: 'box',
        layoutAnchor: { x: 0.5, y: 0.5 },
    })
    try {
        const snapshot = group.capture()
        const before = boxOf(child)
        parent.style.left = '60px'
        parent.style.width = '160px'
        const run = group.play(snapshot)
        const animations = [...parent.getAnimations(), ...child.getAnimations()]
        let worst = 0
        for (let index = 0; index <= 60; index++) {
            const q = index / 60
            pauseAt(animations, q * 200)
            const box = boxOf(child)
            const expectedLeft = before.left + 60 * q
            const expectedWidth = before.width
            const error = Math.max(
                Math.abs(box.left - expectedLeft),
                Math.abs(box.width - expectedWidth)
            )
            worst = Math.max(worst, error)
        }
        resumeAnimations(animations)
        await run
        expectEqual(
            worst <= 0.5,
            true,
            `P11 anchored-child projection sampled error ${worst}`
        )
        return `P11: anchored-child 60-offset projection error ${worst.toFixed(3)}px`
    } finally {
        removeParent()
        removeChild()
        group.dispose()
        root.remove()
    }
}

export async function P12(): Promise<string> {
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:240px;height:120px;'
    const old = document.createElement('div')
    old.style.cssText =
        'position:absolute;left:0;top:0;width:40px;height:40px;background:#222;'
    const next = document.createElement('div')
    next.style.cssText =
        'position:absolute;left:120px;top:0;width:40px;height:40px;background:#444;'
    root.append(old, next)
    document.body.append(root)
    const group = createLayoutGroup({ motion: { duration: 0.15 } })
    const removeOld = group.add(old, { layoutId: 'hero' })
    const removeNext = group.add(next, { layoutId: 'hero' })
    try {
        const snapshot = group.capture()
        old.style.left = '20px'
        next.style.left = '140px'
        const run = group.play(snapshot)
        const oldAnimations = old.getAnimations()
        const nextAnimations = next.getAnimations()
        const opacity = [...oldAnimations, ...nextAnimations].some(
            (animation) =>
                animation.effect
                    ?.getKeyframes()
                    .some((frame) => frame.opacity !== undefined)
        )
        expectEqual(opacity, true, 'P12 duplicate layoutId crossfades')
        expectEqual(
            new Set(
                [...oldAnimations, ...nextAnimations].map((a) => a.startTime)
            ).size,
            1,
            'P12 crossfade shares one clock'
        )
        group.finish()
        await run
        return 'P12: duplicate-layoutId crossfade shares the group clock'
    } finally {
        removeOld()
        removeNext()
        group.dispose()
        root.remove()
    }
}
