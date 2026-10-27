import { vi } from 'vitest'
import type { Box } from '../geometry'

/**
 * A layout model for jsdom (unit tests only): each placed element has a
 * layout box in an untransformed view space, and its rect is that box drawn
 * through the inline `translate` and `scale` of the element and of every
 * placed ancestor, each about its `transform-origin` (px, default `0 0`).
 * `offsetWidth`/`offsetHeight` round the layout size, and computed styles
 * report the inline transform properties and the exact border-box size.
 * An inline `zoom` on any ancestor (placed or not) scales the rects under it
 * about its layout box's top-left (an unplaced one: the view origin), and
 * changes no layout size. Every read is counted, in order.
 *
 * Engine precision (§4.2 measurement error): `widths: 'chromium'` serializes
 * computed widths and heights to six significant digits; `rects: 'firefox'`
 * quantizes the edges of a transformed box's rect to 1/60 px app units.
 */
export interface RectModelOptions {
    readonly widths?: 'exact' | 'chromium'
    readonly rects?: 'exact' | 'firefox'
}

export interface RectModel {
    /** Places `element` at `box`; `offset` overrides the rounded layout size. */
    place(
        element: HTMLElement,
        box: Box,
        offset?: readonly [number, number]
    ): void
    /** The layout box of a placed element. */
    layout(element: HTMLElement): Box
    /** The rect the browser would report now. */
    rect(element: HTMLElement): Box
    readonly reads: { rects: number; offsets: number; styles: number }
    /** Every read, in order: 'rect', 'offset' (one per pair) or 'style'. */
    readonly log: string[]
    reset(): void
    /** Sets the engine precision the model reports with from now on. */
    precision(options: RectModelOptions): void
}

function px(value: string): number {
    return Number.parseFloat(value)
}

function translateOf(element: HTMLElement): [number, number] {
    const value = element.style.translate
    if (!value || value === 'none') return [0, 0]
    const [x, y] = value.split(' ')
    return [px(x!), y === undefined ? 0 : px(y)]
}

function scaleOf(element: HTMLElement): [number, number] {
    const value = element.style.scale
    if (!value || value === 'none') return [1, 1]
    const [x, y] = value.split(' ').map(Number)
    return [x!, y ?? x!]
}

/** The inline `transform-origin` in px; a percentage resolves on `layout`. */
function originOf(element: HTMLElement, layout?: Box): [number, number] {
    const value = element.style.transformOrigin
    if (!value) return [0, 0]
    const [x, y] = value.split(' ')
    const resolve = (v: string | undefined, size: number) =>
        v?.endsWith('%') ? (px(v) / 100) * size : px(v ?? '0') || 0
    return [resolve(x, layout?.w ?? 0), resolve(y, layout?.h ?? 0)]
}

function zoomOf(element: HTMLElement): number {
    const value = Number.parseFloat(element.style.zoom)
    return Number.isFinite(value) && value > 0 ? value : 1
}

