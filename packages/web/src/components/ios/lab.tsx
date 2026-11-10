'use client'

import { createClock } from '@freestylejs/ani-core'
import { useTimeline } from '@freestylejs/ani-react'
import { type ReactNode, useState } from 'react'
import {
    IosAppFolder,
    IosAppStore,
    IosExposureSlider,
    IosNotificationsStack,
    IosPointer,
    IosSlider,
    IosSwipeActions,
    IosViewAppStore,
} from './index'

export const IOS_EXAMPLES = [
    {
        id: 'ios-app-folder',
        name: 'App folder',
        subtitle: 'A place for everything.',
        mode: 'Shared layout',
        light: true,
        version: '4b8f9ee63e14',
        hint: 'Open the folder. Select an app, click outside, or press Escape to close.',
    },
    {
        id: 'ios-pointer',
        name: 'Magnetic pointer',
        subtitle: 'Follow. Attract. Release.',
        mode: 'Ani follower',
        light: true,
        version: '20514cf44b33',
        hint: 'Move your pointer around Appearance. Hover, press, and move away. Touch and keyboard retain the normal button.',
    },
    {
        id: 'ios-slider',
        name: 'Brightness',
        subtitle: 'A little resistance feels right.',
        mode: 'Direct manipulation',
        light: false,
        version: '8b32481b61a6',
        hint: 'Drag up or down, then pull beyond the ends. Use arrow keys or Home / End with keyboard focus.',
    },
    {
        id: 'app-store',
        name: 'App Store',
        subtitle: 'One card. A whole story.',
        mode: 'Shared layout',
        light: true,
        version: 'd5869e7b6f89',
        hint: 'Open a card and close from the backdrop or Escape. Reopen during the return transition to test continuity.',
    },
    {
        id: 'notifications-stack',
        name: 'Notifications',
        subtitle: 'Less noise. More space.',
        mode: 'Ani follower',
        light: false,
        version: '2f1131661fe3',
        hint: 'Hover over the stack, then click to expand. Collapse and reopen before the motion settles.',
    },
    {
        id: 'carousel-ios-exposure-slider',
        name: 'Exposure',
        subtitle: 'Find the light.',
        mode: 'Direct manipulation',
        light: false,
        version: 'a4885d84d9b7',
        hint: 'Drag the ruler left or right. Tap the value to reset. Arrow keys adjust one step; Home / End reach the limits.',
    },
    {
        id: 'swipe-actions',
        name: 'Swipe actions',
        subtitle: 'Actions, only when needed.',
        mode: 'Velocity & snap',
        light: false,
        version: '6d351cd76fff',
        hint: 'Swipe either way to reveal actions. A full swipe activates that side’s primary action. Escape cancels.',
    },
    {
        id: 'animate-view-app-store',
        name: 'App Store · View',
        subtitle: 'The same story. A different engine.',
        mode: 'Native View Transition',
        light: true,
        version: 'eec1716818a3',
        hint: 'Open and close a card. This uses native snapshots, not layout projection. Unsupported browsers update immediately.',
    },
] as const
export type IosExampleId = (typeof IOS_EXAMPLES)[number]['id']
export function isIosExample(value: string): value is IosExampleId {
    return IOS_EXAMPLES.some((example) => example.id === value)
}
function previewUrl(example: (typeof IOS_EXAMPLES)[number]) {
    return example.id === 'animate-view-app-store'
        ? `https://images.motion.dev/examples/previews/react/${example.id}/v-${example.version}/preview.mp4`
        : `https://images.motion.dev/examples/stage/react/${example.id}/v-${example.version}/thumb.mp4`
}
function posterUrl(example: (typeof IOS_EXAMPLES)[number]) {
    return example.id === 'animate-view-app-store'
        ? `https://images.motion.dev/examples/previews/react/${example.id}/v-${example.version}/poster.webp`
        : `https://images.motion.dev/examples/stage/react/${example.id}/v-${example.version}/thumb.webp`
}

