import { describe, expect, it } from 'vitest'
import { anchorOrigin, compileChildProjection } from './compiler'

describe('depth-1 projection compiler', () => {
    it('inverts a parent translate and scale for a box child', () => {
        const result = compileChildProjection(
            {
                after: { x: 60, y: 0, width: 160, height: 100 },
                dx: -60,
                dy: 0,
                sx: 0.625,
                sy: 1,
                mode: 'box',
            },
            {
                before: { x: 10, y: 10, width: 20, height: 20 },
                after: { x: 70, y: 10, width: 20, height: 20 },
                mode: 'box',
            }
        )
        expect(result).toEqual({ dx: 6, dy: 0, sx: 1.6, sy: 1 })
    })

    it('keeps position children unscaled and rejects a degenerate parent', () => {
        const result = compileChildProjection(
            {
                after: { x: 0, y: 0, width: 10, height: 10 },
                dx: 10,
                dy: 0,
                sx: 1,
                sy: 1,
                mode: 'position',
            },
            {
                before: { x: 0, y: 0, width: 10, height: 10 },
                after: { x: 10, y: 0, width: 10, height: 10 },
                mode: 'position',
            }
        )
        expect(result).toEqual({ dx: -20, dy: 0, sx: 1, sy: 1 })
        expect(
            compileChildProjection(
                {
                    after: { x: 0, y: 0, width: 10, height: 10 },
                    dx: 0,
                    dy: 0,
                    sx: 0,
                    sy: 1,
                    mode: 'box',
                },
                {
                    before: { x: 0, y: 0, width: 10, height: 10 },
                    after: { x: 0, y: 0, width: 10, height: 10 },
                    mode: 'box',
                }
            )
        ).toBeNull()
    })

    it('clamps anchors for all corners', () => {
        expect(anchorOrigin({ x: 0, y: 0 }, 100, 50)).toEqual({ x: 0, y: 0 })
        expect(anchorOrigin({ x: 0.5, y: 0.5 }, 100, 50)).toEqual({
            x: 50,
            y: 25,
        })
        expect(anchorOrigin({ x: 1, y: 1 }, 100, 50)).toEqual({
            x: 100,
            y: 50,
        })
        expect(anchorOrigin({ x: -1, y: 2 }, 100, 50)).toEqual({
            x: 0,
            y: 50,
        })
    })
})
