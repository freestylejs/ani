/**
 * S-ACC — Settings disclosure (React, P2; scene spec 2.4).
 *
 * Row 2 expands, row 6 expands mid-flight, then row 2 collapses. Rows,
 * headers, bodies and the 0.5 px separators are layout participants; the
 * headers/bodies are position-pinned under the row's scale.
 */

import { type Clock, createClock } from '@freestylejs/ani-core'
import {
    createManualClock,
    type ManualClock,
} from '@freestylejs/ani-core/testing'
import { type LayoutReport, layoutRuntime } from '@freestylejs/ani-layout'
import {
    LayoutGroup,
    useLayout,
    useLayoutGroup,
} from '@freestylejs/ani-react/layout'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Box } from '../../oracle.ts'
import type { RealTrace, SceneTrace, VariantRunOptions } from '../../types.ts'
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
import {
    prefersReduced,
    type ReducedSceneOptions,
    reducedPolicyFor,
} from './reduced.ts'

const ROWS = 11
const EXPANDED = 168
const COLLAPSED = 48
const GROUP_TOP = 107
const KEYS = [
    ...Array.from({ length: ROWS }, (_, i) => `row-${i}`),
    ...Array.from({ length: ROWS }, (_, i) => `header-${i}`),
    ...Array.from({ length: ROWS }, (_, i) => `body-${i}`),
    ...Array.from({ length: ROWS - 1 }, (_, i) => `sep-${i}`),
]
const ROW_KEYS = Array.from({ length: ROWS }, (_, i) => `row-${i}`)
const HEADER_KEYS = Array.from({ length: ROWS }, (_, i) => `header-${i}`)
const BODY_KEYS = Array.from({ length: ROWS }, (_, i) => `body-${i}`)
const SEP_KEYS = Array.from({ length: ROWS - 1 }, (_, i) => `sep-${i}`)
const ICONS = [
    ['M1 8h9l4-6M1 8h9l4 6M4 8l2-3', '#FF9500', 'Airplane Mode'],
    [
        'M2 6a9 9 0 0112 0M4 9a6 6 0 018 0M6.5 12a2 2 0 013 0',
        '#007AFF',
        'Wi-Fi',
    ],
    ['M5 2l6 4-6 4V2zm0 12l6-4-6-4v8z', '#007AFF', 'Bluetooth'],
    ['M3 13V9M6 13V6M9 13V3M12 13V1', '#34C759', 'Cellular'],
    [
        'M4 6a6 6 0 010 8M7 4a9 9 0 010 12M10 3a12 12 0 010 14',
        '#007AFF',
        'Personal Hotspot',
    ],
    [
        'M4 12h8M5 12V7a3 3 0 016 0v5M6 4a2 2 0 014 0',
        '#FF3B30',
        'Notifications',
    ],
    ['M3 6v4h3l4 3V3L6 6H3zM12 6a3 3 0 010 4', '#FF2D55', 'Sounds & Haptics'],
    ['M12 10a5 5 0 01-6-6 5 5 0 106 6z', '#5E5CE6', 'Focus'],
    ['M2 3h12v9H2zM5 14h6', '#5E5CE6', 'Screen Time'],
    [
        'M8 5a3 3 0 100 6 3 3 0 000-6zM8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13',
        '#8E8E93',
        'General',
    ],
    [
        'M5 8V4a1 1 0 012 0v4M7 8V3a1 1 0 012 0v5M9 8V4a1 1 0 012 0v4M11 8v3a4 4 0 01-8 0V8',
        '#007AFF',
        'Privacy & Security',
    ],
]
const BODIES = [
    'Off',
    'Home',
    'On',
    'On',
    'Off',
    'Banners, Sounds, Badges',
    'Ringtone: Reflection',
    'Do Not Disturb',
    '4h 12m today',
    'Software Update',
    'Location Services',
]

let stylesInstalled = false