export function createRectModel(initial: RectModelOptions = {}): RectModel {
    let options = initial
    const boxes = new WeakMap<HTMLElement, Box>()
    const offsets = new WeakMap<HTMLElement, readonly [number, number]>()
    const reads = { rects: 0, offsets: 0, styles: 0 }
    const log: string[] = []

    const rect = (element: HTMLElement): Box => {
        let box = { ...boxes.get(element)! }
        let transformed = false
        for (
            let node: HTMLElement | null = element;
            node;
            node = node.parentElement
        ) {
            const layout = boxes.get(node)
            const z = zoomOf(node)
            if (z !== 1) {
                transformed = true
                const zx = layout?.x ?? 0
                const zy = layout?.y ?? 0
                box = {
                    x: zx + z * (box.x - zx),
                    y: zy + z * (box.y - zy),
                    w: z * box.w,
                    h: z * box.h,
                }
            }
            if (!layout) continue
            const [tx, ty] = translateOf(node)
            const [sx, sy] = scaleOf(node)
            if (tx !== 0 || ty !== 0 || sx !== 1 || sy !== 1) transformed = true
            const [ox, oy] = originOf(node, layout)
            const cx = layout.x + ox
            const cy = layout.y + oy
            box = {
                x: cx + tx + sx * (box.x - cx),
                y: cy + ty + sy * (box.y - cy),
                w: sx * box.w,
                h: sy * box.h,
            }
        }
        if (options.rects === 'firefox' && transformed) {
            // app units: every edge on the 1/60 px grid
            const q = (v: number) => Math.round(v * 60) / 60
            const x = q(box.x)
            const y = q(box.y)
            box = { x, y, w: q(box.x + box.w) - x, h: q(box.y + box.h) - y }
        }
        return box
    }
    /** A computed length as the engine serializes it. */
    const length = (v: number): string =>
        options.widths === 'chromium'
            ? `${Number(v.toPrecision(6))}px`
            : `${v}px`

    const realGetComputedStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((elt: Element) => {
        reads.styles += 1
        log.push('style')
        const raw = realGetComputedStyle(elt)
        const html = elt as HTMLElement
        const layout = boxes.get(html)
        return new Proxy(raw, {
            get(target, prop, receiver) {
                if (prop === 'translate') return html.style.translate || 'none'
                if (prop === 'scale') return html.style.scale || 'none'
                if (prop === 'rotate') return html.style.rotate || 'none'
                if (prop === 'transform') return html.style.transform || 'none'
                if (prop === 'transformOrigin') {
                    const [ox, oy] = originOf(html, layout)
                    return `${ox}px ${oy}px`
                }
                if (prop === 'width' && layout) return length(layout.w)
                if (prop === 'height' && layout) return length(layout.h)
                if (prop === 'getPropertyValue') {
                    // corner radii resolve as a browser's do: '0px' when unset
                    return (name: string) =>
                        html.style.getPropertyValue(name) ||
                        target.getPropertyValue(name) ||
                        (name.endsWith('-radius') ? '0px' : '')
                }
                if (prop === 'boxSizing') return 'border-box'
                if (prop === 'display') return 'block'
                if (prop === 'transitionDuration') {
                    return html.style.transitionDuration || '0s'
                }
                if (prop === 'transitionDelay') {
                    return html.style.transitionDelay || '0s'
                }
                if (prop === 'transitionProperty') {
                    return html.style.transitionProperty || 'none'
                }
                const value = Reflect.get(target, prop, receiver)
                return typeof value === 'function' ? value.bind(target) : value
            },
        })
    })

    return {
        place(element, box, offset) {
            boxes.set(element, box)
            if (offset) offsets.set(element, offset)
            else offsets.delete(element)
            element.getBoundingClientRect = () => {
                reads.rects += 1
                log.push('rect')
                const r = rect(element)
                return {
                    x: r.x,
                    y: r.y,
                    left: r.x,
                    top: r.y,
                    right: r.x + r.w,
                    bottom: r.y + r.h,
                    width: r.w,
                    height: r.h,
                    toJSON: () => ({}),
                } as DOMRect
            }
            Object.defineProperty(element, 'offsetWidth', {
                configurable: true,
                get: () => {
                    reads.offsets += 1
                    log.push('offset')
                    return (
                        offsets.get(element)?.[0] ??
                        Math.round(boxes.get(element)!.w)
                    )
                },
            })
            Object.defineProperty(element, 'offsetHeight', {
                configurable: true,
                get: () =>
                    offsets.get(element)?.[1] ??
                    Math.round(boxes.get(element)!.h),
            })
        },
        layout: (element) => boxes.get(element)!,
        rect,
        reads,
        log,
        reset() {
            reads.rects = 0
            reads.offsets = 0
            reads.styles = 0
            log.length = 0
        },
        precision(next) {
            options = next
        },
    }
}