export function IosLab({
    initial = 'ios-app-folder',
    isolated = false,
}: {
    initial?: string
    isolated?: boolean
}) {
    const [selected, setSelected] = useState<IosExampleId>(() =>
        isIosExample(initial) ? initial : 'ios-app-folder'
    )
    const [revision, setRevision] = useState(0)
    const [compare, setCompare] = useState(false)
    const [reduced, setReduced] = useState(false)
    const [feedback, setFeedback] = useState('')
    const clock = useTimeline(
        () => createClock({ reducedMotion: reduced ? true : 'system' }),
        [reduced]
    )
    const example = IOS_EXAMPLES.find((item) => item.id === selected)!
    const select = (id: IosExampleId) => {
        setSelected(id)
        setFeedback('')
        const url = new URL(window.location.href)
        url.searchParams.set('example', id)
        window.history.replaceState(null, '', url)
    }
    const components: Record<IosExampleId, () => ReactNode> = {
        'ios-app-folder': () => (
            <IosAppFolder
                clock={clock}
                onSelect={(item) => setFeedback(`${item.label} selected`)}
            />
        ),
        'ios-pointer': () => (
            <IosPointer
                clock={clock}
                onPress={() => setFeedback('Appearance pressed')}
            />
        ),
        'ios-slider': () => (
            <IosSlider
                clock={clock}
                onValueCommit={(value) =>
                    setFeedback(`Brightness ${Math.round(value * 100)}%`)
                }
            />
        ),
        'app-store': () => <IosAppStore clock={clock} />,
        'notifications-stack': () => <IosNotificationsStack clock={clock} />,
        'carousel-ios-exposure-slider': () => (
            <IosExposureSlider
                clock={clock}
                onValueCommit={(value) =>
                    setFeedback(`Exposure ${value > 0 ? '+' : ''}${value}`)
                }
            />
        ),
        'swipe-actions': () => (
            <IosSwipeActions
                clock={clock}
                onAction={(id) => setFeedback(`${id} activated`)}
            />
        ),
        'animate-view-app-store': () => <IosViewAppStore clock={clock} />,
    }
    const stage = (
        <div
            className={`ios-lab-scene ${example.light ? 'is-light' : 'is-dark'} ${selected.includes('app-store') ? 'is-store' : ''}`}
            data-ios-scene={selected}
            key={`${selected}-${revision}-${reduced}`}
        >
            {components[selected]()}
        </div>
    )
    if (isolated)
        return (
            <main className="ios-lab-isolated" data-ios-lab="isolated">
                {stage}
            </main>
        )
    return (
        <main className="ios-lab" data-ios-lab="full">
            <header className="ios-lab-top">
                <a
                    href="/ios"
                    className="ios-lab-brand"
                    aria-label="Ani interaction lab"
                >
                    <span className="ios-lab-mark">a</span>
                    <span>
                        ani<span className="ios-lab-brand-divider">/</span>
                        interaction lab
                    </span>
                </a>
                <span className="ios-lab-build">
                    <i /> Eight studies · one engine
                </span>
            </header>
            <section className="ios-lab-intro">
                <div>
                    <p className="ios-lab-eyebrow">IOS INTERACTION STUDIES</p>
                    <h1>Feel every detail.</h1>
                    <p className="ios-lab-lead">
                        Eight familiar interactions. Built with Ani.
                        <br />A dedicated space to pull, interrupt, reverse, and
                        compare.
                    </p>
                </div>
                <div className="ios-lab-intro-note">
                    <span>REFERENCE-DRIVEN</span>
                    <p>
                        Inspired by the official Motion examples.
                        <br />
                        Same visual brief. Independent Ani implementation.
                    </p>
                    <a href="#ios-evidence">
                        Read the evidence boundary{' '}
                        <span aria-hidden="true">↗</span>
                    </a>
                </div>
            </section>
            <nav className="ios-lab-tabs" aria-label="Interaction examples">
                {IOS_EXAMPLES.map((item, index) => (
                    <button
                        type="button"
                        key={item.id}
                        aria-pressed={item.id === selected}
                        data-example-select={item.id}
                        onClick={() => select(item.id)}
                    >
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        {item.name}
                    </button>
                ))}
            </nav>
            <section className="ios-lab-workbench" aria-label={example.name}>
                <header className="ios-lab-workbench-head">
                    <div>
                        <span className="ios-lab-number">
                            {String(IOS_EXAMPLES.indexOf(example) + 1).padStart(
                                2,
                                '0'
                            )}
                        </span>
                        <div>
                            <h2>{example.name}</h2>
                            <p>{example.subtitle}</p>
                        </div>
                    </div>
                    <div className="ios-lab-tools">
                        <button
                            type="button"
                            onClick={() => {
                                setRevision((value) => value + 1)
                                setFeedback('')
                            }}
                            aria-label="Reset example"
                        >
                            ↺ <span>Reset</span>
                        </button>
                        <button
                            type="button"
                            aria-pressed={compare}
                            onClick={() => setCompare(!compare)}
                        >
                            Compare
                        </button>
                        <a
                            href={`/ios?example=${selected}&isolated=1`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open isolated example"
                        >
                            Open <span aria-hidden="true">↗</span>
                        </a>
                    </div>
                </header>
                <div
                    className={`ios-lab-canvases ${compare ? 'is-comparing' : ''}`}
                >
                    <div className="ios-lab-canvas">
                        <div className="ios-lab-canvas-label">
                            <span>ANI</span>
                            <span>{example.mode}</span>
                        </div>
                        {stage}
                    </div>
                    {compare && (
                        <div className="ios-lab-reference">
                            <div className="ios-lab-canvas-label">
                                <span>MOTION · OFFICIAL PREVIEW</span>
                                <a
                                    href={`https://motion.dev/examples/react-${selected}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Original ↗
                                </a>
                            </div>
                            <video
                                key={selected}
                                controls={true}
                                loop={true}
                                muted={true}
                                playsInline={true}
                                preload="metadata"
                                poster={posterUrl(example)}
                                src={previewUrl(example)}
                            />
                            <p>
                                This is the public reference recording, not an
                                interactive Ani implementation. Pause to compare
                                a state.
                            </p>
                        </div>
                    )}
                </div>
                <footer className="ios-lab-workbench-foot">
                    <p>{example.hint}</p>
                    <label>
                        <input
                            type="checkbox"
                            checked={reduced}
                            onChange={(event) =>
                                setReduced(event.target.checked)
                            }
                        />{' '}
                        Reduce motion
                    </label>
                </footer>
            </section>
            <div className="ios-lab-feedback" role="status" aria-live="polite">
                {feedback || 'Ready for input.'}
            </div>
            <section className="ios-lab-evidence" id="ios-evidence">
                <div>
                    <p className="ios-lab-eyebrow">WHAT THIS PAGE PROVES</p>
                    <h2>
                        Built to be tested.
                        <br />
                        Not just watched.
                    </h2>
                </div>
                <div>
                    <p>
                        These are reusable Ani components, not videos,
                        screenshots, or Motion running under a different name.
                        The comparison panel contains only Motion’s public
                        reference preview.
                    </p>
                    <p>
                        Seven complete reference implementations require Motion+
                        access. Their visible states and public tutorial
                        contracts inform this independent reconstruction; exact
                        private logic is not certified. The AnimateView App
                        Store source is public and has a separately measured
                        snapshot profile.
                    </p>
                    <p>
                        Keyboard, pointer cancellation, reduced motion,
                        interruptions, and cleanup are engineering requirements
                        here. Desktop browser tests are not a substitute for
                        real iOS display or input-latency measurements.
                    </p>
                </div>
            </section>
            <footer className="ios-lab-bottom">
                <span>Ani · Native-grade-capable interactions</span>
                <a
                    href={`https://motion.dev/examples/react-${selected}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    Official reference ↗
                </a>
                <span>
                    Public references credited to Motion and their authors.
                </span>
            </footer>
        </main>
    )
}