function installStyles(): void {
    if (stylesInstalled) return
    stylesInstalled = true
    styleOnce(
        's-acc',
        `
        ${STATUS_CSS}
        .acc-stage {
            position: fixed; inset: 0; width: 390px; height: 844px;
            overflow: hidden; background: #F2F2F7; color: #000;
            font-family: ${FONT}; -webkit-font-smoothing: antialiased;
            font-optical-sizing: auto; color-scheme: light;
        }
        .acc-nav {
            position: absolute; left: 0; top: 47px; width: 390px; height: 44px;
            background: #F2F2F7; z-index: 3;
        }
        .acc-nav-title {
            position: absolute; left: 0; top: 11px; width: 390px; text-align: center;
            font: 600 17px/22px ${FONT}; letter-spacing: -0.41px;
        }
        .acc-scroller {
            position: absolute; left: 0; top: 91px; width: 390px; height: 753px;
            overflow-y: auto; overflow-x: hidden; scrollbar-width: none;
            overscroll-behavior: contain; z-index: 1;
        }
        .acc-scroller::-webkit-scrollbar { display: none; }
        .acc-group {
            position: relative; left: 16px; top: 16px; width: 358px;
            border-radius: 12px; background: #FFFFFF; overflow: hidden;
        }
        .acc-row {
            position: relative; height: ${COLLAPSED}px; overflow: hidden;
            background: #FFFFFF; transform-origin: 50% 0%;
        }
        .acc-row.acc-open { height: ${EXPANDED}px; }
        .acc-header {
            position: absolute; left: 0; top: 0; width: 358px; height: ${COLLAPSED}px;
            border: 0; padding: 0; background: transparent; text-align: left;
            transform-origin: 50% 0%; cursor: pointer;
        }
        .acc-icon {
            position: absolute; left: 16px; top: 9.5px; width: 29px; height: 29px;
            border-radius: 7px; color: #FFFFFF; display: flex; align-items: center;
            justify-content: center;
        }
        .acc-icon svg { width: 17px; height: 17px; }
        .acc-title {
            position: absolute; left: 61px; top: 13px; width: 240px;
            font: 400 17px/22px ${FONT}; letter-spacing: -0.41px; color: #000;
        }
        .acc-chev {
            position: absolute; right: 16px; top: 18px; width: 8px; height: 13px;
            color: #C7C7CC; transition: transform 0.2s ease;
        }
        .acc-reduced .acc-chev { transition: none; }
        .acc-row.acc-open .acc-chev { transform: rotate(90deg); }
        .acc-body {
            position: absolute; left: 0; top: ${COLLAPSED}px; width: 358px;
            height: 120px; padding: 0 16px; box-sizing: border-box;
            transform-origin: 50% 0%;
        }
        .acc-body p {
            margin: 0; font: 400 15px/20px ${FONT}; letter-spacing: -0.24px;
            color: rgba(60,60,67,0.60);
        }
        .acc-sep {
            height: 0.5px; width: 342px; margin-left: 16px;
            background: rgba(60,60,67,0.29); transform-origin: 50% 0%;
        }
        .acc-stage.acc-control-sep1 .acc-sep { height: 1px; }
    `
    )
}

interface AccApi {
    control: { update(fn: () => void): Promise<LayoutReport> } | null
    setOpen: ((rows: readonly number[]) => void) | null
}

interface RowProps {
    readonly i: number
    readonly open: boolean
    readonly record: (key: string, element: HTMLElement) => void
}

