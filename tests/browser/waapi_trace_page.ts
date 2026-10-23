// Page side of `waapi_trace.ts`: a depth-0 'position' move on an engine,
// then a 120 ms main-thread block while it runs.
import { timing } from '@freestylejs/ani-core'
import { createLayoutGroup } from '@freestylejs/ani-layout'

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

export async function run(engine: 'waapi' | 'raf'): Promise<{
    /** The animation's play state as the block starts. */
    state: string
    blockMs: number
}> {
    document.body.style.margin = '0'
    const element = document.createElement('div')
    element.style.cssText =
        'position: absolute; left: 0; top: 0; width: 60px; height: 60px; background: #335;'
    document.body.append(element)
    const group = createLayoutGroup({
        engine,
        motion: { duration: 1, timing: timing.linear() },
    })
    group.add(element, { layout: 'position' })
    await frame()
    group.capture()
    element.style.left = '400px'
    void group.flush()
    // running, and handed to the compositor
    await frame()
    await frame()
    await new Promise((resolve) => setTimeout(resolve, 100))
    const state =
        engine === 'waapi'
            ? element.getAnimations()[0]?.playState
            : element.style.translate === ''
              ? 'idle'
              : 'running'
    const start = performance.now()
    while (performance.now() < start + 120) {
        // the main thread is blocked
    }
    const blockMs = performance.now() - start
    await frame()
    group.dispose()
    return { state: state ?? 'none', blockMs }
}
