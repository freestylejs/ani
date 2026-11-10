import * as a from '@freestylejs/ani-core'
import { createManualClock } from '@freestylejs/ani-core/testing'
import {
    useAniGroup,
    useAniStates,
    useFollow,
    useTimeline,
} from '@freestylejs/ani-react'
import {
    createElement,
    type ReactElement,
    StrictMode,
    Suspense,
    startTransition,
    useLayoutEffect,
} from 'react'
import { flushSync } from 'react-dom'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { createContainer, expectEqual, frames, waitFor } from './assert.ts'
import {
    type Driver,
    type FollowMount,
    type GroupMount,
    INITIAL,
    once,
    type PoseNode,
    type StatesMount,
    statesConfig,
} from './fixtures.ts'
import { Box, type BoxProbe } from './react_box.ts'
import * as shared from './shared.ts'

/** A discarded render must not publish an owner into the committed tree. */
export async function OwnerAbortedRender(): Promise<string> {
    const container = createContainer()
    const root = createRoot(container)
    const mc = createManualClock()
    const node = a.ani({
        to: { x: 100 },
        duration: 1,
        timing: a.timing.linear(),
    })
    type Timeline = ReturnType<typeof a.rafTimeline<{ x: number }>>
    let committed: Timeline | null = null
    let suspended = 0
    const never = new Promise<void>(() => undefined)
    const created: Array<{
        dep: number
        value: Timeline
        commits: number
        disposals: number
    }> = []
    function Owner({ dep, stall }: { dep: number; stall: boolean }) {
        const timeline = useTimeline(() => {
            const value = a.rafTimeline(node, { clock: mc.clock })
            const entry = { dep, value, commits: 0, disposals: 0 }
            const dispose = value.dispose.bind(value)
            value.dispose = () => {
                entry.disposals++
                dispose()
            }
            created.push(entry)
            return value
        }, [dep])
        useLayoutEffect(() => {
            committed = timeline
            created.find((entry) => entry.value === timeline)!.commits++
        }, [timeline])
        if (stall) {
            suspended++
            throw never
        }
        return createElement('div', null, String(dep))
    }
    const render = (dep: number, stall: boolean, strict = false) => {
        const tree = createElement(
            Suspense,
            { fallback: 'waiting' },
            createElement(Owner, { dep, stall })
        )
        root.render(strict ? createElement(StrictMode, null, tree) : tree)
    }
    const current = (): Timeline => {
        if (!committed) throw new Error('No committed owner')
        return committed
    }
    try {
        flushSync(() => render(0, false))
        const original = current()
        void original.play({ from: { x: 0 } })
        mc.frames(11, 16)
        const before = original.value!.x
        startTransition(() => render(1, true))
        await waitFor(() => suspended > 0, 2000, 'speculative factory ran')
        flushSync(() => render(0, false))
        if (current() !== original)
            throw new Error(
                'Abandoned render replaced the committed active owner'
            )
        expectEqual(
            current().status,
            'PLAYING',
            'aborted update kept execution'
        )
        expectEqual(current().value!.x, before)
        mc.frames(5, 16)
        if (!(current().value!.x > before))
            throw new Error('Committed timeline did not continue')
        expectEqual(
            created.find((entry) => entry.value === original)!.disposals,
            0
        )
        flushSync(() => render(2, false))
        if (current() === original)
            throw new Error('Committed dependency change did not replace owner')
        expectEqual(
            created.find((entry) => entry.value === original)!.disposals,
            1
        )
        // Exercise StrictMode re-activation and ordinary committed replacement.
        flushSync(() => render(3, false, true))
        await waitFor(
            () => {
                const entry = created.find(
                    (candidate) => candidate.value === current()
                )
                return entry?.dep === 3 && entry.disposals === 0
            },
            2000,
            'StrictMode owner reconnected'
        )
        void current().play({ from: { x: 0 } })
        mc.frames(4, 16)
        expectEqual(
            current().status,
            'PLAYING',
            'StrictMode live instance executes'
        )
        flushSync(() => root.unmount())
        expectEqual(mc.clock.size, 0)
        for (const entry of created) {
            if (entry.commits > 0 && entry.disposals !== 1)
                throw new Error(
                    `Committed owner disposed ${entry.disposals} times`
                )
            // Discarded pure constructors never acquire a clock subscription.
            if (entry.commits === 0 && entry.value.status !== 'IDLE')
                throw new Error('Speculative owner acquired execution')
        }
        return 'Aborted dependency render preserves active owner/progress; committed replacement and StrictMode dispose once; discarded constructors stay inert'
    } finally {
        flushSync(() => root.unmount())
        container.remove()
        mc.clock.dispose()
    }
}