function Row({ i, open, record }: RowProps): React.ReactElement {
    const rowRef = useLayout<HTMLDivElement>({ layout: true, radius: false })
    const headerRef = useLayout<HTMLButtonElement>({
        layout: 'position',
        radius: false,
    })
    const bodyRef = useLayout<HTMLDivElement>({
        layout: 'position',
        radius: false,
    })
    const recordRef = useRef(record)
    recordRef.current = record
    const composedRow = useMemo(
        () =>
            (element: HTMLDivElement | null): void => {
                if (element) recordRef.current(`row-${i}`, element)
                rowRef(element)
            },
        [rowRef, i]
    )
    const composedHeader = useMemo(
        () =>
            (element: HTMLButtonElement | null): void => {
                if (element) recordRef.current(`header-${i}`, element)
                headerRef(element)
            },
        [headerRef, i]
    )
    const composedBody = useMemo(
        () =>
            (element: HTMLDivElement | null): void => {
                if (element) recordRef.current(`body-${i}`, element)
                bodyRef(element)
            },
        [bodyRef, i]
    )
    const [glyph, color, label] = ICONS[i]!
    return (
        <div
            ref={composedRow}
            data-p={`row-${i}`}
            className={open ? 'acc-row acc-open' : 'acc-row'}
        >
            <button
                ref={composedHeader}
                data-p={`header-${i}`}
                className="acc-header"
                type="button"
                aria-label={label}
                aria-expanded={open}
            >
                <span className="acc-icon" style={{ background: color }}>
                    <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <path d={glyph} />
                    </svg>
                </span>
                <span className="acc-title">{label}</span>
                <svg className="acc-chev" viewBox="0 0 8 13" aria-hidden="true">
                    <path
                        d="M1.5 1.5 6.5 6.5l-5 5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>
            <div ref={composedBody} data-p={`body-${i}`} className="acc-body">
                <p>{BODIES[i]}</p>
            </div>
        </div>
    )
}

function Separator({
    i,
    record,
}: {
    readonly i: number
    readonly record: (key: string, element: HTMLElement) => void
}): React.ReactElement {
    const ref = useLayout<HTMLDivElement>({ layout: 'position', radius: false })
    const recordRef = useRef(record)
    recordRef.current = record
    const composed = useMemo(
        () =>
            (element: HTMLDivElement | null): void => {
                if (element) recordRef.current(`sep-${i}`, element)
                ref(element)
            },
        [ref, i]
    )
    return <div ref={composed} data-p={`sep-${i}`} className="acc-sep" />
}

function AccBody({
    api,
    record,
    ready,
}: {
    readonly api: AccApi
    readonly record: (key: string, element: HTMLElement) => void
    readonly ready: () => void
}): React.ReactElement {
    const control = useLayoutGroup()
    const [open, setOpen] = useState<readonly number[]>([])
    api.control = control
    api.setOpen = setOpen
    useEffect(() => {
        ready()
    }, [ready])
    const rows: React.ReactElement[] = []
    for (let i = 0; i < ROWS; i++) {
        rows.push(
            <Row
                key={`row-${i}`}
                i={i}
                open={open.includes(i)}
                record={record}
            />
        )
        if (i < ROWS - 1)
            rows.push(<Separator key={`sep-${i}`} i={i} record={record} />)
    }
    return (
        <>
            <IosStatus />
            <div className="acc-nav">
                <div className="acc-nav-title">Settings</div>
            </div>
            <div className="acc-scroller" data-scroller="">
                <div className="acc-group" data-group="">
                    {rows}
                </div>
            </div>
            <HomeIndicator />
        </>
    )
}

function probeBoxes(): Record<string, Box> {
    installStyles()
    const stage = probeStage()
    const group = document.createElement('div')
    group.className = 'acc-group'
    group.style.left = '16px'
    group.style.top = `${GROUP_TOP}px`
    group.style.position = 'absolute'
    stage.append(group)
    const boxes: Record<string, Box> = {}
    for (const [name, openRows] of [
        ['c1', [2]],
        ['c2', [2, 6]],
        ['c3', [6]],
    ] as const) {
        group.innerHTML = ''
        for (let i = 0; i < ROWS; i++) {
            const row = document.createElement('div')
            row.className = (openRows as readonly number[]).includes(i)
                ? 'acc-row acc-open'
                : 'acc-row'
            const header = document.createElement('div')
            header.className = 'acc-header'
            const body = document.createElement('div')
            body.className = 'acc-body'
            row.append(header, body)
            group.append(row)
            boxes[`row-${i}@${name}`] = viewBox(row)
            boxes[`header-${i}@${name}`] = viewBox(header)
            boxes[`body-${i}@${name}`] = viewBox(body)
            if (i < ROWS - 1) {
                const sep = document.createElement('div')
                sep.className = 'acc-sep'
                group.append(sep)
                boxes[`sep-${i}@${name}`] = viewBox(sep)
            }
        }
    }
    stage.remove()
    return boxes
}

