/**
 * A bind target: `{ style }` where `style` records the last value written per
 * property. Core's style writer assigns camelCase keys and calls
 * `setProperty` for hyphenated ones; nothing else is used.
 */
export interface FakeElement {
    readonly id: number
    readonly style: object
    /** Last written text per property. */
    readonly last: Map<string, string>
    writes: number
    /** Set once the owner disposed or unbound it: any later write is a bug. */
    dead: boolean
}

export function createFakeElement(
    id: number,
    onDeadWrite: (element: FakeElement) => void
): FakeElement {
    const last = new Map<string, string>()
    const record = (key: string, value: unknown): void => {
        element.last.set(key, String(value))
        element.writes++
        if (element.dead) onDeadWrite(element)
    }
    const style = new Proxy(
        {},
        {
            set(_target, key, value) {
                if (typeof key === 'string') record(key, value)
                return true
            },
            get(_target, key) {
                if (key === 'setProperty') return record
                return typeof key === 'string' ? last.get(key) : undefined
            },
        }
    )
    const element: FakeElement = { id, style, last, writes: 0, dead: false }
    return element
}

const TRANSFORM_PART = /(\w+)\(([^)]*)\)/g

/**
 * Reads the numbers back from what was written: `transform` is split into its
 * functions, every other property is `<number>[unit]`.
 */
export function parseWritten(element: FakeElement): Record<string, number> {
    const parsed: Record<string, number> = {}
    for (const [key, text] of element.last) {
        if (key === 'transform') {
            for (const part of text.matchAll(TRANSFORM_PART)) {
                parsed[part[1]!] = Number.parseFloat(part[2]!)
            }
        } else {
            parsed[key] = Number.parseFloat(text)
        }
    }
    return parsed
}
