// @vitest-environment jsdom

// §11.3 model-based lifecycle fuzz. A pure seeded event model drives the real
// scope through captures, frame markers, flushes, presented and unpresented
// scrolls, layout changes, detach/re-add, document change, layoutKey change,
// presence enter/exit, reduced motion, the kill switch, visibility, injected
// faults and unmount. Every step checks the §11.3 properties: no NaN, B is a
// captured box or the node is reported snapped, no read after the first write
// in a batch, one writer per property, every report resolves, styles and
// `inert` restore byte-identically, and no listener/subscription survives idle.
import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import { clearLayoutFaults, injectLayoutFault } from '../fault'
import { linkPresence } from '../presence_link'
import { layoutRuntime } from '../runtime'
import { createLayoutGroup } from '../scope'
import type { LayoutGroup, LayoutReport } from '../types'
import { createRectModel, type RectModel } from './rect_model'

const motion = { duration: 0.32, timing: timing.linear() }
const TOL = 0.5

let model: RectModel
const restores: (() => void)[] = []
const originalSetProperty = CSSStyleDeclaration.prototype.setProperty
const originalRemoveProperty = CSSStyleDeclaration.prototype.removeProperty
const originalSetAttribute = Element.prototype.setAttribute
const originalRemoveAttribute = Element.prototype.removeAttribute
let batch: {
    writes: number
    violation: string | null
    unowned: string | null
    stack: string | null
    /**
     * A document-change eviction restores a participant that has already left
     * this document before the capture's reads. That restore is in another
     * document's tree and cannot force this one's layout, so it closes the
     * read/write batch (see the seed's document-change event).
     */
    crossDocument: boolean
} | null = null

const OWNED_PROPERTIES = new Set([
    'translate',
    'scale',
    'opacity',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
    'overflow-anchor',
])

function recordWrite(property?: string, attribute?: string): void {
    if (!batch) return
    batch.writes += 1
    if (property !== undefined && !OWNED_PROPERTIES.has(property))
        batch.unowned = property
    if (attribute !== undefined && attribute !== 'inert')
        batch.unowned = attribute
}

function recordRead(what: string): void {
    if (!batch || batch.writes === 0) return
    if (batch.crossDocument) {
        batch.writes = 0
        return
    }
    if (batch.violation === null) {
        batch.violation = what
        batch.stack = new Error('read').stack ?? null
    }
}

beforeEach(() => {
    model = createRectModel()
    layoutRuntime.setMode('animate')
    clearLayoutFaults()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    document.body.innerHTML = ''
    batch = null
    CSSStyleDeclaration.prototype.setProperty = function (
        property: string,
        value: string | null,
        priority?: string
    ) {
        recordWrite(property)
        return originalSetProperty.call(this, property, value, priority)
    }
    CSSStyleDeclaration.prototype.removeProperty = function (property: string) {
        recordWrite(property)
        return originalRemoveProperty.call(this, property)
    }
    Element.prototype.setAttribute = function (name: string, value: string) {
        recordWrite(undefined, name)
        return originalSetAttribute.call(this, name, value)
    }
    Element.prototype.removeAttribute = function (name: string) {
        recordWrite(undefined, name)
        return originalRemoveAttribute.call(this, name)
    }
    const computed = window.getComputedStyle.bind(window)
    window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
        recordRead('computed style')
        return computed(element, pseudo)
    }) as typeof window.getComputedStyle
})

afterEach(() => {
    for (const restore of restores.splice(0)) restore()
    CSSStyleDeclaration.prototype.setProperty = originalSetProperty
    CSSStyleDeclaration.prototype.removeProperty = originalRemoveProperty
    Element.prototype.setAttribute = originalSetAttribute
    Element.prototype.removeAttribute = originalRemoveAttribute
    clearLayoutFaults()
    layoutRuntime.setMode('animate')
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    batch = null
})

/** Runs a scope call as one batch and fails on a read after its first write. */
function run<T>(work: () => T): T {
    if (batch !== null) throw new Error('a batch is already open')
    batch = {
        writes: 0,
        violation: null,
        unowned: null,
        stack: null,
        crossDocument: false,
    }
    let value: T
    try {
        value = work()
    } catch (error) {
        batch = null
        throw error
    }
    const current = batch
    batch = null
    if (current.violation !== null) {
        throw new Error(
            `a ${current.violation} read followed the batch's first write (writes ${current.writes})\n${current.stack}`
        )
    }
    if (current.unowned !== null) {
        throw new Error(`layout wrote an unowned property: ${current.unowned}`)
    }
    return value
}

