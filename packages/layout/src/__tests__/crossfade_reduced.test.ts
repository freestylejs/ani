// @vitest-environment jsdom

// H20 (§5.8, §6, §9.4): the two reduced-motion crossfade failures H19 found
// in S-CARD. `'jump'` must end a pair as a completed fade (lead restored,
// follower held invisible, inert, radius at the lead's endpoint), and
// `{ maxDuration }` must keep the follower and its counter-projected content
// on the lead's clamped track until the lead's own track ends — no
// per-participant divergence.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClock } from '../../../core/src/testing/index'
import type { Box } from '../geometry'
import { linkPresence } from '../presence_link'
import { layoutRuntime } from '../runtime'
import { createLayoutGroup } from '../scope'
import type { LayoutGroup, LayoutReport } from '../types'
import { createRectModel, type RectModel } from './rect_model'

const motion = { type: 'spring', duration: 0.55, bounce: 0.05 } as const
let model: RectModel

beforeEach(() => {
    model = createRectModel()
    layoutRuntime.setMode('animate')
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    document.body.innerHTML = ''
})

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function element(at: Box, parent: HTMLElement = document.body): HTMLElement {
    const e = document.createElement('div')
    parent.append(e)
    model.place(e, at)
    return e
}

interface FakePresence {
    readonly link: {
        readonly exiting: boolean
        readonly opacity: false
        hold(until: Promise<void>): void
    }
    set(exiting: boolean): void
    readonly holds: Promise<void>[]
}

function presence(): FakePresence {
    let exiting = false
    const holds: Promise<void>[] = []
    return {
        link: {
            get exiting() {
                return exiting
            },
            opacity: false,
            hold(until) {
                holds.push(until)
            },
        },
        set(value) {
            exiting = value
        },
        holds,
    }
}

function setRadius(element: HTMLElement, value: string): void {
    element.style.borderTopLeftRadius = value
    element.style.borderTopRightRadius = value
    element.style.borderBottomRightRadius = value
    element.style.borderBottomLeftRadius = value
}

function expectBox(actual: Box, expected: Box, label: string): void {
    for (const key of ['x', 'y', 'w', 'h'] as const) {
        expect(
            Math.abs(actual[key] - expected[key]),
            `${label}.${key}: ${actual[key]} vs ${expected[key]}`
        ).toBeLessThanOrEqual(0.05)
    }
}

const CARD = { x: 16, y: 176, w: 358, h: 440 } as const
const SHEET = { x: 0, y: 0, w: 390, h: 844 } as const
const CARD_TITLE = { x: 36, y: 492, w: 300, h: 56 } as const
const SHEET_TITLE = { x: 20, y: 528, w: 300, h: 56 } as const

