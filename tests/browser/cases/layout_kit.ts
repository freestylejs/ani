// In-page helpers shared by the v3 layout rows: a manual-clock harness,
// absolutely positioned nodes, page boxes, frame stepping and oracle checks.
import {
    createManualClock,
    type ManualClock,
} from '@freestylejs/ani-core/testing'
import {
    createLayoutGroup,
    type LayoutGroup,
    type LayoutGroupOptions,
    type LayoutOptions,
    type LayoutReport,
} from '@freestylejs/ani-layout'
import {
    maxDiff,
    type OBox,
} from '../../../packages/layout/src/__tests__/oracle'

/** Per-frame tolerance against the oracle (ARCHITECTURE §11). */
export const TOL = 0.5

export function pageBox(element: Element): OBox {
    const r = element.getBoundingClientRect()
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }
}

/** Rendered box in view space (`getBoundingClientRect()`, ARCHITECTURE §3.2, §11.1). */
export function viewBox(element: Element): OBox {
    const r = element.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
}

export function shiftBox(box: OBox, dx: number, dy: number): OBox {
    return { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h }
}

export function node(parent: HTMLElement, css: string): HTMLElement {
    const element = document.createElement('div')
    element.style.cssText = `position: absolute; box-sizing: border-box; ${css}`
    parent.append(element)
    return element
}

export interface Harness {
    readonly mc: ManualClock
    readonly group: LayoutGroup
    readonly root: HTMLElement
    add(element: HTMLElement, options?: LayoutOptions): void
    dispose(): void
}

export function harness(
    options: Omit<LayoutGroupOptions, 'clock'> = {}
): Harness {
    document.body.style.margin = '0'
    const root = document.createElement('div')
    root.style.cssText = 'position: relative; width: 900px; height: 700px;'
    document.body.append(root)
    const mc = createManualClock()
    const group = createLayoutGroup({ ...options, clock: mc.clock })
    const removes: (() => void)[] = []
    return {
        mc,
        group,
        root,
        add(element, layoutOptions) {
            removes.push(group.add(element, layoutOptions))
        },
        dispose() {
            for (const remove of removes) remove()
            group.dispose()
            root.remove()
        },
    }
}

/** Microtask turns: promise reactions (run reports, presence) settle. */
export async function settleMicrotasks(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve()
}

/**
 * Runs frames of `frameMs` until `done()` or `limit`, checking every frame;
 * the first frame after a flush has `dt = 0`, so frame k (from 0) shows
 * elapsed k·dt for a track from rest.
 */
export async function frames(
    mc: ManualClock,
    limit: number,
    check: (elapsed: number, index: number) => void,
    done: () => boolean = () => false,
    frameMs = 16
): Promise<number> {
    let count = 0
    for (; count < limit && !done(); count++) {
        mc.frame(frameMs)
        check((count * frameMs) / 1000, count)
        await settleMicrotasks()
    }
    return count
}

export function expectAt(
    element: Element,
    want: OBox,
    label: string,
    tolerance = TOL
): number {
    const got = pageBox(element)
    const error = maxDiff(got, want)
    if (!(error <= tolerance)) {
        throw new Error(
            `${label}: drawn ${JSON.stringify(got)} differs from ${JSON.stringify(want)} by ${error.toFixed(3)} px`
        )
    }
    return error
}

export function expectViewAt(
    element: Element,
    want: OBox,
    label: string,
    tolerance = TOL
): number {
    const got = viewBox(element)
    const error = maxDiff(got, want)
    if (!(error <= tolerance)) {
        throw new Error(
            `${label}: drawn ${JSON.stringify(got)} differs from ${JSON.stringify(want)} by ${error.toFixed(3)} px`
        )
    }
    return error
}

export function report(promise: Promise<LayoutReport>): {
    value: LayoutReport | null
} {
    const holder: { value: LayoutReport | null } = { value: null }
    void promise.then((r) => {
        holder.value = r
    })
    return holder
}

/** On-screen corner radii (x, y per corner) of an element under its scale. */
export function screenRadii(element: HTMLElement): number[] {
    const style = getComputedStyle(element)
    const box = pageBox(element)
    const sx = box.w / element.offsetWidth
    const sy = box.h / element.offsetHeight
    return [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
    ].flatMap((value) => {
        const parts = value.split(' ')
        const resolve = (part: string, size: number) =>
            Number.parseFloat(part) * (part.includes('%') ? size / 100 : 1)
        const x = resolve(parts[0]!, element.offsetWidth)
        const y = resolve(parts[1] ?? parts[0]!, element.offsetHeight)
        return [x * sx, y * sy]
    })
}

export function silenceWarnings(): {
    readonly messages: string[]
    restore(): void
} {
    // biome-ignore lint/suspicious/noConsole: capture the expected development warnings
    const original = console.warn
    const messages: string[] = []
    console.warn = (...args: unknown[]) => {
        messages.push(args.map(String).join(' '))
    }
    return {
        messages,
        restore() {
            console.warn = original
        },
    }
}
