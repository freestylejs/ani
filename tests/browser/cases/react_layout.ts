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
