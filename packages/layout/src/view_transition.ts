import { type TimingFunction, timing } from '@freestylejs/ani-core'
import { cssEasing } from './easing'
import { hasDOM, reducedLayoutMotion, supportsViewTransition } from './feature'
import {
    assertKeys,
    invalidOptions,
    validateMotion,
    validateReducedMotion,
} from './motion'
import type {
    ViewTransitionMotion,
    ViewTransitionOptions,
    ViewTransitionResult,
} from './types'

interface SavedName {
    readonly value: string
    readonly priority: string
}

interface ActiveTransition {
    transition: { skipTransition?: () => void }
    restore: () => void
    lifecycle: { interrupted: boolean }
}

const shared = new Map<string, Set<HTMLElement>>()
let current: ActiveTransition | null = null
const MAX_NAMES = 32

function defaultTiming(): TimingFunction {
    return timing.bezier({
        p2: { x: 0.2, y: 0 },
        p3: { x: 0, y: 1 },
    })
}

function warn(message: string): void {
    if (typeof console !== 'undefined') console.warn(`[ani-layout] ${message}`)
}

function hash(value: string): string {
    let hash = 5381
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0
    }
    return hash.toString(36)
}

function nameFor(id: string): string {
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40)
    return `ani-${safe}-${hash(id)}`.slice(0, 64)
}

function uniqueName(id: string, used: Set<string>): string {
    const base = nameFor(id)
    let name = base
    let counter = 1
    while (used.has(name)) {
        const suffix = `-${counter++}`
        name = `${base.slice(0, 64 - suffix.length)}${suffix}`
    }
    used.add(name)
    return name
}

function latest(id: string): HTMLElement | null {
    const set = shared.get(id)
    if (!set) return null
    let candidate: HTMLElement | null = null
    for (const element of set) {
        if (element.isConnected) candidate = element
    }
    return candidate
}

function getSavedName(element: HTMLElement): SavedName {
    return {
        value: element.style.getPropertyValue('view-transition-name'),
        priority: element.style.getPropertyPriority('view-transition-name'),
    }
}

function setName(element: HTMLElement, value: string, priority = ''): void {
    if (value)
        element.style.setProperty('view-transition-name', value, priority)
    else element.style.removeProperty('view-transition-name')
}

function restoreNames(saved: Map<HTMLElement, SavedName>): void {
    for (const [element, value] of saved) {
        setName(element, value.value, value.priority)
    }
    saved.clear()
}

function nativeActive(): object | null {
    if (!hasDOM()) return null
    const active = (
        document as Document & {
            activeViewTransition?: object | null
        }
    ).activeViewTransition
    if (active) return active
    try {
        if (document.documentElement.matches(':active-view-transition')) {
            // Without the activeViewTransition object we cannot prove that
            // the transition is ours. Treat it as foreign and yield.
            return document
        }
    } catch {
        // selector unsupported
    }
    return null
}

/**
 * Registers a shared-element candidate. No name is written until a transition
 * actually shares `id`.
 */
export function shareElement(element: HTMLElement, id: string): () => void {
    let set = shared.get(id)
    if (!set) {
        set = new Set()
        shared.set(id, set)
    }
    set.add(element)
    return () => {
        set?.delete(element)
        if (set?.size === 0) shared.delete(id)
    }
}

/**
 * Runs a DOM update inside a View Transition when the browser supports it.
 * The update callback runs exactly once in every path.
 */
