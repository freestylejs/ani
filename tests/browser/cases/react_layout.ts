import { LayoutGroup, useLayout } from '@freestylejs/ani-react/layout'
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
