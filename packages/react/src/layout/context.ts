import {
    type Clock,
    DEV,
    type TimingFunction,
    timing,
} from '@freestylejs/ani-core'
import {
    createLayoutGroup,
    type LayoutGroup,
    type LayoutGroupOptions,
    type LayoutMotion,
    type LayoutOptions,
    type LayoutReport,
} from '@freestylejs/ani-layout'
import { createContext, type Ref, type RefCallback } from 'react'
import { flushSync } from 'react-dom'

const NO_CHANGE: LayoutReport = { status: 'no-change', snapped: [] }

export const hasDOM = (): boolean => typeof document !== 'undefined'

/**
 * The adapter's handle on one core scope (§4.1–§4.2): renders capture,
 * layout effects queue one flush per scope and commit. The core group is
 * created lazily and re-created (with every registration) when its options
 * change or after disposal.
 */
export interface LayoutScope {
    /** Render of a participant, group or presence: the before-boxes. */
    touch(): void
    /** Layout effect: queues the commit's one flush. */
    commit(): void
    add(element: HTMLElement, options: LayoutOptions): () => void
    set(element: HTMLElement, options: LayoutOptions): void
    update(fn: () => void): Promise<LayoutReport>
    finish(): void
    /** Re-creates the core group with new options. */
    recreate(options: LayoutGroupOptions): void
    dispose(): void
}

interface Member {
    options: LayoutOptions
    remove: () => void
    /** Removed, pending the end of the task. */
    leaving: boolean
}

const TRIGGER_WARNING =
    '[ani-react/layout] The DOM around layout participants changed in a commit that rendered none of them, so nothing was captured and the change did not animate. Render a participant, LayoutGroup or AnimatePresence in that commit (put the LayoutGroup inside the component that owns the state), or wrap the change in useLayoutGroup().update(fn).'

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null

/** Same own enumerable fields, each equal by {@link sameValue}, in any key order. */
function sameFields(
    a: Record<string, unknown>,
    b: Record<string, unknown>
): boolean {
    const keys = Object.keys(a)
    return (
        keys.length === Object.keys(b).length &&
        keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
    )
}

/**
 * Equal by value: plain objects and arrays field by field, in any key order;
 * anything else by identity (`Object.is`).
 */
export function sameValue(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true
    if (!isObject(a) || !isObject(b)) return false
    const proto = Object.getPrototypeOf(a)
    if (
        proto !== Object.getPrototypeOf(b) ||
        (proto !== Object.prototype &&
            proto !== Array.prototype &&
            proto !== null)
    ) {
        return false
    }
    return sameFields(a, b)
}

/**
 * Timings are compared by value: the same class with equal parameters, in any
 * key order (a timing written inline is a new object every render). Core
 * timings keep their parameters in `opt` and derive the rest of their fields
 * from it; a timing without `opt` is compared field by field.
 */
function sameTiming(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (!isObject(a) || !isObject(b) || a.constructor !== b.constructor) {
        return false
    }
    return 'opt' in a || 'opt' in b ? sameValue(a.opt, b.opt) : sameFields(a, b)
}

/** The layout defaults (§7.1): an omitted field equals its default. */
const DEFAULT_DURATION = 0.35
let defaultTiming: TimingFunction | null = null

/** Equal when they draw the same track: omitted fields are their defaults. */
function sameMotion(
    a: LayoutMotion | undefined,
    b: LayoutMotion | undefined
): boolean {
    if (a === b) return true
    if (
        (a?.duration ?? DEFAULT_DURATION) !==
            (b?.duration ?? DEFAULT_DURATION) ||
        (a?.delay ?? 0) !== (b?.delay ?? 0)
    ) {
        return false
    }
    if (a?.timing === b?.timing) return true
    defaultTiming ??= timing.easeOut()
    return sameTiming(a?.timing ?? defaultTiming, b?.timing ?? defaultTiming)
}

