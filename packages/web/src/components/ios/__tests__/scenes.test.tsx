// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../../../core/src/testing/index'

let host: HTMLDivElement
let root: Root
const dialogDescriptors = new Map<string, PropertyDescriptor | undefined>()
beforeEach(() => {
    // jsdom has no top layer. Only emulate open/close state here; the real
    // Chromium/WebKit cases prove modal focus and hit-test isolation.
    for (const key of ['showModal', 'close']) {
        dialogDescriptors.set(
            key,
            Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, key)
        )
        Object.defineProperty(HTMLDialogElement.prototype, key, {
            configurable: true,
            value(this: HTMLDialogElement) {
                this.open = key === 'showModal'
            },
        })
    }
    ;(
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    // jsdom has no layout engine and returns empty computed radius longhands.
    // Supply only the platform's default longhand; geometry is verified in real browsers.
    const computed = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
        (element, pseudo) => {
            const style = computed(element, pseudo)
            const get = style.getPropertyValue.bind(style)
            style.getPropertyValue = (property: string) =>
                get(property) ||
                (/^border-(top|bottom)-(left|right)-radius$/.test(property)
                    ? '0px'
                    : '')
            return style
        }
    )
})
afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    for (const [key, descriptor] of dialogDescriptors) {
        if (descriptor)
            Object.defineProperty(HTMLDialogElement.prototype, key, descriptor)
        else Reflect.deleteProperty(HTMLDialogElement.prototype, key)
    }
    dialogDescriptors.clear()
})
async function render(node: ReactNode) {
    await act(async () => root.render(node))
}
async function click(selector: string) {
    await act(async () =>
        host.querySelector<HTMLButtonElement>(selector)!.click()
    )
}
async function load() {
    const paths = [
        '../ios_app_folder',
        '../ios_notifications_stack',
        '../ios_app_store',
        '../ios_view_app_store',
    ]
    const modules = await Promise.all(
        paths.map((path) => import(/* @vite-ignore */ path).catch(() => null))
    )
    expect(modules.every(Boolean), 'all four reusable scenes must exist').toBe(
        true
    )
    return { ...modules[0]!, ...modules[1]!, ...modules[2]!, ...modules[3]! }
}
const items = [
    { id: 'one', label: 'One', iconSrc: '/one.png' },
    { id: 'two', label: 'Two', iconSrc: '/two.png' },
]
const articles = [
    {
        id: 'story',
        category: 'Travel',
        title: 'A test story',
        imageSrc: '/story.jpg',
        content: <p>Independent component content</p>,
    },
]

it('folder instances isolate state and shared ids, then restore keyboard focus', async () => {
    const { IosAppFolder } = await load()
    const mc = createManualClock({ reducedMotion: true })
    const change = vi.fn()
    await render(
        <>
            <IosAppFolder
                title="First"
                items={items}
                clock={mc.clock}
                onOpenChange={change}
            />
            <IosAppFolder title="Second" items={items} clock={mc.clock} />
        </>
    )
    const buttons =
        host.querySelectorAll<HTMLButtonElement>('[data-folder-open]')
    await act(async () => buttons[0]!.click())
    expect(change).toHaveBeenCalledExactlyOnceWith(true)
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(
        host.querySelector('[role="dialog"]')!.getAttribute('aria-label')
    ).toBe('First')
    expect(host.querySelectorAll('[data-folder-open]')).toHaveLength(1)
    await act(async () =>
        host
            .querySelector('[role="dialog"]')!
            .dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
            )
    )
    await act(async () => mc.frames(120, 16))
    expect(change).toHaveBeenLastCalledWith(false)
    expect(host.querySelectorAll('[data-folder-open]')).toHaveLength(2)
    await render(null)
    expect(mc.clock.size).toBe(0)
})

it('notification stack preserves content and exposes its three cards only when expanded', async () => {
    const { IosNotificationsStack } = await load()
    const mc = createManualClock()
    await render(
        <IosNotificationsStack
            clock={mc.clock}
            items={[
                { id: 'a', content: 'Alpha' },
                { id: 'b', content: 'Beta' },
                { id: 'c', content: 'Gamma' },
            ]}
        />
    )
    expect(host.querySelectorAll('[data-notification]')).toHaveLength(3)
    await click('[data-stack-expand]')
    expect(host.textContent).toContain('Notifications')
    expect(
        host.querySelector('[data-stack-root]')!.getAttribute('data-expanded')
    ).toBe('true')
    await click('[data-stack-collapse]')
    await act(async () => mc.frames(120, 16))
    expect(
        host.querySelector('[data-stack-root]')!.getAttribute('data-expanded')
    ).toBe('false')
    await render(null)
    expect(mc.clock.size).toBe(0)
})

it('layout store uses supplied content and closes without retaining an exiting dialog', async () => {
    const { IosAppStore } = await load()
    const mc = createManualClock({ reducedMotion: true })
    const select = vi.fn()
    await render(
        <IosAppStore
            items={articles}
            clock={mc.clock}
            onSelectionChange={select}
        />
    )
    expect(
        host.querySelector('[data-ios-store]')!.getAttribute('data-engine')
    ).toBe('layout')
    await click('[data-store-card="story"]')
    expect(select).toHaveBeenCalledWith('story')
    expect(host.querySelector('[role="dialog"]')!.textContent).toContain(
        'Independent component content'
    )
    await click('[data-store-close]')
    await act(async () => mc.frames(120, 16))
    expect(select).toHaveBeenLastCalledWith(null)
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    await render(null)
    expect(mc.clock.size).toBe(0)
})

it('view store performs its actual unsupported native-transition fallback, not layout substitution', async () => {
    const { IosViewAppStore } = await load()
    const select = vi.fn()
    await render(
        <IosViewAppStore items={articles} onSelectionChange={select} />
    )
    expect(
        host.querySelector('[data-ios-store]')!.getAttribute('data-engine')
    ).toBe('view-transition')
    await click('[data-store-card="story"]')
    expect(select).toHaveBeenCalledExactlyOnceWith('story')
    expect(
        host
            .querySelector('[data-ios-store]')!
            .getAttribute('data-transition-result')
    ).toBe('unsupported')
    await click('[data-store-close]')
    expect(select).toHaveBeenLastCalledWith(null)
    expect(host.querySelector('[role="dialog"]')).toBeNull()
})
