import { a } from '@freestylejs/ani-core'
import { useAniRef } from '@freestylejs/ani-react'
import { useEffect } from 'react'

export const timeline = {
    appear: a.dynamicTimeline(
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
    const c = useAniRef(ref, { timeline: timeline.appear })
    useEffect(() => {
        if (!ref.current) {
            return
        }

        c.play({ from: { opacity: 0, scale: 0 } })

        return () => {
            c.reset()
        }
    }, [])
}
