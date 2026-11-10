'use client'

import {
    type PointerEvent as ReactPointerEvent,
    useEffect,
    useRef,
} from 'react'
import {
    type PointerSample,
    recordSample,
    sampleVelocity,
} from './interaction_math'

export interface DragFrame {
    readonly element: HTMLElement
    readonly pointerId: number
    readonly x: number
    readonly y: number
    readonly dx: number
    readonly dy: number
    /** Largest displacement, so an out-and-back drag cannot become a tap. */
    readonly distance: number
    readonly velocity: { readonly x: number; readonly y: number }
}
export type DragCancelReason =
    | 'cancel'
    | 'lost-capture'
    | 'blur'
    | 'disabled'
    | 'unmount'
    | 'axis'
interface DragCallbacks {
    readonly disabled?: boolean | undefined
    /** Touch intent only; CSS touch-action remains the browser's scroll authority. */
    readonly axis?: 'x' | 'y' | undefined
    onStart(frame: DragFrame): void | false
    onMove(frame: DragFrame): void
    onEnd(frame: DragFrame): void
    onCancel(frame: DragFrame, reason: DragCancelReason): void
}
interface Session {
    element: HTMLElement
    id: number
    pointerType: string
    x: number
    y: number
    distance: number
    pendingAxis: 'x' | 'y' | null
    samples: PointerSample[]
    /** Dispatched position is authoritative even if its timer bucket is old. */
    last: PointerSample
}
const TOUCH_SLOP = 4

