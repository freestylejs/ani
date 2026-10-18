import type { ReactElement } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

export async function mount(ui: ReactElement) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
        root.render(ui)
    })
    return {
        container,
        root,
        rerender: (next: ReactElement) =>
            act(async () => {
                root.render(next)
            }),
        unmount: () =>
            act(async () => {
                root.unmount()
                container.remove()
            }),
    }
}

export { act }
