import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    COMMIT_HZ_MAX,
    COMMIT_HZ_MIN,
    costOutcome,
    costValidity,
} from './cost_validity.ts'

const valid = { g: 0.005, commits: 300, commitHz: 59.9 }

test('a 60 Hz, 300-commit, fine-timer run is valid', () => {
    const result = costValidity(valid)
    assert.equal(result.valid, true)
    assert.equal(result.timerValid, true)
    assert.equal(result.cadenceValid, true)
    assert.deepEqual(result.reasons, [])
})

test('N3: 42 Hz is outside the stated 58.5-61.5 Hz tolerance and blocks', () => {
    const result = costValidity({ ...valid, commitHz: 42 })
    assert.equal(result.valid, false)
    assert.equal(result.cadenceValid, false)
    assert.match(result.reasons.join(';'), /42\.00 Hz/)
    assert.match(result.reasons.join(';'), /58\.5-61\.5/)
})

test('N3: the tolerance boundaries are inclusive', () => {
    assert.equal(
        costValidity({ ...valid, commitHz: COMMIT_HZ_MIN }).valid,
        true
    )
    assert.equal(
        costValidity({ ...valid, commitHz: COMMIT_HZ_MAX }).valid,
        true
    )
    assert.equal(
        costValidity({ ...valid, commitHz: COMMIT_HZ_MIN - 0.01 }).valid,
        false
    )
    assert.equal(
        costValidity({ ...valid, commitHz: COMMIT_HZ_MAX + 0.01 }).valid,
        false
    )
})

test('N3: a coarse timer is BLOCK even with a valid cadence', () => {
    const result = costValidity({ ...valid, g: 1 })
    assert.equal(result.valid, false)
    assert.equal(result.timerValid, false)
    assert.equal(result.cadenceValid, true)
    assert.match(result.reasons.join(';'), /quantized/)
})

test('N3: a short commit count is invalid', () => {
    const result = costValidity({ ...valid, commits: 299 })
    assert.equal(result.valid, false)
    assert.match(result.reasons.join(';'), /299 commits/)
})

test('N9/H16: an all-green valid run with measured G12 is pass', () => {
    const result = costOutcome({
        valid: true,
        metricsPass: true,
    })
    assert.equal(result.status, 'pass')
    assert.equal(result.pass, true)
    assert.equal(result.pending, null)
})

test('N9/H16: a measured G12 failure is fail, not pending', () => {
    const result = costOutcome({
        valid: true,
        metricsPass: false,
    })
    assert.equal(result.status, 'fail')
    assert.equal(result.pass, false)
    assert.equal(result.pending, null)
})

test('N9/H16: an invalid run is blocked and never pass', () => {
    const result = costOutcome({
        valid: false,
        metricsPass: true,
    })
    assert.equal(result.status, 'blocked')
    assert.equal(result.pass, false)
})
