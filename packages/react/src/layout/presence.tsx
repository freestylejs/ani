import { createStyleSheet, type GroupableRecord } from '@freestylejs/ani-core'
import {
    createPresence,
    type PresenceEntry,
    type PresenceHandle,
    type PresenceKey,
    type PresenceMotion,
    type PresenceOptions,
    reconcilePresence,
    settlePresence,
} from '@freestylejs/ani-layout'
import {
    type CSSProperties,
    Fragment,
    isValidElement,
    type ReactElement,
    type ReactNode,
    type RefCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { useIsoLayoutEffect } from '../ani/owned'
import {
    existingScopes,
    hasDOM,
    LayoutContext,
    PresenceContext,
    type PresenceContextValue,
} from './context'

export interface AnimatePresenceProps {
    children?: ReactNode
    /** Default false: first-render children do not enter. */
    initial?: boolean
    mode?: 'sync' | 'popLayout' | 'wait'
    onExitComplete?: (key: string) => void
    /**
     * Value exposed to presence children via `usePresence().custom`.
     * This is data, not an exit-variant resolver.
     */
    custom?: unknown
}

function keyOf(child: ReactElement, index: number): string {
    return child.key === null ? String(index) : String(child.key)
}

function childrenEntries(
    children: ReactNode
): Array<readonly [PresenceKey, ReactNode]> {
    const result: Array<readonly [PresenceKey, ReactNode]> = []
    const visit = (node: ReactNode): void => {
        if (Array.isArray(node)) {
            for (const child of node) visit(child)
            return
        }
        if (!isValidElement(node)) return
        if (node.type === Fragment) {
            visit(
                (node as ReactElement<{ children?: ReactNode }>).props.children
            )
            return
        }
        result.push([keyOf(node, result.length), node])
    }
    visit(children)
    return result
}

/**
 * DOM-less presence boundary. It retains the last child for each key while it
 * exits; it never clones a child or creates a wrapper element.
 */
export function AnimatePresence(props: AnimatePresenceProps): ReactNode {
    const layout = useContext(LayoutContext)
    /** The documents its children's elements registered from. */
    const documents = useRef(new Set<Document>())
    // render: the before-boxes of the scopes its children live in (§4.1),
    // also in a render that only settles an exit and renders no participant
    const touched = existingScopes(layout, documents.current)
    for (const scope of touched) scope.touch()
    const touchedRef = useRef(touched)
    touchedRef.current = touched
    useIsoLayoutEffect(() => {
        for (const scope of touchedRef.current) scope.commit()
    })
    const [entries, setEntries] = useState<readonly PresenceEntry<ReactNode>[]>(
        []
    )
    const entriesRef = useRef(entries)
    const childMap = useRef(new Map<PresenceKey, ReactNode>())
    const registrants = useRef(new Map<PresenceKey, Set<number>>())
    const completed = useRef(
        new Map<PresenceKey, { token: number; ids: Set<number> }>()
    )
    const nextRegistrant = useRef(0)
    const willEnter = useRef(new Map<PresenceKey, boolean>())
    const initialRender = useRef(true)
    const committedKeys = useRef(new Set<PresenceKey>())
    const onExitComplete = useRef(props.onExitComplete)
    onExitComplete.current = props.onExitComplete

    const rawPairs = childrenEntries(props.children)
    const willExit =
        props.mode === 'wait' &&
        entries.some(
            (entry) =>
                entry.present && !rawPairs.some(([key]) => key === entry.key)
        )
    const pairs = willExit
        ? rawPairs.filter(([key]) => entries.some((entry) => entry.key === key))
        : rawPairs
    for (const [key, child] of pairs) childMap.current.set(key, child)
    const previousPresent = new Map(
        entries.map((entry) => [entry.key, entry.present] as const)
    )
    const nextEntries = reconcilePresence(entries, pairs)
    for (const [key] of pairs) {
        if (!willEnter.current.has(key)) {
            willEnter.current.set(
                key,
                !initialRender.current || props.initial === true
            )
        } else if (previousPresent.get(key) === false) {
            willEnter.current.set(key, true)
            completed.current.delete(key)
        }
    }
    if (nextEntries !== entries) setEntries(nextEntries)
    entriesRef.current = nextEntries
    const waiting =
        props.mode === 'wait' && nextEntries.some((entry) => !entry.present)
    const visibleEntries = waiting
        ? nextEntries.filter((entry) => committedKeys.current.has(entry.key))
        : nextEntries

    useEffect(() => {
        initialRender.current = false
    }, [])

    useEffect(() => {
        if (!waiting) {
            committedKeys.current = new Set(
                nextEntries
                    .filter((entry) => entry.present)
                    .map((entry) => entry.key)
            )
        }
    }, [nextEntries, waiting])

    const settle = useMemo(
        () => (key: PresenceKey, token: number) => {
            const next = settlePresence(entriesRef.current, key, token)
            if (next === entriesRef.current) return
            entriesRef.current = next
            childMap.current.delete(key)
            willEnter.current.delete(key)
            completed.current.delete(key)
            setEntries(next)
            onExitComplete.current?.(String(key))
        },
        []
    )

    const maybeSettle = useMemo(
        () => (key: PresenceKey) => {
            const entry = entriesRef.current.find(
                (candidate) => candidate.key === key
            )
            if (!entry || entry.present) return
            const ids = registrants.current.get(key)
            const done = completed.current.get(key)
            if (!ids || ids.size === 0) {
                settle(key, entry.token)
                return
            }
            if (
                done?.token === entry.token &&
                [...ids].every((id) => done.ids.has(id))
            ) {
                settle(key, entry.token)
            }
        },
        [settle]
    )

    const register = useMemo(
        () => (key: PresenceKey, document?: Document) => {
            if (document) documents.current.add(document)
            const id = ++nextRegistrant.current
            let ids = registrants.current.get(key)
            if (!ids) {
                ids = new Set()
                registrants.current.set(key, ids)
            }
            ids.add(id)
            return id
        },
        []
    )
    const unregister = useMemo(
        () => (key: PresenceKey, id: number) => {
            const ids = registrants.current.get(key)
            ids?.delete(id)
            if (ids?.size === 0) registrants.current.delete(key)
            const done = completed.current.get(key)
            done?.ids.delete(id)
            maybeSettle(key)
        },
        [maybeSettle]
    )
    const reportExit = useMemo(
        () => (key: PresenceKey, id: number, token: number) => {
            const entry = entriesRef.current.find(
                (candidate) => candidate.key === key
            )
            if (!entry || entry.present || entry.token !== token) return
            let done = completed.current.get(key)
            if (!done || done.token !== token) {
                done = { token, ids: new Set() }
                completed.current.set(key, done)
            }
            done.ids.add(id)
            maybeSettle(key)
        },
        [maybeSettle]
    )

    useIsoLayoutEffect(() => {
        for (const entry of nextEntries) {
            if (
                !entry.present &&
                (registrants.current.get(entry.key)?.size ?? 0) === 0
            ) {
                if (committedKeys.current.has(entry.key)) {
                    if (typeof console !== 'undefined') {
                        // biome-ignore lint/suspicious/noConsole: development warning
                        console.warn(
                            `[ani-react/layout] AnimatePresence has no usePresence registrant for "${String(entry.key)}"; releasing it now.`
                        )
                    }
                }
                settle(entry.key, entry.token)
            }
        }
    }, [nextEntries, settle])

    return (
        <>
            {visibleEntries.map((entry) => {
                const value: PresenceContextValue = {
                    key: String(entry.key),
                    token: entry.token,
                    present: entry.present,
                    willEnter: willEnter.current.get(entry.key) ?? true,
                    popLayout: props.mode === 'popLayout',
                    custom: props.custom,
                    register: (document) => register(entry.key, document),
                    unregister: (id) => unregister(entry.key, id),
                    settle: () => settle(entry.key, entry.token),
                    reportExit: (id) => reportExit(entry.key, id, entry.token),
                }
                return (
                    <PresenceContext.Provider
                        key={String(entry.key)}
                        value={value}
                    >
                        {entry.item}
                    </PresenceContext.Provider>
                )
            })}
        </>
    )
}

const px = (value: string): number => Number.parseFloat(value) || 0

/** A computed value other than its initial one (`''` where not computed). */
const set = (value: string | undefined, initial = 'none'): boolean =>
    value !== undefined && value !== '' && value !== initial

/** Whether `style` makes its element the containing block of absolute descendants. */
function containsAbsolute(style: CSSStyleDeclaration): boolean {
    return (
        set(style.position, 'static') ||
        set(style.transform) ||
        set(style.translate) ||
        set(style.scale) ||
        set(style.rotate) ||
        set(style.filter) ||
        set(style.backdropFilter) ||
        set(style.perspective) ||
        /layout|paint|strict|content/.test(style.contain) ||
        /size/.test(style.containerType ?? '') ||
        /transform|translate|scale|rotate|filter|perspective/.test(
            style.willChange
        )
    )
}

/** The border-box size of a computed style, before transforms (0 where not computed). */
function borderBox(style: CSSStyleDeclaration): {
    width: number
    height: number
} {
    let width = px(style.width)
    let height = px(style.height)
    if (style.boxSizing !== 'border-box') {
        width +=
            px(style.paddingLeft) +
            px(style.paddingRight) +
            px(style.borderLeftWidth) +
            px(style.borderRightWidth)
        height +=
            px(style.paddingTop) +
            px(style.paddingBottom) +
            px(style.borderTopWidth) +
            px(style.borderBottomWidth)
    }
    return { width, height }
}

/** A 2D affine map `[a, b, c, d, e, f]`: `x′ = a·x + c·y + e`, `y′ = b·x + d·y + f`. */
type Affine = readonly [number, number, number, number, number, number]

const IDENTITY: Affine = [1, 0, 0, 1, 0, 0]

function compose(m: Affine, n: Affine): Affine {
    return [
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5],
    ]
}

