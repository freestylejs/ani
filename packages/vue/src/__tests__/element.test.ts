// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { ComponentPublicInstance } from 'vue'
import { createElementBinder, resolveTarget } from '../ani/element'

const instance = (el: unknown) => ({ $el: el }) as ComponentPublicInstance

describe('resolveTarget', () => {
    it('returns an element, or the $el of a component instance', () => {
        const el = document.createElement('div')
        expect(resolveTarget(el)).toBe(el)
        expect(resolveTarget(instance(el))).toBe(el)
    })

    it('ignores null and nodes without a style', () => {
        expect(resolveTarget(null)).toBeNull()
        expect(resolveTarget(instance(document.createTextNode('x')))).toBeNull()
        expect(resolveTarget(instance(null))).toBeNull()
        expect(resolveTarget(instance('text'))).toBeNull()
    })
})

describe('createElementBinder', () => {
    it('binds once per element and unbinds on null', () => {
        const unbind = vi.fn()
        const attach = vi.fn(() => unbind)
        const binder = createElementBinder(attach)
        const el = document.createElement('div')

        binder.set(el)
        binder.set(el)
        expect(attach).toHaveBeenCalledTimes(1)

        binder.set(null)
        expect(unbind).toHaveBeenCalledTimes(1)
        binder.set(null)
        expect(unbind).toHaveBeenCalledTimes(1)
    })

    it('moves the binding to another element and rebinds on demand', () => {
        const unbind = vi.fn()
        const attach = vi.fn(() => unbind)
        const binder = createElementBinder(attach)
        const first = document.createElement('div')
        const second = document.createElement('div')

        binder.rebind()
        expect(attach).not.toHaveBeenCalled()

        binder.set(first)
        binder.set(second)
        expect(unbind).toHaveBeenCalledTimes(1)
        expect(attach).toHaveBeenLastCalledWith(second)

        binder.rebind()
        expect(unbind).toHaveBeenCalledTimes(2)
        expect(attach).toHaveBeenCalledTimes(3)

        binder.dispose()
        expect(unbind).toHaveBeenCalledTimes(3)
        binder.rebind()
        expect(attach).toHaveBeenCalledTimes(3)
    })
})
