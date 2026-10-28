import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    aggregateRatio,
    frameSamples,
    granularity,
    median,
    percentile,
} from './stats.ts'

test('nearest-rank percentiles', () => {
    const values = [5, 1, 4, 2, 3]
    assert.equal(percentile(values, 0.2), 1)
    assert.equal(percentile(values, 0.5), 3)
    assert.equal(percentile(values, 0.95), 5)
    assert.equal(percentile([7], 1), 7)
    assert.throws(() => percentile([], 0.5))
})

test('median odd and even', () => {
    assert.equal(median([3, 1, 2]), 2)
    assert.equal(median([4, 1, 3, 2]), 2.5)
    assert.equal(median([9]), 9)
    assert.throws(() => median([]))
})

test('g is the smallest non-zero delta', () => {
    assert.ok(Math.abs(granularity([1, 1.1, 1.2, 1.5]) - 0.1) < 1e-12)
    assert.equal(granularity([1, 1, 1]), 0)
    assert.equal(granularity([]), 0)
})

test('g <= 0.05 keeps one sample per frame', () => {
    const result = frameSamples([1, 2, 3], 0.005)
    assert.deepEqual(result.samples, [1, 2, 3])
    assert.equal(result.mode, 'frame')
    assert.equal(result.errorBound, 0.0025)
})

test('a coarse g does not average quantized frames into a fake 20-frame mean', () => {
    const result = frameSamples([1, 1, 3, 3], 1)
    assert.deepEqual(result.samples, [1, 1, 3, 3])
    assert.equal(result.mode, 'quantized')
    assert.equal(result.errorBound, 0.5)
    assert.match(result.detail, /20-frame mean not claimed/)
})

test('aggregateRatio is the median of per-run ratios', () => {
    assert.equal(aggregateRatio([2, 4, 6], [1, 2, 3]), 2)
    assert.throws(() => aggregateRatio([1], [1, 2]))
})