class AccRuntime {
    readonly mc: ManualClock | null
    readonly builder: TraceBuilder | null
    readonly elements: Map<string, HTMLElement | null>
    readonly diagnostics: string[] = []
    readonly tracker: ReturnType<typeof reportTracker> | null
    readonly audit = installReadAudit()
    readonly api: AccApi = { control: null, setOpen: null }
    readonly stage: HTMLDivElement
    readonly clock: Clock | undefined
    readonly policy: ReturnType<typeof reducedPolicyFor>
    mount: { root: { unmount(): void }; container: HTMLDivElement } | null =
        null
    frame = 0
    private readonly offDiagnostic: () => void
    private readonly record: (key: string, element: HTMLElement) => void
    private readonly control: string | undefined

    constructor(options: {
        mc: ManualClock | null
        clock?: Clock | undefined
        builder: TraceBuilder | null
        elements?: Map<string, HTMLElement | null>
        control?: string | undefined
        variant?: VariantRunOptions | undefined
    }) {
        installStyles()
        this.mc = options.mc
        this.clock = options.clock ?? options.mc?.clock
        this.builder = options.builder
        this.elements = options.elements ?? new Map()
        this.control = options.control
        this.policy = reducedPolicyFor({
            control: options.control,
            variant: options.variant,
        })
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
        this.stage.className = 'acc-stage'
        if (this.policy !== 'ignore') this.stage.classList.add('acc-reduced')
        if (options.control === 'acc-separator-1px')
            this.stage.classList.add('acc-control-sep1')
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
        const onSnap = (element: HTMLElement, reason: string): void => {
            builder?.snap(element.dataset.p ?? 'unknown', reason, this.frame)
        }
        root.render(
            <LayoutGroup
                {...(this.clock ? { clock: this.clock } : {})}
                motion={SPRING.acc}
                reducedMotion={this.policy}
                threshold={1}
                maxNodes={300}
                maxParticipants={2000}
                onSnap={onSnap}
            >
                <AccBody api={api} record={record} ready={resolveReady} />
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

    commit(label: string, rows: readonly number[]): Promise<LayoutReport> {
        const control = this.api.control!
        const setOpen = this.api.setOpen!
        const result = recordCommit({
            builder: this.builder!,
            keys: KEYS,
            elements: this.elements,
            frame: this.frame,
            label,
            radiusKeys: new Set(),
            typedOM: isWebKitEngine(),
            audit: this.audit,
            // 43 participant style reads + 4 support/anchoring reads per
            // commit, audited by the DOM read counter (2026-10-29).
            stylesExpected: isWebKitEngine() ? 82 : 47,
            run: () => {
                if (this.control === 'acc-extra-read')
                    document.body.getBoundingClientRect()
                return control.update(() => {
                    setOpen(rows)
                })
            },
        })
        this.builder!.record('flush', this.frame, label)
        this.tracker!.track(label, result.promise, () => this.frame)
        return result.promise
    }

    commitReal(label: string, rows: readonly number[]): Promise<LayoutReport> {
        const control = this.api.control!
        const setOpen = this.api.setOpen!
        return control.update(() => {
            setOpen(rows)
        })
    }

    dispose(): void {
        this.offDiagnostic()
        this.audit.dispose()
        this.mount?.root.unmount()
        this.stage.remove()
    }
}

async function stepAcc(
    mc: ManualClock,
    builder: TraceBuilder,
    runtime: AccRuntime
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

export class AccScene {
    static async runManual(
        options: ReducedSceneOptions = {}
    ): Promise<SceneTrace> {
        const mc = createManualClock({
            reducedMotion: prefersReduced(options),
        })
        const elements = new Map<string, HTMLElement | null>()
        const builder = new TraceBuilder({
            scene: 's-acc',
            stepMs: 16,
            keys: KEYS,
            elements,
            clock: mc,
        })
        const runtime = new AccRuntime({
            mc,
            builder,
            elements,
            control: options.control,
            variant: options.variant,
        })
        await document.fonts.ready
        await runtime.mountReact()
        const probes = probeBoxes()
        for (const [key, box] of Object.entries(probes)) builder.aBox(key, box)
        ;(window as unknown as { __scene?: unknown }).__scene = {
            scene: 's-acc',
            participants: KEYS,
            boxes: probes,
            motion: SPRING.acc,
        }
        await runtime.drain()
        try {
            builder.record('frame', 0)
            runtime.frame = 0
            runtime.commit('c1', [2])
            await microtasks()
            for (let i = 0; i < 12; i++) await stepAcc(mc, builder, runtime)
            runtime.commit('c2', [2, 6])
            await microtasks()
            for (let i = 0; i < 6; i++) await stepAcc(mc, builder, runtime)
            runtime.commit('c3', [6])
            await microtasks()
            let guard = 0
            while (guard++ < 400) {
                if (runtime.tracker?.done.get('c3') && mc.clock.size === 0)
                    break
                await stepAcc(mc, builder, runtime)
            }
            await microtasks()
            if (options.control === 'acc-leftover-pose') {
                elements
                    .get('row-0')
                    ?.style.setProperty('translate', '0.5px 0px', 'important')
            }
            await stepAcc(mc, builder, runtime)
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

    static async runReal(
        options: ReducedSceneOptions = {}
    ): Promise<RealTrace> {
        const granularityInfo = measureGranularityInfo()
        const g = granularityInfo.value
        const sampler = installRafSampler()
        const clock = prefersReduced(options)
            ? createClock({ reducedMotion: true })
            : null
        const runtime = new AccRuntime({
            mc: null,
            ...(clock ? { clock } : {}),
            builder: null,
            variant: options.variant,
        })
        await document.fonts.ready
        await runtime.mountReact()
        await runtime.drain()
        const commits: { label: string; at: number }[] = []
        try {
            await nextFrame()
            await nextFrame()
            sampler.markCommit()
            const first = runtime.commitReal('c1', [2])
            commits.push({ label: 'c1', at: performance.now() })
            void first
            await waitUntil(commits[0]!.at + 192)
            sampler.markCommit()
            const second = runtime.commitReal('c2', [2, 6])
            commits.push({ label: 'c2', at: performance.now() })
            void second
            await waitUntil(commits[1]!.at + 96)
            sampler.markCommit()
            const third = runtime.commitReal('c3', [6])
            commits.push({ label: 'c3', at: performance.now() })
            await third
            for (let i = 0; i < 4; i++) await nextFrame()
            const final = {
                tracks: 0,
                holds: 0,
                connected: KEYS.filter(
                    (key) => runtime.elements.get(key)?.isConnected
                ).length,
            }
            runtime.dispose()
            clock?.dispose()
            sampler.stop()
            const frames = [...sampler.frames]
            return {
                scene: 's-acc',
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
            clock?.dispose()
            sampler.stop()
            throw error
        }
    }

    static async demo(): Promise<void> {
        for (;;) {
            await AccScene.runReal()
            await waitMs(700)
        }
    }
}

export const ACC_KEYS = KEYS
export const ACC_ROW_KEYS = ROW_KEYS
export const ACC_HEADER_KEYS = HEADER_KEYS
export const ACC_BODY_KEYS = BODY_KEYS
export const ACC_SEP_KEYS = SEP_KEYS
