// CP2 spikes S1 (React 19, plain), S2 (first frame after a block) and S3
// (measurement under presence and authored transforms).
import { type Animatable, defaultClock, timing } from '@freestylejs/ani-core'
import { createElement as h, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { s1Cases } from './spike_s1'

export const pageOptions = {}
export const knownFailures: Record<string, string> = {}

const plain = s1Cases(false)
export const S1_sync = plain.S1_sync
export const S1_transition = plain.S1_transition
export const S1_deferred = plain.S1_deferred
export const S1_suspense = plain.S1_suspense

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))
const frame = () =>
    new Promise<number>((resolve) => requestAnimationFrame(resolve))

function block(ms: number): void {
    const end = performance.now() + ms
    while (performance.now() < end) {
        // deliberately busy
    }
}

/* ─────────────────────────── S2 ─────────────────────────── */

const DURATION = 0.4

interface S2Run {
    engineFirst: number
    visualFirst: number
}

async function runS2(forceFirstDt: boolean): Promise<S2Run> {
    let before: DOMRect | null = null
    let element: HTMLElement | null = null
    let queued = false
    let engineFirst = -1
    let setOn: ((on: boolean) => void) | null = null

    const flush = () => {
        queued = false
        const el = element!
        const b = before!
        before = null
        el.style.translate = ''
        const a = el.getBoundingClientRect()
        const dx = b.left - a.left
        el.style.translate = `${dx}px 0px`
        let elapsed = 0
        let first = true
        let progress = 0
        const animatable: Animatable = {
            update(dt) {
                elapsed += first && forceFirstDt ? 0 : dt
                first = false
                progress = Math.min(1, elapsed / DURATION)
            },
            commit() {
                if (engineFirst < 0) engineFirst = progress
                el.style.translate = `${dx * (1 - progress)}px 0px`
                if (progress >= 1) {
                    el.style.translate = ''
                    defaultClock.unsubscribe(animatable)
                }
            },
        }
        defaultClock.subscribe(animatable)
    }

    function Box(): ReturnType<typeof h> {
        const [on, set] = useState(false)
        if (element && before === null) before = element.getBoundingClientRect()
        useLayoutEffect(() => {
            setOn = set
        }, [])
        useLayoutEffect(() => {
            if (queued || before === null) return
            queued = true
            queueMicrotask(flush)
        })
        return h('div', {
            ref: (el: HTMLDivElement | null) => {
                element = el
            },
            style: {
                width: '40px',
                height: '40px',
                marginLeft: on ? '300px' : '0px',
                background: '#335',
            },
        })
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    flushSync(() => root.render(h(Box)))
    await sleep(50)
    before = null
    const start = element!.getBoundingClientRect().left
    flushSync(() => setOn!(true))
    // the commit's flush microtask runs first, then the main thread blocks
    await Promise.resolve()
    if (before !== null || queued) throw new Error('flush did not run')
    block(120)
    await frame()
    const visual = element!.getBoundingClientRect().left
    const end = start + 300
    const visualFirst = (visual - start) / (end - start)
    await sleep(DURATION * 1000 + 200)
    root.unmount()
    host.remove()
    return { engineFirst, visualFirst }
}

export async function S2(): Promise<string> {
    const real = await runS2(true)
    const control = await runS2(false)
    const line = `first painted frame after a 120 ms block: ${(real.visualFirst * 100).toFixed(2)} % (engine ${(real.engineFirst * 100).toFixed(2)} %); control without forced dt=0: ${(control.visualFirst * 100).toFixed(2)} %`
    if (!(real.visualFirst <= 0.06) || !(real.engineFirst <= 0.06)) {
        throw new Error(`S2 failed: ${line}`)
    }
    return line
}

/* ─────────────────────────── S3 ─────────────────────────── */

interface Box {
    x: number
    y: number
    w: number
    h: number
}

interface Axis {
    k: number
    b: number
}

function lengthOf(token: string, basis: number): number {
    if (token.endsWith('%')) return (Number.parseFloat(token) / 100) * basis
    if (token.endsWith('px')) return Number.parseFloat(token)
    if (token === '0') return 0
    throw new Error(`unparseable length ${token}`)
}

/** Inner-map parameters of one element, measured in its own (untransformed) box. */
function innerOf(element: HTMLElement): {
    origin: [string, string]
    translate: [string, string]
    scale: [number, number]
    matrix: DOMMatrixReadOnly
} {
    const style = getComputedStyle(element)
    const origin = style.transformOrigin.split(' ') as [string, string]
    const t = style.translate === 'none' ? [] : style.translate.split(' ')
    const s = style.scale === 'none' ? [] : style.scale.split(' ')
    const sx = s[0] === undefined ? 1 : Number.parseFloat(s[0])
    const sy = s[1] === undefined ? sx : Number.parseFloat(s[1])
    const inline = element.style.transform
    return {
        origin,
        translate: [t[0] ?? '0px', t[1] ?? '0px'],
        scale: [sx, sy],
        matrix: new DOMMatrixReadOnly(inline === '' ? undefined : inline),
    }
}

/**
 * Divide the inner maps out along a chain (outermost first). `rect` boxes are
 * page boxes; returns the layout box of every element of the chain.
 */
function layoutChain(chain: readonly HTMLElement[]): Box[] {
    const maps: Array<[Axis, Axis]> = []
    const boxes: Box[] = []
    for (const element of chain) {
        const r = element.getBoundingClientRect()
        let box: Box = {
            x: r.left + scrollX,
            y: r.top + scrollY,
            w: r.width,
            h: r.height,
        }
        // undo the ancestors' inner maps, outermost first
        for (let i = 0; i < maps.length; i++) {
            const [mx, my] = maps[i]!
            box = {
                x: (box.x - mx.b) / mx.k,
                y: (box.y - my.b) / my.k,
                w: box.w / mx.k,
                h: box.h / my.k,
            }
        }
        const inner = innerOf(element)
        const m = inner.matrix
        if (Math.abs(m.b) > 1e-9 || Math.abs(m.c) > 1e-9) {
            throw new Error('rotation/skew is unsupported')
        }
        const kx = inner.scale[0] * m.a
        const ky = inner.scale[1] * m.d
        const w = box.w / kx
        const height = box.h / ky
        const ox = lengthOf(inner.origin[0], w)
        const oy = lengthOf(inner.origin[1], height)
        const tx = lengthOf(inner.translate[0], w)
        const ty = lengthOf(inner.translate[1], height)
        const x = box.x - ox * (1 - kx) - tx - inner.scale[0] * m.e
        const y = box.y - oy * (1 - ky) - ty - inner.scale[1] * m.f
        boxes.push({ x, y, w, h: height })
        // this element's inner map in page space, for its descendants
        maps.push([
            { k: kx, b: x + ox + tx + inner.scale[0] * m.e - kx * (x + ox) },
            { k: ky, b: y + oy + ty + inner.scale[1] * m.f - ky * (y + oy) },
        ])
    }
    return boxes
}

/** Truth: the same chain measured with every transform property removed. */
function truthChain(chain: readonly HTMLElement[]): Box[] {
    const saved = chain.map((element) => element.style.cssText)
    for (const element of chain) {
        element.style.setProperty('transform', 'none', 'important')
        element.style.setProperty('translate', 'none', 'important')
        element.style.setProperty('scale', 'none', 'important')
    }
    const boxes = chain.map((element) => {
        const r = element.getBoundingClientRect()
        return {
            x: r.left + scrollX,
            y: r.top + scrollY,
            w: r.width,
            h: r.height,
        }
    })
    chain.forEach((element, i) => {
        element.style.cssText = saved[i]!
    })
    return boxes
}

export async function S3(): Promise<string> {
    const style = document.createElement('style')
    style.textContent =
        '.hov{scale:1.05;translate:10% 4px}.half{scale:.9}.toast{transform-origin:50% 100%}'
    document.head.append(style)
    document.body.style.margin = '7.3px'
    const page = document.createElement('div')
    page.style.cssText = 'padding:13.37px 21.5px;height:2000px'
    page.innerHTML = `
      <ol id="toasts" style="list-style:none;margin:0;padding:3.25px">
        <li id="t1" class="toast" style="height:61.5px;width:301.3px;margin:4.5px 0;transform:translateY(14px) scaleX(0.8)">
          <span id="t1c" class="half" style="display:block;width:50.5px;height:20.25px;margin-left:33.3px"></span>
        </li>
        <li id="t2" class="toast" style="height:61.5px;width:301.3px;transform:translateY(6.31px) scaleX(0.937)"></li>
      </ol>
      <div id="card" class="hov" style="width:211.7px;height:123.1px;margin:9.1px 17.2px">
        <div id="inner" style="width:90.4px;height:40.6px;margin:5.5px;transform:translate(5px,7px) scale(1.2);transform-origin:0 0">
          <i id="leaf" class="half" style="display:block;width:20.3px;height:10.1px;margin:2.2px 3.3px"></i>
        </div>
      </div>`
    document.body.append(page)
    scrollTo(0, 37)
    await frame()
    const byId = (id: string) => document.getElementById(id) as HTMLElement
    const chains: Record<string, HTMLElement[]> = {
        'toast mid-enter': [byId('t1')],
        'toast child': [byId('t1'), byId('t1c')],
        'second toast': [byId('t2')],
        'hover-scaled card': [byId('card')],
        'card > inner > leaf': [byId('card'), byId('inner'), byId('leaf')],
    }
    let worst = 0
    const lines: string[] = []
    for (const [name, chain] of Object.entries(chains)) {
        const got = layoutChain(chain)
        const want = truthChain(chain)
        let error = 0
        got.forEach((box, i) => {
            const t = want[i]!
            error = Math.max(
                error,
                Math.abs(box.x - t.x),
                Math.abs(box.y - t.y),
                Math.abs(box.w - t.w),
                Math.abs(box.h - t.h)
            )
        })
        worst = Math.max(worst, error)
        lines.push(`${name} ${error.toFixed(4)} px`)
    }
    const origin = getComputedStyle(byId('t1')).transformOrigin
    const translate = getComputedStyle(byId('card')).translate
    const line = `max error ${worst.toFixed(4)} px (${lines.join(', ')}); computed transform-origin "${origin}", translate "${translate}"`
    if (!(worst <= 0.5)) throw new Error(`S3 failed: ${line}`)
    return line
}

/* ─────────────────────────── S4 ─────────────────────────── */

function percentile(values: readonly number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
}

/** Commit reads at 1,000 participants. */
async function readCost(): Promise<{
    capture: number
    flush: number
    layout: number
}> {
    const grid = document.createElement('div')
    grid.style.cssText = 'display:flex;flex-wrap:wrap;width:1200px'
    const items: HTMLElement[] = []
    for (let i = 0; i < 1000; i++) {
        const item = document.createElement('div')
        item.style.cssText = `width:${20 + (i % 7)}px;height:14px;margin:1px`
        grid.append(item)
        items.push(item)
    }
    document.body.append(grid)
    await frame()
    const runs = {
        capture: [] as number[],
        flush: [] as number[],
        layout: [] as number[],
    }
    for (let round = 0; round < 15; round++) {
        let t = performance.now()
        for (const item of items) {
            item.getBoundingClientRect()
            void item.style.transform
        }
        runs.capture.push(performance.now() - t)
        grid.style.width = `${1100 + (round % 2) * 100}px`
        t = performance.now()
        void grid.offsetWidth // the layout the commit costs anyway
        runs.layout.push(performance.now() - t)
        t = performance.now()
        for (let i = 0; i < items.length; i++) {
            const item = items[i]!
            item.getBoundingClientRect()
            void item.style.transform
            if (i % 10 < 3) {
                const style = getComputedStyle(item)
                void style.translate
                void style.scale
                void style.rotate
                void style.transformOrigin
            }
        }
        runs.flush.push(performance.now() - t)
        await frame()
    }
    grid.remove()
    return {
        capture: percentile(runs.capture, 0.5),
        flush: percentile(runs.flush, 0.5),
        layout: percentile(runs.layout, 0.5),
    }
}

/** Steady frame at 300 nested movers: solve + write, no reads. */
async function frameCost(): Promise<{
    p50: number
    p95: number
    frames: number
}> {
    const ease = timing.easeOut()
    const ctx = { dt: 0, from: 0, to: 1, duration: 1 }
    interface Node {
        el: HTMLElement
        parent: number
        b: [number, number, number, number]
        a: [number, number, number, number]
        k: [number, number] // drawn map scale (x, y)
        o: [number, number] // drawn map offset
        last: string
        lastScale: string
    }
    const nodes: Node[] = []
    const host = document.createElement('div')
    document.body.append(host)
    for (let p = 0; p < 100; p++) {
        const parent = document.createElement('div')
        parent.style.cssText =
            'width:120px;height:60px;display:inline-block;margin:2px'
        host.append(parent)
        const pi = nodes.length
        nodes.push({
            el: parent,
            parent: -1,
            b: [p * 3, 10, 100, 50],
            a: [p * 3 + 40, 30, 120, 60],
            k: [1, 1],
            o: [0, 0],
            last: '',
            lastScale: '',
        })
        for (let c = 0; c < 2; c++) {
            const child = document.createElement('div')
            child.style.cssText = 'width:40px;height:20px'
            parent.append(child)
            nodes.push({
                el: child,
                parent: pi,
                b: [p * 3 + c * 10, 12, 30, 15],
                a: [p * 3 + 45 + c * 10, 35, 40, 20],
                k: [1, 1],
                o: [0, 0],
                last: '',
                lastScale: '',
            })
        }
    }
    await frame()
    const D = 1.2
    let elapsed = 0
    const times: number[] = []
    let started = 0
    await new Promise<void>((resolve) => {
        const animatable: Animatable = {
            update(dt) {
                started = performance.now()
                elapsed += dt
                const tau = Math.min(1, elapsed / D)
                const e = ease.step(tau, ctx).value
                for (const n of nodes) {
                    const v = [0, 0, 0, 0].map(
                        (_, i) =>
                            n.a[i]! + (n.b[i]! - n.a[i]!) * (1 - e) + 0 * tau
                    )
                    let vx = v[0]!
                    let vy = v[1]!
                    let vw = v[2]!
                    let vh = v[3]!
                    if (n.parent >= 0) {
                        const p = nodes[n.parent]!
                        vx = (vx - p.o[0]) / p.k[0]
                        vy = (vy - p.o[1]) / p.k[1]
                        vw /= p.k[0]
                        vh /= p.k[1]
                    }
                    const sx = vw / n.a[2]
                    const sy = vh / n.a[3]
                    const tx = vx - n.a[0] - n.a[2] * 0.5 * (1 - sx)
                    const ty = vy - n.a[1] - n.a[3] * 0.5 * (1 - sy)
                    const ox = n.a[0] + n.a[2] * 0.5
                    const oy = n.a[1] + n.a[3] * 0.5
                    const pk = n.parent >= 0 ? nodes[n.parent]!.k : [1, 1]
                    const po = n.parent >= 0 ? nodes[n.parent]!.o : [0, 0]
                    n.k = [pk[0]! * sx, pk[1]! * sy]
                    n.o = [
                        pk[0]! * (ox + tx - sx * ox) + po[0]!,
                        pk[1]! * (oy + ty - sy * oy) + po[1]!,
                    ]
                    n.last = `${tx}px ${ty}px`
                    n.lastScale = `${sx} ${sy}`
                }
                if (tau >= 1) {
                    defaultClock.unsubscribe(animatable)
                    resolve()
                }
            },
            commit() {
                for (const n of nodes) {
                    n.el.style.translate = n.last
                    n.el.style.scale = n.lastScale
                }
                times.push(performance.now() - started)
            },
        }
        defaultClock.subscribe(animatable)
    })
    host.remove()
    return {
        p50: percentile(times, 0.5),
        p95: percentile(times, 0.95),
        frames: times.length,
    }
}

export async function S4(): Promise<string> {
    const reads = await readCost()
    const steady = await frameCost()
    const line = `1,000 participants: capture reads ${reads.capture.toFixed(2)} ms + flush reads ${reads.flush.toFixed(2)} ms = ${(reads.capture + reads.flush).toFixed(2)} ms (the commit's own layout ${reads.layout.toFixed(2)} ms, not ours); 300 nested movers: frame p50 ${steady.p50.toFixed(3)} ms, p95 ${steady.p95.toFixed(3)} ms over ${steady.frames} frames`
    if (!(reads.capture + reads.flush <= 4) || !(steady.p95 <= 2)) {
        throw new Error(`S4 failed: ${line}`)
    }
    return line
}
