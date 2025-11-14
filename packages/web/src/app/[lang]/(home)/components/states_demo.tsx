'use client'

import { a } from '@freestylejs/ani-core'
import { useAniRef, useAniStates } from '@freestylejs/ani-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useAppear } from './timeline'

const Spring = a.timing.spring({ m: 1, k: 100, c: 10 })

export function StatesDemo() {
    const ref = useRef<HTMLButtonElement>(null)

    useAppear(ref)

    const [Ani, setCurrentState] = useAniStates({
        initial: 'idle',
        initialFrom: {
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

    useAniRef(ref, {
        timeline: Ani.timeline,
    })

    const handleClick = () => {
        setCurrentState('loading')

        setTimeout(() => {
            setCurrentState('success')
            setTimeout(() => {
                setCurrentState('idle')
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
                ref={ref}
                className="cursor-pointer text-xl"
                onClick={handleClick}
                variant={
                    Ani.state === 'idle'
                        ? 'outline'
                        : Ani.state === 'loading'
                          ? 'ghost'
                          : 'glow'
                }
                disabled={Ani.state !== 'idle'}
            >
                {stateText[Ani.state]}
            </Button>
        </div>
    )
}
