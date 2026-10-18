import { a } from '@freestylejs/ani-core'
import { useTimeline } from '@freestylejs/ani-react'
import { useEffect } from 'react'

const createAppear = () =>
    a.rafTimeline(
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
    )

export const useAppear = <T extends HTMLElement>(
    ref: React.RefObject<T | null>
) => {
    const appear = useTimeline(createAppear)

    useEffect(() => {
        const element = ref.current
        if (!element) {
            return
        }

        const unbind = appear.bind(element)
        void appear.play({ from: { opacity: 0, scale: 0 } })

        return () => {
            unbind()
            appear.reset()
        }
    }, [appear, ref])
}
