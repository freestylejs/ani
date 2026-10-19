import type { ReducedMotionPolicy } from '@freestylejs/ani-core'
import * as a from '@freestylejs/ani-core'
import {
    createAniGroup,
    createAniRef,
    createAniStates,
    createFollow,
    createTimeline,
} from '@freestylejs/ani-solid'
import { type Component, createComponent, type JSX } from 'solid-js'
import { insert, render, style as setStyle } from 'solid-js/web'
import { createContainer } from './assert.ts'
import {
    type Driver,
    type FollowMount,
    type GroupMount,
    INITIAL,
    once,
    type PoseNode,
    type RefMount,
    type StatesMount,
    statesConfig,
} from './fixtures.ts'
import * as shared from './shared.ts'

/** Sets the inline style the way compiled Solid templates do. */
function applyStyle(
    element: HTMLElement,
    style: JSX.CSSProperties | undefined
): void {
    setStyle(element, (style ?? {}) as Record<string, string>, {})
}

function mountComponent<P extends Record<string, unknown>>(
    component: Component<P>,
    props: P
): { container: HTMLElement; unmount(): void } {
    const container = createContainer()
    const dispose = render(() => createComponent(component, props), container)
    return {
        container,
        unmount: once(() => {
            dispose()
            container.remove()
        }),
    }
}

interface BoxProps extends Record<string, unknown> {
    probe: { timeline?: RefMount['timeline'] }
    node: PoseNode
    reducedMotion: ReducedMotionPolicy | undefined
}

function Box(props: BoxProps) {
    const timeline = createTimeline(() =>
        a.rafTimeline(
            props.node,
            props.reducedMotion ? { reducedMotion: props.reducedMotion } : {}
        )
    )
    const { ref, style } = createAniRef(timeline, { initialValue: INITIAL })
    props.probe.timeline = timeline
    const element = document.createElement('div')
    element.id = 'box'
    applyStyle(element, style())
    ref(element)
    return element
}

interface GroupProps extends Record<string, unknown> {
    probe: { group?: GroupMount['group'] }
    node: PoseNode
    count: number
}

function Group(props: GroupProps) {
    const group = createTimeline(() => a.rafGroup(props.node))
    const { ref, style } = createAniGroup(group, { initialValue: INITIAL })
    props.probe.group = group
    const list = document.createElement('div')
    list.id = 'group'
    for (let index = 0; index < props.count; index++) {
        const element = document.createElement('div')
        applyStyle(element, style())
        ref(index)(element)
        list.append(element)
    }
    return list
}

interface StatesProps extends Record<string, unknown> {
    probe: { transitionTo?: StatesMount['transitionTo'] }
}

function States(props: StatesProps) {
    const { ref, style, state, transitionTo } = createAniStates(statesConfig())
    props.probe.transitionTo = transitionTo
    const element = document.createElement('div')
    element.id = 'states'
    applyStyle(element, style())
    ref(element)
    const text = document.createElement('span')
    text.id = 'state'
    insert(text, state)
    element.append(text)
    return element
}

interface FollowProps extends Record<string, unknown> {
    probe: { follower?: FollowMount['follower'] }
}

function Follow(props: FollowProps) {
    const { ref, style, follower } = createFollow({ translateX: 0 })
    props.probe.follower = follower
    const element = document.createElement('div')
    element.id = 'follow'
    applyStyle(element, style())
    ref(element)
    return element
}

function find(container: HTMLElement, selector: string): HTMLElement {
    const element = container.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`${selector} was not rendered`)
    return element
}

const driver: Driver = {
    mountRef({ node, reducedMotion }) {
        const probe: BoxProps['probe'] = {}
        const { container, unmount } = mountComponent(Box, {
            probe,
            node,
            reducedMotion,
        })
        if (!probe.timeline) throw new Error('Box did not create a timeline')
        return {
            element: find(container, '#box'),
            timeline: probe.timeline,
            unmount,
        }
    },
    mountGroup({ node, count }) {
        const probe: GroupProps['probe'] = {}
        const { container, unmount } = mountComponent(Group, {
            probe,
            node,
            count,
        })
        if (!probe.group) throw new Error('Group did not create a group')
        return {
            elements: Array.from(find(container, '#group').children).filter(
                (child): child is HTMLElement => child instanceof HTMLElement
            ),
            group: probe.group,
            unmount,
        }
    },
    mountStates() {
        const probe: StatesProps['probe'] = {}
        const { container, unmount } = mountComponent(States, { probe })
        const text = find(container, '#state')
        if (!probe.transitionTo) throw new Error('States did not mount')
        return {
            element: find(container, '#states'),
            stateText: () => text.textContent ?? '',
            transitionTo: probe.transitionTo,
            unmount,
        }
    },
    mountFollow() {
        const probe: FollowProps['probe'] = {}
        const { container, unmount } = mountComponent(Follow, { probe })
        if (!probe.follower) throw new Error('Follow did not mount')
        return {
            element: find(container, '#follow'),
            follower: probe.follower,
            unmount,
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
