import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OperationTimeoutError, withTimeout } from './timeout.ts'

test('withTimeout resolves a prompt operation', async () => {
    assert.equal(await withTimeout(Promise.resolve(7), 1000, 'test'), 7)
})

test('withTimeout rejects with the exact stage after the deadline', async () => {
    const stage = 'chromium run 2/5 manual s-card@rm-max evaluate'
    const started = performance.now()
    await assert.rejects(
        withTimeout(new Promise<never>(() => undefined), 20, stage),
        (error: unknown) => {
            assert.ok(error instanceof OperationTimeoutError)
            assert.equal(error.stage, stage)
            assert.equal(error.timeoutMs, 20)
            assert.match(error.message, /timed out after 20 ms/)
            assert.match(
                error.message,
                /chromium run 2\/5 manual s-card@rm-max/
            )
            return true
        }
    )
    // The deadline is the bound, not a busy wait.
    assert.ok(performance.now() - started < 1000)
})

test('withTimeout propagates an ordinary rejection unchanged', async () => {
    const failure = new Error('page crashed')
    await assert.rejects(
        withTimeout(Promise.reject(failure), 1000, 'test'),
        (error: unknown) => error === failure
    )
})

test('withTimeout clears its deadline when the operation wins', async () => {
    // A leaked 200 ms timer would keep the test process alive; the runner
    // completing promptly is the observable assertion.
    assert.equal(await withTimeout(Promise.resolve('ok'), 200, 'test'), 'ok')
})