const shift = (x: number, y: number): Affine => [1, 0, 0, 1, x, y]

/** A length of a computed `translate` / `transform-origin`; `%` of `size`. */
const length = (value: string | undefined, size: number): number =>
    value?.endsWith('%') ? (px(value) / 100) * size : px(value ?? '0')

const ANGLE: Record<string, number> = {
    deg: Math.PI / 180,
    grad: Math.PI / 200,
    rad: 1,
    turn: 2 * Math.PI,
}

/** A computed `rotate` about the z axis, in radians (0 for a 3D axis). */
function angle(value: string): number {
    const parts = value.trim().split(/\s+/)
    const axis = parts.slice(0, -1)
    if (
        axis.length > 0 &&
        axis.join(' ') !== 'z' &&
        axis.join(' ') !== '0 0 1'
    ) {
        return 0
    }
    const match = /^(-?[\d.e+-]+)([a-z]+)$/.exec(parts[parts.length - 1] ?? '')
    return match ? Number(match[1]) * (ANGLE[match[2]!] ?? 0) : 0
}

/** A computed `transform` (`matrix()`, or the 2D part of `matrix3d()`). */
function matrix(value: string): Affine {
    const match = /^matrix(3d)?\(([^)]*)\)$/.exec(value)
    if (!match) return IDENTITY
    const n = match[2]!.split(',').map(Number)
    const m: Affine = match[1]
        ? [n[0]!, n[1]!, n[4]!, n[5]!, n[12]!, n[13]!]
        : [n[0]!, n[1]!, n[2]!, n[3]!, n[4]!, n[5]!]
    return m.every(Number.isFinite) ? m : IDENTITY
}

