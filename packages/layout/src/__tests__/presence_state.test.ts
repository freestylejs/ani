// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { reconcilePresence, settlePresence } from '../presence_state'
import type { PresenceEntry } from '../types'

const entries = (...keys: Array<[string, string]>): PresenceEntry<string>[] =>
    keys.map(([key, item]) => ({
        key,
        item,
        present: true,
        token: 0,
    }))

describe('reconcilePresence', () => {
    it('keeps the same array identity when nothing changes', () => {
        const previous = entries(['a', 'A'], ['b', 'B'])
        const next = reconcilePresence(previous, [
            ['a', 'A'],
            ['b', 'B'],
        ])
        expect(next).toBe(previous)
    })

    it('marks removed keys exiting with a new token', () => {
        const previous = entries(['a', 'A'], ['b', 'B'])
        const next = reconcilePresence(previous, [['a', 'A']])
        expect(next).not.toBe(previous)
        expect(next[0]).toMatchObject({ key: 'a', present: true, token: 0 })
        expect(next[1]).toMatchObject({
            key: 'b',
            item: 'B',
            present: false,
            token: 1,
        })
    })

    it('re-enters an exiting key without bumping the token', () => {
        const previous = reconcilePresence(entries(['a', 'A'], ['b', 'B']), [
            ['a', 'A'],
        ])
        const next = reconcilePresence(previous, [
            ['a', 'A'],
            ['b', 'B2'],
        ])
        expect(next[1]).toMatchObject({
            key: 'b',
            item: 'B2',
            present: true,
            token: 1,
        })
    })

    it('bumps the token again after a second removal', () => {
        const once = reconcilePresence(entries(['a', 'A'], ['b', 'B']), [
            ['a', 'A'],
        ])
        const reentered = reconcilePresence(once, [
            ['a', 'A'],
            ['b', 'B'],
        ])
        const twice = reconcilePresence(reentered, [['a', 'A']])
        expect(twice[1]).toMatchObject({ key: 'b', present: false, token: 2 })
    })

    it('keeps exiting entries near their previous position', () => {
        const previous = entries(['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D'])
        const next = reconcilePresence(previous, [
            ['a', 'A'],
            ['d', 'D'],
        ])
        expect(next.map((entry) => entry.key)).toEqual(['a', 'b', 'c', 'd'])
        expect(next.map((entry) => entry.present)).toEqual([
            true,
            false,
            false,
            true,
        ])
    })

    it('uses next order for present entries', () => {
        const previous = entries(['a', 'A'], ['b', 'B'], ['c', 'C'])
        const next = reconcilePresence(previous, [
            ['c', 'C'],
            ['a', 'A'],
            ['b', 'B'],
        ])
        expect(next.map((entry) => entry.key)).toEqual(['c', 'a', 'b'])
    })

    it('last duplicate key wins', () => {
        const next = reconcilePresence(
            [],
            [
                ['a', 'first'],
                ['a', 'last'],
            ]
        )
        expect(next).toHaveLength(1)
        expect(next[0]!.item).toBe('last')
    })

    it('preserves invariants over random add/remove/re-add sequences', () => {
        let seed = 1
        const random = (): number => {
            seed = (seed * 1664525 + 1013904223) >>> 0
            return seed / 0x100000000
        }
        let previous: PresenceEntry<string>[] = []
        const live = new Map<string, string>()

        for (let step = 0; step < 300; step++) {
            const key = `k${Math.floor(random() * 10)}`
            if (random() < 0.56) {
                live.set(key, `v${step}`)
            } else {
                live.delete(key)
            }

            const next = reconcilePresence(previous, live)
            const keys = next.map((entry) => entry.key)
            expect(new Set(keys).size).toBe(keys.length)

            for (const entry of next) {
                if (live.has(entry.key)) {
                    expect(entry.present).toBe(true)
                    expect(entry.item).toBe(live.get(entry.key))
                } else {
                    expect(entry.present).toBe(false)
                    expect(entry.token).toBeGreaterThan(0)
                }

                if (!entry.present) {
                    expect(
                        settlePresence(next, entry.key, entry.token - 1)
                    ).toBe(next)
                }
            }

            expect(reconcilePresence(next, live)).toBe(next)
            previous = next
        }
    })
})

describe('settlePresence', () => {
    it('removes only a matching exiting token', () => {
        const previous = reconcilePresence(entries(['a', 'A'], ['b', 'B']), [
            ['a', 'A'],
        ])
        expect(settlePresence(previous, 'b', 0)).toBe(previous)
        expect(settlePresence(previous, 'b', 1)).toEqual([
            { key: 'a', item: 'A', present: true, token: 0 },
        ])
    })

    it('never removes a present entry', () => {
        const previous = entries(['a', 'A'])
        expect(settlePresence(previous, 'a', 0)).toBe(previous)
    })
})
