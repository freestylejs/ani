import { DEV } from '@freestylejs/ani-core'
import type { LayoutGroupOptions } from '@freestylejs/ani-layout'
import {
    createElement,
    type ReactNode,
    useContext,
    useMemo,
    useRef,
} from 'react'

import { useIsoLayoutEffect } from '../ani/owned'
import {
    createLayoutScope,
    hasDOM,
    LayoutContext,
    type LayoutContextValue,
    type LayoutScope,
    mergeMotion,
    sameValue,
} from './context'

/** Every option may also be passed as `undefined` (the default), as React props are. */
type LayoutGroupOptionProps = {
    readonly [K in Exclude<keyof LayoutGroupOptions, 'engine'>]?:
        | LayoutGroupOptions[K]
        | undefined
}

export type LayoutGroupProps = LayoutGroupOptionProps & {
    /**
     * Default: `'raf'`.
     *
     * `'waapi'` runs flat compositor `translate` animations. Every
     * participant must set `layout: 'position'` and must not set
     * `layoutAnchor`, `layoutId` or `radius: true`; nesting throws from
     * `add` / `set`, while nesting introduced later snaps as
     * `'unsupported'`; without CSS `linear()` easing, moves snap as
     * `'unsupported'`.
     *
     * Unlike `'raf'`, a retarget carries no velocity; tracks use the document
     * timeline, so the Ani clock's time scale does not apply (reduced motion
     * still does); a jank retarget can step back by missed compositor frames;
     * no inline style is written.
     */
    readonly engine?: LayoutGroupOptions['engine'] | undefined
    /** Namespaces the `layoutId`s of this group's participants. */
    readonly id?: string | undefined
    readonly children?: ReactNode
}

/** Read from the outermost group only; a change re-creates the scope. */
const SCOPE_OPTIONS = [
    'clock',
    'reducedMotion',
    'threshold',
    'maxNodes',
    'retain',
    'onSnap',
    'engine',
] as const

interface Owned {
    readonly scope: LayoutScope
    /** The scope options it was created with (`onSnap` excluded). */
    key: readonly unknown[]
    disposing: boolean
}

/**
 * DOM-less layout scope. The outermost group owns the scope; nested groups
 * join it, namespace `layoutId`s with `id` and supply `motion` defaults.
 * Rendering the group captures; its commit flushes.
 */
export function LayoutGroup(props: LayoutGroupProps): ReactNode {
    const parent = useContext(LayoutContext)
    const onSnap = useRef(props.onSnap)
    onSnap.current = props.onSnap
    const owned = useRef<Owned | null>(null)
    const key = [
        props.clock,
        props.reducedMotion,
        props.threshold,
        props.maxNodes,
        props.retain,
        props.engine,
    ]

    const options = (): LayoutGroupOptions => ({
        ...(props.clock !== undefined && { clock: props.clock }),
        ...(props.reducedMotion !== undefined && {
            reducedMotion: props.reducedMotion,
        }),
        ...(props.threshold !== undefined && { threshold: props.threshold }),
        ...(props.maxNodes !== undefined && { maxNodes: props.maxNodes }),
        ...(props.retain !== undefined && { retain: props.retain }),
        ...(props.engine !== undefined && { engine: props.engine }),
        onSnap: (element, reason) => onSnap.current?.(element, reason),
    })

    if (!parent && !owned.current) {
        owned.current = {
            scope: createLayoutScope(options()),
            key,
            disposing: false,
        }
    }
    const scope = parent ? parent.scope : owned.current!.scope

    // render: the before-boxes (§4.1)
    if (hasDOM()) scope.touch()

    if (
        DEV &&
        parent &&
        SCOPE_OPTIONS.some((name) => props[name] !== undefined)
    ) {
        warnNested()
    }

    useIsoLayoutEffect(() => {
        const current = owned.current
        if (parent || !current) return
        // by value: an inline `reducedMotion={{ maxDuration }}` is a new
        // object every render and must not dispose a running scope
        if (!key.every((value, i) => sameValue(value, current.key[i]))) {
            current.key = key
            current.scope.recreate(options())
        }
    })

    useIsoLayoutEffect(() => {
        scope.commit()
    })

    // the outermost group disposes its scope; a StrictMode re-run keeps it
    useIsoLayoutEffect(() => {
        const current = owned.current
        if (parent || !current) return
        current.disposing = false
        return () => {
            current.disposing = true
            queueMicrotask(() => {
                if (current.disposing) current.scope.dispose()
            })
        }
    }, [parent])

    const namespace =
        props.id === undefined
            ? parent?.namespace
            : parent?.namespace === undefined
              ? props.id
              : `${parent.namespace}/${props.id}`
    const motion = mergeMotion(parent?.motion, props.motion)
    const value = useMemo<LayoutContextValue>(
        () => ({ scope, namespace, motion }),
        // `motion` by value: an inline object is new every render
        [scope, namespace, motion?.duration, motion?.delay, motion?.timing]
    )
    return createElement(LayoutContext.Provider, { value }, props.children)
}

let nestedWarned = false

function warnNested(): void {
    if (nestedWarned) return
    nestedWarned = true
    // biome-ignore lint/suspicious/noConsole: development warning
    console.warn(
        `[ani-react/layout] A nested LayoutGroup joins its outermost group's scope: ${SCOPE_OPTIONS.join(', ')} are read from the outermost group only. Set them there.`
    )
}
