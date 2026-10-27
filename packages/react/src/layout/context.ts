import { type Clock, DEV } from '@freestylejs/ani-core'
import {
    createLayoutGroup,
    type LayoutGroup,
    type LayoutGroupOptions,
    type LayoutMotion,
    type LayoutOptions,
    type LayoutReport,
    mergeLayoutMotion,
    sameLayoutMotion,
    validateMotion,
    validateMotionLayers,
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
    readonly document?: Document | undefined
    readonly clock?: Clock | undefined
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
 * Declarations layout (`!important` poses, crossfade opacity, owned corners),
 * presence and Core (`transform`, `opacity`) write while they animate: they
 * never change a layout box, so changing them is no trigger-contract miss.
 */
const OWNED_STYLE = new Set([
    'translate',
    'scale',
    'transform',
    'opacity',
    'border-radius',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
])

/** An inline style's declarations other than the owned ones, normalized. */
function authoredStyle(text: string | null): string {
    if (!text) return ''
    return text
        .split(';')
        .map((declaration) => declaration.trim())
        .filter(
            (declaration) =>
                declaration !== '' &&
                !OWNED_STYLE.has(
                    declaration.slice(0, declaration.indexOf(':')).trim()
                )
        )
        .sort()
        .join(';')
}

/**
 * Whether a batch of mutations around participants can have moved one: any
 * node added or removed, any `class` change, and a `style` change beyond the
 * owned declarations (compared from each element's first old value to now).
 */
function movesLayout(records: readonly MutationRecord[]): boolean {
    const styles = new Map<Element, string | null>()
    for (const record of records) {
        if (record.type !== 'attributes' || record.attributeName !== 'style') {
            return true
        }
        const target = record.target as Element
        if (!styles.has(target)) styles.set(target, record.oldValue)
    }
    for (const [target, old] of styles) {
        if (
            authoredStyle(old) !== authoredStyle(target.getAttribute('style'))
        ) {
            return true
        }
    }
    return false
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
        Object.is(a.layoutKey, b.layoutKey) &&
        (a.radius ?? a.layoutId !== undefined) ===
            (b.radius ?? b.layoutId !== undefined) &&
        sameLayoutMotion(a.motion, b.motion)
    )
}

export function createLayoutScope(
    initial: LayoutGroupOptions,
    onEmpty?: () => void,
    doc: Document | undefined = hasDOM() ? document : undefined
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

    const observed = new Set<Element>()
    const watch = (element: HTMLElement): void => {
        if (!DEV || typeof MutationObserver === 'undefined') return
        observer ??= new MutationObserver((records) => {
            if (warned || !movesLayout(records)) return
            // nothing left on screen to jump (an unmount of the whole scope)
            if (![...members.keys()].some((element) => element.isConnected)) {
                return
            }
            if (capturedSinceCheck) {
                capturedSinceCheck = false
                return
            }
            warned = true
            // biome-ignore lint/suspicious/noConsole: development warning
            console.warn(TRIGGER_WARNING)
        })
        // the parent's subtree: the parent itself, the participants and
        // their siblings, with everything inside them
        const parent = element.parentElement
        if (!parent || observed.has(parent)) return
        observed.add(parent)
        observer.observe(parent, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style'],
            attributeOldValue: true,
        })
    }

    const scope: LayoutScope = {
        document: doc,
        get clock() {
            return options.clock
        },
        touch() {
            if (!hasDOM()) return
            touched = true
            capturedSinceCheck = true
            // a render after the commit's layout effects, before its flush:
            // the open capture holds that commit's before-boxes. Capturing
            // now would refresh it (a time-sliced render took it in an
            // earlier task) with the after-boxes; the flush's hand-off
            // captures for this render instead (K14)
            if (queued) return
            live().capture()
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
                // a group this registration creates has presented no
                // participant: its capture is the empty one a render of an
                // existing scope would have taken, so the commit's flush is
                // measured and the new participants appear at their layout
                // box (§4.1, §4.4)
                const created = group === null
                const current = live()
                if (created) current.capture()
                member = {
                    options: participant,
                    remove: current.add(element, participant),
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
            observed.clear()
        },
    }
    emptied()
    return scope
}

/* ───────────────────────── implicit root ───────────────────────── */

interface Roots {
    readonly byDocument: WeakMap<Document, LayoutScope>
    /** The same scopes, iterable: those a render of unknown document touches. */
    readonly live: Set<LayoutScope>
}

