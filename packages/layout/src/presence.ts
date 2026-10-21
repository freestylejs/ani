import {
    type AnimationNode,
    type AnimationStateShape,
    ani,
    createStates,
    type GroupableRecord,
    type RunResult,
    type StateProps,
    timing,
} from '@freestylejs/ani-core'
import type {
    PresenceExitResult,
    PresenceHandle,
    PresenceMotion,
    PresenceOptions,
} from './types'

const DEFAULT_MAX_EXIT_MS = 10_000
const SNAP_DURATION = 0.01

function jumpNode<G extends GroupableRecord>(present: G): AnimationNode<G> {
    const node = ani<GroupableRecord>({
        to: present,
        duration: SNAP_DURATION,
        timing: timing.linear(),
    })
    return node as unknown as AnimationNode<G>
}

function exitResult(result: RunResult): PresenceExitResult {
    switch (result) {
        case 'ended':
            return 'exited'
        case 'disposed':
            return 'disposed'
        case 'interrupted':
        case 'reset':
        case 'skipped':
            return 'interrupted'
    }
}

/**
 * Per-element presence handle.
 *
 * The element is owned by the caller. `createPresence` owns the state machine,
 * the exit/enter timelines and the watchdog. It never unmounts anything.
 */
export function createPresence<G extends GroupableRecord>(
    element: HTMLElement,
    motion: PresenceMotion<G>,
    options: PresenceOptions = {}
): PresenceHandle {
    const present = jumpNode(motion.present)
    const enter = motion.enter ?? present
    const machine = createStates({
        initial: 'present',
        states: {
            present,
            enter,
            exit: motion.exit,
        },
        initialValue: motion.present,
        clock: options.clock,
        reducedMotion: options.reducedMotion,
    } as unknown as StateProps<AnimationStateShape>)

    let unbind: (() => void) | null = null
    const offTransition = machine.onTransition((_state, timeline) => {
        transitioned = true
        unbind?.()
        unbind = timeline.bind(
            element,
            options.resolver ? { resolver: options.resolver } : undefined
        )
    })

    let phase: PresenceHandle['phase'] = 'present'
    let disposed = false
    let transitioned = false
    let exitGeneration = 0
    let enterGeneration = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    let resolveExit: ((result: PresenceExitResult) => void) | null = null
    let exitPromise: Promise<PresenceExitResult> | null = null

    const clearTimer = (): void => {
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
    }

    const finishExit = (result: PresenceExitResult): void => {
        if (result === 'exited' || result === 'timeout') phase = 'exited'
        clearTimer()
        const resolve = resolveExit
        resolveExit = null
        exitPromise = null
        resolve?.(result)
    }

    const armWatchdog = (generation: number): void => {
        clearTimer()
        const configured = options.maxExitMs
        if (configured === Infinity) return
        const duration = machine.timeline().duration
        const fallback = Number.isFinite(duration)
            ? duration * 1000 + 1000
            : DEFAULT_MAX_EXIT_MS
        const delay = configured ?? fallback
        if (!Number.isFinite(delay) || delay < 0) return
        timer = setTimeout(() => {
            if (
                disposed ||
                phase !== 'exiting' ||
                generation !== exitGeneration
            ) {
                return
            }
            machine.dispose()
            finishExit('timeout')
        }, delay)
    }

    const handle: PresenceHandle = {
        get phase() {
            return phase
        },

        enter(): Promise<RunResult> {
            if (disposed) return Promise.resolve('disposed')
            clearTimer()
            if (phase === 'exiting') {
                exitGeneration++
                finishExit('interrupted')
            }
            phase = 'entering'
            const generation = ++enterGeneration
            const run = transitioned
                ? machine.transitionTo('enter')
                : machine.transitionTo('enter', {
                      from: motion.initial ?? motion.present,
                  })
            return run.then((result) => {
                if (
                    !disposed &&
                    phase !== 'exiting' &&
                    generation === enterGeneration
                ) {
                    phase = 'present'
                }
                return result
            })
        },

        exit(): Promise<PresenceExitResult> {
            if (disposed) return Promise.resolve('disposed')
            if (exitPromise) return exitPromise
            enterGeneration++
            const generation = ++exitGeneration
            phase = 'exiting'
            let resolve!: (result: PresenceExitResult) => void
            const promise = new Promise<PresenceExitResult>((done) => {
                resolve = done
            })
            exitPromise = promise
            resolveExit = resolve
            void machine.transitionTo('exit').then((result) => {
                if (
                    disposed ||
                    phase !== 'exiting' ||
                    generation !== exitGeneration
                ) {
                    return
                }
                finishExit(exitResult(result))
            })
            armWatchdog(generation)
            return promise
        },

        dispose(): void {
            if (disposed) return
            disposed = true
            exitGeneration++
            enterGeneration++
            clearTimer()
            finishExit('disposed')
            phase = 'exited'
            offTransition()
            unbind?.()
            unbind = null
            machine.dispose()
        },
    }

    return handle
}
