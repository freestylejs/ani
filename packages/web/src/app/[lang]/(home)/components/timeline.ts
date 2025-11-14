import { a } from '@freestylejs/ani-core'
import { useAniRef } from '@freestylejs/ani-react/index'
import { useEffect } from 'react'

export const timeline = {
    appear: a.timeline(
        a.sequence(
            [
                a.ani({
                    duration: 0.5,
                    to: { scale: 0.75, opacity: 0 },
                }),
                a.ani({
                    duration: 1.5,
                    to: { scale: 1, opacity: 1 },
                }),
            ],
            a.timing.spring({ m: 1, k: 200, c: 10 })
        )
    ),
}

export const useAppear = <T extends HTMLElement>(
    ref: React.RefObject<T | null>
) => {
    const creationControllers = useAniRef(ref, { timeline: timeline.appear })

    useEffect(() => {
        creationControllers.play({ from: { opacity: 0, scale: 0 } })
    }, [])
}
