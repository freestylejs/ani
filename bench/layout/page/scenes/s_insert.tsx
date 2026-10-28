/**
 * S-INSERT — Mail, three new messages at the top (React, P2; spec 2.7).
 *
 * The inbox is scrolled 1.5 viewports. Three messages are prepended above the
 * viewport under presence; the 13 driven visible rows spring down 234 px while
 * the scroll offset stays at 1000.
 */

import { ani, timing } from '@freestylejs/ani-core'
import {
    createManualClock,
    type ManualClock,
} from '@freestylejs/ani-core/testing'
import {
    type LayoutReport,
    layoutRuntime,
    type PresenceMotion,
} from '@freestylejs/ani-layout'
import {
    AnimatePresence,
    LayoutGroup,
    useLayout,
    useLayoutGroup,
    usePresence,
} from '@freestylejs/ani-react/layout'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Box } from '../../oracle.ts'
import type { RealTrace, SceneTrace } from '../../types.ts'
import {
    installRafSampler,
    isWebKitEngine,
    measureGranularityInfo,
    microtasks,
    nextFrame,
    TraceBuilder,
    viewBox,
    waitMs,
} from '../harness.ts'
import {
    FONT,
    finalState,
    installReadAudit,
    probeStage,
    recordCommit,
    reportTracker,
    SPRING,
    STATUS_CSS,
    styleOnce,
} from './kit.ts'
import { HomeIndicator, IosStatus } from './react_kit.tsx'

const ROW = 78
const SCROLL_TOP = 1000
const LIST_TOP = 143
const STATIC_BEFORE = 9
const PARTICIPANTS = 13
const NEW = 3
const KEYS = [
    ...Array.from({ length: NEW }, (_, i) => `new-${i}`),
    ...Array.from({ length: PARTICIPANTS }, (_, i) => `row-${9 + i}`),
]
const EXISTING_KEYS = KEYS.filter((key) => key.startsWith('row-'))
const NEW_KEYS = KEYS.filter((key) => key.startsWith('new-'))

interface Message {
    readonly id: string
    readonly sender: string
    readonly subject: string
    readonly preview: string
    readonly date: string
    readonly unread: boolean
}

const MESSAGES: readonly Message[] = [
    [
        'Ava Chen',
        'Design review',
        'The new motion study is ready for Friday.',
        '9:41',
    ],
    [
        'Noah Patel',
        'Standup notes',
        'Three things: scope, the trace, the gate.',
        '9:12',
    ],
    [
        'Mia Torres',
        'Weekend plans',
        'Are we still doing the coast on Saturday?',
        '8:54',
    ],
    ['Liam Brooks', 'Invoice 2041', 'Attached is the signed copy.', '8:31'],
    [
        'Sofia Reyes',
        'Re: onboarding',
        'This is exactly the flow I meant.',
        '8:02',
    ],
    ['Ethan Kim', 'Launch checklist', 'Only the benchmark remains.', '7:48'],
    ['Isla Morgan', 'Photos', 'The light in these is unreal.', '7:20'],
    [
        'Lucas Reed',
        'Research notes',
        'I left the PDF in the shared folder.',
        '6:58',
    ],
    ['Amara Singh', 'Offsite', 'Vote for the cabin by Wednesday.', 'Yesterday'],
    ['Jonas Weber', 'Build 447', 'The staged rollout is green.', 'Yesterday'],
    ['Nora Park', 'Lunch?', 'The ramen place at 12:30.', 'Yesterday'],
    ['Theo Alvarez', 'Contract', 'One clause left to settle.', 'Yesterday'],
    ['Zoe Martin', 'Weeknotes', 'A short one this week.', 'Monday'],
    ['Miles Foster', 'Gym', 'Leg day moved to Thursday.', 'Monday'],
    ['Elena Rossi', 'Tickets', 'Row F, seats 12 and 13.', 'Monday'],
    ['Kai Nakamura', 'Re: budget', 'Approved as written.', 'Sunday'],
    ['Priya Shah', 'Book club', 'Next pick is short.', 'Sunday'],
    ['Owen Grant', 'Server alert', 'Resolved at 03:12.', 'Saturday'],
    ['Lena Vogt', 'Birthday', 'Save the date.', 'Saturday'],
    ['Ben Carter', 'Lease', 'The landlord confirmed.', 'Friday'],
    ['Ruth Ellis', 'Garden', 'The tomatoes finally came in.', 'Friday'],
    ['Adam Novak', 'Trip', 'Train leaves at 7:05.', 'Thursday'],
    ['Iris Bell', 'Re: photos', 'Sending the originals tonight.', 'Thursday'],
    ['Sam Okafor', 'Invoice', 'Paid, thank you.', 'Wednesday'],
].map(([sender, subject, preview, date], index) => ({
    id: `m-${index}`,
    sender: sender!,
    subject: subject!,
    preview: preview!,
    date: date!,
    unread: index % 3 === 0,
}))