/**
 * The element's own transforms as one map of its border box (`width` ×
 * `height`, local coordinates from its top left corner): `translate`,
 * `rotate`, `scale` and `transform` about `transform-origin`, as CSS
 * composes them. Presence's `transform` and layout's pose are among them.
 */
function ownMap(
    style: CSSStyleDeclaration,
    width: number,
    height: number
): Affine {
    const origin = (style.transformOrigin || '50% 50%').split(/\s+/)
    const ox = length(origin[0], width)
    const oy = length(origin[1], height)
    let map = shift(ox, oy)
    if (set(style.translate)) {
        const [x, y] = style.translate.split(/\s+/)
        map = compose(map, shift(length(x, width), length(y, height)))
    }
    if (set(style.rotate)) {
        const r = angle(style.rotate)
        map = compose(map, [
            Math.cos(r),
            Math.sin(r),
            -Math.sin(r),
            Math.cos(r),
            0,
            0,
        ])
    }
    if (set(style.scale)) {
        const factor = (value: string) =>
            value.endsWith('%') ? px(value) / 100 : px(value)
        const [x = '1', y = x] = style.scale.split(/\s+/)
        map = compose(map, [factor(x), 0, 0, factor(y), 0, 0])
    }
    if (set(style.transform)) map = compose(map, matrix(style.transform))
    return compose(map, shift(-ox, -oy))
}

