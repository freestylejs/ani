import {
    type LayoutGroup as CoreLayoutGroup,
    createLayoutGroup,
    type LayoutGroupOptions,
    type LayoutSnapshot,
} from '@freestylejs/ani-layout'
import { Component, createElement, type ReactNode, useContext } from 'react'
import {
    createLayoutFacade,
    LayoutConfigContext,
    type LayoutConfigValue,
    LayoutContext,
    type LayoutFacade,
} from './context'

export interface LayoutGroupProps extends LayoutGroupOptions {
    children?: ReactNode
    /** Absent: every boundary update opens a transaction. */
    deps?: readonly unknown[]
}

function changed(
    previous: readonly unknown[] | undefined,
    next: readonly unknown[] | undefined
): boolean {
    if (!previous || !next || previous.length !== next.length) return true
    for (let i = 0; i < previous.length; i++) {
        if (!Object.is(previous[i], next[i])) return true
    }
    return false
}

interface BoundaryProps extends LayoutGroupProps {
    readonly outer: LayoutFacade | null
    readonly config: LayoutConfigValue
}

class LayoutBoundary extends Component<BoundaryProps> {
    private readonly facade: LayoutFacade

    constructor(props: BoundaryProps) {
        super(props)
        this.facade = props.outer ?? createLayoutFacade()
    }

    override componentDidMount(): void {
        if (this.props.outer) return
        const motion = this.props.motion ?? this.props.config.motion
        const reducedMotion =
            this.props.reducedMotion ?? this.props.config.reducedMotion
        const options: LayoutGroupOptions = {
            ...(motion !== undefined && { motion }),
            ...(this.props.clock !== undefined && {
                clock: this.props.clock,
            }),
            ...(reducedMotion !== undefined && { reducedMotion }),
            ...(this.props.threshold !== undefined && {
                threshold: this.props.threshold,
            }),
            ...(this.props.maxAnimated !== undefined && {
                maxAnimated: this.props.maxAnimated,
            }),
            ...(this.props.maxBoxes !== undefined && {
                maxBoxes: this.props.maxBoxes,
            }),
            ...(this.props.onError !== undefined && {
                onError: this.props.onError,
            }),
        }
        const group: CoreLayoutGroup = createLayoutGroup(options)
        this.facade.attach(group)
    }

    override componentWillUnmount(): void {
        if (!this.props.outer) this.facade.dispose()
    }

    override getSnapshotBeforeUpdate(
        previous: BoundaryProps
    ): LayoutSnapshot | null {
        if (!this.facade.group) return null
        if (!changed(previous.deps, this.props.deps)) return null
        return this.facade.capture()
    }

    override componentDidUpdate(
        _previous: BoundaryProps,
        _state: unknown,
        snapshot: LayoutSnapshot | null
    ): void {
        if (!snapshot || !this.facade.group) return
        void this.facade
            .play(snapshot, this.props.motion ?? this.props.config.motion)
            ?.catch((error: unknown) => this.props.onError?.(error))
    }

    override render(): ReactNode {
        return createElement(
            LayoutContext.Provider,
            { value: this.facade },
            this.props.children
        )
    }
}

/**
 * DOM-less layout boundary. The outermost group owns the transaction and the
 * core layout group; nested groups join the outer group and act as boundaries.
 */
export interface LayoutConfigProps extends LayoutConfigValue {
    children?: ReactNode
}

/** Defaults inherited by descendant LayoutGroups. */
export function LayoutConfig(props: LayoutConfigProps): ReactNode {
    const parent = useContext(LayoutConfigContext)
    const value: LayoutConfigValue = {
        ...parent,
        ...(props.motion !== undefined && { motion: props.motion }),
        ...(props.reducedMotion !== undefined && {
            reducedMotion: props.reducedMotion,
        }),
    }
    return createElement(
        LayoutConfigContext.Provider,
        { value },
        props.children
    )
}

export function LayoutGroup(props: LayoutGroupProps): ReactNode {
    const outer = useContext(LayoutContext)
    const config = useContext(LayoutConfigContext)
    return createElement(LayoutBoundary, { ...props, outer, config })
}