const roots = new Map<Clock | undefined, Roots>()

/**
 * The implicit root scope of `(clock, document)` (§7.2): created on first
 * use, disposed when its last participant leaves, independent of every other
 * pair. `undefined` is the default clock.
 */
export function rootScope(
    clock: Clock | undefined,
    doc: Document
): LayoutScope {
    let partition = roots.get(clock)
    if (!partition) {
        partition = { byDocument: new WeakMap(), live: new Set() }
        roots.set(clock, partition)
    }
    const { byDocument, live } = partition
    let scope = byDocument.get(doc)
    if (!scope) {
        const created: LayoutScope = createLayoutScope(
            clock ? { clock } : {},
            () => {
                if (byDocument.get(doc) !== created) return
                byDocument.delete(doc)
                live.delete(created)
                created.dispose()
            },
            doc
        )
        scope = created
        byDocument.set(doc, scope)
        live.add(scope)
    }
    return scope
}

/** The root scope of `(clock, document)` if it exists. */
export function peekRootScope(
    clock: Clock | undefined,
    doc: Document
): LayoutScope | undefined {
    return roots.get(clock)?.byDocument.get(doc)
}

/* ───────────────────────── contexts ───────────────────────── */

export interface LayoutContextValue {
    readonly scope: LayoutScope
    /** Joined ids of the enclosing groups; prefixes every `layoutId`. */
    readonly namespace: string | undefined
    /** The enclosing groups' `motion`, merged outermost first. */
    readonly motion: LayoutMotion | undefined
    /** The outermost group's `engine`, if set. */
    readonly engine?: LayoutGroupOptions['engine'] | undefined
}

export { validateMotion, validateMotionLayers }

export const LayoutContext = createContext<LayoutContextValue | null>(null)

/** The group's scope, else the implicit root of the element's document (created). */
export function scopeOf(
    context: LayoutContextValue | null,
    element?: Element | null
): LayoutScope {
    const doc = element?.ownerDocument ?? document
    if (context && (!element || context.scope.document === doc)) {
        return context.scope
    }
    return rootScope(context?.scope.clock, doc)
}

/**
 * Like {@link scopeOf}, but never creates a root: renders and effects only
 * touch and flush scopes that have participants (registration creates them).
 */
export function existingScope(
    context: LayoutContextValue | null,
    element?: Element | null
): LayoutScope | undefined {
    if (!hasDOM()) return undefined
    const doc = element?.ownerDocument ?? document
    if (context && (!element || context.scope.document === doc)) {
        return context.scope
    }
    return peekRootScope(context?.scope.clock, doc)
}

/**
 * The existing scopes a render touches when it knows its DOM only by
 * `documents` (§4.1, §7.2): the group's scope, else the implicit roots of
 * those documents. A render that knows no document yet (a first render,
 * `AnimatePresence` before any registration) touches every implicit root:
 * touching one too many costs a read, missing one loses the change.
 */
export function existingScopes(
    context: LayoutContextValue | null,
    documents: Iterable<Document>
): LayoutScope[] {
    if (!hasDOM()) return []
    const found: LayoutScope[] = []
    const add = (scope: LayoutScope | undefined) => {
        if (scope && !found.includes(scope)) found.push(scope)
    }
    let known = false
    for (const doc of documents) {
        known = true
        if (context && context.scope.document === doc) {
            add(context.scope)
        } else {
            add(peekRootScope(context?.scope.clock, doc))
        }
    }
    if (known) return found
    if (context) add(context.scope)
    for (const scope of roots.get(context?.scope.clock)?.live ?? []) {
        if (!context || scope.document !== context.scope.document) {
            add(scope)
        }
    }
    return found
}

/** `over` merged onto `base` by the kind-level rule of the layout engine (§5.1). */
export function mergeMotion(
    base: LayoutMotion | undefined,
    over: LayoutMotion | undefined
): LayoutMotion | undefined {
    if (!base) return over
    if (!over) return base
    return mergeLayoutMotion([base, over])
}

export interface PresenceContextValue {
    readonly key: string
    readonly token: number
    readonly present: boolean
    readonly willEnter: boolean
    readonly popLayout: boolean
    readonly custom?: unknown
    /** Registers an exit to wait for, with its element's document if it has one. */
    readonly register: (document?: Document) => number
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
