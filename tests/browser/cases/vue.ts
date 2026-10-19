import * as a from '@freestylejs/ani-core'
import {
    useAniGroup,
    useAniStates,
    useFollow,
    useTimeline,
} from '@freestylejs/ani-vue'
import {
    type Component,
    createApp,
    createSSRApp,
    defineComponent,
    h,
    type PropType,
} from 'vue'
import { createContainer, expectEqual, frames, waitFor } from './assert.ts'
import {
    type Driver,
    type FollowMount,
    INITIAL,
    once,
    type Pose,
    type PoseNode,
    type StatesMount,
    statesConfig,
} from './fixtures.ts'
import * as shared from './shared.ts'
import { Box, type BoxProbe } from './vue_box.ts'

function mountComponent(
    component: Component,
    props: Record<string, unknown>
): { container: HTMLElement; unmount(): void } {
    const container = createContainer()
    const app = createApp(component, props)
    app.mount(container)
    return {
        container,
        unmount: once(() => {
            app.unmount()
            container.remove()
        }),
    }
}

interface GroupProbe {
    group?: ReturnType<typeof a.rafGroup<Pose>>
}

const Group = defineComponent({
    props: {
        probe: { type: Object as PropType<GroupProbe>, required: true },
        node: { type: Object as PropType<PoseNode>, required: true },
        count: { type: Number, required: true },
    },
    setup(props) {
        const group = useTimeline(() => a.rafGroup(props.node))
        const { ref, style } = useAniGroup(group, { initialValue: INITIAL })
        props.probe.group = group
        return () =>
            h(
                'div',
                { id: 'group' },
                Array.from({ length: props.count }, (_, index) =>
                    h('div', {
                        key: index,
                        ref: ref(index),
                        style: style.value,
                    })
                )
            )
    },
})

interface StatesProbe {
    transitionTo?: StatesMount['transitionTo']
}

const States = defineComponent({
    props: { probe: { type: Object as PropType<StatesProbe>, required: true } },
    setup(props) {
        const { ref, style, state, transitionTo } = useAniStates(statesConfig())
        props.probe.transitionTo = transitionTo
        return () =>
            h('div', { ref, style: style.value, id: 'states' }, [
                h('span', { id: 'state' }, String(state.value)),
            ])
    },
})

interface FollowProbe {
    follower?: FollowMount['follower']
}

const Follow = defineComponent({
    props: { probe: { type: Object as PropType<FollowProbe>, required: true } },
    setup(props) {
        const { ref, style, follower } = useFollow({ translateX: 0 })
        props.probe.follower = follower
        return () => h('div', { ref, style: style.value, id: 'follow' })
    },
})

function find(container: HTMLElement, selector: string): HTMLElement {
    const element = container.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`${selector} was not rendered`)
    return element
}

const driver: Driver = {
    mountRef({ node, reducedMotion }) {
        const probe: BoxProbe = {}
        const { container, unmount } = mountComponent(Box, {
            probe,
            node,
            ...(reducedMotion ? { reducedMotion } : {}),
        })
        if (!probe.timeline) throw new Error('Box did not create a timeline')
        return {
            element: find(container, '#box'),
            timeline: probe.timeline,
            unmount,
        }
    },
    mountGroup({ node, count }) {
        const probe: GroupProbe = {}
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
        const probe: StatesProbe = {}
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
        const probe: FollowProbe = {}
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
    const app = createSSRApp(Box, { probe })
    app.mount(container)
    try {
        await waitFor(() => probe.mounted === true, 2000, 'hydration mounted')
        await frames(3)
        expectEqual(container.firstElementChild === element, true, 'DOM reused')
        expectEqual(element.getAttribute('style'), before, 'inline style')
    } finally {
        app.unmount()
    }
}
