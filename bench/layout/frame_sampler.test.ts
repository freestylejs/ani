import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FrameSampler } from './frame_sampler.ts'

test('a commit between two frames marks the next frame, never the previous', () => {
    const sampler = new FrameSampler()
    sampler.record(100, 1)
    sampler.markCommit()
    sampler.record(116, 2)
    sampler.stop()
    assert.equal(sampler.frames.length, 2)
    assert.equal(sampler.frames[0]!.commit, false)
    assert.equal(sampler.frames[1]!.commit, true)
})

test('a commit inside a callback marks that callback frame', () => {
    const sampler = new FrameSampler()
    sampler.frame(100, () => sampler.markCommitInFrame())
    sampler.record(116, 1)
    sampler.stop()
    assert.equal(sampler.frames[0]!.commit, true)
    assert.equal(sampler.frames[1]!.commit, false)
})

test('script done between frames is charged to the next frame', () => {
    const sampler = new FrameSampler()
    sampler.record(100, 1)
    sampler.addScript(5)
    sampler.record(116, 2)
    sampler.stop()
    assert.equal(sampler.frames[0]!.ms, 1)
    assert.equal(sampler.frames[1]!.ms, 7)
})

test('stop flushes the last batch once', () => {
    const sampler = new FrameSampler()
    sampler.record(100, 1.5)
    sampler.stop()
    sampler.stop()
    assert.equal(sampler.frames.length, 1)
    assert.equal(sampler.frames[0]!.ms, 1.5)
})