function rng(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

interface World {
    readonly mc: ReturnType<typeof createManualClock>
    readonly group: LayoutGroup
    readonly a: HTMLElement
    readonly b: HTMLElement
    readonly card: HTMLElement
    readonly detail: HTMLElement
    readonly second: Document
    readonly reports: Promise<LayoutReport>[]
    readonly exits: Promise<unknown>[]
    readonly removes: (() => void)[]
    cardExiting: boolean
    detailPresent: boolean
    removeDetail: (() => void) | null
    removedA: boolean
    removedB: boolean
    adopted: boolean
    readonly authored: Map<HTMLElement, { style: string; inert: string | null }>
    /** Every box a capture read, per participant (§4.1): a valid B. */
    readonly captures: Map<
        HTMLElement,
        { x: number; y: number; w: number; h: number }[]
    >
    readonly log: string[]
}

function place(
    element: HTMLElement,
    x: number,
    y: number,
    w = 80,
    h = 80
): void {
    model.place(element, { x, y, w, h })
    const rect = element.getBoundingClientRect.bind(element)
    element.getBoundingClientRect = () => {
        recordRead('rect')
        return rect()
    }
    for (const name of ['offsetWidth', 'offsetHeight'] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(element, name)
        if (!descriptor?.get) continue
        Object.defineProperty(element, name, {
            configurable: true,
            get() {
                recordRead(name)
                return descriptor.get!.call(element)
            },
        })
    }
}

function element(): HTMLElement {
    const node = document.createElement('div')
    document.body.append(node)
    return node
}

function world(): World {
    const mc = createManualClock()
    const group = createLayoutGroup({ clock: mc.clock, motion })
    const a = element()
    place(a, 0, 0)
    const b = element()
    place(b, 200, 0)
    const card = element()
    place(card, 20, 200)
    const detail = element()
    place(detail, 300, 40, 300, 200)
    const button = document.createElement('button')
    b.append(button)
    button.focus()
    const second = document.implementation.createHTMLDocument('fuzz-second')
    const authored = new Map<
        HTMLElement,
        { style: string; inert: string | null }
    >()
    for (const node of [a, b, card, detail]) {
        authored.set(node, {
            style: node.style.cssText,
            inert: node.getAttribute('inert'),
        })
    }
    const state: World = {
        mc,
        group,
        a,
        b,
        card,
        detail,
        second,
        reports: [],
        exits: [],
        removes: [],
        cardExiting: false,
        detailPresent: false,
        removeDetail: null,
        removedA: false,
        removedB: false,
        adopted: false,
        authored,
        captures: new Map(),
        log: [],
    }
    state.removes.push(group.add(a, { radius: false }))
    state.removes.push(group.add(b, { radius: false }))
    state.removes.push(group.add(card, { layoutId: 'card', radius: false }))
    restores.push(
        linkPresence(card, {
            get exiting() {
                return state.cardExiting
            },
            opacity: false,
            hold(until) {
                state.exits.push(until)
            },
        })
    )
    return state
}

/** Records the boxes a capture just read (§4.1). */
function recordCaptured(world: World): void {
    for (const node of [world.a, world.b, world.card, world.detail]) {
        if (!node.isConnected) continue
        if (node === world.a && world.adopted) continue
        const rect = node.getBoundingClientRect()
        const list = world.captures.get(node) ?? []
        list.push({
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height,
        })
        world.captures.set(node, list)
    }
}

/**
 * Takes a capture; only a fresh one (stats.captures grew) is a new box set.
 * Returns whether this call made the capture, not reused one already live.
 */
function capture(world: World): boolean {
    const before = world.group.stats.captures
    run(() => world.group.capture())
    const fresh = world.group.stats.captures !== before
    if (fresh) recordCaptured(world)
    return fresh
}

function styleSnapshot(world: World): Map<HTMLElement, Map<string, string>> {
    const snapshot = new Map<HTMLElement, Map<string, string>>()
    for (const node of [world.a, world.b, world.card, world.detail]) {
        const values = new Map<string, string>()
        for (let i = 0; i < node.style.length; i++) {
            const property = node.style.item(i)
            values.set(
                property,
                `${node.style.getPropertyValue(property)}|${node.style.getPropertyPriority(property)}`
            )
        }
        snapshot.set(node, values)
    }
    return snapshot
}

const OWNED = new Set(['translate', 'scale', 'opacity', 'overflow-anchor'])
const RADIUS = new Set([
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
])

function assertStyles(
    world: World,
    before: Map<HTMLElement, Map<string, string>>
): void {
    for (const node of [world.a, world.b, world.card, world.detail]) {
        const was = before.get(node)!
        const names = new Set<string>()
        for (let i = 0; i < node.style.length; i++)
            names.add(node.style.item(i))
        for (const property of names) {
            const value = node.style.getPropertyValue(property)
            const priority = node.style.getPropertyPriority(property)
            if (!OWNED.has(property) && !RADIUS.has(property)) {
                throw new Error(`layout wrote an unowned property: ${property}`)
            }
            if (
                (property === 'translate' || property === 'scale') &&
                value !== '' &&
                priority !== 'important'
            ) {
                throw new Error(`layout wrote ${property} without !important`)
            }
            if (!was.has(property) && value !== '') continue
            if (was.get(property) === `${value}|${priority}`) continue
            if (!OWNED.has(property) && !RADIUS.has(property)) {
                throw new Error(
                    `layout changed an unowned property: ${property}`
                )
            }
        }
        for (const [property, value] of was) {
            if (node.style.getPropertyValue(property) !== '' || value === '')
                continue
            // a restore removed a property layout owned: allowed
        }
        const values: number[] = []
        for (let i = 0; i < node.style.length; i++) {
            const property = node.style.item(i)
            const raw = node.style.getPropertyValue(property)
            values.push(
                ...[...raw.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))
            )
        }
        const rect = node.getBoundingClientRect()
        values.push(rect.x, rect.y, rect.width, rect.height)
        if (values.some((value) => !Number.isFinite(value))) {
            throw new Error(`a non-finite value on a participant: ${values}`)
        }
        if (/NaN|Infinity/.test(node.style.cssText)) {
            throw new Error(`a non-finite style: ${node.style.cssText}`)
        }
    }
}

