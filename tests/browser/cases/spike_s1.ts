// CP2 spike S1: render capture stays valid under StrictMode, transitions,
// deferred values and Suspense (React 19 / 18.3, plain / React Compiler).
import {
    createElement as h,
    version as reactVersion,
    type SetStateAction,
    StrictMode,
    startTransition,
} from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { pendingCapture, resetProto, type S1Stats, stats } from './spike_proto'
import { App, type AppState } from './spike_s1_fixture'
import { controls, resetResources } from './spike_s1_support'

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

let interleaved = 0

/** Waits (in later tasks) until a render has captured but not flushed. */
async function untilCaptured(): Promise<boolean> {
    for (let i = 0; i < 200; i++) {
        if (pendingCapture()) return true
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    return false
}

function set(update: SetStateAction<AppState>): void {
    if (!controls.setState) throw new Error('fixture not mounted')
    controls.setState(update)
}

function reorder(state: AppState, step: number): AppState {
    const order = [...state.order]
    const from = step % order.length
    const to = (step * 3 + 1) % order.length
    const [moved] = order.splice(from, 1)
    order.splice(to, 0, moved!)
    return { ...state, version: state.version + 1, order }
}

type Body = () => Promise<void>

const SCENARIOS = {
    sync: {
        slow: false,
        body: async () => {
            for (let i = 0; i < 20; i++) {
                if (i % 2 === 0) flushSync(() => set((s) => reorder(s, i)))
                else set((s) => reorder(s, i))
                await sleep(40)
            }
        },
    },
    transition: {
        slow: true,
        body: async () => {
            for (let i = 0; i < 20; i++) {
                startTransition(() => set((s) => reorder(s, i)))
                if (await untilCaptured()) interleaved += 1
                // a sync commit outside the scope pre-empts the transition render
                if (i % 2 === 0) flushSync(() => controls.toggleBanner?.())
                else set((s) => ({ ...s, version: s.version + 1 }))
                await sleep(150)
            }
        },
    },
    deferred: {
        slow: true,
        body: async () => {
            for (let i = 0; i < 12; i++) {
                set((s) => ({
                    ...s,
                    version: s.version + 1,
                    query: `${s.query}x`.slice(-4),
                }))
                if (i % 3 === 0) controls.toggleBanner?.()
                await sleep(25)
            }
            await sleep(300)
        },
    },
    suspense: {
        slow: false,
        body: async () => {
            for (let i = 0; i < 6; i++) {
                startTransition(() =>
                    set((s) => ({ ...reorder(s, i), suspend: s.suspend + 1 }))
                )
                await sleep(120)
                set((s) => ({ ...reorder(s, i + 1), suspend: s.suspend + 1 }))
                await sleep(40)
                set((s) => ({ ...reorder(s, i + 2), suspend: s.suspend + 1 }))
                await sleep(120)
                set((s) => ({ ...reorder(s, i + 3), suspend: s.suspend + 1 }))
                await sleep(40)
            }
        },
    },
} satisfies Record<string, { slow: boolean; body: Body }>

async function scenario(
    slow: boolean,
    body: Body,
    refresh: boolean
): Promise<S1Stats & { interleaved: number }> {
    resetProto(refresh)
    resetResources()
    interleaved = 0
    controls.setState = null
    controls.toggleBanner = null
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(h(StrictMode, null, h(App, { slow })))
    await sleep(60)
    await body()
    await sleep(120)
    root.unmount()
    host.remove()
    return { ...stats, interleaved }
}

export async function runS1(
    name: keyof typeof SCENARIOS,
    expectCompiled: boolean
): Promise<string> {
    const compiled = /_c\(|\$\[/.test(String(App))
    if (compiled !== expectCompiled) {
        throw new Error(
            `fixture compiled=${compiled}, expected ${expectCompiled}`
        )
    }
    const { slow, body } = SCENARIOS[name]!
    const real = await scenario(slow, body, true)
    const control = await scenario(slow, body, false)
    const line = `React ${reactVersion}, compiled=${compiled}, StrictMode, ${name}: flushes ${real.flushes}, compared ${real.compared}, violations ${real.violations} (control without refresh: ${control.violations}, max error ${control.maxError.toFixed(1)} px), refreshes ${real.refreshes}, updates interleaved into a pending capture ${real.interleaved}, missing ${real.missing}, max error ${real.maxError.toFixed(3)} px`
    const insensitive = name === 'transition' && control.violations === 0
    if (
        real.violations > 0 ||
        real.missing > 0 ||
        real.compared === 0 ||
        insensitive
    ) {
        throw new Error(`S1 failed: ${line}`)
    }
    return line
}

export function s1Cases(expectCompiled: boolean) {
    return {
        S1_sync: () => runS1('sync', expectCompiled),
        S1_transition: () => runS1('transition', expectCompiled),
        S1_deferred: () => runS1('deferred', expectCompiled),
        S1_suspense: () => runS1('suspense', expectCompiled),
    }
}
