import type { Groupable, GroupableRecord } from '~/ani/core'

import {
    type AnimationNode,
    assertNoExtraArguments,
    type NodeOptions,
    parseNodeOptions,
} from './base'
import {
    type CompositionChildren,
    CompositionNode,
    type CompositionPlan,
} from './composition'
import {
    assertNoEndlessOverlap,
    type Footprint,
    mergeFootprints,
} from './footprint'
import { SegmentNode } from './segment'

const PARALLEL_FORM = '`parallel(children, { timing, id })`'

/**
 * Composition node that runs all of its children at the same time.
 */
export class ParallelNode<
    const Children extends CompositionChildren,
> extends CompositionNode<Children> {
    readonly type = 'PARALLEL'
    readonly duration: number
    readonly footprint: Footprint

    constructor(children: Children, options?: NodeOptions) {
        const { timing: resolvedTiming, id: resolvedId } = parseNodeOptions(
            options,
            'parallel',
            PARALLEL_FORM
        )
        // Record-shaped direct segments: when several write the same key the
        // later declaration wins (all start together). Overridden keys are
        // stripped from earlier segments. A segment that ends up with no key
        // stays as a key-less hold so that it keeps contributing its duration
        // (and its slot in `keyframes` / `durations` overrides), exactly like
        // `delay()`. Array / nested shapes are resolved by the timeline's
        // overlap rule instead.
        const seenProperty = new Set<string>()
        const resolvedChildren: AnimationNode<Groupable>[] = []

        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i]!
            if (child instanceof SegmentNode) {
                const segment = child as SegmentNode<Groupable>
                const propsTo = segment.props.to

                // record shape
                if (propsTo && !Array.isArray(propsTo)) {
                    const propsToAnimate = Object.keys(propsTo)
                    if (propsToAnimate.length > 0) {
                        const finalConstructedTo: Record<string, number> = {}
                        let handledCount = 0

                        for (const propKey of propsToAnimate) {
                            if (!seenProperty.has(propKey)) {
                                finalConstructedTo[propKey] = (
                                    propsTo as Record<string, number>
                                )[propKey]!
                                seenProperty.add(propKey)
                                handledCount++
                            }
                        }

                        if (handledCount === propsToAnimate.length) {
                            // nothing overridden
                            resolvedChildren.push(child)
                        } else if (handledCount > 0) {
                            resolvedChildren.push(
                                new SegmentNode<Groupable>(
                                    {
                                        ...segment.props,
                                        to: finalConstructedTo as GroupableRecord,
                                    },
                                    segment.id
                                )
                            )
                        } else {
                            resolvedChildren.push(
                                new SegmentNode<Groupable>(
                                    {
                                        to: {} as GroupableRecord,
                                        duration: segment.duration,
                                    },
                                    segment.id
                                )
                            )
                        }
                        continue
                    }
                }
            }

            // Non-conflicts
            resolvedChildren.push(child)
        }

        resolvedChildren.reverse()

        super(
            resolvedChildren as unknown as Children,
            resolvedTiming,
            resolvedId
        )

        // Plain loop: spreading into Math.max overflows the stack for large
        // child counts.
        let duration = 0
        for (const child of children) {
            if (child.duration > duration) duration = child.duration
        }
        this.duration = duration

        const placed = this.children.map((child) => ({
            footprint: child.footprint,
            offset: 0,
        }))
        assertNoEndlessOverlap('parallel', placed)
        this.footprint = mergeFootprints(placed)
    }

    public construct(plan: CompositionPlan<Children>, startTime: number): void {
        for (const child of this.children) {
            child.construct(plan, startTime)
        }
    }
}

/**
 * Parallel composition animation
 * @param children Parallel children nodes.
 * @param options `{ timing, id }`: timing inherited by children without their own, optional node ID.
 */
export function parallel<const Children extends CompositionChildren>(
    children: Children,
    options?: NodeOptions
): ParallelNode<Children>
export function parallel<const Children extends CompositionChildren>(
    children: Children,
    options?: NodeOptions,
    ...extra: unknown[]
): ParallelNode<Children> {
    assertNoExtraArguments('parallel', PARALLEL_FORM, extra)
    return new ParallelNode(children, options)
}