describe('H20 §9.4 jump: a handoff ends as a completed fade', () => {
    it('holds the follower at opacity 0 with inert and the lead radius, then restores on unmount', async () => {
        const clock = createManualClock({ reducedMotion: true })
        const group = createLayoutGroup({
            clock: clock.clock,
            motion,
            reducedMotion: 'jump',
            threshold: 1,
        })
        const stops: (() => void)[] = []
        const card = element(CARD)
        setRadius(card, '20px')
        const cardPresence = presence()
        const sheetPresence = presence()
        stops.push(group.add(card, { layoutId: 'card', radius: true }))
        stops.push(linkPresence(card, cardPresence.link))
        group.capture()
        await group.flush()

        cardPresence.set(true)
        group.capture()
        const sheet = element(SHEET)
        const sheetContent = element(SHEET, sheet)
        stops.push(group.add(sheet, { layoutId: 'card', radius: true }))
        stops.push(group.add(sheetContent, { layout: 'position' }))
        stops.push(linkPresence(sheet, sheetPresence.link))
        const open = group.flush()

        // The flush is the fade's endpoint: lead restored, follower hidden,
        // inert and drawing the lead's radius, held where it was presented.
        expect(sheet.style.opacity).toBe('')
        expect(card.style.opacity).toBe('0')
        expect(card.getAttribute('inert')).toBe('')
        expect(card.style.borderTopLeftRadius).toBe('0px 0px')
        expectBox(model.rect(card), CARD, 'card')
        expect(await open).toMatchObject({ status: 'reduced' })

        clock.frames(2)
        expect(card.style.opacity).toBe('0')
        expect(card.getAttribute('inert')).toBe('')
        expectBox(model.rect(card), CARD, 'card held')

        // The lead gives its declarations back on unmount; the follower
        // restores its authored opacity, radius and inert byte-identically.
        stops[0]!()
        stops[1]!()
        expect(card.style.opacity).toBe('')
        expect(card.style.borderTopLeftRadius).toBe('20px')
        expect(card.hasAttribute('inert')).toBe(false)
        group.dispose()
        for (const stop of stops) stop()
    })

    it('finishes a running crossfade when the clock turns jump on', async () => {
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion,
            reducedMotion: 'jump',
            threshold: 1,
        })
        const stops: (() => void)[] = []
        const card = element(CARD)
        setRadius(card, '20px')
        const cardPresence = presence()
        const sheetPresence = presence()
        stops.push(group.add(card, { layoutId: 'card', radius: true }))
        stops.push(linkPresence(card, cardPresence.link))
        group.capture()
        await group.flush()

        cardPresence.set(true)
        group.capture()
        const sheet = element(SHEET)
        setRadius(sheet, '0px')
        stops.push(group.add(sheet, { layoutId: 'card', radius: true }))
        stops.push(linkPresence(sheet, sheetPresence.link))
        void group.flush()
        clock.frames(2)
        // The full-motion crossfade is in flight: both layers own opacity and
        // the follower is inert.
        expect(card.style.opacity).not.toBe('')
        expect(sheet.style.opacity).not.toBe('')

        // The preference turns on; the next flush finishes the fade at once.
        clock.setReducedMotion(true)
        group.capture()
        void group.flush()
        expect(sheet.style.opacity).toBe('')
        expect(sheet.style.borderTopLeftRadius).toBe('0px')
        expect(card.style.opacity).toBe('0')
        expect(card.getAttribute('inert')).toBe('')
        expect(card.style.borderTopLeftRadius).toBe('0px 0px')

        stops[0]!()
        expect(card.style.opacity).toBe('')
        expect(card.style.borderTopLeftRadius).toBe('20px')
        expect(card.hasAttribute('inert')).toBe(false)
        group.dispose()
        for (const stop of stops) stop()
    })

    it('restores the follower as the new lead and hides the old lead at the endpoint', async () => {
        const clock = createManualClock({ reducedMotion: true })
        const group = createLayoutGroup({
            clock: clock.clock,
            motion,
            reducedMotion: 'jump',
            threshold: 1,
        })
        const stops: (() => void)[] = []
        const cardPresence = presence()
        const sheetPresence = presence()
        const card = element(CARD)
        setRadius(card, '20px')
        stops.push(group.add(card, { layoutId: 'card', radius: true }))
        stops.push(linkPresence(card, cardPresence.link))
        group.capture()
        await group.flush()

        cardPresence.set(true)
        group.capture()
        const sheet = element(SHEET)
        setRadius(sheet, '0px')
        stops.push(group.add(sheet, { layoutId: 'card', radius: true }))
        stops.push(linkPresence(sheet, sheetPresence.link))
        await group.flush()
        clock.frames(1)

        // Reverse to the card under jump: the old follower becomes the visible
        // lead again (opacity and authored radius back) and the old lead is
        // held invisible with the new lead's radius.
        cardPresence.set(false)
        sheetPresence.set(true)
        group.capture()
        const reverse: Promise<LayoutReport> = group.flush()
        expect(card.style.opacity).toBe('')
        expect(card.style.borderTopLeftRadius).toBe('20px')
        expect(card.hasAttribute('inert')).toBe(false)
        expect(sheet.style.opacity).toBe('0')
        expect(sheet.getAttribute('inert')).toBe('')
        expect(sheet.style.borderTopLeftRadius).toBe('20px 20px')
        expectBox(model.rect(sheet), SHEET, 'sheet')
        expect(await reverse).toMatchObject({ status: 'reduced' })

        stops[2]!()
        expect(sheet.style.opacity).toBe('')
        expect(sheet.style.borderTopLeftRadius).toBe('0px')
        expect(sheet.hasAttribute('inert')).toBe(false)
        group.dispose()
        for (const stop of stops) stop()
    })
})

