import { timing } from '@freestylejs/ani-core'
import { describe, expect, it, vi } from 'vitest'
import * as geometry from '../geometry'
import { resolveMotion } from '../motion'
import { type SolveNode, solve } from '../solve'
import { trackOf as createTrack } from './nodes'

// counts every map composition the solver makes
const count = vi.hoisted(() => ({ compose: 0 }))
vi.mock('../geometry', async (original) => {
    const actual = await original<typeof geometry>()
    return {
        ...actual,
        compose: (outer: geometry.Map2, inner: geometry.Map2) => {
            count.compose++
            return actual.compose(outer, inner)
        },
    }
})

/**
 * The CP8 trial's J-036 chain: N nested participants, the root moving, every
 * descendant planned at its own flush under a different root layer, so every
 * node has its own epoch.
 */
function chain(n: number): SolveNode[] {
    const motion = resolveMotion([{ duration: 1, timing: timing.linear() }])
    const nodes: SolveNode[] = []
    for (let i = 0; i < n; i++) {
        const a = { x: 0, y: 40 * i, w: 100, h: 40 }
        const layer = geometry.aboutOrigin(
            { tx: 0, ty: 0, sx: 1 + i / 1000, sy: 1 },
            0,
            0
        )
        nodes.push({
            parent: i - 1,
            a,
            box: a,
            ox: 0,
            oy: 40 * i,
            inner: geometry.IDENTITY_MAP,
            track:
                i === 0
                    ? createTrack(
                          { ...a, x: -200 },
                          a,
                          null,
                          0,
                          0,
                          true,
                          motion,
                          null
                      )
                    : createTrack(
                          { ...a, w: 120 },
                          a,
                          null,
                          0,
                          0,
                          true,
                          motion,
                          null
                      ),
            elapsed: 0.2,
            follow: -1,
            fade: null,
            radius: null,
            layers: i === 0 ? null : [{ at: 0, map: layer }],
        })
    }
    return nodes
}

describe('solve: per-frame work (ARCHITECTURE §5.3, CP8 trial J-036)', () => {
    it('distinct epochs on one chain cost four compositions per layered node', () => {
        for (const n of [25, 50, 100, 200]) {
            const nodes = chain(n)
            count.compose = 0
            solve(nodes)
            // Ωₐ∘Γ, ∘Ωₐ⁻¹, corr∘Ω_parent and Ω = corr⁻¹∘full (never needed
            // for the leaf): linear in N, where recomposing every ancestor
            // chain would be N(N−1)/2
            expect(count.compose).toBe(4 * (n - 1) - 1)
        }
    })

    it('a frame without layers composes nothing', () => {
        const nodes = chain(100).map((node) => ({ ...node, layers: null }))
        count.compose = 0
        solve(nodes)
        expect(count.compose).toBe(0)
    })
})