function assertB(
    world: World,
    drawn: Map<HTMLElement, boolean>,
    presented: Map<HTMLElement, DOMRect>
): void {
    for (const [node, changed] of drawn) {
        if (!changed) continue
        const rect = node.getBoundingClientRect()
        const shown = presented.get(node)
        const allowed = [
            ...[...world.captures.values()].flat(),
            ...(shown
                ? [
                      {
                          x: shown.x,
                          y: shown.y,
                          w: shown.width,
                          h: shown.height,
                      },
                  ]
                : []),
        ]
        let matches = false
        for (const box of allowed) {
            if (
                Math.abs(rect.x - box.x) <= TOL &&
                Math.abs(rect.y - box.y) <= TOL &&
                Math.abs(rect.width - box.w) <= TOL &&
                Math.abs(rect.height - box.h) <= TOL
            ) {
                matches = true
                break
            }
        }
        if (!matches) {
            const history = [...world.captures].map(
                ([element, boxes]) =>
                    `${element === world.a ? 'a' : element === world.b ? 'b' : element === world.card ? 'card' : 'detail'}:${JSON.stringify(boxes)}`
            )
            throw new Error(
                `B is not a captured box: ${node === world.a ? 'a' : node === world.b ? 'b' : node === world.card ? 'card' : 'detail'} at ${rect.x},${rect.y} ${rect.width}x${rect.height}, translate ${JSON.stringify(node.style.translate)}; history ${history.join(' ')}; presented ${presented.get(node) ? `${presented.get(node)!.x},${presented.get(node)!.y} ${presented.get(node)!.width}x${presented.get(node)!.height}` : 'none'}`
            )
        }
    }
}

/** The drawn box at the flush's capture, when no capture supplies B (§4.4). */
function presentedBoxes(world: World): Map<HTMLElement, DOMRect> {
    const boxes = new Map<HTMLElement, DOMRect>()
    for (const node of [world.a, world.b, world.card, world.detail]) {
        if (!node.isConnected) continue
        if (node === world.a && world.adopted) continue
        boxes.set(node, node.getBoundingClientRect())
    }
    return boxes
}

function changedTransforms(
    before: Map<HTMLElement, Map<string, string>>,
    world: World
): Map<HTMLElement, boolean> {
    const changed = new Map<HTMLElement, boolean>()
    for (const node of [world.a, world.b, world.card, world.detail]) {
        const now = new Map<string, string>()
        for (let i = 0; i < node.style.length; i++) {
            const property = node.style.item(i)
            now.set(property, node.style.getPropertyValue(property))
        }
        // a pose written by this flush; a restore (an empty declaration) is
        // not a drawn motion and has no B to check (§4.4)
        const translate = now.get('translate') ?? ''
        const scale = now.get('scale') ?? ''
        changed.set(node, translate !== '' || (scale !== '' && scale !== '1 1'))
    }
    return changed
}

