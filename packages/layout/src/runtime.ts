/**
 * `layoutRuntime` and the diagnostics stream (§7.2).
 *
 * A module singleton of the installed package copy. The kill switch reaches
 * every registered explicit and implicit scope synchronously. Diagnostics are
 * built only when a listener exists; every listener runs after the engine's
 * state is consistent, inside its own `try` (§9.2).
 */
import { DEV } from '@freestylejs/ani-core'
import { layoutFault } from './fault'
import { invalidOptions } from './motion'
import type {
    LayoutDiagnostic,
    LayoutDiagnosticMetrics,
    LayoutRuntime,
} from './types'

export type LayoutDiagnosticListener = (event: LayoutDiagnostic) => void

/** What the runtime can do to one live scope: finish every track at once. */
export interface RuntimeScope {
    /** §7.2: live tracks finish at identity, holds invalidate, reports resolve `'disabled'`. */
    snap(): void
}

const listeners = new Set<LayoutDiagnosticListener>()
const scopes = new Set<RuntimeScope>()
let mode: 'animate' | 'snap' = 'animate'
let scopeCounter = 0
let runCounter = 0

/** The next stable scope id of this page (§7.2). */
export function nextLayoutScopeId(): number {
    scopeCounter += 1
    return scopeCounter
}

/** The next run id of this page. */
export function nextLayoutRunId(): number {
    runCounter += 1
    return runCounter
}

/** Whether building a diagnostic payload is worthwhile (§7.2 Cost). */
export function hasDiagnosticListeners(): boolean {
    return listeners.size > 0
}

/** Registers a live scope for `setMode('snap')`; returns its unregister. */
export function registerRuntimeScope(scope: RuntimeScope): () => void {
    scopes.add(scope)
    return () => {
        scopes.delete(scope)
    }
}

/** Rethrown asynchronously in development (§7.2 Isolation); nothing in production. */
function rethrowAsync(error: unknown): void {
    if (!DEV) return
    const queue = globalThis.queueMicrotask
    if (typeof queue === 'function') {
        queue(() => {
            throw error
        })
        return
    }
    setTimeout(() => {
        throw error
    }, 0)
}

/**
 * Delivers one event to every listener of the moment, each inside its own
 * `try`. A throwing listener is reported as `callback-error` to the others
 * only, never back to itself and never recursively.
 */
export function emitDiagnostic(event: LayoutDiagnostic): void {
    if (listeners.size === 0) return
    const recipients = [...listeners]
    const failures: { error: unknown; source: LayoutDiagnosticListener }[] = []
    for (const listener of recipients) {
        if (!listeners.has(listener)) continue
        try {
            layoutFault('diagnostic')
            listener(event)
        } catch (error) {
            failures.push({ error, source: listener })
        }
    }
    // after the event reached every other listener, so the stream's order is
    // the original event first, then `callback-error` for the thrower
    for (const failure of failures) {
        reportListenerError(failure.error, event, failure.source, recipients)
    }
}

function reportListenerError(
    error: unknown,
    cause: LayoutDiagnostic,
    source: LayoutDiagnosticListener,
    recipients: readonly LayoutDiagnosticListener[]
): void {
    const callbackError = callbackErrorEvent(error, cause)
    for (const listener of recipients) {
        if (listener === source || !listeners.has(listener)) continue
        try {
            listener(callbackError)
        } catch (nested) {
            // never recursively: only this listener's error leaves the boundary
            rethrowAsync(nested)
        }
    }
    rethrowAsync(error)
}

function callbackErrorEvent(
    error: unknown,
    cause: Pick<
        LayoutDiagnostic,
        'scope' | 'run' | 'engine' | 'metrics' | 'element'
    >
): LayoutDiagnostic {
    return {
        version: 1,
        code: 'callback-error',
        scope: cause.scope,
        run: cause.run,
        engine: cause.engine,
        action: 'none',
        ...(cause.element !== undefined && { element: cause.element }),
        metrics: cause.metrics,
        error,
    }
}

export interface CallbackErrorBase {
    readonly scope: number
    readonly run: number | null
    readonly engine: 'raf' | 'waapi'
    readonly metrics: LayoutDiagnosticMetrics
    readonly element?: HTMLElement
}

/**
 * A user callback outside the stream threw (`onSnap`): report it to every
 * diagnostic listener, then rethrow it asynchronously in development. The
 * engine keeps its state.
 */
export function reportCallbackError(
    error: unknown,
    base: CallbackErrorBase
): void {
    if (listeners.size === 0) {
        rethrowAsync(error)
        return
    }
    const event = callbackErrorEvent(error, base)
    for (const listener of [...listeners]) {
        if (!listeners.has(listener)) continue
        try {
            listener(event)
        } catch (nested) {
            rethrowAsync(nested)
        }
    }
    rethrowAsync(error)
}

export const layoutRuntime: LayoutRuntime = {
    get mode() {
        return mode
    },
    setMode(next) {
        if (next !== 'animate' && next !== 'snap') {
            throw invalidOptions(
                'type',
                `layoutRuntime.setMode expects 'animate' or 'snap', received ${String(next)}.`
            )
        }
        if (next === mode) return
        mode = next
        if (next !== 'snap') return
        for (const scope of [...scopes]) {
            try {
                scope.snap()
            } catch (error) {
                // one scope's failure never stops the others (§7.2)
                rethrowAsync(error)
            }
        }
    },
    onDiagnostic(listener) {
        if (typeof listener !== 'function') {
            throw invalidOptions('type', 'onDiagnostic expects a function.')
        }
        // one subscription per function: a second call returns another remove
        listeners.add(listener)
        let active = true
        return () => {
            if (!active) return
            active = false
            listeners.delete(listener)
        }
    },
}