const NEW_MESSAGES: readonly Message[] = [
    {
        id: 'new-0',
        sender: 'Ana Duarte',
        subject: 'New message',
        preview: 'The layout trace is attached.',
        date: '9:41',
        unread: true,
    },
    {
        id: 'new-1',
        sender: 'Mika Ito',
        subject: 'New message',
        preview: 'Can you look at the frame gate?',
        date: '9:41',
        unread: true,
    },
    {
        id: 'new-2',
        sender: 'Leo Brandt',
        subject: 'New message',
        preview: 'Sending the final numbers now.',
        date: '9:41',
        unread: true,
    },
]

const NO_PRESENCE: PresenceMotion<{
    opacity: number
    translateY: number
    scale: number
}> = {
    present: { opacity: 1, translateY: 0, scale: 1 },
    exit: ani({
        to: { opacity: 1, translateY: 0, scale: 1 },
        duration: 0.01,
        timing: timing.linear(),
    }),
}

const INSERT_MOTION: PresenceMotion<{
    opacity: number
    translateY: number
    scale: number
}> = {
    present: { opacity: 1, translateY: 0, scale: 1 },
    initial: { opacity: 0, translateY: -24, scale: 0.98 },
    enter: ani({
        to: { opacity: 1, translateY: 0, scale: 1 },
        duration: 0.3,
        timing: timing.easeOut(),
    }),
    // No exit in this scene; the record is required by the presence API.
    exit: ani({
        to: { opacity: 1, translateY: 0, scale: 1 },
        duration: 0.01,
        timing: timing.linear(),
    }),
}

let stylesInstalled = false

function installStyles(): void {
    if (stylesInstalled) return
    stylesInstalled = true
    styleOnce(
        's-insert',
        `
        ${STATUS_CSS}
        .mail-stage {
            position: fixed; inset: 0; width: 390px; height: 844px;
            overflow: hidden; background: #F2F2F7; color: #000;
            font-family: ${FONT}; -webkit-font-smoothing: antialiased;
            font-optical-sizing: auto; color-scheme: light;
        }
        .mail-nav {
            position: absolute; left: 0; top: 47px; width: 390px; height: 44px;
            background: rgba(249,249,249,0.94); z-index: 3;
            border-bottom: 0.5px solid rgba(60,60,67,0.29);
            box-sizing: border-box;
        }
        .mail-nav-title { position: absolute; left: 0; top: 11px; width: 390px; text-align: center; font: 600 17px/22px ${FONT}; letter-spacing: -0.41px; }
        .mail-mailboxes { position: absolute; left: 16px; top: 11px; border: 0; padding: 0; background: transparent; color: #007AFF; font: 400 17px/22px ${FONT}; letter-spacing: -0.41px; }
        .mail-edit { position: absolute; right: 16px; top: 11px; border: 0; padding: 0; background: transparent; color: #007AFF; font: 400 17px/22px ${FONT}; letter-spacing: -0.41px; }
        .mail-search {
            position: absolute; left: 16px; top: 99px; width: 358px; height: 36px;
            border-radius: 10px; background: rgba(118,118,128,0.12); z-index: 2;
        }
        .mail-search span { position: absolute; left: 28px; top: 9px; font: 400 17px/22px ${FONT}; letter-spacing: -0.41px; color: rgba(60,60,67,0.60); }
        .mail-scroller {
            position: absolute; left: 0; top: 143px; width: 390px; height: 667px;
            overflow-y: auto; overflow-x: hidden; scrollbar-width: none;
            overscroll-behavior: contain; background: #FFFFFF; z-index: 1;
            /* Scene contribution: isolate the §12 uncompensated-shift shape
               from the browser's pre-read anchoring camera. */
            overflow-anchor: none;
        }
        .mail-scroller::-webkit-scrollbar { display: none; }
        .mail-list { position: relative; width: 390px; }
        .mail-row {
            position: relative; height: ${ROW}px; background: #FFFFFF;
            overflow: hidden; transform-origin: 50% 0%;
            box-sizing: border-box;
        }
        .mail-sep { position: absolute; left: 16px; right: 16px; bottom: 0; height: 0.5px; background: rgba(60,60,67,0.29); }
        .mail-dot { position: absolute; left: 8px; top: 35px; width: 8px; height: 8px; border-radius: 4px; background: #007AFF; }
        .mail-sender { position: absolute; left: 36px; top: 12px; width: 260px; font: 600 17px/22px ${FONT}; letter-spacing: -0.41px; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mail-date { position: absolute; right: 16px; top: 12px; font: 400 13px/18px ${FONT}; letter-spacing: -0.08px; color: rgba(60,60,67,0.60); }
        .mail-subject { position: absolute; left: 36px; top: 34px; width: 330px; font: 400 15px/20px ${FONT}; letter-spacing: -0.24px; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mail-preview { position: absolute; left: 36px; top: 52px; width: 330px; font: 400 15px/20px ${FONT}; letter-spacing: -0.24px; color: rgba(60,60,67,0.60); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    `
    )
}

