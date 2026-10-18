// @vitest-environment node

import { a, rafTimeline } from '@freestylejs/ani-core'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { useAni } from '../ani/use_ani'
import { useAniRef } from '../ani/use_ani_ref'
import { useAniStates } from '../ani/use_ani_states'

describe('vue SSR', () => {
    it('renders every composable without window/document and retains nothing', async () => {
        expect(typeof window).toBe('undefined')
        const timeline = rafTimeline(a.ani({ to: { opacity: 1 }, duration: 1 }))
        const html = await renderToString(
            createSSRApp(
                defineComponent({
                    setup() {
                        const [v] = useAni(timeline, { opacity: 0.1 })
                        const [r] = useAniRef({
                            timeline,
                            initialValue: { opacity: 0 },
                            events: { onClick: () => undefined },
                        })
                        const [, s] = useAniStates({
                            initial: 'idle',
                            initialFrom: { opacity: 0 },
                            states: {
                                idle: a.ani({
                                    to: { opacity: 0 },
                                    duration: 1,
                                }),
                            },
                        })
                        return () =>
                            h(
                                'div',
                                { ref: r },
                                `${s.state.value}:${v.value.opacity}`
                            )
                    },
                })
            )
        )
        expect(html).toContain('idle:0.1')
    })
})
