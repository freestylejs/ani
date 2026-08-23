// @vitest-environment jsdom

import { createRoot } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('createAniStates', () => {
    afterEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        vi.doUnmock('@freestylejs/ani-core')
    })

    it('cleans up the timeline change subscription on dispose', async () => {
        const unsubscribe = vi.fn()
        const onTimelineChange = vi.fn(() => unsubscribe)

        vi.doMock('@freestylejs/ani-core', async () => {
            const actual = await vi.importActual<
                typeof import('@freestylejs/ani-core')
            >('@freestylejs/ani-core')

            return {
                ...actual,
                createStates: vi.fn(() => ({
                    timeline: () => ({}),
                    onTimelineChange,
                    transitionTo: vi.fn(),
                })),
            }
        })

        const { createAniStates } = await import('../ani/create_ani_states')

        const dispose = createRoot((rootDispose) => {
            createAniStates({
                initial: 'idle',
                initialFrom: { opacity: 0 },
                states: {
                    idle: {} as never,
                },
            })

            return rootDispose
        })

        await Promise.resolve()
        await Promise.resolve()

        expect(onTimelineChange).toHaveBeenCalledTimes(1)
        expect(unsubscribe).not.toHaveBeenCalled()

        dispose()

        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })
})