function mutate(world: World, seed: number, steps: number): void {
    const random = rng(seed)
    const mc = world.mc
    const group = world.group
    let reduced = false
    let hidden = false
    for (let step = 0; step < steps; step++) {
        let pick = -1
        try {
            const before = styleSnapshot(world)
            const presented = presentedBoxes(world)
            pick = random()
            if (pick < 0.14) {
                capture(world)
            } else if (pick < 0.26) {
                run(() => mc.frame(16))
            } else if (pick < 0.38) {
                const fresh = capture(world)
                run(() => {
                    const x = Math.round(random() * 260)
                    const y = Math.round(random() * 120)
                    place(world.a, x, y)
                    place(world.b, 260 - x, y)
                })
                const report = run(() => group.flush())
                world.reports.push(report)
                // a reused (stale) capture moves a running track with its layout
                // (§4.4), so B is only checkable on a fresh capture
                if (fresh)
                    assertB(world, changedTransforms(before, world), presented)
            } else if (pick < 0.46) {
                // an unpresented change: the capture has aged past a frame
                capture(world)
                run(() => {
                    if (!world.adopted)
                        place(world.a, Math.round(random() * 260), 0)
                    mc.frame(16)
                })
                const report = run(() => group.flush())
                world.reports.push(report)
            } else if (pick < 0.53) {
                capture(world)
                run(() => place(world.b, Math.round(random() * 260), 0))
                world.reports.push(run(() => group.flush()))
            } else if (pick < 0.6) {
                run(() => {
                    if (world.adopted) return
                    if (world.a.isConnected) world.a.remove()
                    else document.body.append(world.a)
                })
                world.reports.push(run(() => group.flush()))
            } else if (pick < 0.66) {
                if (world.cardExiting) {
                    world.cardExiting = false
                    if (world.detailPresent) {
                        world.removeDetail?.()
                        world.removeDetail = null
                        world.detailPresent = false
                    }
                    capture(world)
                    world.reports.push(run(() => group.flush()))
                } else {
                    world.cardExiting = true
                    capture(world)
                    world.reports.push(run(() => group.flush()))
                    if (!world.detailPresent) {
                        document.body.append(world.detail)
                        world.removeDetail = group.add(world.detail, {
                            layoutId: 'card',
                            radius: false,
                        })
                        world.detailPresent = true
                    }
                }
            } else if (pick < 0.7) {
                capture(world)
                run(() =>
                    group.set(world.adopted ? world.b : world.a, {
                        radius: false,
                        layoutKey: String(Math.round(random() * 4)),
                    })
                )
                world.reports.push(run(() => group.flush()))
            } else if (pick < 0.75) {
                // a presented scroll: the capture follows the event
                run(() => document.dispatchEvent(new Event('scroll')))
                capture(world)
                run(() => place(world.b, Math.round(random() * 260), 0))
                world.reports.push(run(() => group.flush()))
                if (random() < 0.5)
                    run(() => document.dispatchEvent(new Event('scrollend')))
            } else if (pick < 0.79) {
                run(() => document.dispatchEvent(new Event('scroll')))
                capture(world)
                world.reports.push(run(() => group.flush()))
                run(() => document.dispatchEvent(new Event('scrollend')))
            } else if (pick < 0.84) {
                reduced = !reduced
                mc.setReducedMotion(reduced)
                capture(world)
                run(() => {
                    if (!world.adopted)
                        place(world.a, Math.round(random() * 260), 0)
                })
                world.reports.push(run(() => group.flush()))
            } else if (pick < 0.88) {
                layoutRuntime.setMode('snap')
                run(() => mc.frame(16))
                layoutRuntime.setMode('animate')
            } else if (pick < 0.91) {
                hidden = !hidden
                mc.setHidden(hidden)
                run(() => mc.frame(16))
            } else if (pick < 0.94) {
                injectLayoutFault(random() < 0.5 ? 'measure' : 'write')
                world.reports.push(run(() => group.flush()))
                clearLayoutFaults()
            } else if (pick < 0.97) {
                if (world.adopted) {
                    run(() => mc.frame(16))
                } else {
                    world.adopted = true
                    const adopted = world.a
                    run(() => {
                        world.second.adoptNode(adopted)
                        world.second.body.append(adopted)
                        // the eviction restore is in the other document
                        batch!.crossDocument = true
                        group.capture()
                        batch!.crossDocument = false
                    })
                    recordCaptured(world)
                    world.reports.push(run(() => group.flush()))
                }
            } else {
                run(() => group.dispose())
            }
            assertStyles(world, before)
            if (
                world.cardExiting &&
                world.card.style.opacity !== '' &&
                !world.card.hasAttribute('inert')
            ) {
                throw new Error('a fading follower is interactive')
            }
            if (document.activeElement !== world.b.firstElementChild) {
                throw new Error(
                    `focus moved to ${document.activeElement?.tagName ?? 'null'}`
                )
            }
        } catch (error) {
            throw new Error(
                `step ${step} (pick ${pick.toFixed(3)}): ${error instanceof Error ? error.message : String(error)}\nlog ${world.log.slice(-8).join(' | ')}`
            )
        }
        world.log.push(
            `${step}:${pick.toFixed(3)} a=${world.a.style.translate || '-'} b=${world.b.style.translate || '-'} tracks=${world.group.stats.tracks}`
        )
    }
}

