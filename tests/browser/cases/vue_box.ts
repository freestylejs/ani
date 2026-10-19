import type { RafTimeline, ReducedMotionPolicy } from '@freestylejs/ani-core'
import * as a from '@freestylejs/ani-core'
import { useAniRef, useTimeline } from '@freestylejs/ani-vue'
import { defineComponent, h, onMounted, type PropType } from 'vue'
import { INITIAL, type Pose, type PoseNode, pose } from './fixtures.ts'

/** What the page reads back from the component. */
export interface BoxProbe {
    timeline?: RafTimeline<Pose>
    mounted?: boolean
}

/**
 * B1's component: owns a timeline and binds a `div` to it. Also rendered to a
 * string in Node (B7), so it must render the same on both sides.
 */
export const Box = defineComponent({
    props: {
        probe: Object as PropType<BoxProbe>,
        node: Object as PropType<PoseNode>,
        reducedMotion: [String, Object] as PropType<ReducedMotionPolicy>,
    },
    setup(props) {
        const timeline = useTimeline(() =>
            a.rafTimeline(
                props.node ?? pose(),
                props.reducedMotion
                    ? { reducedMotion: props.reducedMotion }
                    : {}
            )
        )
        const { ref, style } = useAniRef(timeline, { initialValue: INITIAL })
        if (props.probe) props.probe.timeline = timeline
        onMounted(() => {
            if (props.probe) props.probe.mounted = true
        })
        return () => h('div', { ref, style: style.value, id: 'box' })
    },
})
