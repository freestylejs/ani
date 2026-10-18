/**
 * Deterministic frame source for clock tests: callbacks registered during a
 * frame run on the next one, exactly like requestAnimationFrame.
 */
export function createFrameDriver(startTime = 1000) {
    let nextId = 1
    let time = startTime
    const pending = new Map<number, (timestamp: number) => void>()
    const stats = { requested: 0, cancelled: 0 }

    return {
        stats,
        requestFrame: (callback: (timestamp: number) => void): number => {
            const id = nextId++
            pending.set(id, callback)
            stats.requested++
            return id
        },
        cancelFrame: (id: number): void => {
            if (pending.delete(id)) stats.cancelled++
        },
        now: (): number => time,
        setNow(value: number): void {
            time = value
        },
        /** number of outstanding frame requests */
        get pending(): number {
            return pending.size
        },
        /** run one display frame `ms` after the previous one */
        frame(ms = 16): void {
            time += ms
            const callbacks = [...pending.values()]
            pending.clear()
            for (const callback of callbacks) callback(time)
        },
        /** simulate an environment that silently loses queued frames */
        drop(): void {
            pending.clear()
        },
    }
}
