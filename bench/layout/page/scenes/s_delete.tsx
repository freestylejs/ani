/**
 * S-DELETE — Reminders delete (React, P2; scene spec 2.8).
 *
 * Row 2 is swiped left and deleted; the exiting row is lifted at its
 * presented box and slides out under presence. Row 5 is deleted 100 ms later
 * while its gap is still closing; its lift starts at the mid-flight box.
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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
    waitUntil,
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

const ROWS = 9
const ROW_H = 56
const PITCH = 64
const LIST_TOP = 190
const STEP = 10
const KEYS = Array.from({ length: ROWS }, (_, i) => `row-${i}`)
const TITLES = [
    'Call the dentist',
    'Pick up the dry cleaning',
    'Book the train tickets',
    'Send the invoice',
    'Water the plants',
    'Return the library books',
    'Renew the passport',
    'Order the cake',
    'Email the landlord',
]
const DUES = [
    'Today, 9:00',
    'Today, 11:30',
    'Today, 14:00',
    'Today, 16:00',
    'Tomorrow',
    'Tomorrow',
    'Friday',
    'Saturday',
    'Next week',
]

const DELETE_MOTION: PresenceMotion<{ translateX: number }> = {
    present: { translateX: 0 },
    exit: ani({
        to: { translateX: -390 },
        duration: 0.25,
        timing: timing.linear(),
    }),
}

let stylesInstalled = false

function installStyles(): void {
    if (stylesInstalled) return
    stylesInstalled = true
    styleOnce(
        's-delete',
        `
        ${STATUS_CSS}
        .rem-stage {
            position: fixed; inset: 0; width: 390px; height: 844px;
            overflow: hidden; background: #F2F2F7; color: #000;
            font-family: ${FONT}; -webkit-font-smoothing: antialiased;
            font-optical-sizing: auto; color-scheme: light;
        }
        .rem-title { position: absolute; left: 16px; top: 100px; font: 700 34px/41px ${FONT}; letter-spacing: 0.4px; }
        .rem-add { position: absolute; right: 16px; top: 56px; border: 0; padding: 0; background: transparent; color: #007AFF; font: 700 28px/28px ${FONT}; }
        .rem-section { position: absolute; left: 16px; top: 168px; font: 600 13px/18px ${FONT}; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(60,60,67,0.60); }
        .rem-list { position: absolute; left: 0; top: ${LIST_TOP}px; width: 390px; }
        .rem-row {
            position: relative; left: 16px; width: 358px; height: ${ROW_H}px;
            margin-bottom: 8px; box-sizing: border-box; background: #FFFFFF;
            border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.04);
            overflow: hidden; z-index: 1; transform-origin: 50% 50%;
        }
        .rem-row:focus { outline: none; }
        .rem-check {
            position: absolute; left: 16px; top: 17px; width: 22px; height: 22px;
            border-radius: 11px; border: 1.5px solid #C7C7CC; box-sizing: border-box;
            background: #FFFFFF;
        }
        .rem-check[data-checked="true"] { border-color: #007AFF; background: #007AFF; }
        .rem-check[data-checked="true"]::after {
            content: ''; position: absolute; left: 6px; top: 3px; width: 6px; height: 10px;
            border: solid #FFFFFF; border-width: 0 2px 2px 0; transform: rotate(45deg);
        }
        .rem-row-title { position: absolute; left: 50px; top: 10px; width: 280px; font: 400 17px/22px ${FONT}; letter-spacing: -0.41px; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rem-due { position: absolute; left: 50px; top: 31px; font: 400 13px/18px ${FONT}; letter-spacing: -0.08px; color: rgba(60,60,67,0.60); }
        .rem-chev { position: absolute; right: 16px; top: 22px; width: 8px; height: 13px; color: #C7C7CC; }
        .rem-delete {
            position: absolute; left: 294px; width: 80px; height: ${ROW_H}px;
            border: 0; border-radius: 10px; background: #FF3B30; color: #FFFFFF;
            font: 600 15px/20px ${FONT}; letter-spacing: -0.24px; z-index: 0;
        }
        .rem-toolbar {
            position: absolute; left: 16px; top: 56px; width: 0; height: 0;
            opacity: 0; border: 0; padding: 0; background: transparent;
        }
    `
    )
}

interface DeleteApi {
    control: { update(fn: () => void): Promise<LayoutReport> } | null
    remove: ((rows: readonly number[]) => void) | null
}

interface RowProps {
    readonly i: number
    readonly clock: ManualClock['clock'] | undefined
    readonly record: (key: string, element: HTMLElement) => void
    readonly control: string | undefined
    readonly manual: boolean
}

function RemRow({
    i,
    clock,
    record,
    control,
    manual,
}: RowProps): React.ReactElement {
    const presence = usePresence(DELETE_MOTION, clock ? { clock } : {})
    const layoutRef = useLayout<HTMLDivElement>({
        layout: 'position',
        radius: true,
        layoutKey:
            control === 'delete-no-lift' || presence.isPresent
                ? 'live'
                : `exiting-${i}`,
    })
    const recordRef = useRef(record)
    recordRef.current = record
    const elementRef = useRef<HTMLDivElement | null>(null)
    const detached = useRef(false)
    const presented = useRef<{
        left: number
        top: number
        width: number
        height: number
    } | null>(null)
    if (!presence.isPresent && elementRef.current && !presented.current) {
        // Read the presented box in the exiting render, before the presence
        // exit writes its own transform (the popLayout lift is computed from
        // the same box).
        const rect = elementRef.current.getBoundingClientRect()
        const parent = elementRef.current.parentElement
        const parentRect = parent?.getBoundingClientRect() ?? {
            left: 0,
            top: 0,
        }
        presented.current = {
            left: rect.left - parentRect.left,
            top: rect.top - parentRect.top,
            width: rect.width,
            height: rect.height,
        }
    }
    const composed = useMemo(
        () =>
            (element: HTMLDivElement | null): void => {
                elementRef.current = element
                if (element) recordRef.current(`row-${i}`, element)
                layoutRef(element)
                presence.ref(element)
            },
        [layoutRef, presence.ref, i]
    )
    useLayoutEffect(() => {
        const element = elementRef.current
        if (!element || presence.isPresent || detached.current) return
        detached.current = true
        if (control === 'delete-no-lift' && i === 5) return
        const box = presented.current
        if (!box) return
        // popLayout divides the authored translateX out of the CSS box; pin the
        // lifted element to the presented box so the layout track ends there
        // and the presence translateX starts from 0. The participant stays
        // registered for the capture/flush read counts (§4.1/§4.3).
        element.style.position = 'absolute'
        element.style.left = `${box.left}px`
        element.style.top = `${box.top}px`
        element.style.width = `${box.width}px`
        element.style.height = `${box.height}px`
        element.style.margin = '0'
        element.style.transform = ''
        if (manual) return
        element.style.transition = 'opacity 200ms linear'
        element.style.opacity = '0'
    }, [presence.isPresent, layoutRef, control, i, manual])
    return (
        <div
            ref={composed}
            data-p={`row-${i}`}
            className="rem-row"
            tabIndex={-1}
            style={presence.style}
        >
            <span
                className="rem-check"
                data-checked={i % 3 === 0 ? 'true' : 'false'}
            />
            <span className="rem-row-title">{TITLES[i]}</span>
            <span className="rem-due">{DUES[i]}</span>
            <svg className="rem-chev" viewBox="0 0 8 13" aria-hidden="true">
                <path
                    d="M1.5 1.5 6.5 6.5l-5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </div>
    )
}

function DeleteBody({
    api,
    record,
    ready,
    clock,
    manual,
    control: controlFlag,
}: {
    readonly api: DeleteApi
    readonly record: (key: string, element: HTMLElement) => void
    readonly ready: () => void
    readonly clock: ManualClock['clock'] | undefined
    readonly control: string | undefined
    readonly manual: boolean
}): React.ReactElement {
    const control = useLayoutGroup()
    const [deleted, setDeleted] = useState<readonly number[]>([])
    api.control = control
    api.remove = setDeleted
    useEffect(() => {
        ready()
    }, [ready])
    const rows: React.ReactElement[] = []
    for (let i = 0; i < ROWS; i++) {
        if (deleted.includes(i)) continue
        rows.push(
            <RemRow
                key={`row-${i}`}
                i={i}
                clock={clock}
                record={record}
                control={controlFlag}
                manual={manual}
            />
        )
    }
    return (
        <>
            <IosStatus />
            <div className="rem-title">Reminders</div>
            <button className="rem-add" type="button" aria-label="New reminder">
                +
            </button>
            <button
                className="rem-toolbar"
                type="button"
                data-action="delete-second"
                aria-label="Delete the second reminder"
            >
                Delete
            </button>
            <div className="rem-section">Today</div>
            <div className="rem-list">
                {Array.from({ length: ROWS }, (_, i) => {
                    if (deleted.includes(i)) return null
                    return (
                        <button
                            key={`d-${i}`}
                            type="button"
                            className="rem-delete"
                            data-delete={i}
                            style={{ top: `${i * PITCH}px` }}
                        >
                            Delete
                        </button>
                    )
                })}
                <AnimatePresence initial={false} mode="popLayout">
                    {rows}
                </AnimatePresence>
            </div>
            <HomeIndicator />
        </>
    )
}

function probeBoxes(): Record<string, Box> {
    installStyles()
    const stage = probeStage()
    const list = document.createElement('div')
    list.className = 'rem-list'
    stage.append(list)
    const boxes: Record<string, Box> = {}
    const build = (deleted: readonly number[], suffix: string): void => {
        list.innerHTML = ''
        for (let i = 0; i < ROWS; i++) {
            if (deleted.includes(i)) continue
            const row = document.createElement('div')
            row.className = 'rem-row'
            list.append(row)
            boxes[`row-${i}@${suffix}`] = viewBox(row)
        }
    }
    build([], 'init')
    build([2], 'c1')
    build([2, 5], 'c2')
    stage.remove()
    return boxes
}

class DeleteRuntime {
    readonly mc: ManualClock | null
    readonly builder: TraceBuilder | null
    readonly elements: Map<string, HTMLElement | null>
    readonly diagnostics: string[] = []
    readonly tracker: ReturnType<typeof reportTracker> | null
    readonly audit = installReadAudit()
    readonly api: DeleteApi = { control: null, remove: null }
    readonly exitStarts = new Map<string, number>()
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
            this.elements.set(key, element)
            if (!this.builder) return
            this.builder.mount(key, element)
            this.builder.initial(key, element)
        }
        this.stage = document.createElement('div')
        this.stage.className = 'rem-stage'
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
                motion={SPRING.delete}
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
                <DeleteBody
                    api={api}
                    record={record}
                    ready={resolveReady}
                    clock={clock}
                    manual={this.mc !== null}
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

    async drain(): Promise<void> {
        if (!this.api.control) return
        await this.api.control.update(() => undefined)
        await microtasks()
    }

    swipe(index: number, offset: number): void {
        const row = this.elements.get(`row-${index}`)
        if (row) row.style.transform = `translateX(${offset}px)`
    }

    focus(index: number): void {
        this.elements.get(`row-${index}`)?.focus()
    }

    commit(label: string, rows: readonly number[]): Promise<LayoutReport> {
        const control = this.api.control!
        const remove = this.api.remove!
        for (const i of rows) {
            if (!this.exitStarts.has(`row-${i}`))
                this.exitStarts.set(
                    `row-${i}`,
                    this.mc?.now ?? performance.now()
                )
        }
        // The engine reads styles for the flush's measured set: the six
        // moving siblings share two captured support geometries, so four are
        // measured at delete-1; delete-2 measures the three retargeted rows.
        const moving = label === 'delete-1' ? 4 : 3
        const result = recordCommit({
            builder: this.builder!,
            keys: KEYS,
            elements: this.elements,
            frame: this.frame,
            label,
            radiusKeys: new Set(),
            typedOM: isWebKitEngine(),
            audit: this.audit,
            stylesExpected: isWebKitEngine()
                ? label === 'delete-1'
                    ? 10
                    : 8
                : moving,
            activeFlush: moving,
            run: () => {
                if (this.control === 'delete-extra-read')
                    document.body.getBoundingClientRect()
                return control.update(() => remove(rows))
            },
        })
        this.builder!.record('flush', this.frame, label)
        this.tracker!.track(label, result.promise, () => this.frame)
        return result.promise
    }

    author(now: number): void {
        for (const [key, start] of this.exitStarts) {
            const row = this.elements.get(key)
            if (!row) continue
            const opacity = 1 - Math.min(1, Math.max(0, (now - start) / 200))
            row.style.opacity = String(opacity)
        }
    }

    commitReal(rows: readonly number[]): Promise<LayoutReport> {
        return this.api.control!.update(() => this.api.remove?.(rows))
    }

    dispose(): void {
        this.offDiagnostic()
        this.audit.dispose()
        this.mount?.root.unmount()
        this.stage.remove()
    }
}

async function stepDelete(
    mc: ManualClock,
    builder: TraceBuilder,
    runtime: DeleteRuntime
): Promise<void> {
    runtime.audit.begin()
    mc.frame(STEP)
    const counts = runtime.audit.end()
    runtime.frame += 1
    const total = counts.rects + counts.offsets + counts.styles + counts.typedOM
    if (total > 0) {
        builder.steadyFrameReads += total
        builder.steadyFrameReadsAt ??= runtime.frame
    }
    await microtasks()
    runtime.author(mc.now)
    builder.record('frame', runtime.frame)
}

export class DeleteScene {
    static async runManual(
        options: { control?: string | undefined } = {}
    ): Promise<SceneTrace> {
        const mc = createManualClock()
        const elements = new Map<string, HTMLElement | null>()
        const builder = new TraceBuilder({
            scene: 's-delete',
            stepMs: STEP,
            keys: KEYS,
            elements,
            clock: mc,
        })
        const runtime = new DeleteRuntime({
            mc,
            builder,
            elements,
            control: options.control,
        })
        await document.fonts.ready
        await runtime.mountReact()
        const probes = probeBoxes()
        for (const [key, box] of Object.entries(probes)) builder.aBox(key, box)
        ;(window as unknown as { __scene?: unknown }).__scene = {
            scene: 's-delete',
            participants: KEYS,
            boxes: probes,
            motion: SPRING.delete,
        }
        await runtime.drain()
        try {
            builder.record('frame', 0)
            runtime.frame = 0
            for (let k = 1; k <= 8; k++) {
                runtime.swipe(2, -10 * k)
                await stepDelete(mc, builder, runtime)
            }
            runtime.focus(3)
            runtime.commit('delete-1', [2])
            for (let i = 0; i < 10; i++) await stepDelete(mc, builder, runtime)
            runtime.focus(6)
            runtime.commit('delete-2', [2, 5])
            let guard = 0
            while (guard++ < 400) {
                if (
                    runtime.tracker?.done.get('delete-2') &&
                    mc.clock.size === 0
                )
                    break
                await stepDelete(mc, builder, runtime)
            }
            // Let React's exit-settle render run in a task, not a microtask.
            await new Promise<void>((resolve) => setTimeout(resolve, 0))
            await nextFrame()
            await microtasks()
            await stepDelete(mc, builder, runtime)
            builder.settleFrames.push(runtime.frame)
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
        const runtime = new DeleteRuntime({ mc: null, builder: null })
        await document.fonts.ready
        await runtime.mountReact()
        await runtime.drain()
        const commits: { label: string; at: number }[] = []
        try {
            await nextFrame()
            await nextFrame()
            for (let k = 1; k <= 8; k++) {
                runtime.swipe(2, -10 * k)
                await waitUntil(performance.now() + 10)
            }
            runtime.focus(3)
            sampler.markCommit()
            const first = runtime.commitReal([2])
            commits.push({ label: 'delete-1', at: performance.now() })
            void first
            await waitUntil(commits[0]!.at + 100)
            runtime.focus(6)
            sampler.markCommit()
            const second = runtime.commitReal([2, 5])
            commits.push({ label: 'delete-2', at: performance.now() })
            await second
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
                scene: 's-delete',
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
            await DeleteScene.runReal()
            await waitMs(700)
        }
    }
}

export const DELETE_KEYS = KEYS
