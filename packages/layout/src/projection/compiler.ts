import type { PlanBox } from './plan'

export interface ParentProjection {
    readonly after: PlanBox
    readonly dx: number
    readonly dy: number
    readonly sx: number
    readonly sy: number
    readonly mode: 'position' | 'box' | 'size' | 'preserve-aspect'
}

export interface ChildProjectionInput {
    readonly before: PlanBox
    readonly after: PlanBox
    readonly mode: 'position' | 'box' | 'size' | 'preserve-aspect'
}

export interface ChildProjection {
    readonly dx: number
    readonly dy: number
    readonly sx: number
    readonly sy: number
}

/**
 * Bounded depth-1 projection. The child starts from the local origin that,
 * after the parent's start transform, reproduces its captured visual box.
 * Scale is counter-corrected only for box-like children; position children
 * translate but intentionally do not scale.
 */
export function compileChildProjection(
    parent: ParentProjection,
    child: ChildProjectionInput
): ChildProjection | null {
    const parentScaleX = parent.mode === 'box' ? parent.sx : 1
    const parentScaleY = parent.mode === 'box' ? parent.sy : 1
    if (parentScaleX <= 0 || parentScaleY <= 0) return null
    const localBeforeX =
        parent.after.x +
        (child.before.x - parent.after.x - parent.dx) / parentScaleX
    const localBeforeY =
        parent.after.y +
        (child.before.y - parent.after.y - parent.dy) / parentScaleY
    return {
        dx: localBeforeX - child.after.x,
        dy: localBeforeY - child.after.y,
        sx:
            child.mode === 'position'
                ? 1
                : child.before.width / parentScaleX / child.after.width,
        sy:
            child.mode === 'position'
                ? 1
                : child.before.height / parentScaleY / child.after.height,
    }
}

/** Normalized anchor -> local px origin. Invalid values are clamped to [0,1]. */
export function anchorOrigin(
    anchor: { x: number; y: number },
    width: number,
    height: number
): { x: number; y: number } {
    return {
        x: Math.min(1, Math.max(0, anchor.x)) * width,
        y: Math.min(1, Math.max(0, anchor.y)) * height,
    }
}
