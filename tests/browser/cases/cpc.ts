import { createLayoutGroup } from '@freestylejs/ani-layout'
import { expectClose, expectEqual } from './assert'
import {
    blockMainThread,
    boxOf,
    runPausedOracle,
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
            expectClose(
                firstSample[key],
                before[key],
                1,
                `first-frame ${key}`
            )
        }
        for (const key of ['left', 'top', 'width', 'height'] as const) {
            expectClose(
                run.final[0]![key],
                target[key],
                0.6,
                `final ${key}`
            )
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