interface InsertApi {
    control: { update(fn: () => void): Promise<LayoutReport> } | null
    insert: (() => void) | null
}

interface RowProps {
    readonly message: Message
    readonly keyName: string
    readonly clock: ManualClock['clock'] | undefined
    readonly record: (key: string, element: HTMLElement) => void
    readonly control: string | undefined
}

function MailRow({
    message,
    keyName,
    clock,
    record,
    control,
}: RowProps): React.ReactElement {
    const presence = usePresence(
        control === 'insert-no-presence' ? NO_PRESENCE : INSERT_MOTION,
        clock ? { clock } : {}
    )
    const layoutRef = useLayout<HTMLDivElement>({
        layout: 'position',
        radius: false,
        ref: presence.ref,
    })
    const recordRef = useRef(record)
    recordRef.current = record
    const composed = useMemo(
        () =>
            (element: HTMLDivElement | null): void => {
                if (element) recordRef.current(keyName, element)
                layoutRef(element)
            },
        [layoutRef, keyName]
    )
    return (
        <div
            ref={composed}
            data-p={keyName}
            className="mail-row"
            style={presence.style}
        >
            {message.unread ? <span className="mail-dot" /> : null}
            <span className="mail-sender">{message.sender}</span>
            <span className="mail-date">{message.date}</span>
            <span className="mail-subject">{message.subject}</span>
            <span className="mail-preview">{message.preview}</span>
            <span className="mail-sep" />
        </div>
    )
}

function StaticRow({
    message,
}: {
    readonly message: Message
}): React.ReactElement {
    return (
        <div className="mail-row" data-static="true">
            {message.unread ? <span className="mail-dot" /> : null}
            <span className="mail-sender">{message.sender}</span>
            <span className="mail-date">{message.date}</span>
            <span className="mail-subject">{message.subject}</span>
            <span className="mail-preview">{message.preview}</span>
            <span className="mail-sep" />
        </div>
    )
}

