import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    type Box,
    bezierAt,
    bezierSlope0,
    coverage,
    crossfade,
    EASE_IN,
    EASE_OUT,
    edgeError,
    integrateSpring,
    LINEAR,
    perceptualSpring,
    settleOfBox,
    springDisplacement,
    springSettle,
    trackState,
} from './oracle.ts'

const W = 2 * Math.PI

function close(
    actual: number,
    expected: number,
    tolerance: number,
    label: string
) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${label}: ${actual} vs ${expected} (${Math.abs(actual - expected)} > ${tolerance})`
    )
}

test('critically damped spring against the hand-computed form', () => {
    const t = 0.1
    const e = Math.exp(-W * t)
    const expectedD = (1 + W * t) * e
    const expectedV = -W * W * t * e
    const got = springDisplacement(1, 0, 1, 0, t)
    close(got.d, expectedD, 1e-12, 'd(0.1)')
    close(got.v, expectedV, 1e-12, 'v(0.1)')
})

test('underdamped spring against the hand-computed form', () => {
    const t = 0.05
    const z = 0.5
    const w = W
    const wd = w * Math.sqrt(1 - z * z)
    const b = (0 + z * w * 1) / wd
    const e = Math.exp(-z * w * t)
    const expectedD = e * (Math.cos(wd * t) + b * Math.sin(wd * t))
    const expectedV =
        -z * w * expectedD +
        e * (-wd * Math.sin(wd * t) + b * wd * Math.cos(wd * t))
    const got = springDisplacement(1, 0.5, 1, 0, t)
    close(got.d, expectedD, 1e-12, 'd(0.05)')
    close(got.v, expectedV, 1e-12, 'v(0.05)')
})

test('overdamped spring against the hand-computed form', () => {
    const t = 0.15
    const z = 2
    const w = W
    const q = Math.sqrt(z * z - 1)
    const r1 = -w * (z - q)
    const r2 = -w * (z + q)
    const c1 = (0 - r2) / (r1 - r2)
    const c2 = 1 - c1
    const expectedD = c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t)
    const expectedV = c1 * r1 * Math.exp(r1 * t) + c2 * r2 * Math.exp(r2 * t)
    const got = springDisplacement(1, -0.5, 1, 0, t)
    close(got.d, expectedD, 1e-12, 'd(0.15)')
    close(got.v, expectedV, 1e-12, 'v(0.15)')
})

test('incoming velocity is exact at t = 0 on every damping branch', () => {
    for (const bounce of [-0.5, 0, 0.5]) {
        const got = springDisplacement(0.55, bounce, 120, -340, 0)
        assert.equal(got.d, 120)
        assert.equal(got.v, -340)
    }
})

test('RK4 agrees with the closed form and a 0.01 ms reference integration', () => {
    for (const bounce of [-0.4, 0, 0.35]) {
        const at = 0.35
        const closed = springDisplacement(0.55, bounce, 240, -180, at)
        const rk = integrateSpring(0.55, bounce, 240, -180, at, 0.00002)
        const reference = integrateSpring(0.55, bounce, 240, -180, at, 0.00001)
        close(rk.d, closed.d, 1e-9, `rk d b=${bounce}`)
        close(rk.v, closed.v, 1e-6, `rk v b=${bounce}`)
        close(rk.d, reference.d, 1e-6, `reference d b=${bounce}`)
    }
})

test('the authority settle example: 300 px, D 0.55, bounce 0 settles at 0.918 s', () => {
    const settle = springSettle(0.55, 0, 300, 0)
    close(settle, 0.918, 0.002, 'settle')
    // and not earlier than the physical tolerance allows
    const early = springDisplacement(0.55, 0, 300, 0, settle - 0.01)
    assert.ok(Math.abs(early.d) > 0.1 || Math.abs(early.v) > 1)
})

test('settle is the first time the tolerances hold, checked after the fact', () => {
    const settle = springSettle(0.55, 0.05, 358, -120)
    for (const t of [settle, settle + 0.05, settle + 0.2, settle + 1]) {
        const { d, v } = springDisplacement(0.55, 0.05, 358, -120, t)
        assert.ok(Math.abs(d) <= 0.1 + 1e-9, `|d| at ${t}`)
        assert.ok(Math.abs(v) <= 1 + 1e-9, `|v| at ${t}`)
    }
    const before = springDisplacement(0.55, 0.05, 358, -120, settle - 0.001)
    assert.ok(
        Math.abs(before.d) > 0.1 || Math.abs(before.v) > 1,
        'settle is not conservative'
    )
})

test('settleOfBox includes the composed right and bottom edges', () => {
    // The left edge moves 100 px and the width 10 px, but the right edge
    // moves 110 px: a settle on the channels alone would snap 10 px early.
    const from: Box = { x: 0, y: 0, w: 10, h: 10 }
    const to: Box = { x: 100, y: 100, w: 20, h: 20 }
    const settle = settleOfBox(0.45, 0, from, to, null)
    const left = springSettle(0.45, 0, from.x - to.x, 0)
    const right = springSettle(0.45, 0, from.x + from.w - (to.x + to.w), 0)
    const bottom = springSettle(0.45, 0, from.y + from.h - (to.y + to.h), 0)
    assert.ok(right > left, 'right edge is the later channel')
    close(settle, Math.max(left, right, bottom), 1e-12, 'edge settle')
})

test('the perceptual spring timeline is monotone and exactly 1 at D', () => {
    assert.equal(perceptualSpring(0.55, 0), 0)
    assert.equal(perceptualSpring(0.55, 0.55), 1)
    assert.equal(perceptualSpring(0.55, 1), 1)
    let previous = 0
    for (let i = 0; i <= 100; i++) {
        const p = perceptualSpring(0.55, (0.55 * i) / 100)
        assert.ok(p >= previous - 1e-12)
        previous = p
    }
})

test('cubic bezier endpoints and linear identity', () => {
    assert.equal(bezierAt(LINEAR, 0).value, 0)
    assert.equal(bezierAt(LINEAR, 0.5).value, 0.5)
    assert.equal(bezierAt(LINEAR, 1).value, 1)
    assert.equal(bezierSlope0(LINEAR), 1)
    assert.equal(bezierAt(EASE_OUT, 0).value, 0)
    assert.equal(bezierAt(EASE_OUT, 1).value, 1)
    assert.equal(bezierAt(EASE_IN, 1).value, 1)
    // easeOut leaves quickly: half the progress is reached before half time
    assert.ok(bezierAt(EASE_OUT, 0.5).value > 0.65)
})

test('crossfade coverage is exactly 1 for a new pair', () => {
    for (let i = 0; i <= 100; i++) {
        const p = i / 100
        const { lead, follower } = crossfade(p, 0, 1)
        close(coverage(lead, follower), 1, 1e-12, `coverage p=${p}`)
        assert.ok(lead >= 0 && lead <= 1)
        assert.ok(follower >= 0 && follower <= 1)
    }
})

test('a reversal starts from the current opacities without a pop', () => {
    const at = crossfade(0.4, 0, 1)
    const reversed = crossfade(0, at.follower, at.lead)
    close(reversed.lead, at.follower, 1e-12, 'lead continuity')
    close(reversed.follower, at.lead, 1e-12, 'follower continuity')
})

test('edge error names the worst edge', () => {
    const a: Box = { x: 10, y: 20, w: 100, h: 50 }
    const b: Box = { x: 10, y: 20.1, w: 100, h: 50 }
    const error = edgeError(a, b)
    close(error.max, 0.1, 1e-12, 'max')
    assert.equal(error.edge, 'top')
})

test('high-bounce settles are finite and meet the tolerance', () => {
    for (const bounce of [0.9, -0.8, -0.5]) {
        const settle = springSettle(0.55, bounce, 300, 0)
        assert.ok(Number.isFinite(settle) && settle > 0, `settle b=${bounce}`)
        for (const t of [settle, settle + 0.01, settle + 0.2]) {
            const { d, v } = springDisplacement(0.55, bounce, 300, 0, t)
            assert.ok(Math.abs(d) <= 0.1 + 1e-9, `d b=${bounce} t=${t}`)
            assert.ok(Math.abs(v) <= 1 + 1e-9, `v b=${bounce} t=${t}`)
        }
    }
})

test('a from-rest timing track is the exact curve with k = 0', () => {
    const from: Box = { x: 0, y: 0, w: 0, h: 0 }
    const to: Box = { x: 100, y: -40, w: 0, h: 0 }
    const motion = {
        type: 'timing' as const,
        duration: 0.3,
        easing: 'ease-out' as const,
    }
    for (const elapsed of [0.0, 0.03, 0.096, 0.15, 0.3]) {
        const state = trackState(motion, from, to, null, elapsed, 0.3)
        const e = bezierAt(EASE_OUT, Math.min(1, elapsed / 0.3)).value
        close(state.box.x, 100 * e, 1e-9, 'x from rest')
        close(state.box.y, -40 * e, 1e-9, 'y from rest')
    }
})

test('a moving timing retarget carries the incoming velocity once', () => {
    const from: Box = { x: 0, y: 0, w: 0, h: 0 }
    const to: Box = { x: 100, y: 0, w: 0, h: 0 }
    const motion = {
        type: 'timing' as const,
        duration: 0.3,
        easing: 'ease-out' as const,
    }
    const state = trackState(
        motion,
        from,
        to,
        { x: 50, y: 0, w: 0, h: 0 },
        1e-6,
        0.3
    )
    close(state.velocity.x, 50, 1, 'incoming velocity')
    const atRest = trackState(
        motion,
        from,
        to,
        { x: 50, y: 0, w: 0, h: 0 },
        0.3,
        0.3
    )
    close(atRest.box.x, 100, 1e-9, 'settled target')
})
