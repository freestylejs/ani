// Public, type-only names of the node classes: the classes themselves are not
// exported from the package (build nodes with `ani`, `sequence`, ...).
import type { Groupable } from '~/ani/core'
import type { AnimationNode as AnimationNodeClass } from './base'
import type {
    CompositionChildren,
    CompositionNode as CompositionNodeClass,
} from './composition'
import type { LoopNode as LoopNodeClass } from './loop'
import type { ParallelNode as ParallelNodeClass } from './parallel'
import type { SegmentNode as SegmentNodeClass } from './segment'
import type { SequenceNode as SequenceNodeClass } from './sequence'
import type { StaggerNode as StaggerNodeClass } from './stagger'

/** A node of an animation tree. */
export type AnimationNode<G extends Groupable> = AnimationNodeClass<G>

/** A node that composes child nodes. */
export type CompositionNode<Children extends CompositionChildren> =
    CompositionNodeClass<Children>

/** A leaf node, made by `ani` / `delay`. */
export type SegmentNode<G extends Groupable> = SegmentNodeClass<G>

/** Made by `sequence`. */
export type SequenceNode<Children extends CompositionChildren> =
    SequenceNodeClass<Children>

/** Made by `parallel`. */
export type ParallelNode<Children extends CompositionChildren> =
    ParallelNodeClass<Children>

/** Made by `stagger`. */
export type StaggerNode<Children extends CompositionChildren> =
    StaggerNodeClass<Children>

/** Made by `loop`. */
export type LoopNode<G extends Groupable> = LoopNodeClass<G>
