import { ani, timing } from '@freestylejs/ani-core'
import {
    AnimatePresence,
    LayoutGroup,
    useLayout,
    usePresence,
} from '@freestylejs/ani-react/layout'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expectClose, frames, waitFor } from './assert'
import { resumeAnimations, sampleBoxes } from './cpc_harness'

export const pageOptions = {}
export const knownFailures: Record<string, string> = {}

function Box({ left }: { left: number }) {
    const ref = useLayout<HTMLDivElement>()
    return createElement('div', {
        ref,
        style: {
            position: 'absolute',
            left,
            top: 0,
            width: '20px',
            height: '20px',
            background: '#222',
        },
    })
}

function App({ left }: { left: number }) {
    return createElement(
        LayoutGroup,
        { deps: [left] },
        createElement(Box, { left })
    )
}

export async function R1(): Promise<string> {
    const host = document.createElement('div')
    host.style.cssText = 'position:relative;width:200px;height:100px;'
    document.body.append(host)
    const root = createRoot(host)
    try {
        root.render(createElement(App, { left: 0 }))
        await frames(2)
        const element = host.firstElementChild as HTMLElement
        if (!element) throw new Error('React layout element missing')

        root.render(createElement(App, { left: 80 }))
        await frames(1)
        const origin = host.getBoundingClientRect().left
        const first = element.getBoundingClientRect().left - origin
        expectClose(first, 0, 0.6, 'React first frame')
        await waitFor(
            () => element.getAnimations().length === 0,
            2000,
            'React layout animation settles'
        )
        const final = element.getBoundingClientRect().left - origin
        expectClose(final, 80, 0.6, 'React final layout')
        return 'React LayoutGroup: inverse first frame and exact final layout'
    } finally {
        root.unmount()
        host.remove()
    }
}

const motion = {
    present: { opacity: 1 },
    exit: ani({
        to: { opacity: 0 },
        duration: 0.12,
        timing: timing.linear(),
    }),
}

function PresenceRow({ id }: { id: string }) {
    const presence = usePresence(motion)
    return createElement('div', {
        ref: presence.ref,
        'data-id': id,
        style: {
            width: 40,
            height: 20,
            background: '#222',
            ...presence.style,
        },
    })
}

function PresenceList({ ids }: { ids: string[] }) {
    return createElement(
        AnimatePresence,
        { initial: false, mode: 'popLayout' },
        ids.map((id) => createElement(PresenceRow, { key: id, id }))
    )
}

export async function R2(): Promise<string> {
    const host = document.createElement('div')
    host.style.cssText = 'position:relative;width:200px;height:100px;'
    document.body.append(host)
    const root = createRoot(host)
    try {
        root.render(createElement(PresenceList, { ids: ['a', 'b'] }))
        await frames(2)
        const beforeA = (
            host.querySelector('[data-id="a"]') as HTMLElement
        ).getBoundingClientRect()
        const beforeB = (
            host.querySelector('[data-id="b"]') as HTMLElement
        ).getBoundingClientRect()
        root.render(createElement(PresenceList, { ids: ['b'] }))
        await frames(1)
        const exiting = host.querySelector(
            '[data-id="a"]'
        ) as HTMLElement | null
        if (!exiting) throw new Error('exiting row missing')
        if (exiting.style.position !== 'absolute') {
            throw new Error(
                `popLayout did not leave flow: ${exiting.style.position}`
            )
        }
        const afterA = exiting.getBoundingClientRect()
        const afterB = (
            host.querySelector('[data-id="b"]') as HTMLElement
        ).getBoundingClientRect()
        expectClose(afterA.left, beforeA.left, 0.6, 'popLayout preserved left')
        expectClose(afterA.top, beforeA.top, 0.6, 'popLayout preserved top')
        expectClose(
            afterA.width,
            beforeA.width,
            0.6,
            'popLayout preserved width'
        )
        expectClose(
            afterA.height,
            beforeA.height,
            0.6,
            'popLayout preserved height'
        )
        expectClose(afterB.top, beforeA.top, 0.6, 'sibling moved into the gap')
        if (!(afterB.top < beforeB.top)) {
            throw new Error('sibling did not move up after popLayout exit')
        }
        await waitFor(
            () => host.querySelector('[data-id="a"]') === null,
            2000,
            'popLayout exit completes'
        )
        return 'React AnimatePresence popLayout: box preserved, sibling moved, exit completed'
    } finally {
        root.unmount()
        host.remove()
    }
}

const toastMotion = {
    present: { opacity: 1, translateY: 0 },
    initial: { opacity: 0, translateY: 0 },
    exit: ani({
        to: { opacity: 0, translateY: 10 },
        duration: 0.2,
        timing: timing.linear(),
    }),
}

function ToastRow({ id }: { id: string }) {
    const presence = usePresence(toastMotion)
    const ref = useLayout<HTMLDivElement>({
        layout: 'position',
        ref: presence.ref,
    })
    return createElement('div', {
        ref,
        'data-id': id,
        style: {
            width: 120,
            height: 20,
            background: '#222',
            ...presence.style,
        },
    })
}

function ToastList({ ids }: { ids: string[] }) {
    return createElement(
        LayoutGroup,
        { deps: [ids] },
        createElement(
            AnimatePresence,
            { initial: false, mode: 'popLayout' },
            ids.map((id) => createElement(ToastRow, { key: id, id }))
        )
    )
}

export async function R3(): Promise<string> {
    const host = document.createElement('div')
    host.style.cssText = 'position:relative;width:200px;height:100px;'
    document.body.append(host)
    const root = createRoot(host)
    try {
        root.render(createElement(ToastList, { ids: ['a', 'b'] }))
        await frames(2)
        const beforeA = (
            host.querySelector('[data-id="a"]') as HTMLElement
        ).getBoundingClientRect()
        const beforeB = (
            host.querySelector('[data-id="b"]') as HTMLElement
        ).getBoundingClientRect()
        root.render(createElement(ToastList, { ids: ['b'] }))
        await frames(1)
        const exiting = host.querySelector(
            '[data-id="a"]'
        ) as HTMLElement | null
        if (!exiting) throw new Error('E5 exiting toast missing')
        if (exiting.style.position !== 'absolute') {
            throw new Error('E5 toast did not pop layout')
        }
        const b = host.querySelector('[data-id="b"]') as HTMLElement
        const animations = b.getAnimations()
        if (animations.length === 0) {
            throw new Error('E5 sibling has no managed layout animation')
        }
        const first = sampleBoxes([b], animations, 0).boxes[0]!
        const middle = sampleBoxes([b], animations, 120).boxes[0]!
        expectClose(first.top, beforeB.top, 1, 'E5 sibling first frame')
        if (!(middle.top < first.top && middle.top > beforeA.top)) {
            throw new Error(
                'E5 sibling interior sample is not between endpoints'
            )
        }
        resumeAnimations(animations)
        await waitFor(
            () => b.getAnimations().length === 0,
            2000,
            'E5 sibling layout settles'
        )
        const afterB = b.getBoundingClientRect()
        expectClose(afterB.top, beforeA.top, 1, 'E5 sibling shifted into gap')
        if (!(afterB.top < beforeB.top)) {
            throw new Error('E5 sibling did not move up')
        }
        await waitFor(
            () => host.querySelector('[data-id="a"]') === null,
            2000,
            'E5 toast exit completes'
        )
        return 'E5 Toast baseline: popLayout, sibling shift, exit completion'
    } finally {
        root.unmount()
        host.remove()
    }
}
