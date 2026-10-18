import { a, defaultClock } from '@freestylejs/ani-core'
import { expectEqual, frames, host, nextFrame } from './assert.ts'

export const pageOptions = {}

export const knownFailures: Record<string, string> = {}

const CYCLES = 10_000
const BATCH = 100
// The heap of a fresh page grows once during its first ~2,000 cycles (JIT
// feedback, first-use caches) and is flat afterwards, so the per-cycle baseline
// h1 is taken once that has happened. A leak keeps growing past it.
const WARM_UP_CYCLES = 2000
const CYCLE_TOLERANCE = 0.05
// Absolute bound on that one-time cost, so it cannot grow unnoticed (a
// percentage of a ~1 MB page is not meaningful).
const FRESH_LIMIT_BYTES = 512 * 1024

function megabytes(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function percent(from: number, to: number): string {
    return `${(((to - from) / from) * 100).toFixed(2)}%`
}

/**
 * C1: memory gate, three measurements (each after two forced GCs):
 * h0 on the fresh page, h1 after 2,000 warm-up cycles, h2 after 10,000 more.
 * h2 must be within 5% of h1 (no growth per bind / unbind cycle) and at most
 * 512 KiB above h0.
 */
export async function C1(): Promise<string> {
    const h0 = await host.heapUsed()
    const timeline = a.rafTimeline(
        a.ani({
            to: { translateX: 100 },
            duration: 0.3,
            timing: a.timing.linear(),
        })
    )
    const stage = document.createElement('div')
    document.body.append(stage)

    // One batch per frame: create, bind, let a frame write them, unbind, remove.
    const cycles = async (count: number): Promise<void> => {
        for (let done = 0; done < count; done += BATCH) {
            const elements: HTMLElement[] = []
            const unbinds: Array<() => void> = []
            for (let i = 0; i < BATCH; i++) {
                const element = document.createElement('div')
                stage.append(element)
                unbinds.push(timeline.bind(element))
                elements.push(element)
            }
            await nextFrame()
            for (const unbind of unbinds) unbind()
            for (const element of elements) element.remove()
        }
    }

    try {
        void timeline.play({ from: { translateX: 0 }, repeat: Infinity })
        await frames(2)
        await cycles(WARM_UP_CYCLES)

        await frames(2)
        const h1 = await host.heapUsed()
        await cycles(CYCLES)
        await frames(2)
        const h2 = await host.heapUsed()

        const report =
            `h0 ${megabytes(h0)} (${h0} B), h1 ${megabytes(h1)} (${h1} B), ` +
            `h2 ${megabytes(h2)} (${h2} B); h2 vs h1 ${percent(h1, h2)} ` +
            `(limit 5%), h2 - h0 ${h2 - h0} B (limit ${FRESH_LIMIT_BYTES} B)`
        if (h2 > h1 * (1 + CYCLE_TOLERANCE)) {
            throw new Error(`heap grew more than 5% over the cycles: ${report}`)
        }
        if (h2 - h0 > FRESH_LIMIT_BYTES) {
            throw new Error(
                `heap grew more than 512 KiB since the fresh page: ${report}`
            )
        }
        return report
    } finally {
        timeline.dispose()
        stage.remove()
    }
}

const ELEMENTS = 1000
const MEASURED_FRAMES = 60
const LAYOUT_SLACK = 5

/**
 * C2: a group of 1,000 elements whose `onUpdate` listener reads
 * `offsetWidth` through `clock.read` runs at most one layout per frame,
 * while its width animation dirties layout every frame.
 */
export async function C2(): Promise<string> {
    const stage = document.createElement('div')
    document.body.append(stage)
    const elements = Array.from({ length: ELEMENTS }, () => {
        const element = document.createElement('div')
        element.style.height = '1px'
        stage.append(element)
        return element
    })
    const group = a.rafGroup(
        a.ani({
            to: { width: 400 },
            duration: 2,
            timing: a.timing.linear(),
        })
    )
    let reads = 0
    let width = 0
    const unbind = group.bind(elements)
    const stopListening = group.onUpdate(() => {
        defaultClock.read(() => {
            for (const element of elements) width += element.offsetWidth
            reads += 1
        })
    })
    try {
        void group.play({ from: { width: 100 }, repeat: Infinity })
        await frames(5)

        const readsBefore = reads
        const layoutsBefore = await host.layoutCount()
        await frames(MEASURED_FRAMES)
        const layouts = (await host.layoutCount()) - layoutsBefore
        const measuredReads = reads - readsBefore

        const report = `${layouts} layouts over ${MEASURED_FRAMES} frames, ${measuredReads} read callbacks`
        expectEqual(measuredReads >= MEASURED_FRAMES - 1, true, report)
        if (width <= 0) throw new Error('offsetWidth was never read')
        if (layouts > MEASURED_FRAMES + LAYOUT_SLACK) {
            throw new Error(`more than one layout per frame: ${report}`)
        }
        return report
    } finally {
        stopListening()
        unbind()
        group.dispose()
        stage.remove()
    }
}