function InsertBody({
    api,
    record,
    ready,
    clock,
    control: controlFlag,
}: {
    readonly api: InsertApi
    readonly record: (key: string, element: HTMLElement) => void
    readonly ready: () => void
    readonly clock: ManualClock['clock'] | undefined
    readonly control: string | undefined
}): React.ReactElement {
    const control = useLayoutGroup()
    const [inserted, setInserted] = useState(false)
    api.control = control
    api.insert = () => setInserted(true)
    useEffect(() => {
        ready()
    }, [ready])
    const rows: React.ReactElement[] = []
    if (inserted) {
        NEW_MESSAGES.forEach((message, index) => {
            rows.push(
                <MailRow
                    key={`new-${index}`}
                    message={message}
                    keyName={`new-${index}`}
                    clock={clock}
                    record={record}
                    control={controlFlag}
                />
            )
        })
    }
    for (let i = 0; i < STATIC_BEFORE; i++) {
        rows.push(<StaticRow key={`s-${i}`} message={MESSAGES[i]!} />)
    }
    for (let i = 0; i < PARTICIPANTS; i++) {
        const index = 9 + i
        rows.push(
            <MailRow
                key={`row-${index}`}
                message={MESSAGES[index]!}
                keyName={`row-${index}`}
                clock={clock}
                record={record}
                control={controlFlag}
            />
        )
    }
    for (let i = 22; i < 24; i++) {
        rows.push(<StaticRow key={`s-${i}`} message={MESSAGES[i]!} />)
    }
    return (
        <>
            <IosStatus />
            <div className="mail-nav">
                <button className="mail-mailboxes" type="button">
                    ‹ Mailboxes
                </button>
                <span className="mail-nav-title">Inbox</span>
                <button
                    className="mail-edit"
                    type="button"
                    data-action="new-mail"
                >
                    Edit
                </button>
            </div>
            <div className="mail-search">
                <span>Search</span>
            </div>
            <div className="mail-scroller" data-scroller="">
                <div className="mail-list">
                    <AnimatePresence initial={false}>{rows}</AnimatePresence>
                </div>
            </div>
            <HomeIndicator />
        </>
    )
}

function probeBoxes(): Record<string, Box> {
    installStyles()
    const stage = probeStage()
    const scroller = document.createElement('div')
    scroller.className = 'mail-scroller'
    const list = document.createElement('div')
    list.className = 'mail-list'
    scroller.append(list)
    stage.append(scroller)
    const build = (inserted: boolean): void => {
        list.innerHTML = ''
        const rows: HTMLElement[] = []
        if (inserted) {
            for (let i = 0; i < NEW; i++) {
                const row = document.createElement('div')
                row.className = 'mail-row'
                list.append(row)
                rows.push(row)
            }
        }
        for (let i = 0; i < 24; i++) {
            const row = document.createElement('div')
            row.className = 'mail-row'
            list.append(row)
            rows.push(row)
        }
        scroller.scrollTop = SCROLL_TOP
        for (let i = 0; i < NEW; i++) {
            const row = rows[i]!
            boxes[`new-${i}@after`] = viewBox(row)
            row.style.transformOrigin = '50% 0%'
            row.style.transform = 'translateY(-24px) scale(0.98)'
            boxes[`new-${i}@enter`] = viewBox(row)
            row.style.transform = ''
        }
        for (let i = 0; i < 24; i++) {
            if (i >= STATIC_BEFORE && i < STATIC_BEFORE + PARTICIPANTS) {
                const participantIndex = i - STATIC_BEFORE
                boxes[`row-${9 + participantIndex}@after`] = viewBox(
                    rows[i + (inserted ? NEW : 0)]!
                )
            }
        }
    }
    const boxes: Record<string, Box> = {}
    build(false)
    build(true)
    stage.remove()
    return boxes
}

class InsertRuntime {
    readonly mc: ManualClock | null
    readonly builder: TraceBuilder | null
    readonly elements: Map<string, HTMLElement | null>
    readonly diagnostics: string[] = []
    readonly tracker: ReturnType<typeof reportTracker> | null
    readonly audit = installReadAudit()
    readonly api: InsertApi = { control: null, insert: null }
    readonly stage: HTMLDivElement
    mount: { root: { unmount(): void }; container: HTMLDivElement } | null =
        null
    frame = 0
    private readonly offDiagnostic: () => void
    private readonly record: (key: string, element: HTMLElement) => void

    private readonly control: string | undefined
    constructor(options: {
        mc: ManualClock | null
        builder: TraceBuilder | null
        elements?: Map<string, HTMLElement | null>
        control?: string | undefined
    }) {
        this.control = options.control
        installStyles()
        this.mc = options.mc
        this.builder = options.builder
        this.elements = options.elements ?? new Map()
        this.tracker = options.builder ? reportTracker(options.builder) : null
        this.offDiagnostic = layoutRuntime.onDiagnostic((event) => {
            this.diagnostics.push(event.code)
            this.builder?.diagnostic(
                event.code,
                event.action,
                this.frame,
                event.element?.dataset.p ?? null
            )
        })
        for (const key of KEYS) this.elements.set(key, null)
        this.record = (key, element) => {
            if (!this.builder) return
            this.builder.mount(key, element)
            this.elements.set(key, element)
        }
        this.stage = document.createElement('div')
        this.stage.className = 'mail-stage'
        document.body.append(this.stage)
    }

