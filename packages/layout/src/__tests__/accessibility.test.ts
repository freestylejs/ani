// @vitest-environment jsdom

// L-A11Y-1 (§5.8, §6, §8): the crossfade follower's `inert`, its byte-exact
// restore on reversal, unmount, abort and dispose, the focus-in-follower rule,
// and focus ownership across a reorder and a held re-render.
import { timing } from '@freestylejs/ani-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import { clearLayoutFaults, injectLayoutFault } from '../fault'
import { linkPresence } from '../presence_link'
import { layoutRuntime } from '../runtime'
import { createLayoutGroup } from '../scope'
import type { LayoutDiagnostic, LayoutGroup } from '../types'
import { createRectModel, type RectModel } from './rect_model'

const motion = { duration: 0.32, timing: timing.linear() }

let model: RectModel
const stops: (() => void)[] = []

beforeEach(() => {
    model = createRectModel()
    layoutRuntime.setMode('animate')
    clearLayoutFaults()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    document.body.innerHTML = ''
})

afterEach(() => {
    for (const stop of stops.splice(0)) stop()
    clearLayoutFaults()
    layoutRuntime.setMode('animate')
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function box(x: number, y: number, w = 80, h = 80) {
    return { x, y, w, h }
}

function element(x: number, y: number, w = 80, h = 80): HTMLElement {
    const node = document.createElement('div')
    document.body.append(node)
    model.place(node, box(x, y, w, h))
    return node
}

function harness(): {
    mc: ReturnType<typeof createManualClock>
    group: LayoutGroup
} {
    const mc = createManualClock()
    const group = createLayoutGroup({ clock: mc.clock, motion })
    return { mc, group }
}

/** A presence link whose phase the test flips (presence.ts's contract). */
function presenceLink(initial: boolean): {
    readonly link: {
        readonly exiting: boolean
        readonly opacity: false
        hold(until: Promise<void>): void
    }
    set(exiting: boolean): void
    readonly hold: ReturnType<typeof vi.fn>
} {
    let exiting = initial
    const hold = vi.fn()
    return {
        link: {
            get exiting() {
                return exiting
            },
            opacity: false,
            hold,
        },
        set(value) {
            exiting = value
        },
        hold,
    }
}

async function microtasks(): Promise<void> {
    for (let i = 0; i < 6; i++) await Promise.resolve()
}

/**
 * A crossfade pair with an exiting card: registers the card, captures, marks
 * presence exiting, captures again, adds the detail (the new lead). Returns
 * the detail and the card's own unsubscribe (its unmount).
 */
function crossfade(
    group: LayoutGroup,
    card: HTMLElement,
    swipe = presenceLink(false)
): {
    detail: HTMLElement
    removeCard: () => void
    swipe: ReturnType<typeof presenceLink>
} {
    const removeCard = group.add(card, { layoutId: 'shared', radius: false })
    stops.push(removeCard, linkPresence(card, swipe.link))
    group.capture()
    void group.flush()
    swipe.set(true)
    group.capture()
    const detail = element(360, 40, 300, 200)
    group.add(detail, { layoutId: 'shared', radius: false })
    return { detail, removeCard, swipe }
}

function collect(): { events: LayoutDiagnostic[] } {
    const events: LayoutDiagnostic[] = []
    const stop = layoutRuntime.onDiagnostic((event) => events.push(event))
    stops.push(stop)
    return { events }
}

describe('§6 crossfade follower inert', () => {
    it('is set at the first crossfade frame and removed byte-identically when the follower unmounts', async () => {
        const { mc, group } = harness()
        const card = element(20, 20)
        const authored = card.style.cssText
        const { detail, removeCard } = crossfade(group, card)
        const run = group.flush()
        // the first crossfade frame is the flush's t = 0 pose
        expect(card.getAttribute('inert')).toBe('')
        expect(card.style.opacity).toBe('1')
        expect(detail.style.opacity).toBe('0')
        mc.frames(2)
        expect(card.getAttribute('inert')).toBe('')
        expect(card.style.opacity).not.toBe('')
        // the follower unmounts (presence disposes it, the adapter unregisters)
        removeCard()
        expect(card.hasAttribute('inert')).toBe(false)
        expect(card.style.cssText).toBe(authored)
        group.dispose()
        await run
    })

    it('preserves an authored inert value through the fade and restores it exactly', async () => {
        const { mc, group } = harness()
        const card = element(20, 20)
        card.setAttribute('inert', 'authored')
        const { detail, removeCard } = crossfade(group, card)
        expect(card.getAttribute('inert')).toBe('authored')
        const run = group.flush()
        expect(card.getAttribute('inert')).toBe('authored')
        mc.frames(2)
        expect(card.getAttribute('inert')).toBe('authored')
        removeCard()
        expect(card.getAttribute('inert')).toBe('authored')
        expect(detail.hasAttribute('inert')).toBe(false)
        group.dispose()
        await run
    })

    it('swaps ownership on a reversal: the old lead becomes inert, the old follower interactive', async () => {
        const { mc, group } = harness()
        const card = element(20, 20)
        const swipe = presenceLink(false)
        const detailSwipe = presenceLink(false)
        const unlink = linkPresence(card, swipe.link)
        stops.push(unlink)
        group.add(card, { layoutId: 'shared', radius: false })
        group.capture()
        await group.flush()
        swipe.set(true)
        group.capture()
        const detail = element(360, 40, 300, 200)
        const unlinkDetail = linkPresence(detail, detailSwipe.link)
        stops.push(unlinkDetail)
        group.add(detail, { layoutId: 'shared', radius: false })
        const first = group.flush()
        mc.frames(2)
        expect(card.getAttribute('inert')).toBe('')
        expect(detail.hasAttribute('inert')).toBe(false)
        // the menu reopens: the card is present again, the detail exits
        swipe.set(false)
        detailSwipe.set(true)
        group.capture()
        const reverse = group.flush()
        expect(detail.getAttribute('inert')).toBe('')
        expect(card.hasAttribute('inert')).toBe(false)
        expect(card.style.opacity).not.toBe('')
        group.dispose()
        await Promise.all([first, reverse])
        expect(card.hasAttribute('inert')).toBe(false)
        expect(detail.hasAttribute('inert')).toBe(false)
    })

    it('restores inert and styles byte-identically through the transactional abort', async () => {
        const { mc, group } = harness()
        const card = element(20, 20)
        const { detail } = crossfade(group, card)
        const authoredCard = card.style.cssText
        const authoredDetail = detail.style.cssText
        const run = group.flush()
        mc.frame(16)
        expect(card.getAttribute('inert')).toBe('')
        const error = new Error('a11y abort')
        injectLayoutFault('write', error)
        mc.frame(16)
        const report = await run
        expect(report.status).toBe('failed')
        expect(card.style.cssText).toBe(authoredCard)
        expect(detail.style.cssText).toBe(authoredDetail)
        expect(card.hasAttribute('inert')).toBe(false)
        expect(group.stats.tracks).toBe(0)
        expect(mc.clock.size).toBe(0)
        group.dispose()
    })

    it('restores inert on dispose, also when the follower is held at opacity 0', async () => {
        const { mc, group } = harness()
        const card = element(20, 20)
        const { detail } = crossfade(group, card)
        const run = group.flush()
        mc.frames(24)
        expect(card.style.opacity).toBe('0')
        expect(card.getAttribute('inert')).toBe('')
        group.dispose()
        expect(card.hasAttribute('inert')).toBe(false)
        expect(card.style.opacity).toBe('')
        expect(detail.style.opacity).toBe('')
        await run
    })

    it('the author removing inert mid-run cannot make the follower interactive', async () => {
        const { mc, group } = harness()
        const card = element(20, 20)
        crossfade(group, card)
        const run = group.flush()
        mc.frame(16)
        expect(card.getAttribute('inert')).toBe('')
        // a hostile re-render removes the attribute in the commit
        card.removeAttribute('inert')
        group.capture()
        const again = group.flush()
        await microtasks()
        expect(card.getAttribute('inert')).toBe('')
        group.dispose()
        await Promise.all([run, again])
    })
})

describe('§8 focus-in-follower', () => {
    function focusedCard(): { card: HTMLElement; button: HTMLButtonElement } {
        const card = element(20, 20)
        const button = document.createElement('button')
        card.append(button)
        button.focus()
        return { card, button }
    }

    it('skips the pair: lead at A, no crossfade, diagnostic action none', async () => {
        const { mc, group } = harness()
        const { card, button } = focusedCard()
        const { events } = collect()
        const swipe = presenceLink(false)
        stops.push(linkPresence(card, swipe.link))
        group.add(card, { layoutId: 'shared', radius: false })
        group.capture()
        await group.flush()
        swipe.set(true)
        group.capture()
        const detail = element(360, 40, 300, 200)
        group.add(detail, { layoutId: 'shared', radius: false })
        const run = group.flush()
        // no crossfade: neither the follower nor the lead takes layout opacity
        expect(card.style.opacity).toBe('')
        expect(card.style.translate).toBe('')
        expect(detail.style.opacity).toBe('')
        expect(detail.style.translate).toBe('')
        expect(card.hasAttribute('inert')).toBe(false)
        expect(swipe.hold).not.toHaveBeenCalled()
        expect(document.activeElement).toBe(button)
        const focus = events.filter(
            (event) => event.code === 'focus-in-follower'
        )
        expect(focus).toHaveLength(1)
        expect(focus[0]!.action).toBe('none')
        expect(focus[0]!.element).toBe(card)
        expect(focus[0]!.engine).toBe('raf')
        expect(focus[0]!.version).toBe(1)
        await expect(run).resolves.toMatchObject({
            status: 'no-change',
            snapped: [],
        })
        mc.frames(3)
        expect(card.style.opacity).toBe('')
        expect(document.activeElement).toBe(button)
        group.dispose()
    })

    it('runs the crossfade when focus is inside the lead', async () => {
        const { mc, group } = harness()
        const { card } = focusedCard()
        const swipe = presenceLink(false)
        stops.push(linkPresence(card, swipe.link))
        group.add(card, { layoutId: 'shared', radius: false })
        group.capture()
        await group.flush()
        swipe.set(true)
        group.capture()
        const detail = element(360, 40, 300, 200)
        const button = document.createElement('button')
        detail.append(button)
        button.focus()
        group.add(detail, { layoutId: 'shared', radius: false })
        const run = group.flush()
        expect(card.getAttribute('inert')).toBe('')
        expect(detail.style.opacity).toBe('0')
        expect(document.activeElement).toBe(button)
        mc.frames(2)
        group.dispose()
        await run
    })

    it('a reversal with focus inside the new follower drops the pair without inert or opacity', async () => {
        const { mc, group } = harness()
        const card = element(20, 20)
        const swipe = presenceLink(false)
        const detailSwipe = presenceLink(false)
        stops.push(linkPresence(card, swipe.link))
        group.add(card, { layoutId: 'shared', radius: false })
        group.capture()
        await group.flush()
        swipe.set(true)
        group.capture()
        const detail = element(360, 40, 300, 200)
        const button = document.createElement('button')
        detail.append(button)
        stops.push(linkPresence(detail, detailSwipe.link))
        group.add(detail, { layoutId: 'shared', radius: false })
        const first = group.flush()
        mc.frames(2)
        expect(card.getAttribute('inert')).toBe('')
        expect(detail.style.opacity).not.toBe('')
        // focus inside the current lead is legal; the reversal then makes it
        // the exiting follower
        button.focus()
        swipe.set(false)
        detailSwipe.set(true)
        group.capture()
        const reverse = group.flush()
        // the pair is not coupled: both give their opacity back, neither is
        // inert (inert would take the focused element away)
        expect(detail.getAttribute('inert')).toBe(null)
        expect(card.hasAttribute('inert')).toBe(false)
        expect(detail.style.opacity).toBe('')
        expect(card.style.opacity).toBe('')
        expect(document.activeElement).toBe(button)
        await expect(reverse).resolves.toMatchObject({
            status: 'no-change',
            snapped: [],
        })
        group.dispose()
        await first
    })

    it('detects focus through an open and a closed shadow root', async () => {
        for (const mode of ['open', 'closed'] as const) {
            const { mc, group } = harness()
            const card = element(20, 20)
            const root = card.attachShadow({ mode })
            const button = document.createElement('button')
            root.append(button)
            button.focus()
            const { events } = collect()
            const swipe = presenceLink(false)
            stops.push(linkPresence(card, swipe.link))
            group.add(card, { layoutId: 'shared', radius: false })
            group.capture()
            await group.flush()
            swipe.set(true)
            group.capture()
            group.add(element(360, 40, 300, 200), {
                layoutId: 'shared',
                radius: false,
            })
            const run = group.flush()
            const focus = events.filter(
                (event) => event.code === 'focus-in-follower'
            )
            expect(focus, mode).toHaveLength(1)
            expect(card.hasAttribute('inert'), mode).toBe(false)
            mc.frame(16)
            group.dispose()
            await run
        }
    })
})

describe('§8 focus ownership', () => {
    it('keeps activeElement and author attributes across a reorder and a held re-render', async () => {
        const { mc, group } = harness()
        const a = element(20, 20)
        const b = element(200, 20)
        for (const node of [a, b]) {
            node.setAttribute('tabindex', '0')
            node.setAttribute('role', 'button')
            node.setAttribute('aria-pressed', 'true')
        }
        const button = document.createElement('button')
        a.append(button)
        button.focus()
        const authorAttributes = (node: HTMLElement) =>
            [...node.attributes]
                .filter((attribute) => attribute.name !== 'style')
                .map((attribute) => `${attribute.name}=${attribute.value}`)
        const attributes = authorAttributes(a)
        group.add(a, { radius: false })
        group.add(b, { radius: false })
        group.capture()
        await group.flush()
        // the keyed reorder: the same nodes move in the DOM; layout only
        // animates their boxes. The capture is the task's before-box read.
        group.capture()
        document.body.insertBefore(b, a)
        model.place(a, box(220, 20))
        model.place(b, box(20, 20))
        const reorder = group.flush()
        expect(document.activeElement).toBe(button)
        expect(a.style.translate).not.toBe('')
        mc.frames(2)
        expect(document.activeElement).toBe(button)
        // a held re-render: the same options, no box change
        group.capture()
        group.set(a, { radius: false })
        const rerender = group.flush()
        expect(document.activeElement).toBe(button)
        expect(a.style.translate).not.toBe('')
        mc.frames(2)
        expect(document.activeElement).toBe(button)
        expect(authorAttributes(a)).toEqual(attributes)
        for (const node of [a, b]) {
            expect(node.getAttribute('tabindex')).toBe('0')
            expect(node.getAttribute('role')).toBe('button')
            expect(node.getAttribute('aria-pressed')).toBe('true')
        }
        group.finish()
        await Promise.all([reorder, rerender])
        expect(document.activeElement).toBe(button)
        expect(authorAttributes(a)).toEqual(attributes)
        expect(a.style.cssText).toBe('')
        expect(b.style.cssText).toBe('')
        group.dispose()
        await microtasks()
    })
})
