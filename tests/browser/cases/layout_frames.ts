// Shared frame harness for the React layout modules: a React root rendered
// synchronously (the commit's flush has run when `render` resolves) and a
// manual clock advanced frame by frame, checked against the independent oracle.
import type { TimingFunction } from '@freestylejs/ani-core'
import type { ManualClock } from '@freestylejs/ani-core/testing'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import {
    maxDiff,
    type OBox,
    type OTrackSpec,
} from '../../../packages/layout/src/__tests__/oracle'

export const FRAME_MS = 16
export const DT = FRAME_MS / 1000
/** Per-frame tolerance against the oracle (§11). */
export const TOL = 0.5

export function pageBox(element: Element): OBox {
    const r = element.getBoundingClientRect()
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }
}

export function q(host: ParentNode, selector: string): HTMLElement {
    const element = host.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`${selector} missing`)
    return element
}

export function offset(
    origin: OBox,
    box: { x: number; y: number; w: number; h: number }
): OBox {
    return { x: origin.x + box.x, y: origin.y + box.y, w: box.w, h: box.h }
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

export async function microtasks(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve()
}

export function macrotask(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0))
}

export const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface Mounted {
    readonly host: HTMLElement
    readonly root: Root
    /** Renders synchronously; the commit's flush has run when it resolves. */
    render(node: ReactNode): Promise<void>
    dispose(): void
}

export function mountRoot(): Mounted {
    document.body.style.margin = '0'
    const host = document.createElement('div')
    host.style.cssText = 'position: relative; width: 700px; height: 700px;'
    document.body.append(host)
    const root = createRoot(host)
    return {
        host,
        root,
        async render(node) {
            flushSync(() => root.render(node))
            await microtasks()
        },
        dispose() {
            flushSync(() => root.unmount())
            host.remove()
        },
    }
}

/**
 * Advances frames until `done()` or `limit`; the first frame after a flush
 * has `dt = 0`, so frame k (from 0) shows elapsed k·DT. React may commit
 * between frames (a macrotask per frame). Returns the frames run.
 */
export async function frames(
    mc: ManualClock,
    limit: number,
    check: (elapsed: number) => void,
    done: () => boolean = () => false
): Promise<number> {
    let count = 0
    for (; count < limit && !done(); count++) {
        mc.frame(FRAME_MS)
        check(count * DT)
        await microtasks()
        await macrotask()
    }
    return count
}

/**
 * `frames` for a run that must complete: exhausting `limit` before `done()`
 * holds throws instead of returning, so a row cannot pass on a run that never
 * settled. Returns the frames run.
 */
export async function framesUntilDone(
    mc: ManualClock,
    limit: number,
    check: (elapsed: number) => void,
    done: () => boolean,
    label = 'run'
): Promise<number> {
    const count = await frames(mc, limit, check, done)
    if (!done()) {
        throw new Error(`${label} did not settle within ${limit} frames`)
    }
    return count
}

/** A track with a centred origin, at rest, no delay. */
export function spec(
    before: OBox,
    after: OBox,
    rest: Partial<OTrackSpec> & { duration: number; timing: TimingFunction }
): OTrackSpec {
    return {
        before,
        after,
        velocity: null,
        fx: 0.5,
        fy: 0.5,
        mode: true,
        delay: 0,
        ...rest,
    }
}

/** No element under `host` carries a layout-owned declaration. */
export function settled(host: ParentNode): boolean {
    for (const element of host.querySelectorAll<HTMLElement>('*')) {
        if (element.style.translate !== '' || element.style.scale !== '') {
            return false
        }
    }
    return true
}

/** Every element under `host` matching `selector`, keyed by an attribute. */
export function picture(
    host: ParentNode,
    selector: string,
    key: (element: HTMLElement) => string
): Map<string, { element: HTMLElement; box: OBox }> {
    const boxes = new Map<string, { element: HTMLElement; box: OBox }>()
    for (const element of host.querySelectorAll<HTMLElement>(selector)) {
        boxes.set(key(element), { element, box: pageBox(element) })
    }
    return boxes
}

/** Elements present before and after a commit did not move (§3.3 invariant 1). */
export function expectUnmoved(
    before: ReadonlyMap<string, { element: HTMLElement; box: OBox }>,
    label: string
): number {
    let worst = 0
    for (const [key, { element, box }] of before) {
        if (!element.isConnected) continue
        worst = Math.max(worst, expectAt(element, box, `${label}: ${key}`))
    }
    return worst
}