/**
 * The exiting element's CSS box as `position: absolute` offsets in its
 * containing block (§6, §7.2 popLayout): the nearest ancestor that contains
 * absolute descendants, else the initial containing block. Measured from the
 * rect, so the block's scale is divided out and the element's own transforms
 * (presence's `transform`, layout's pose, authored ones) are taken back out:
 * the lifted element keeps them, and draws exactly where it was.
 */
function popBox(element: HTMLElement): {
    left: number
    top: number
    width: number
    height: number
} {
    const rect = element.getBoundingClientRect()
    let block: HTMLElement | null = null
    let blockStyle: CSSStyleDeclaration | null = null
    for (let node = element.parentElement; node; node = node.parentElement) {
        const candidate = getComputedStyle(node)
        if (containsAbsolute(candidate)) {
            block = node
            blockStyle = candidate
            break
        }
    }
    // the drawn rect in the block's padding-box coordinates
    let left: number
    let top: number
    let sx = 1
    let sy = 1
    if (!block || !blockStyle) {
        const view = element.ownerDocument.defaultView
        left = rect.left + (view?.scrollX ?? 0)
        top = rect.top + (view?.scrollY ?? 0)
    } else {
        const outer = block.getBoundingClientRect()
        // the border-box size before transforms, exact
        const size = borderBox(blockStyle)
        sx = size.width > 0 ? outer.width / size.width : 1
        sy = size.height > 0 ? outer.height / size.height : 1
        left =
            (rect.left - outer.left) / sx -
            px(blockStyle.borderLeftWidth) +
            block.scrollLeft
        top =
            (rect.top - outer.top) / sy -
            px(blockStyle.borderTopWidth) +
            block.scrollTop
    }
    const drawnWidth = rect.width / sx
    const drawnHeight = rect.height / sy
    const style = getComputedStyle(element)
    const own = borderBox(style)
    // the CSS size where computed, else the drawn one through the own scale
    const unscale = ownMap(style, drawnWidth, drawnHeight)
    const width =
        own.width > 0
            ? own.width
            : unscale[1] === 0 && unscale[2] === 0 && unscale[0] !== 0
              ? drawnWidth / Math.abs(unscale[0])
              : drawnWidth
    const height =
        own.height > 0
            ? own.height
            : unscale[1] === 0 && unscale[2] === 0 && unscale[3] !== 0
              ? drawnHeight / Math.abs(unscale[3])
              : drawnHeight
    // the drawn rect is the bounding box of the own map's corners
    const map = ownMap(style, width, height)
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    for (const [x, y] of [
        [0, 0],
        [width, 0],
        [0, height],
        [width, height],
    ] as const) {
        minX = Math.min(minX, map[0] * x + map[2] * y + map[4])
        minY = Math.min(minY, map[1] * x + map[3] * y + map[5])
    }
    return { left: left - minX, top: top - minY, width, height }
}

export interface UsePresenceResult<E extends HTMLElement> {
    ref: RefCallback<E>
    style: CSSProperties | undefined
    isPresent: boolean
    /** Custom value passed through AnimatePresence. */
    custom: unknown
}

/**
 * Creates a per-element presence handle bound to the surrounding
 * AnimatePresence. The returned style is undefined at rest; it carries
 * `motion.initial` for the first enter and popLayout positioning during exit.
 */
export function usePresence<
    G extends GroupableRecord,
    E extends HTMLElement = HTMLElement,