export async function viewTransition(
    update: () => void | Promise<void>,
    options: ViewTransitionOptions = {}
): Promise<ViewTransitionResult> {
    // Validate before naming elements, interrupting a run, or calling update,
    // including the unsupported-API fallback.
    validateTransitionMotion(options.motion)
    const policy = validateReducedMotion(options.reducedMotion, true)
    if (!hasDOM() || !supportsViewTransition()) {
        await update()
        return 'unsupported'
    }

    const reduced = reducedLayoutMotion(options.clock, policy)
    const maxDuration =
        reduced === 'clamp' && typeof policy === 'object'
            ? policy.maxDuration
            : null
    const skipForReduced = reduced === 'skip' || maxDuration === 0

    const active = nativeActive()
    const own = current && (!active || active === current.transition)
    if (active && !own) {
        if (current) {
            current.restore()
            current = null
        }
        await update()
        return skipForReduced ? 'reduced' : 'yielded'
    }
    if (own && current) {
        current.lifecycle.interrupted = true
        try {
            current.transition.skipTransition?.()
        } catch {
            // already finished
        }
        current.restore()
        current = null
    }
    if (skipForReduced) {
        await update()
        return 'reduced'
    }

    const ids = [...new Set(options.share ?? [])]
    const names: string[] = []
    const usedNames = new Set<string>()
    const saved = new Map<HTMLElement, SavedName>()
    const named = new Map<string, { element: HTMLElement; name: string }>()
    for (const id of ids) {
        if (names.length >= MAX_NAMES) {
            warn(
                `viewTransition: at most ${MAX_NAMES} shared names are allowed; extras are unnamed.`
            )
            break
        }
        const element = latest(id)
        if (!element || saved.has(element)) continue
        const name = uniqueName(id, usedNames)
        names.push(name)
        saved.set(element, getSavedName(element))
        setName(element, name)
        named.set(id, { element, name })
    }

    const lifecycle = { interrupted: false }
    let ran = false
    let closed = false
    let failed = false
    let updateError: unknown
    let skippedByReady = false
    const runUpdate = async (): Promise<void> => {
        if (ran) return
        ran = true
        const started =
            typeof performance === 'undefined' ? null : performance.now()
        try {
            await update()
            if (closed) return
            if (
                started !== null &&
                typeof performance !== 'undefined' &&
                performance.now() - started > 100
            ) {
                warn(
                    'viewTransition: update took more than 100ms; load data before starting the transition.'
                )
            }
            for (const id of ids) {
                const lead = latest(id)
                const previous = named.get(id)
                if (!lead || !previous || lead === previous.element) continue
                const usedByOther = [...named.entries()].some(
                    ([other, value]) => other !== id && value.element === lead
                )
                if (usedByOther) continue
                setName(
                    previous.element,
                    saved.get(previous.element)?.value ?? '',
                    saved.get(previous.element)?.priority ?? ''
                )
                saved.delete(previous.element)
                if (!saved.has(lead)) {
                    saved.set(lead, getSavedName(lead))
                }
                setName(lead, previous.name)
                named.set(id, { element: lead, name: previous.name })
            }
        } catch (error) {
            failed = true
            updateError = error
            throw error
        }
    }

    let transition: {
        ready: Promise<unknown>
        finished: Promise<unknown>
        updateCallbackDone?: Promise<unknown>
        types?: { add: (value: string) => void }
        skipTransition: () => void
    }
    try {
        transition = (
            document as Document & {
                startViewTransition: (callback: () => Promise<void>) => never
            }
        ).startViewTransition(runUpdate) as never
    } catch (error) {
        try {
            if (!ran) await update()
        } catch (updateFailure) {
            failed = true
            updateError = updateFailure
        } finally {
            closed = true
            restoreNames(saved)
            current = null
        }
        if (failed) throw updateError
        throw error
    }

    const activeState: ActiveTransition = {
        transition,
        restore: () => {
            closed = true
            restoreNames(saved)
        },
        lifecycle,
    }
    current = activeState
    // Observe rejection even when an earlier ready/retiming failure exits.
    const finishedResult = transition.finished.then(
        () => true,
        () => false
    )

    if (transition.updateCallbackDone) {
        transition.updateCallbackDone.catch(() => undefined)
    }

    if (options.types && transition.types) {
        for (const type of options.types) {
            try {
                transition.types.add(type)
            } catch {
                // optional per engine
            }
        }
    }

    try {
        await transition.ready
    } catch {
        skippedByReady = true
    }
    if (skippedByReady && !ran) {
        try {
            await runUpdate()
        } catch {
            // failed is recorded by runUpdate; cleanup happens below
        }
    }
    if (failed) {
        closed = true
        restoreNames(saved)
        if (current === activeState) current = null
        throw updateError
    }

    let reducedFallback = false
    let finished = false
    try {
        if (
            !skippedByReady &&
            !closed &&
            (options.motion || maxDuration !== null)
        ) {
            const retimed = retimeEffects(
                options.motion ?? {},
                // The accessibility cap covers the root as well as shared names.
                maxDuration === null ? names : undefined,
                maxDuration
            )
            if (
                maxDuration !== null &&
                (!retimed.complete || retimed.count === 0)
            ) {
                // With no observable VT effects the cap is unproven, not a
                // successful cosmetic fallback. Ordinary retiming still may
                // return zero without skipping.
                // Do not claim a reduced fallback unless the native skip ran.
                // A throwing/incomplete native API still restores names below.
                transition.skipTransition()
                reducedFallback = true
            }
        }
        finished = await finishedResult
        if (finished && transition.updateCallbackDone) {
            await transition.updateCallbackDone.catch(() => undefined)
        }
    } finally {
        closed = true
        restoreNames(saved)
        if (current === activeState) current = null
    }

    if (failed) throw updateError
    if (lifecycle.interrupted) return 'interrupted'
    if (reducedFallback) return 'reduced'
    if (skippedByReady || !finished) return 'skipped'
    return 'finished'
}

