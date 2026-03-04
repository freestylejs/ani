import { describe, expect, it } from 'vitest'
import { EventManager } from '../manager'

class MockElement {
    private listeners = new Map<string, Set<EventListener>>()

    public addEventListener(
        eventName: string,
        listener: EventListenerOrEventListenerObject
    ): void {
        const targetListener = listener as EventListener
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, new Set())
        }
        this.listeners.get(eventName)!.add(targetListener)
    }

    public removeEventListener(
        eventName: string,
        listener: EventListenerOrEventListenerObject
    ): void {
        const targetListener = listener as EventListener
        this.listeners.get(eventName)?.delete(targetListener)
    }

    public count(eventName: string): number {
        return this.listeners.get(eventName)?.size ?? 0
    }
}

describe('EventManager', () => {
    it('should remove listener mapping after cleanupOne', () => {
        const manager = new EventManager(['click'] as const)
        const element = new MockElement()

        manager.bind(element as unknown as HTMLElement)
        manager.setAnimeGetter(() => ({ value: 0 }))
        manager.add('click', () => {})

        expect(element.count('click')).toBe(1)
        expect(manager.cleanupOne('click')).toBe(true)
        expect(element.count('click')).toBe(0)

        // Should be false after first cleanup if internal map is also cleaned.
        expect(manager.cleanupOne('click')).toBe(false)
    })
})
