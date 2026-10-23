// CP2 spike S1: helpers the compiled fixture calls (kept out of the compiler).
import type { Dispatch, SetStateAction } from 'react'
import type { AppState } from './spike_s1_fixture'

export const controls: {
    setState: Dispatch<SetStateAction<AppState>> | null
    toggleBanner: (() => void) | null
} = { setState: null, toggleBanner: null }

export function busy(ms: number): void {
    const end = performance.now() + ms
    while (performance.now() < end) {
        // deliberately busy: makes concurrent renders span several tasks
    }
}

interface Resource {
    status: 'pending' | 'done'
    promise: Promise<void>
}

const resources = new Map<number, Resource>()

/** Suspends while `key` is odd and its 50 ms load has not finished. */
export function readResource(key: number): string {
    if (key % 2 === 0) return `ready ${key}`
    let resource = resources.get(key)
    if (!resource) {
        const created: Resource = {
            status: 'pending',
            promise: new Promise<void>((resolve) =>
                setTimeout(resolve, 50)
            ).then(() => {
                created.status = 'done'
            }),
        }
        resource = created
        resources.set(key, created)
    }
    if (resource.status === 'pending') throw resource.promise
    return `loaded ${key}`
}

export function resetResources(): void {
    resources.clear()
}
