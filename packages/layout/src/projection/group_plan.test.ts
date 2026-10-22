import { describe, expect, it, vi } from 'vitest'
import { cancelGroupRun, finishGroupRun, type GroupRun } from './group_plan'

function run(animations: Animation[]): GroupRun {
    return {
        animations,
        elements: [],
        plans: [],
        startTime: 0,
        resolve: vi.fn(),
    }
}

describe('group plan lifecycle', () => {
    it('cancels every animation and tolerates already-canceled entries', () => {
        const cancel = vi.fn()
        const thrower = {
            cancel: vi.fn(() => {
                throw new Error('canceled')
            }),
        }
        cancelGroupRun(
            run([
                { cancel } as unknown as Animation,
                thrower as unknown as Animation,
            ])
        )
        expect(cancel).toHaveBeenCalledTimes(1)
        expect(thrower.cancel).toHaveBeenCalledTimes(1)
    })

    it('finishes then cancels every animation and tolerates failures', () => {
        const finish = vi.fn()
        const cancel = vi.fn()
        const thrower = {
            finish: vi.fn(() => {
                throw new Error('finished')
            }),
            cancel: vi.fn(),
        }
        finishGroupRun(
            run([
                { finish, cancel } as unknown as Animation,
                thrower as unknown as Animation,
            ])
        )
        expect(finish).toHaveBeenCalledTimes(1)
        expect(cancel).toHaveBeenCalledTimes(1)
        expect(thrower.cancel).toHaveBeenCalledTimes(1)
    })
})
