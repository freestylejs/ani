import { describe, expect, it } from 'vitest'
import { EditSet } from '../edits'

describe('COD: EditSet', () => {
    it('applies replacements and insertions in source order', () => {
        const edits = new EditSet('0123456789')
        edits.replace(6, 8, 'X')
        edits.insert(2, 'a')
        edits.insert(2, 'b')
        expect(edits.result()).toBe('01ab2345X89')
    })

    it('render applies only the edits inside the range', () => {
        const edits = new EditSet('0123456789')
        edits.replace(2, 3, 'X')
        edits.replace(8, 9, 'Y')
        expect(edits.render(1, 5)).toBe('1X34')
    })

    it('a later replace swallows the edits nested in it', () => {
        const edits = new EditSet('0123456789')
        edits.replace(3, 4, 'X')
        edits.replace(2, 6, edits.render(2, 6).toUpperCase())
        expect(edits.result()).toBe('01' + '2X45'.toUpperCase() + '6789')
    })

    it('drops an edit that overlaps an earlier one', () => {
        const edits = new EditSet('0123456789')
        edits.replace(2, 6, 'X')
        edits.replace(4, 8, 'Y')
        expect(edits.result()).toBe('01X6789')
    })
})
