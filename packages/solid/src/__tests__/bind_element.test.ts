// @vitest-environment jsdom

import { createRoot, createSignal } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { createBinder, createInitialStyle } from '../ani/bind_element'

describe('createInitialStyle', () => {
    it('is undefined without an initial value', () => {
        expect(createInitialStyle(undefined, undefined)).toBeUndefined()
    })

    it('uses kebab-case keys and keeps custom properties', () => {
        expect(
            createInitialStyle(
                { opacity: 0.5, borderRadius: 4, x: 1 },
                { x: (v: number) => ({ key: '--x', value: `${v}px` }) }
            )
        ).toEqual({ opacity: 0.5, 'border-radius': '4px', '--x': '1px' })
    })

    it('joins transform functions into one declaration', () => {
        expect(
            createInitialStyle({ translateX: 10, scale: 2 }, undefined)
        ).toEqual({ transform: 'translateX(10px) scale(2)' })
    })
})

describe('createBinder', () => {
    it('releases a binding with its owner, once', () => {
        const release = vi.fn()
        const dispose = createRoot((d) => {
            createBinder(() => 1, false)(() => release)
            return d
        })
        expect(release).not.toHaveBeenCalled()
        dispose()
        dispose()
        expect(release).toHaveBeenCalledTimes(1)
    })

    it('rebinds every attached element when the source changes', () => {
        const released: number[] = []
        const bound: number[] = []
        const [source, setSource] = createSignal(1)
        const dispose = createRoot((d) => {
            const attach = createBinder(source, true)
            const bind = (value: number) => {
                bound.push(value)
                return () => released.push(value)
            }
            attach(bind)
            attach(bind)
            return d
        })
        expect(bound).toEqual([1, 1])
        setSource(2)
        expect(released).toEqual([1, 1])
        expect(bound).toEqual([1, 1, 2, 2])
        dispose()
        expect(released).toEqual([1, 1, 2, 2])
    })
})
