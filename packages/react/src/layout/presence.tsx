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
    existingScope,
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
    // render: the before-boxes of the scope its children live in (§4.1)
    existingScope(layout)?.touch()
    useIsoLayoutEffect(() => {
        existingScope(layout)?.commit()
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
        () => (key: PresenceKey) => {
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
                    register: () => register(entry.key),
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

/**
 * The exiting element's box as `position: absolute` offsets in its
 * containing block (§7.2 popLayout): the nearest ancestor that contains
 * absolute descendants, else the initial containing block. Rect based, so a
 * scaled containing block is divided out.
 */
function popBox(element: HTMLElement): {
    left: number
    top: number
    width: number
    height: number
} {
    const rect = element.getBoundingClientRect()
    let block: HTMLElement | null = null
    let style: CSSStyleDeclaration | null = null
    for (let node = element.parentElement; node; node = node.parentElement) {
        const candidate = getComputedStyle(node)
        if (containsAbsolute(candidate)) {
            block = node
            style = candidate
            break
        }
    }
    if (!block || !style) {
        const view = element.ownerDocument.defaultView
        return {
            left: rect.left + (view?.scrollX ?? 0),
            top: rect.top + (view?.scrollY ?? 0),
            width: rect.width,
            height: rect.height,
        }
    }
    const outer = block.getBoundingClientRect()
    const borderLeft = px(style.borderLeftWidth)
    const borderTop = px(style.borderTopWidth)
    // the border-box size before transforms, exact
    let width = px(style.width)
    let height = px(style.height)
    if (style.boxSizing !== 'border-box') {
        width +=
            px(style.paddingLeft) +
            px(style.paddingRight) +
            borderLeft +
            px(style.borderRightWidth)
        height +=
            px(style.paddingTop) +
            px(style.paddingBottom) +
            borderTop +
            px(style.borderBottomWidth)
    }
    const sx = width > 0 ? outer.width / width : 1
    const sy = height > 0 ? outer.height / height : 1
    return {
        left: (rect.left - outer.left) / sx - borderLeft + block.scrollLeft,
        top: (rect.top - outer.top) / sy - borderTop + block.scrollTop,
        width: rect.width / sx,
        height: rect.height / sy,
    }
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
    const registration = useRef<number | null>(null)
    const detach = useMemo(
        () => () => {
            handle.current?.dispose()
            handle.current = null
            const current = contextRef.current
            if (registration.current !== null) {
                current?.unregister(registration.current)
                registration.current = null
            }
        },
        []
    )

    const attach = useMemo(
        () => (element: E) => {
            const current = contextRef.current
            if (!current) return
            detach()
            handle.current = createPresence(
                element,
                motionRef.current,
                optionsRef.current
            )
            registration.current = current.register()
        },
        [detach]
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
        if (elementRef.current && !handle.current) {
            attach(elementRef.current)
        }
        return detach
    }, [attach, detach])

    const [applyInitial, setApplyInitial] = useState(true)
    useIsoLayoutEffect(() => {
        const current = contextRef.current
        const active = handle.current
        if (!current || !active) return
        if (!current.present) {
            void active.exit().then((result) => {
                if (result === 'exited' || result === 'timeout') {
                    const id = registration.current
                    if (id !== null) current.reportExit(id, current.token)
                }
            })
        } else if (current.willEnter) {
            // the initial style stays a prop until the enter is done: React
            // would otherwise clear the values the enter is writing
            void active.enter().then(() => {
                if (contextRef.current?.present) setApplyInitial(false)
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