describe('H22 §5.8/§9.1: a crossfade settles as a completed fade', () => {
    interface FullPair {
        readonly clock: ReturnType<typeof createManualClock>
        readonly group: LayoutGroup
        readonly stops: (() => void)[]
        readonly card: HTMLElement
        readonly sheet: HTMLElement
        readonly cardPresence: FakePresence
        readonly sheetPresence: FakePresence
        readonly open: Promise<LayoutReport>
    }

    async function fullPair(maxParticipants?: number): Promise<FullPair> {
        const clock = createManualClock()
        const group = createLayoutGroup({
            clock: clock.clock,
            motion,
            threshold: 1,
            ...(maxParticipants === undefined ? {} : { maxParticipants }),
        })
        const stops: (() => void)[] = []
        const cardPresence = presence()
        const sheetPresence = presence()
        const card = element(CARD)
        setRadius(card, '20px')
        stops.push(group.add(card, { layoutId: 'card', radius: true }))
        stops.push(linkPresence(card, cardPresence.link))
        group.capture()
        await group.flush()

        cardPresence.set(true)
        group.capture()
        const sheet = element(SHEET)
        setRadius(sheet, '0px')
        stops.push(group.add(sheet, { layoutId: 'card', radius: true }))
        stops.push(linkPresence(sheet, sheetPresence.link))
        return {
            clock,
            group,
            stops,
            card,
            sheet,
            cardPresence,
            sheetPresence,
            open: group.flush(),
        }
    }

    it('finish() during a crossfade holds the follower invisible and inert until unmount', async () => {
        const p = await fullPair()
        p.clock.frames(2)
        expect(p.card.style.opacity).not.toBe('')
        expect(p.card.getAttribute('inert')).toBe('')

        // The author ends the group mid-fade. The lead is restored, but the
        // exiting follower belongs to presence: it stays at opacity 0 and
        // inert until presence unmounts it (§5.8, §6).
        p.group.finish()
        expect(await p.open).toMatchObject({ status: 'ended' })
        expect(p.sheet.style.opacity).toBe('')
        expect(p.sheet.style.borderTopLeftRadius).toBe('0px')
        expect(p.card.style.opacity).toBe('0')
        expect(p.card.getAttribute('inert')).toBe('')

        p.clock.frames(2)
        expect(p.card.style.opacity).toBe('0')
        expect(p.card.getAttribute('inert')).toBe('')

        p.stops[0]!()
        p.stops[1]!()
        expect(p.card.style.opacity).toBe('')
        expect(p.card.style.borderTopLeftRadius).toBe('20px')
        expect(p.card.hasAttribute('inert')).toBe(false)
        p.group.dispose()
        for (const stop of p.stops) stop()
    })

    it('finish() after the fade end does not restore the still-mounted follower', async () => {
        const p = await fullPair()
        // Frames until the pair's fade is over: the lead has restored its
        // authored opacity and the follower is at opacity 0 and inert, still
        // mounted under presence.
        let frames = 0
        while (p.sheet.style.opacity !== '' && frames < 120) {
            p.clock.frames(1)
            frames += 1
        }
        expect(frames).toBeLessThan(120)
        expect(p.sheet.style.opacity).toBe('')
        expect(p.card.style.opacity).toBe('0')
        expect(p.card.getAttribute('inert')).toBe('')

        // A finish after the fade has ended must not revive the follower.
        p.group.finish()
        expect(p.sheet.style.opacity).toBe('')
        expect(p.card.style.opacity).toBe('0')
        expect(p.card.getAttribute('inert')).toBe('')

        p.stops[0]!()
        p.stops[1]!()
        expect(p.card.style.opacity).toBe('')
        expect(p.card.hasAttribute('inert')).toBe(false)
        p.group.dispose()
        for (const stop of p.stops) stop()
    })

    it('a capped flush mid-fade keeps the follower invisible and inert until unmount', async () => {
        const p = await fullPair(2)
        p.clock.frames(2)
        expect(p.card.style.opacity).not.toBe('')

        // A mount over the participant cap snaps the scope, but a cap is a
        // degradation, not the author's removal: the follower is still
        // presence's, so it ends the fade invisible and inert (§9.1).
        const extra = element({ x: 10, y: 10, w: 10, h: 10 })
        p.stops.push(p.group.add(extra))
        p.group.capture()
        const capped = await p.group.flush()
        expect(capped.status).toBe('capped')
        expect(capped.snapped.map((s) => s.reason)).toEqual([
            'capped',
            'capped',
            'capped',
        ])
        expect(p.sheet.style.opacity).toBe('')
        expect(p.card.style.opacity).toBe('0')
        expect(p.card.getAttribute('inert')).toBe('')

        p.stops[0]!()
        p.stops[1]!()
        expect(p.card.style.opacity).toBe('')
        expect(p.card.hasAttribute('inert')).toBe(false)
        p.group.dispose()
        for (const stop of p.stops) stop()
    })

    it('removing the lead mid-fade ends the fade instead of leaving the follower visible', async () => {
        const p = await fullPair()
        p.clock.frames(2)
        expect(p.card.style.opacity).not.toBe('')
        let released = false
        for (const hold of p.cardPresence.holds) {
            void hold.then(() => {
                released = true
            })
        }
        expect(p.cardPresence.holds.length).toBeGreaterThan(0)

        // The lead leaves the scope while the pair is still fading. The
        // follower has no track to draw any more and must not remain a
        // partially visible ghost until presence unmounts it (F5).
        p.stops[2]!()
        p.clock.frames(1)
        await Promise.resolve()
        expect(released).toBe(true)
        expect(p.card.style.opacity).toBe('0')
        expect(p.card.getAttribute('inert')).toBe('')

        p.stops[0]!()
        p.stops[1]!()
        expect(p.card.style.opacity).toBe('')
        expect(p.card.hasAttribute('inert')).toBe(false)
        p.group.dispose()
        for (const stop of p.stops) stop()
    })
})