    async mountReact(): Promise<void> {
        const { createRoot } = await import('react-dom/client')
        const root = createRoot(this.stage)
        this.mount = { root, container: this.stage }
        let resolveReady: () => void = () => undefined
        const ready = new Promise<void>((resolve) => {
            resolveReady = resolve
        })
        const api = this.api
        const record = this.record
        const builder = this.builder
        const clock = this.mc?.clock
        root.render(
            <LayoutGroup
                {...(this.mc ? { clock: this.mc.clock } : {})}
                motion={SPRING.insert}
                reducedMotion="ignore"
                threshold={1}
                maxNodes={300}
                maxParticipants={2000}
                onSnap={(element: HTMLElement, reason: string) => {
                    builder?.snap(
                        element.dataset.p ?? 'unknown',
                        reason,
                        this.frame
                    )
                }}
            >
                <InsertBody
                    api={api}
                    record={record}
                    ready={resolveReady}
                    clock={clock}
                    control={this.control}
                />
            </LayoutGroup>
        )
        await ready
        await microtasks()
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve())
        )
    }

    async scrollToStart(): Promise<void> {
        const scroller = this.stage.querySelector('[data-scroller]')
        if (!(scroller instanceof HTMLElement)) throw new Error('no scroller')
        scroller.scrollTop = SCROLL_TOP
        await new Promise<void>((resolve) => {
            let done = false
            const finish = (): void => {
                if (done) return
                done = true
                scroller.removeEventListener('scrollend', finish)
                resolve()
            }
            scroller.addEventListener('scrollend', finish, { once: true })
            window.setTimeout(finish, 250)
        })
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve())
        )
        if (Math.abs(scroller.scrollTop - SCROLL_TOP) > 0.01)
            throw new Error(`insert: scrollTop ${scroller.scrollTop}`)
    }

    scrollOffset(): number {
        const scroller = this.stage.querySelector('[data-scroller]')
        return scroller instanceof HTMLElement ? scroller.scrollTop : 0
    }

    async drain(): Promise<void> {
        if (!this.api.control) return
        await this.api.control.update(() => undefined)
        await microtasks()
    }

    commit(label: string, run: () => void): Promise<LayoutReport> {
        const control = this.api.control!
        const result = recordCommit({
            builder: this.builder!,
            keys: KEYS,
            elements: this.elements,
            frame: this.frame,
            label,
            radiusKeys: new Set(),
            typedOM: isWebKitEngine(),
            audit: this.audit,
            // The audited engine set is pinned after the first measurement.
            stylesExpected: isWebKitEngine() ? 29 : 16,
            run: () => control.update(run),
        })
        this.builder!.record('flush', this.frame, label)
        this.tracker!.track(label, result.promise, () => this.frame)
        return result.promise
    }

    commitReal(run: () => void): Promise<LayoutReport> {
        return this.api.control!.update(run)
    }

    dispose(): void {
        this.offDiagnostic()
        this.audit.dispose()
        this.mount?.root.unmount()
        this.stage.remove()
    }
}

async function stepInsert(
    mc: ManualClock,
    builder: TraceBuilder,
    runtime: InsertRuntime
): Promise<void> {
    runtime.audit.begin()
    mc.frame(16)
    const counts = runtime.audit.end()
    runtime.frame += 1
    const total = counts.rects + counts.offsets + counts.styles + counts.typedOM
    if (total > 0) {
        builder.steadyFrameReads += total
        builder.steadyFrameReadsAt ??= runtime.frame
    }
    await microtasks()
    builder.record('frame', runtime.frame)
}