/**
 * Equal options keep a running track; a change retargets it (§5.5). Compared
 * by effect: an omitted option equals its default, a timing its parameters.
 */
export function sameOptions(a: LayoutOptions, b: LayoutOptions): boolean {
    return (
        (a.layout ?? true) === (b.layout ?? true) &&
        a.layoutId === b.layoutId &&
        a.layoutAnchor?.x === b.layoutAnchor?.x &&
        a.layoutAnchor?.y === b.layoutAnchor?.y &&
        (a.layoutCrossfade ?? true) === (b.layoutCrossfade ?? true) &&
        'layoutDependency' in a === 'layoutDependency' in b &&
        Object.is(a.layoutDependency, b.layoutDependency) &&
        (a.radius ?? false) === (b.radius ?? false) &&
        sameMotion(a.motion, b.motion)
    )
}

export function createLayoutScope(
    initial: LayoutGroupOptions,
    onEmpty?: () => void
): LayoutScope {
    let options = initial
    let group: LayoutGroup | null = null
    const members = new Map<HTMLElement, Member>()
    let queued = false
    /** A render touched after the commit's last layout effect (K14). */
    let touched = false

    // development: the trigger contract (§7.2)
    let observer: MutationObserver | null = null
    let capturedSinceCheck = false
    let warned = false

    const live = (): LayoutGroup => {
        group ??= createLayoutGroup(options)
        return group
    }

    const run = (): void => {
        if (!queued) return
        queued = false
        const current = group
        if (!current) return
        void current.flush()
        // the next commit's mutations are covered only by a later capture
        capturedSinceCheck = touched
        // a render that started in the commit's task reused the capture this
        // flush consumed: its before-boxes are the after-boxes just read
        if (touched) {
            touched = false
            current.capture()
        }
    }

    const emptied = (): void => {
        if (!onEmpty) return
        queueMicrotask(() => {
            if (members.size === 0) onEmpty()
        })
    }

    const watch = (element: HTMLElement): void => {
        if (!DEV || typeof MutationObserver === 'undefined') return
        observer ??= new MutationObserver(() => {
            if (members.size === 0) return
            if (capturedSinceCheck) {
                capturedSinceCheck = false
                return
            }
            if (warned) return
            warned = true
            // biome-ignore lint/suspicious/noConsole: development warning
            console.warn(TRIGGER_WARNING)
        })
        observer.observe(element, {
            attributes: true,
            attributeFilter: ['class'],
        })
        if (element.parentElement) {
            observer.observe(element.parentElement, { childList: true })
        }
    }

    const scope: LayoutScope = {
        touch() {
            if (!hasDOM()) return
            live().capture()
            touched = true
            capturedSinceCheck = true
        },

        commit() {
            touched = false
            if (queued) return
            queued = true
            queueMicrotask(run)
        },

        add(element, participant) {
            let member = members.get(element)
            if (member?.leaving) {
                // re-attached in the task that detached it (StrictMode replays
                // the refs of mounted and moved fibers): it keeps its capture
                member.leaving = false
                if (!sameOptions(member.options, participant)) {
                    member.options = participant
                    group?.set(element, participant)
                }
            } else {
                member = {
                    options: participant,
                    remove: live().add(element, participant),
                    leaving: false,
                }
                members.set(element, member)
                watch(element)
            }
            const self = member
            return () => {
                if (members.get(element) !== self || self.leaving) return
                self.leaving = true
                queueMicrotask(() => {
                    if (!self.leaving || members.get(element) !== self) return
                    members.delete(element)
                    self.remove()
                    if (members.size === 0) emptied()
                })
            }
        },

        set(element, participant) {
            const member = members.get(element)
            if (!member) return
            member.options = participant
            group?.set(element, participant)
        },

        update(fn) {
            if (!hasDOM()) {
                fn()
                return Promise.resolve(NO_CHANGE)
            }
            // an earlier commit's pending flush keeps its own capture
            run()
            capturedSinceCheck = true
            const report = live().update(() => flushSync(fn))
            // the commit inside `fn` was flushed by `update` itself
            queued = false
            touched = false
            return report
        },

        finish() {
            group?.finish()
        },

        recreate(next) {
            options = next
            if (!group) return
            group.dispose()
            group = createLayoutGroup(options)
            for (const [element, member] of members) {
                member.remove = group.add(element, member.options)
            }
        },

        dispose() {
            queued = false
            touched = false
            group?.dispose()
            group = null
            members.clear()
            observer?.disconnect()
            observer = null
        },
    }
    emptied()
    return scope
}