describe('H20 §9.4 { maxDuration }: one clamped track for the pair', () => {
    interface Pair {
        readonly clock: ReturnType<typeof createManualClock>
        readonly group: LayoutGroup
        readonly stops: (() => void)[]
        readonly card: HTMLElement
        readonly cardTitle: HTMLElement
        readonly sheet: HTMLElement
        readonly sheetTitle: HTMLElement
        readonly sheetContent: HTMLElement
        readonly cardPresence: FakePresence
        readonly sheetPresence: FakePresence
    }

    async function pair(): Promise<Pair> {
        const clock = createManualClock({ reducedMotion: true })
        const group = createLayoutGroup({
            clock: clock.clock,
            motion,
            reducedMotion: { maxDuration: 0.2 },
            threshold: 1,
        })
        const stops: (() => void)[] = []
        const cardPresence = presence()
        const sheetPresence = presence()
        const card = element(CARD)
        const cardTitle = element(CARD_TITLE, card)
        stops.push(group.add(card, { layoutId: 'card', radius: false }))
        stops.push(group.add(cardTitle, { layoutId: 'title', radius: false }))
        stops.push(linkPresence(card, cardPresence.link))
        stops.push(linkPresence(cardTitle, cardPresence.link))
        group.capture()
        await group.flush()

        cardPresence.set(true)
        group.capture()
        const sheet = element(SHEET)
        const sheetTitle = element(SHEET_TITLE, sheet)
        const sheetContent = element(SHEET, sheet)
        stops.push(group.add(sheet, { layoutId: 'card', radius: false }))
        stops.push(group.add(sheetTitle, { layoutId: 'title', radius: false }))
        stops.push(group.add(sheetContent, { layout: 'position' }))
        stops.push(linkPresence(sheet, sheetPresence.link))
        stops.push(linkPresence(sheetTitle, sheetPresence.link))
        return {
            clock,
            group,
            stops,
            card,
            cardTitle,
            sheet,
            sheetTitle,
            sheetContent,
            cardPresence,
            sheetPresence,
        }
    }

    function toTrackEnd(
        group: LayoutGroup,
        clock: ReturnType<typeof createManualClock>,
        label: string
    ): void {
        let frames = 0
        // A spring's crossfade ends at its perceptual duration; every pose
        // follows its track to its settle. The scope reports tracks until the
        // last lead settles; each pair may clamp to a different factor.
        while (group.stats.tracks > 0 && frames < 600) {
            clock.frames(1)
            frames += 1
        }
        expect(frames, `${label}: track did not end`).toBeLessThan(600)
        expect(group.stats.tracks).toBe(0)
    }

    it('draws the follower and its title at the lead until the lead track ends', async () => {
        const p = await pair()
        const open = p.group.flush()
        const released: boolean[] = []
        p.cardPresence.holds.forEach((hold, i) => {
            released[i] = false
            void hold.then(() => {
                released[i] = true
            })
        })
        // Each exiting follower (card and its title) holds presence's release.
        expect(p.cardPresence.holds).toHaveLength(2)
        expect(p.sheetPresence.holds).toHaveLength(0)

        for (let frame = 0; frame < 12; frame++) {
            if (frame > 0) p.clock.frames(1)
            // §5.8: both layers draw at the lead's clamped track; the clamp
            // chose the same timeline for the pair, so the follower never
            // freezes relative to a still-moving parent.
            expectBox(
                model.rect(p.card),
                model.rect(p.sheet),
                `card at lead, frame ${frame}`
            )
            expectBox(
                model.rect(p.cardTitle),
                model.rect(p.sheetTitle),
                `card-title at lead, frame ${frame}`
            )
            // The nested counter-projected participant stays at its own A.
            expectBox(
                model.rect(p.sheetContent),
                SHEET,
                `sheet-content at A, frame ${frame}`
            )
        }
        toTrackEnd(p.group, p.clock, 'open')
        // Fade end: both layers land on the lead's absolute A, not merely on
        // each other, and the follower is invisible and inert while mounted.
        expectBox(model.rect(p.card), SHEET, 'card at SHEET')
        expectBox(model.rect(p.sheet), SHEET, 'sheet at SHEET')
        expectBox(
            model.rect(p.cardTitle),
            SHEET_TITLE,
            'card-title at SHEET_TITLE'
        )
        expectBox(
            model.rect(p.sheetTitle),
            SHEET_TITLE,
            'sheet-title at SHEET_TITLE'
        )
        expect(p.sheet.style.opacity).toBe('')
        expect(p.card.style.opacity).toBe('0')
        expect(p.card.getAttribute('inert')).toBe('')
        expect(p.sheetTitle.style.opacity).toBe('')
        expect(p.cardTitle.style.opacity).toBe('0')
        expect(p.cardTitle.getAttribute('inert')).toBe('')
        await Promise.resolve()
        expect(released).toEqual([true, true])
        expect(await open).toMatchObject({ status: 'ended' })

        // Presence releases and unmounts both followers: their authored
        // opacity, radius and inert come back byte-identically.
        p.stops[0]!()
        p.stops[1]!()
        expect(p.card.style.opacity).toBe('')
        expect(p.card.hasAttribute('inert')).toBe(false)
        expect(p.cardTitle.style.opacity).toBe('')
        expect(p.cardTitle.hasAttribute('inert')).toBe(false)
        for (const stop of p.stops) stop()
        p.group.dispose()
    })

    it('keeps the counter-projected content at A across fade end and reversal', async () => {
        const p = await pair()
        p.group.flush()
        p.clock.frames(12)

        // Close: the sheet and its nested followers exit; the card leads.
        p.cardPresence.set(false)
        p.sheetPresence.set(true)
        p.group.capture()
        const closeBase = p.sheetPresence.holds.length
        p.group.flush()
        const closeReleased: boolean[] = []
        p.sheetPresence.holds.slice(closeBase).forEach((hold, i) => {
            closeReleased[i] = false
            void hold.then(() => {
                closeReleased[i] = true
            })
        })
        expect(p.sheetPresence.holds.length - closeBase).toBe(2)
        for (let frame = 0; frame < 8; frame++) {
            if (frame > 0) p.clock.frames(1)
            expectBox(
                model.rect(p.sheetContent),
                SHEET,
                `sheet-content at A after fade end, frame ${frame}`
            )
            expectBox(
                model.rect(p.sheetTitle),
                model.rect(p.cardTitle),
                `sheet-title at lead, frame ${frame}`
            )
        }
        toTrackEnd(p.group, p.clock, 'close')
        // The close's clamped track lands the pair on the card's absolute A.
        expectBox(model.rect(p.card), CARD, 'card at CARD')
        expectBox(model.rect(p.sheet), CARD, 'sheet at CARD')
        expectBox(
            model.rect(p.cardTitle),
            CARD_TITLE,
            'card-title at CARD_TITLE'
        )
        expectBox(
            model.rect(p.sheetTitle),
            CARD_TITLE,
            'sheet-title at CARD_TITLE'
        )
        expect(p.card.style.opacity).toBe('')
        expect(p.sheet.style.opacity).toBe('0')
        expect(p.sheet.getAttribute('inert')).toBe('')
        expect(p.sheetTitle.style.opacity).toBe('0')
        expect(p.sheetTitle.getAttribute('inert')).toBe('')
        await Promise.resolve()
        expect(closeReleased).toEqual([true, true])

        // Reverse at the close's clamped fade end: the content must still
        // counter-project rather than inherit the follower's frozen map.
        p.cardPresence.set(true)
        p.sheetPresence.set(false)
        p.group.capture()
        const holdsBefore = p.cardPresence.holds.length
        p.group.flush()
        const openReleased: boolean[] = []
        p.cardPresence.holds.slice(holdsBefore).forEach((hold, i) => {
            openReleased[i] = false
            void hold.then(() => {
                openReleased[i] = true
            })
        })
        expect(p.cardPresence.holds.length - holdsBefore).toBe(2)
        for (let frame = 0; frame < 12; frame++) {
            if (frame > 0) p.clock.frames(1)
            expectBox(
                model.rect(p.sheetContent),
                SHEET,
                `sheet-content at A on reversal, frame ${frame}`
            )
        }
        toTrackEnd(p.group, p.clock, 'reverse')
        // The reverse pair lands on the sheet's absolute A with the old lead
        // held invisible and inert under presence.
        expectBox(model.rect(p.sheet), SHEET, 'sheet at SHEET after reversal')
        expectBox(model.rect(p.card), SHEET, 'card at SHEET after reversal')
        expectBox(
            model.rect(p.sheetTitle),
            SHEET_TITLE,
            'sheet-title at SHEET_TITLE after reversal'
        )
        expectBox(
            model.rect(p.cardTitle),
            SHEET_TITLE,
            'card-title at SHEET_TITLE after reversal'
        )
        expect(p.sheet.style.opacity).toBe('')
        expect(p.card.style.opacity).toBe('0')
        expect(p.card.getAttribute('inert')).toBe('')
        expect(p.cardTitle.style.opacity).toBe('0')
        expect(p.cardTitle.getAttribute('inert')).toBe('')
        await Promise.resolve()
        expect(openReleased).toEqual([true, true])
        for (const stop of p.stops) stop()
        p.group.dispose()
    })
})
