import {
    a,
    type RafTimeline,
    type ReducedMotionPolicy,
} from '@freestylejs/ani-core'
import { useAniRef, useTimeline } from '@freestylejs/ani-react'
import { createElement, useEffect } from 'react'
import { INITIAL, type Pose, type PoseNode, pose } from './fixtures.ts'

/** What the page reads back from the component. */
export interface BoxProbe {
    timeline?: RafTimeline<Pose>
    mounted?: boolean
}

export interface BoxProps {
    probe?: BoxProbe
    node?: PoseNode
    reducedMotion?: ReducedMotionPolicy
}

/**
 * B1's component: owns a timeline and binds a `div` to it. Also rendered to a
 * string in Node (B7), so it must render the same on both sides.
 */
export function Box(props: BoxProps) {
    const timeline = useTimeline(() =>
        a.rafTimeline(
            props.node ?? pose(),
            props.reducedMotion ? { reducedMotion: props.reducedMotion } : {}
        )
    )
    const { ref, style } = useAniRef(timeline, { initialValue: INITIAL })
    if (props.probe) props.probe.timeline = timeline
    useEffect(() => {
        if (props.probe) props.probe.mounted = true
    }, [props.probe])
    return createElement('div', { ref, style, id: 'box' })
}