export class InsertScene {
    static async runManual(
        options: { control?: string | undefined } = {}
    ): Promise<SceneTrace> {
        const mc = createManualClock()
        const elements = new Map<string, HTMLElement | null>()
        const builder = new TraceBuilder({
            scene: 's-insert',
            stepMs: 16,
            keys: KEYS,
            elements,
            clock: mc,
        })
        const runtime = new InsertRuntime({
            mc,
            builder,
            elements,
            control: options.control,
        })
        await document.fonts.ready
        await runtime.mountReact()
        const probes = probeBoxes()
        for (const [key, box] of Object.entries(probes)) builder.aBox(key, box)
        // The new rows' declared pre-insert (presence-initial) boxes.
        for (let i = 0; i < NEW; i++) {
            const probe = document.createElement('div')
            probe.style.cssText = `position:absolute;left:0;top:0;width:390px;height:${ROW}px;visibility:hidden;`
            document.body.append(probe)
            probe.style.transformOrigin = '50% 0%'
            probe.style.transform = 'translateY(-24px) scale(0.98)'
            // the box is translated into place after the probe's rest frame
            const a = probes[`new-${i}@after`]!
            probe.style.position = 'fixed'
            probe.style.left = `${a.x}px`
            probe.style.top = `${a.y}px`
            probe.style.transformOrigin = '50% 0%'
            probe.style.transform = 'translateY(-24px) scale(0.98)'
            builder.initial(`new-${i}`, probe)
            probe.remove()
        }
        await runtime.scrollToStart()
        for (const key of EXISTING_KEYS) {
            const element = runtime.elements.get(key)
            if (element?.isConnected) builder.initial(key, element)
        }
        ;(window as unknown as { __scene?: unknown }).__scene = {
            scene: 's-insert',
            participants: KEYS,
            boxes: probes,
            scrollTop: SCROLL_TOP,
            motion: SPRING.insert,
        }
        await runtime.drain()
        try {
            builder.record('frame', 0)
            runtime.frame = 0
            runtime.commit('insert', () => runtime.api.insert?.())
            let guard = 0
            while (guard++ < 400) {
                if (runtime.tracker?.done.get('insert') && mc.clock.size === 0)
                    break
                await stepInsert(mc, builder, runtime)
            }
            await microtasks()
            await stepInsert(mc, builder, runtime)
            builder.settleFrames.push(runtime.frame)
            if (Math.abs(runtime.scrollOffset() - SCROLL_TOP) > 0.01) {
                throw new Error(
                    `insert: scrollTop moved to ${runtime.scrollOffset()}`
                )
            }
            const final = finalState({
                tracks: mc.clock.size,
                holds: 0,
                clockPending: mc.pending,
                clockSize: mc.clock.size,
                connected: KEYS.filter(
                    (key) => runtime.elements.get(key)?.isConnected
                ),
                diagnostics: runtime.diagnostics,
            })
            builder.record('frame', runtime.frame)
            return builder.build(final)
        } finally {
            runtime.dispose()
        }
    }

    static async runReal(): Promise<RealTrace> {
        const granularityInfo = measureGranularityInfo()
        const g = granularityInfo.value
        const sampler = installRafSampler()
        const runtime = new InsertRuntime({ mc: null, builder: null })
        await document.fonts.ready
        await runtime.mountReact()
        await runtime.scrollToStart()
        await runtime.drain()
        const commits: { label: string; at: number }[] = []
        try {
            await nextFrame()
            await nextFrame()
            sampler.markCommit()
            const insert = runtime.commitReal(() => runtime.api.insert?.())
            commits.push({ label: 'insert', at: performance.now() })
            await insert
            for (let i = 0; i < 4; i++) await nextFrame()
            const final = {
                tracks: 0,
                holds: 0,
                connected: KEYS.filter(
                    (key) => runtime.elements.get(key)?.isConnected
                ).length,
            }
            runtime.dispose()
            sampler.stop()
            const frames = [...sampler.frames]
            return {
                scene: 's-insert',
                mode: 'real',
                g,
                gSource: granularityInfo.source,
                frameCosts: frames,
                commits,
                diagnostics: [...runtime.diagnostics],
                final,
            }
        } catch (error) {
            runtime.dispose()
            sampler.stop()
            throw error
        }
    }

    static async demo(): Promise<void> {
        for (;;) {
            await InsertScene.runReal()
            await waitMs(700)
        }
    }
}

export const INSERT_KEYS = KEYS
export const INSERT_EXISTING_KEYS = EXISTING_KEYS
export const INSERT_NEW_KEYS = NEW_KEYS