/* ───────────────────────── implicit root ───────────────────────── */

const roots = new Map<Clock | undefined, WeakMap<Document, LayoutScope>>()

/**
 * The implicit root scope of `(clock, document)` (§7.2): created on first
 * use, disposed when its last participant leaves, independent of every other
 * pair. `undefined` is the default clock.
 */
export function rootScope(
    clock: Clock | undefined,
    doc: Document
): LayoutScope {
    let byDocument = roots.get(clock)
    if (!byDocument) {
        byDocument = new WeakMap()
        roots.set(clock, byDocument)
    }
    const partition = byDocument
    let scope = partition.get(doc)
    if (!scope) {
        const created: LayoutScope = createLayoutScope(
            clock ? { clock } : {},
            () => {
                if (partition.get(doc) !== created) return
                partition.delete(doc)
                created.dispose()
            }
        )
        scope = created
        partition.set(doc, scope)
    }
    return scope
}

/** The root scope of `(clock, document)` if it exists. */
export function peekRootScope(
    clock: Clock | undefined,
    doc: Document
): LayoutScope | undefined {
    return roots.get(clock)?.get(doc)
}

/* ───────────────────────── contexts ───────────────────────── */

export interface LayoutContextValue {
    readonly scope: LayoutScope
    /** Joined ids of the enclosing groups; prefixes every `layoutId`. */
    readonly namespace: string | undefined
    /** The enclosing groups' `motion`, merged outermost first. */
    readonly motion: LayoutMotion | undefined
}

export const LayoutContext = createContext<LayoutContextValue | null>(null)

/** The group's scope, else the implicit root of the element's document (created). */
export function scopeOf(
    context: LayoutContextValue | null,
    element?: Element | null
): LayoutScope {
    return (
        context?.scope ??
        rootScope(undefined, element?.ownerDocument ?? document)
    )
}

/**
 * Like {@link scopeOf}, but never creates a root: renders and effects only
 * touch and flush scopes that have participants (registration creates them).
 */
export function existingScope(
    context: LayoutContextValue | null,
    element?: Element | null
): LayoutScope | undefined {
    if (context) return context.scope
    if (!hasDOM()) return undefined
    return peekRootScope(undefined, element?.ownerDocument ?? document)
}

/** `motion` fields of `over` replace those of `base`, field by field. */
export function mergeMotion(
    base: LayoutMotion | undefined,
    over: LayoutMotion | undefined
): LayoutMotion | undefined {
    if (!base) return over
    if (!over) return base
    return {
        ...base,
        ...(over.duration !== undefined && { duration: over.duration }),
        ...(over.delay !== undefined && { delay: over.delay }),
        ...(over.timing !== undefined && { timing: over.timing }),
    }
}

export interface PresenceContextValue {
    readonly key: string
    readonly token: number
    readonly present: boolean
    readonly willEnter: boolean
    readonly popLayout: boolean
    readonly custom?: unknown
    readonly register: () => number
    readonly unregister: (id: number) => void
    readonly settle: () => void
    readonly reportExit: (id: number, token: number) => void
}

export const PresenceContext = createContext<PresenceContextValue | null>(null)

export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
    if (typeof ref === 'function') {
        ;(ref as RefCallback<T>)(value)
    } else if (ref) {
        ;(ref as { current: T | null }).current = value
    }
}
