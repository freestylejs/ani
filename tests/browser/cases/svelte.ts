import { a } from '@freestylejs/ani-core'
import {
    useAniGroup,
    useAniRef,
    useAniStates,
    useFollow,
    useTimeline,
} from '@freestylejs/ani-svelte'
import { type Component, flushSync, mount, onDestroy, unmount } from 'svelte'
import type { Action } from 'svelte/action'
import { pop, push } from 'svelte/internal/client'
import { createContainer } from './assert.ts'
import {
    type Driver,
    type FollowMount,
    type GroupMount,
    INITIAL,
    once,
    type RefMount,
    type StatesMount,
    statesConfig,
} from './fixtures.ts'
import * as shared from './shared.ts'

// No compiler: a component is a function of (anchor, props) that runs between
// `push` and `pop`, which is what gives `onDestroy` its component scope.
function mountComponent(setup: (anchor: ChildNode) => void): {
    container: HTMLElement
    unmount(): void
} {
    const container = createContainer()
    const component = (anchor: ChildNode, props: Record<string, unknown>) => {
        push(props, true)
        try {
            setup(anchor)
        } finally {
            pop()
        }
    }
    const app = mount(component as unknown as Component, { target: container })
    flushSync()
    return {
        container,
        unmount: once(() => {
            unmount(app)
            container.remove()
        }),
    }
}

/** Creates a `div` before `anchor`, styled and wired like `<div use:action {style}>`. */
function createElementFor<Param>(
    anchor: ChildNode,
    id: string,
    action: Action<HTMLElement, Param>,
    style: string | undefined,
    param: Param
): HTMLElement {
    const element = document.createElement('div')
    element.id = id
    if (style !== undefined) element.setAttribute('style', style)
    anchor.before(element)
    const handle = action(element, param)
    onDestroy(() => {
        handle?.destroy?.()
        element.remove()
    })
    return element
}

function find(container: HTMLElement, selector: string): HTMLElement {
    const element = container.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`${selector} was not rendered`)
    return element
}

const driver: Driver = {
    mountRef({ node, reducedMotion }) {
        let timeline: RefMount['timeline'] | undefined
        const { container, unmount: remove } = mountComponent((anchor) => {
            timeline = useTimeline(() =>
                a.rafTimeline(node, reducedMotion ? { reducedMotion } : {})
            )
            const { action, style } = useAniRef(timeline, {
                initialValue: INITIAL,
            })
            createElementFor(anchor, 'box', action, style, undefined)
        })
        if (!timeline) throw new Error('Box did not create a timeline')
        return { element: find(container, '#box'), timeline, unmount: remove }
    },
    mountGroup({ node, count }) {
        let group: GroupMount['group'] | undefined
        const { container, unmount: remove } = mountComponent((anchor) => {
            group = useTimeline(() => a.rafGroup(node))
            const { action, style } = useAniGroup(group, {
                initialValue: INITIAL,
            })
            const list = document.createElement('div')
            list.id = 'group'
            anchor.before(list)
            onDestroy(() => list.remove())
            const end = document.createComment('')
            list.append(end)
            for (let index = 0; index < count; index++) {
                createElementFor(end, `item-${index}`, action, style, index)
            }
        })
        if (!group) throw new Error('Group did not create a group')
        return {
            elements: Array.from(find(container, '#group').children).filter(
                (child): child is HTMLElement => child instanceof HTMLElement
            ),
            group,
            unmount: remove,
        }
    },
    mountStates() {
        let transitionTo: StatesMount['transitionTo'] | undefined
        const { container, unmount: remove } = mountComponent((anchor) => {
            const states = useAniStates(statesConfig())
            transitionTo = states.transitionTo
            const element = createElementFor(
                anchor,
                'states',
                states.action,
                states.style,
                undefined
            )
            const label = document.createElement('span')
            label.id = 'state'
            const text = document.createTextNode('')
            label.append(text)
            element.append(label)
            const unsubscribe = states.state.subscribe((value) => {
                text.data = String(value)
            })
            onDestroy(unsubscribe)
        })
        if (!transitionTo) throw new Error('States did not mount')
        const label = find(container, '#state')
        return {
            element: find(container, '#states'),
            stateText: () => label.textContent ?? '',
            transitionTo,
            unmount: remove,
        }
    },
    mountFollow() {
        let follower: FollowMount['follower'] | undefined
        const { container, unmount: remove } = mountComponent((anchor) => {
            const follow = useFollow({ translateX: 0 })
            follower = follow.follower
            createElementFor(
                anchor,
                'follow',
                follow.action,
                follow.style,
                undefined
            )
        })
        if (!follower) throw new Error('Follow did not mount')
        return {
            element: find(container, '#follow'),
            follower,
            unmount: remove,
        }
    },
}

export const pageOptions = {
    B6: { reducedMotion: 'reduce' },
}

export const knownFailures: Record<string, string> = {}

export const B1 = () => shared.ref(driver)
export const B2 = () => shared.group(driver)
export const B3 = () => shared.unmount(driver)
export const B4 = () => shared.states(driver)
export const B5 = () => shared.follow(driver)
export const B6 = () => shared.reducedMotion(driver)