>(motion: PresenceMotion<G>, options?: PresenceOptions): UsePresenceResult<E> {
    const context = useContext(PresenceContext)
    const contextRef = useRef(context)
    contextRef.current = context
    const motionRef = useRef(motion)
    motionRef.current = motion
    const optionsRef = useRef(options)
    optionsRef.current = options
    const elementRef = useRef<E | null>(null)
    const handle = useRef<PresenceHandle | null>(null)
    /** The element `handle` animates. */
    const bound = useRef<E | null>(null)
    const registration = useRef<number | null>(null)
    /** The phase started on `handle` (`token:present:willEnter`). */
    const started = useRef<string | null>(null)
    /** A detach waiting for the end of the task. */
    const detaching = useRef(false)

    const release = useMemo(
        () => () => {
            handle.current?.dispose()
            handle.current = null
            bound.current = null
            started.current = null
            const current = contextRef.current
            if (registration.current !== null) {
                current?.unregister(registration.current)
                registration.current = null
            }
        },
        []
    )

    // StrictMode replays the refs and effects of mounted and moved fibers
    // (K17): a detach waits until the end of the task, and a re-attach of the
    // same element in that task keeps the handle, its running enter or exit,
    // its registration and its holds.
    const detach = useMemo(
        () => () => {
            if (!handle.current || detaching.current) return
            detaching.current = true
            queueMicrotask(() => {
                if (!detaching.current) return
                detaching.current = false
                release()
            })
        },
        [release]
    )

    const attach = useMemo(
        () => (element: E) => {
            const current = contextRef.current
            if (!current) return
            detaching.current = false
            if (handle.current && bound.current === element) return
            release()
            handle.current = createPresence(
                element,
                motionRef.current,
                optionsRef.current
            )
            bound.current = element
            registration.current = current.register(element.ownerDocument)
        },
        [release]
    )

    const ref = useMemo<RefCallback<E>>(
        () => (element) => {
            if (!element) {
                elementRef.current = null
                detach()
                return
            }
            elementRef.current = element
            attach(element)
        },
        [attach, detach]
    )

    useIsoLayoutEffect(() => {
        if (!contextRef.current) return
        if (elementRef.current) attach(elementRef.current)
        return detach
    }, [attach, detach])

    const [applyInitial, setApplyInitial] = useState(true)
    useIsoLayoutEffect(() => {
        const current = contextRef.current
        const active = handle.current
        if (!current || !active) return
        const phase = `${current.token}:${current.present}:${current.willEnter}`
        // a replayed effect: the phase already runs on this handle
        if (started.current === phase) return
        started.current = phase
        // a settled run of a replaced handle or of an earlier phase is stale
        const live = () =>
            handle.current === active && started.current === phase
        if (!current.present) {
            void active.exit().then((result) => {
                if (!live()) return
                if (result === 'exited' || result === 'timeout') {
                    const id = registration.current
                    if (id !== null) current.reportExit(id, current.token)
                }
            })
        } else if (current.willEnter) {
            // the initial style stays a prop until the enter is done: React
            // would otherwise clear the values the enter is writing
            void active.enter().then(() => {
                if (live() && contextRef.current?.present) {
                    setApplyInitial(false)
                }
            })
        }
    }, [context?.present, context?.willEnter, context?.token])

    const initialStyle = useMemo(
        () =>
            context?.willEnter && motion.initial
                ? (createStyleSheet(
                      motion.initial as Record<string, number>
                  ) as CSSProperties)
                : undefined,
        [context?.willEnter, motion.initial]
    )
    // measured in the render that exits, before React mutates the DOM
    const popping = context !== null && !context.present && context.popLayout
    const popStyle = useMemo<CSSProperties | undefined>(() => {
        const element = elementRef.current
        if (!popping || !element || !hasDOM()) return undefined
        return {
            position: 'absolute',
            ...popBox(element),
            margin: 0,
            boxSizing: 'border-box',
            pointerEvents: 'none',
        }
    }, [popping, context?.token])

    return {
        ref,
        style: popStyle ?? (applyInitial ? initialStyle : undefined),
        isPresent: context?.present ?? true,
        custom: context?.custom,
    }
}

export function usePresenceControl(options?: { maxExitMs?: number }): {
    isPresent: boolean
    safeToRemove: () => void
} {
    const context = useContext(PresenceContext)
    const contextRef = useRef(context)
    contextRef.current = context
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const clear = () => {
        if (timer.current !== null) {
            clearTimeout(timer.current)
            timer.current = null
        }
    }

    const registration = useRef<number | null>(null)
    useIsoLayoutEffect(() => {
        const current = contextRef.current
        if (!current) return
        const id = current.register()
        registration.current = id
        return () => {
            current.unregister(id)
            registration.current = null
            clear()
        }
    }, [])

    useIsoLayoutEffect(() => {
        clear()
        const current = contextRef.current
        if (!current || current.present) return
        const token = current.token
        const delay = options?.maxExitMs ?? 10_000
        if (delay === Infinity) return
        timer.current = setTimeout(() => {
            timer.current = null
            const active = contextRef.current
            const id = registration.current
            if (active && id !== null && active.token === token) {
                active.reportExit(id, token)
            }
        }, delay)
    }, [context?.present, context?.token, options?.maxExitMs])

    const token = context?.token
    return {
        isPresent: context?.present ?? true,
        safeToRemove: () => {
            const current = contextRef.current
            const id = registration.current
            if (!current || id === null || current.token !== token) return
            clear()
            current.reportExit(id, token)
        },
    }
}
