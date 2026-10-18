'use client'

import { a } from '@freestylejs/ani-core'
import { useAniStates } from '@freestylejs/ani-react'
import { useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useAppear } from './timeline'

const Spring = a.timing.spring({ m: 1, k: 100, c: 10 })

export const StatesDemo = () => {
    const ref = useRef<HTMLButtonElement | null>(null)

    useAppear(ref)

    const {
        ref: statesRef,
        style,
        state,
        transitionTo,
    } = useAniStates({
        initial: 'idle',
        initialValue: {
            opacity: 1,
            rotate: 0,
            scale: 1,
        },
        states: {
            idle: a.ani({
                to: { scale: 1, opacity: 1, rotate: 0 },
                duration: 0.3,
                timing: Spring,
            }),
            loading: a.loop(
                a.parallel([
                    a.sequence(
                        [
                            a.ani({
                                to: { opacity: 0.5 },
                                duration: 0.5,
                            }),
                            a.ani({
                                to: { opacity: 0.25 },
                                duration: 0.5,
                            }),
                        ],
                        a.timing.linear()
                    ),
                    a.sequence(
                        [
                            a.ani({
                                to: { rotate: 5 },
                                duration: 0.5,
                            }),
                            a.ani({
                                to: { rotate: -7 },
                                duration: 0.5,
                            }),
                        ],
                        Spring
                    ),
                ]),
                3
            ),
            success: a.sequence(
                [
                    a.ani({
                        to: { opacity: 1, scale: 1.5, rotate: 0 },
                        duration: 1,
                    }),
                    a.ani({ to: { scale: 1 }, duration: 0.3 }),
                ],
                Spring
            ),
        },
    })

    // The element is bound by both the appear animation and the state machine.
    const setRef = useCallback(
        (element: HTMLButtonElement | null) => {
            ref.current = element
            statesRef(element)
        },
        [statesRef]
    )

    const handleClick = () => {
        transitionTo('loading')

        setTimeout(() => {
            transitionTo('success')
            setTimeout(() => {
                transitionTo('idle')
            }, 1500)
        }, 2000)
    }

    const stateText = {
        idle: 'Submit',
        loading: 'Loading...',
        success: 'Success!',
    } as const

    return (
        <div className="flex size-full items-center justify-center">
            <Button
                ref={setRef}
                style={style}
                className="inline-flex cursor-pointer text-xl transition-none"
                onClick={handleClick}
                variant={
                    state === 'idle'
                        ? 'outline'
                        : state === 'loading'
                          ? 'ghost'
                          : 'glow'
                }
                disabled={state !== 'idle'}
            >
                {stateText[state]}
            </Button>
        </div>
    )
}

export const statesCode = `
const Spring = a.timing.spring({ m: 1, k: 100, c: 10 })

const StatesDemo = () => {
    const { ref, style, state, transitionTo } = useAniStates({
        initial: 'idle',
        initialValue: {
            opacity: 1,
            rotate: 0,
            scale: 1,
        },
        states: {
            idle: a.ani({
                to: { scale: 1, opacity: 1, rotate: 0 },
                duration: 0.3,
                timing: Spring,
            }),
            loading: a.loop(
                a.parallel([
                    a.sequence(
                        [
                            a.ani({
                                to: { opacity: 0.5 },
                                duration: 0.5,
                            }),
                            a.ani({
                                to: { opacity: 0.25 },
                                duration: 0.5,
                            }),
                        ],
                        a.timing.linear()
                    ),
                    a.sequence(
                        [
                            a.ani({
                                to: { rotate: 5 },
                                duration: 0.5,
                            }),
                            a.ani({
                                to: { rotate: -7 },
                                duration: 0.5,
                            }),
                        ],
                        Spring
                    ),
                ]),
                3
            ),
            success: a.sequence(
                [
                    a.ani({
                        to: { opacity: 1, scale: 1.35, rotate: 0 },
                        duration: 1,
                    }),
                    a.ani({ to: { scale: 1 }, duration: 0.3 }),
                ],
                Spring
            ),
        },
    })

    const stateText = {
        idle: 'Submit',
        loading: 'Loading...',
        success: 'Success!',
    } as const

    return (
        <div className="flex size-full items-center justify-center">
            <Button
                ref={ref}
                style={style}
                className="cursor-pointer text-xl"
                onClick={() => transitionTo('loading')}
                variant={
                    state === 'idle'
                        ? 'outline'
                        : state === 'loading'
                          ? 'ghost'
                          : 'glow'
                }
                disabled={state !== 'idle'}
            >
                {stateText[state]}
            </Button>
        </div>
    )
}
`