function mountComponent(element: ReactElement): {
    container: HTMLElement
    unmount(): void
} {
    const container = createContainer()
    const root = createRoot(container)
    flushSync(() => root.render(element))
    return {
        container,
        unmount: once(() => {
            flushSync(() => root.unmount())
            container.remove()
        }),
    }
}

interface GroupProbe {
    group?: GroupMount['group']
}

function Group(props: { probe: GroupProbe; node: PoseNode; count: number }) {
    const group = useTimeline(() => a.rafGroup(props.node))
    const { ref, style } = useAniGroup(group, { initialValue: INITIAL })
    props.probe.group = group
    return createElement(
        'div',
        { id: 'group' },
        Array.from({ length: props.count }, (_, index) =>
            createElement('div', { key: index, style, ref: ref(index) })
        )
    )
}

interface StatesProbe {
    transitionTo?: StatesMount['transitionTo']
}

function States(props: { probe: StatesProbe }) {
    const { ref, style, state, transitionTo } = useAniStates(statesConfig())
    props.probe.transitionTo = transitionTo
    return createElement(
        'div',
        { ref, style, id: 'states' },
        createElement('span', { id: 'state' }, state)
    )
}

interface FollowProbe {
    follower?: FollowMount['follower']
}

function Follow(props: { probe: FollowProbe }) {
    const { ref, style, follower } = useFollow({ translateX: 0 })
    props.probe.follower = follower
    return createElement('div', { ref, style, id: 'follow' })
}

function find(container: HTMLElement, selector: string): HTMLElement {
    const element = container.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`${selector} was not rendered`)
    return element
}

const driver: Driver = {
    mountRef({ node, reducedMotion }) {
        const probe: BoxProbe = {}
        const { container, unmount } = mountComponent(
            createElement(Box, {
                probe,
                node,
                ...(reducedMotion ? { reducedMotion } : {}),
            })
        )
        if (!probe.timeline) throw new Error('Box did not create a timeline')
        return {
            element: find(container, '#box'),
            timeline: probe.timeline,
            unmount,
        }
    },
    mountGroup({ node, count }) {
        const probe: GroupProbe = {}
        const { container, unmount } = mountComponent(
            createElement(Group, { probe, node, count })
        )
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
        const probe: StatesProbe = {}
        const { container, unmount } = mountComponent(
            createElement(States, { probe })
        )
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
        const probe: FollowProbe = {}
        const { container, unmount } = mountComponent(
            createElement(Follow, { probe })
        )
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
    B7: { ssr: true },
}

export const knownFailures: Record<string, string> = {}

export const B1 = () => shared.ref(driver)
export const B2 = () => shared.group(driver)
export const B3 = () => shared.unmount(driver)
export const B4 = () => shared.states(driver)
export const B5 = () => shared.follow(driver)
export const B6 = () => shared.reducedMotion(driver)

/** B7: hydrating the server-rendered B1 component keeps its inline style. */
export async function B7(): Promise<void> {
    const container = document.getElementById('root')
    const element = container?.firstElementChild
    if (!container || !(element instanceof HTMLElement)) {
        throw new Error('the page has no server-rendered markup')
    }
    const before = element.getAttribute('style')
    expectEqual(before === null, false, 'server markup has an inline style')

    const probe: BoxProbe = {}
    const root = hydrateRoot(container, createElement(Box, { probe }))
    try {
        await waitFor(() => probe.mounted === true, 2000, 'hydration commit')
        await frames(3)
        expectEqual(container.firstElementChild === element, true, 'DOM reused')
        expectEqual(element.getAttribute('style'), before, 'inline style')
    } finally {
        flushSync(() => root.unmount())
    }
}