/**
 * Retimes running ::view-transition-* animations to ANI timing.
 * Returns the number retimed; 0 is a cosmetic UA-timing fallback.
 */
export function retimeViewTransition(
    motion: ViewTransitionMotion,
    names?: readonly string[]
): number {
    validateTransitionMotion(motion)
    return retimeEffects(motion, names, null).count
}

function validateTransitionMotion(motion: unknown): void {
    validateMotion(motion, 'viewTransition.motion')
    if (motion === undefined) return
    const value = motion as Record<string, unknown>
    assertKeys(value, ['type', 'duration', 'timing'], 'viewTransition.motion')
    if (value.type !== undefined && value.type !== 'timing') {
        throw invalidOptions(
            'type',
            'View Transitions support timing motion only.'
        )
    }
}

/** Retiming metadata stays local; no public spring fallback or second motion law. */
function retimeEffects(
    motion: ViewTransitionMotion,
    names: readonly string[] | undefined,
    maxDuration: number | null
): { count: number; complete: boolean } {
    if (!hasDOM() || typeof document.getAnimations !== 'function') {
        return { count: 0, complete: false }
    }
    const ordinary = Math.min(
        500,
        Math.max(100, (motion.duration ?? 0.35) * 1000)
    )
    const duration =
        maxDuration === null ? ordinary : Math.min(ordinary, maxDuration * 1000)
    const easing = cssEasing(motion.timing ?? defaultTiming())
    let count = 0
    let complete = true
    let animations: Animation[]
    try {
        animations = document.getAnimations()
    } catch {
        return { count: 0, complete: false }
    }
    for (const animation of animations) {
        const effect = animation.effect
        if (!effect) continue
        const pseudo = (
            effect as AnimationEffect & { pseudoElement?: string | null }
        ).pseudoElement
        if (!pseudo?.startsWith('::view-transition')) continue
        if (
            names?.length &&
            !names.some((name) => pseudo.includes(`(${name})`))
        ) {
            continue
        }
        try {
            effect.updateTiming({
                duration,
                easing,
                // A duration cap must not leave an authored delay or repeat
                // that can keep a native effect alive beyond that cap.
                ...(maxDuration !== null && {
                    delay: 0,
                    endDelay: 0,
                    iterations: 1,
                    iterationStart: 0,
                }),
            })
            count++
        } catch {
            complete = false
        }
    }
    return { count, complete }
}