function finalChecks(world: World): void {
    layoutRuntime.setMode('animate')
    world.mc.setHidden(false)
    world.mc.setReducedMotion(false)
    run(() => world.group.dispose())
    // the last marker, if any, runs once and stops its clock
    run(() => world.mc.frame(16))
    for (const node of [world.a, world.b, world.card, world.detail]) {
        const authored = world.authored.get(node)!
        if (node.style.cssText !== authored.style) {
            throw new Error(
                `styles are not byte-identical on ${node === world.a ? 'a' : node === world.b ? 'b' : node === world.card ? 'card' : 'detail'}: ${JSON.stringify(node.style.cssText)}`
            )
        }
        const inert = node.getAttribute('inert')
        if (inert !== authored.inert) {
            throw new Error(
                `inert is not byte-identical: ${JSON.stringify(inert)}`
            )
        }
    }
}

async function awaitAll(world: World): Promise<void> {
    const reports = await Promise.allSettled(world.reports)
    for (const settled of reports) {
        if (settled.status !== 'fulfilled') throw settled.reason
        if (
            ![
                'failed',
                'disposed',
                'disabled',
                'capped',
                'interrupted',
                'ended',
                'reduced',
                'stale',
                'no-change',
            ].includes(settled.value.status)
        ) {
            throw new Error(`unknown status ${settled.value.status}`)
        }
    }
    const exits = await Promise.allSettled(world.exits)
    for (const settled of exits) {
        if (settled.status !== 'fulfilled') throw settled.reason
    }
    if (world.mc.clock.size !== 0) {
        throw new Error(`a clock subscription survived: ${world.mc.clock.size}`)
    }
    if (world.mc.pending !== 0) {
        throw new Error(`a frame request survived: ${world.mc.pending}`)
    }
    if (world.group.stats.tracks !== 0) {
        throw new Error(`a track survived: ${world.group.stats.tracks}`)
    }
}

describe('§11.3 model-based lifecycle fuzz', () => {
    it('the invariant checkers fail when the invariant is broken', () => {
        const game = world()
        try {
            const before = styleSnapshot(game)
            place(game.a, Number.NaN, 0)
            expect(() => assertStyles(game, before)).toThrow(/non-finite/)
            place(game.a, 0, 0)
            game.a.style.transform = 'scale(2)'
            expect(() => assertStyles(game, before)).toThrow(/unowned property/)
            game.a.style.transform = ''
            expect(() =>
                assertB(game, new Map([[game.a, true]]), new Map())
            ).toThrow(/B is not a captured box/)
            expect(() =>
                run(() => {
                    recordWrite('translate')
                    game.a.getBoundingClientRect()
                })
            ).toThrow(/rect read followed the batch's first write/)
            expect(() =>
                run(() => {
                    game.a.style.setProperty('rotate', '10deg')
                })
            ).toThrow(/unowned property/)
        } finally {
            game.group.dispose()
        }
    })

    it('reproduces every seed deterministically and keeps every invariant', async () => {
        const seeds = Array.from({ length: 24 }, (_, index) => index + 1)
        for (const seed of seeds) {
            const game = world()
            try {
                mutate(game, seed, 18 + (seed % 7))
                finalChecks(game)
                await awaitAll(game)
            } catch (error) {
                throw new Error(
                    `seed ${seed}: ${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
    })
})