/** Gesture ownership only. Animation and geometry remain Ani's responsibility. */
export function usePointerDrag(callbacks: DragCallbacks) {
    const latest = useRef(callbacks)
    latest.current = callbacks
    const session = useRef<Session | null>(null)

    const frame = (s: Session): DragFrame => {
        const last = s.last
        return {
            element: s.element,
            pointerId: s.id,
            x: last.x,
            y: last.y,
            dx: last.x - s.x,
            dy: last.y - s.y,
            distance: s.distance,
            velocity: sampleVelocity(s.samples),
        }
    }
    const release = (s: Session) => {
        try {
            if (s.element.hasPointerCapture(s.id))
                s.element.releasePointerCapture(s.id)
        } catch {
            /* Capture may already have ended when the browser cancels. */
        }
    }
    const cancel = (reason: DragCancelReason) => {
        const s = session.current
        if (!s) return
        // Clear before invoking user code or releasePointerCapture, both of
        // which can synchronously re-enter a terminal event handler.
        session.current = null
        try {
            latest.current.onCancel(frame(s), reason)
        } finally {
            release(s)
        }
    }
    useEffect(() => {
        const blur = () => cancel('blur')
        const hidden = () => {
            if (document.hidden) cancel('blur')
        }
        window.addEventListener('blur', blur)
        document.addEventListener('visibilitychange', hidden)
        return () => {
            window.removeEventListener('blur', blur)
            document.removeEventListener('visibilitychange', hidden)
            cancel('unmount')
        }
    }, [])
    useEffect(() => {
        if (callbacks.disabled) cancel('disabled')
    }, [callbacks.disabled])

    const sample = (s: Session, event: PointerEvent): boolean => {
        if (
            ![event.clientX, event.clientY, event.timeStamp].every(
                Number.isFinite
            )
        )
            return false
        const last = {
            x: event.clientX,
            y: event.clientY,
            time: event.timeStamp,
        }
        // Position and velocity history have different validity rules. A
        // clock discontinuity resets speed, never the final pointer position.
        if (last.time < s.last.time) s.samples.length = 0
        let coalesced: PointerEvent[] = []
        try {
            coalesced = event.getCoalescedEvents?.() ?? []
        } catch {
            /* Optional input capability; dispatched event remains usable. */
        }
        for (const e of coalesced) {
            if (
                (e.pointerId !== undefined && e.pointerId !== s.id) ||
                (e.pointerType !== undefined &&
                    e.pointerType !== s.pointerType) ||
                ![e.clientX, e.clientY, e.timeStamp].every(Number.isFinite) ||
                e.timeStamp > last.time ||
                e.timeStamp < s.last.time
            )
                continue
            recordSample(s.samples, {
                x: e.clientX,
                y: e.clientY,
                time: e.timeStamp,
            })
            s.distance = Math.max(
                s.distance,
                Math.hypot(e.clientX - s.x, e.clientY - s.y)
            )
        }
        recordSample(s.samples, last)
        s.last = last
        s.distance = Math.max(
            s.distance,
            Math.hypot(last.x - s.x, last.y - s.y)
        )
        return true
    }
    const usable = (s: Session): boolean => {
        if (latest.current.disabled) {
            cancel('disabled')
            return false
        }
        if (!s.element.isConnected) {
            cancel('unmount')
            return false
        }
        return true
    }
    const intent = (s: Session, ending = false): boolean => {
        if (!s.pendingAxis) return true
        const current = frame(s)
        const along = Math.abs(s.pendingAxis === 'x' ? current.dx : current.dy)
        const across = Math.abs(s.pendingAxis === 'x' ? current.dy : current.dx)
        if (across >= TOUCH_SLOP && across > along) {
            cancel('axis')
            return false
        }
        if (along >= TOUCH_SLOP) {
            s.pendingAxis = null
            return true
        }
        return ending // Below slop, pointer-up is a tap; move is still undecided.
    }
    return {
        active: () => session.current !== null,
        cancel: () => cancel('cancel'),
        onPointerDown(event: ReactPointerEvent<HTMLElement>) {
            if (
                latest.current.disabled ||
                session.current ||
                event.button !== 0 ||
                event.isPrimary === false ||
                !event.currentTarget.isConnected ||
                ![event.clientX, event.clientY, event.timeStamp].every(
                    Number.isFinite
                )
            )
                return
            const s: Session = {
                element: event.currentTarget,
                id: event.pointerId,
                pointerType: event.pointerType,
                x: event.clientX,
                y: event.clientY,
                distance: 0,
                pendingAxis:
                    event.pointerType === 'touch'
                        ? (latest.current.axis ?? null)
                        : null,
                samples: [],
                last: {
                    x: event.clientX,
                    y: event.clientY,
                    time: event.timeStamp,
                },
            }
            sample(s, event.nativeEvent)
            try {
                s.element.setPointerCapture(s.id)
            } catch {
                return
            }
            session.current = s
            try {
                if (latest.current.onStart(frame(s)) === false) {
                    session.current = null
                    release(s)
                    return
                }
                // Do not pre-empt touch scrolling while direction is undecided.
                if (event.pointerType !== 'touch') event.preventDefault()
            } catch (error) {
                try {
                    cancel('cancel')
                } catch {
                    // Capture is released in cancel's finally. Preserve the
                    // original user-code failure, not a secondary cleanup error.
                }
                throw error
            }
        },
        onPointerMove(event: ReactPointerEvent<HTMLElement>) {
            const s = session.current
            if (!s || s.id !== event.pointerId || !usable(s)) return
            if (!sample(s, event.nativeEvent)) {
                cancel('cancel')
                return
            }
            if (!intent(s)) return
            try {
                latest.current.onMove(frame(s))
            } catch (error) {
                try {
                    cancel('cancel')
                } catch {
                    // The original movement failure remains authoritative.
                }
                throw error
            }
        },
        onPointerUp(event: ReactPointerEvent<HTMLElement>) {
            const s = session.current
            if (!s || s.id !== event.pointerId || !usable(s)) return
            // Invalid terminal input cancels, rather than activating an action
            // using a stale position. Capture still terminates exactly once.
            if (!sample(s, event.nativeEvent)) {
                cancel('cancel')
                return
            }
            if (!intent(s, true)) return
            session.current = null
            try {
                latest.current.onEnd(frame(s))
            } finally {
                release(s)
            }
        },
        onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
            if (session.current?.id === event.pointerId) cancel('cancel')
        },
        onLostPointerCapture(event: ReactPointerEvent<HTMLElement>) {
            if (session.current?.id === event.pointerId) cancel('lost-capture')
        },
    }
}
