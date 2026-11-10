'use client'

import { useFollow } from '@freestylejs/ani-react'
import {
    type CSSProperties,
    type KeyboardEvent,
    useCallback,
    useRef,
    useState,
} from 'react'
import {
    exposureBrightness,
    exposureDrag,
    exposureNotch,
    finiteClamp,
} from './interaction_math'
import {
    BASE_CSS,
    type NumericControlProps,
    useCommitEffect,
    useNumericControl,
} from './shared'
import { usePointerDrag } from './use_pointer_drag'

export interface IosExposureSliderProps extends NumericControlProps {
    readonly imageSrc?: string | undefined
    readonly imageAlt?: string | undefined
}
interface ControlledRelease {
    readonly target: number
    readonly velocity: number
    readonly generation: number
}
const TICKS = Array.from({ length: 41 }, (_, index) => (index - 20) * 5)
const CIRCUMFERENCE = 2 * Math.PI * 48
function releaseVelocity(value: number, velocity: number): number {
    return (value === 100 && velocity > 0) || (value === -100 && velocity < 0)
        ? 0
        : velocity
}
const CSS = `${BASE_CSS}
.ani-ios-exposure{width:min(500px,100%);display:flex;flex-direction:column;align-items:center;gap:24px;color:#fff;--ani-rail-value:0;--ani-brightness:1}
.ani-ios-exposure-image{width:100%;aspect-ratio:5/3;overflow:hidden;border-radius:8px;background:#121d23}
.ani-ios-exposure-image img{display:block;width:100%;height:100%;object-fit:cover;filter:brightness(var(--ani-brightness));user-select:none;pointer-events:none}
.ani-ios-exposure-value{width:74px;height:74px;padding:0;border:0;border-radius:50%;background:none;position:relative;cursor:pointer}
.ani-ios-exposure-value svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.ani-ios-exposure-value span{font-size:18px;position:relative;color:#e6e9e7;font-variant-numeric:tabular-nums}
.ani-ios-exposure-value:not([data-zero="true"]) span{color:#ffe94d}
.ani-ios-exposure-track{width:100%;height:40px;position:relative;touch-action:pan-y;outline:none;user-select:none;cursor:ew-resize;overflow:hidden}
.ani-ios-exposure-ticks{position:absolute;inset:0;transform:translateX(calc(var(--ani-rail-value) * -0.4%));will-change:transform}
.ani-ios-exposure-ticks i{display:block;position:absolute;left:calc(50% + var(--tick-index) * 2.6%);bottom:0;width:3px;height:20px;background:#707975;border-radius:1px;transform-origin:center bottom;pointer-events:none}
.ani-ios-exposure-track[aria-disabled="true"]{opacity:.45;cursor:default}
`

/** One Ani value drives the rail, picture and indicator; semantic limits never include elastic overshoot. */
export function IosExposureSlider(props: IosExposureSliderProps) {
    const {
        clock,
        className = '',
        disabled = false,
        label = 'Exposure',
        imageSrc = '/ios-assets/exposure-neutral.png',
        imageAlt = 'City at night',
    } = props
    const control = useNumericControl(props, 0, -100, 100)
    const initial = useRef(control.current.current)
    const host = useRef<HTMLDivElement | null>(null)
    const track = useRef<HTMLDivElement | null>(null)
    const output = useRef<HTMLSpanElement | null>(null)
    const reset = useRef<HTMLButtonElement | null>(null)
    const arc = useRef<SVGCircleElement | null>(null)
    const ticks = useRef(new Map<number, HTMLElement>())
    const start = useRef({
        value: initial.current,
        accepted: initial.current,
        pixelsPerStep: 2,
    })
    const pendingDrag = useRef<{ semantic: number; presented: number } | null>(
        null
    )
    const generation = useRef(0)
    const [pendingRelease, setPendingRelease] =
        useState<ControlledRelease | null>(null)
    const handledRelease = useRef<ControlledRelease | null>(null)
    const motion = useFollow(
        { value: initial.current, activity: 0 },
        {
            ...(clock !== undefined && { clock }),
            spring: { m: 1, k: 350, c: 35, tolerance: 0.001 },
            resolver: {
                value: (value) => ({ key: '--ani-rail-value', value }),
                activity: (value) => ({ key: '--ani-rail-activity', value }),
            },
        }
    )
    // Initial declarations stay stable across owner rerenders. Only the commit
    // listener owns subsequent brightness/text/arc, so callbacks cannot flash the target early.
    const initialStyle = useRef({
        ...motion.style,
        '--ani-brightness': exposureBrightness(initial.current),
    } as CSSProperties)
    const ref = useCallback(
        (next: HTMLDivElement | null) => {
            host.current = next
            motion.ref(next)
        },
        [motion.ref]
    )
    const paint = (value: number, activity: number) => {
        const bounded = finiteClamp(value, -100, 100)
        const presented = value
        host.current?.style.setProperty(
            '--ani-brightness',
            String(exposureBrightness(bounded))
        )
        if (output.current)
            output.current.textContent = String(Math.round(bounded))
        reset.current?.setAttribute(
            'data-zero',
            String(Math.abs(bounded) < 0.5)
        )
        if (arc.current)
            arc.current.style.strokeDashoffset = String(
                CIRCUMFERENCE * (1 - Math.abs(bounded) / 100)
            )
        for (const [tick, element] of ticks.current) {
            const pose = exposureNotch(tick, presented, activity)
            element.style.transform = `translateX(-50%) scaleY(${pose.height / 20})`
            element.style.opacity = String(pose.opacity)
            const shade = Math.round(112 + pose.emphasis * 143)
            element.style.backgroundColor =
                tick === 0 ? '#ffe94d' : `rgb(${shade}, ${shade}, ${shade})`
        }
    }
    const announce = () =>
        track.current?.setAttribute(
            'aria-valuenow',
            String(Math.round(control.current.current))
        )
    useCommitEffect(() => {
        paint(motion.follower.value.value, motion.follower.value.activity)
        return motion.follower.onUpdate(({ state }) =>
            paint(state.value, state.activity)
        )
    }, [motion.follower])
    const set = (value: number) => {
        generation.current++
        const accepted = control.request(finiteClamp(value, -100, 100))
        void motion.follower.set({ value: accepted, activity: 0 })
        announce()
    }
    const drag = usePointerDrag({
        disabled,
        axis: 'x',
        onStart({ element }) {
            element.focus({ preventScroll: true })
            start.current = {
                value: motion.follower.value.value,
                accepted: control.current.current,
                pixelsPerStep:
                    (element.getBoundingClientRect().width || 500) * 0.004,
            }
            pendingDrag.current = null
            generation.current++
            motion.follower.jump({ activity: 1 })
        },
        onMove({ dx }) {
            const presented = exposureDrag(
                start.current.value,
                -dx / start.current.pixelsPerStep
            )
            const semantic = finiteClamp(presented, -100, 100)
            pendingDrag.current = { semantic, presented }
            const accepted = control.request(semantic)
            motion.follower.jump({
                value:
                    props.value === undefined || accepted === semantic
                        ? presented
                        : accepted,
                activity: 1,
            })
            announce()
        },
        onEnd({ dx, velocity }) {
            const presented = exposureDrag(
                start.current.value,
                -dx / start.current.pixelsPerStep
            )
            const speed = -velocity.x / start.current.pixelsPerStep
            const target = Math.round(
                finiteClamp(presented + speed * 0.12, -100, 100)
            )
            pendingDrag.current = null
            if (props.value === undefined) {
                const accepted = control.request(target)
                void motion.follower.set(
                    { value: accepted, activity: 0 },
                    {
                        velocity: {
                            value: releaseVelocity(accepted, speed),
                            activity: 0,
                        },
                    }
                )
            } else {
                const release = {
                    target,
                    velocity: speed,
                    generation: ++generation.current,
                }
                // Callback return is not owner acceptance. Freeze this pose;
                // one release-state update guarantees a commit even when the
                // owner rejects the proposal without changing any prop.
                motion.follower.jump(motion.follower.value)
                control.request(target)
                setPendingRelease(release)
            }
            announce()
            control.commit(target)
        },
        onCancel(_frame, reason) {
            generation.current++
            pendingDrag.current = null
            if (reason === 'unmount') return
            if (reason === 'axis') {
                void motion.follower.set({
                    value: start.current.accepted,
                    activity: 0,
                })
            } else set(start.current.accepted)
        },
    })
    const { active, cancel, ...handlers } = drag
    useCommitEffect(() => {
        const release =
            pendingRelease !== handledRelease.current &&
            pendingRelease?.generation === generation.current
                ? pendingRelease
                : null
        if (release) handledRelease.current = release
        if (props.value !== undefined || release) {
            if (active()) {
                const pending = pendingDrag.current
                const presented =
                    pending?.semantic === control.current.current
                        ? pending.presented
                        : control.current.current
                motion.follower.jump({ value: presented, activity: 1 })
            } else {
                const accepted = control.current.current
                const velocity = release
                    ? {
                          velocity: {
                              value:
                                  !disabled &&
                                  props.value !== undefined &&
                                  accepted === release.target
                                      ? releaseVelocity(
                                            accepted,
                                            release.velocity
                                        )
                                      : 0,
                              activity: 0,
                          },
                      }
                    : undefined
                void motion.follower.set(
                    { value: accepted, activity: 0 },
                    velocity
                )
            }
        }
        announce()
    }, [props.value, disabled, pendingRelease, motion.follower])
    const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return
        const value = control.current.current
        const next =
            event.key === 'Home'
                ? -100
                : event.key === 'End'
                  ? 100
                  : event.key === 'ArrowRight' || event.key === 'ArrowUp'
                    ? value + 1
                    : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                      ? value - 1
                      : event.key === 'PageUp'
                        ? value + 10
                        : event.key === 'PageDown'
                          ? value - 10
                          : null
        if (event.key === 'Escape') {
            generation.current++
            cancel()
            return
        }
        if (next === null) return
        event.preventDefault()
        cancel()
        set(next)
        control.commit(next)
    }
    return (
        <>
            <style>{CSS}</style>
            <div
                ref={ref}
                className={`ani-ios ani-ios-exposure ${className}`}
                data-ios-exposure=""
                style={initialStyle.current}
            >
                <div className="ani-ios-exposure-image">
                    <img
                        src={imageSrc}
                        alt={imageAlt}
                        width={500}
                        height={300}
                        draggable={false}
                    />
                </div>
                <button
                    ref={reset}
                    className="ani-ios-exposure-value"
                    type="button"
                    aria-label="Reset exposure"
                    data-exposure-reset=""
                    data-zero={initial.current === 0}
                    disabled={disabled}
                    onClick={() => {
                        cancel()
                        set(0)
                        control.commit(0)
                    }}
                >
                    <svg viewBox="0 0 100 100" aria-hidden="true">
                        <circle
                            cx="50"
                            cy="50"
                            r="48"
                            fill="none"
                            stroke="#59635e"
                            strokeWidth="2"
                        />
                        <circle
                            ref={arc}
                            data-exposure-arc=""
                            cx="50"
                            cy="50"
                            r="48"
                            fill="none"
                            stroke="#ffe94d"
                            strokeWidth="2"
                            strokeDasharray={CIRCUMFERENCE}
                            strokeDashoffset={
                                CIRCUMFERENCE *
                                (1 - Math.abs(initial.current) / 100)
                            }
                        />
                    </svg>
                    <span ref={output}>{Math.round(initial.current)}</span>
                </button>
                <div
                    ref={track}
                    className="ani-ios-exposure-track"
                    role="slider"
                    tabIndex={disabled ? -1 : 0}
                    aria-label={label}
                    aria-valuemin={-100}
                    aria-valuemax={100}
                    aria-valuenow={control.current.current}
                    aria-disabled={disabled}
                    onKeyDown={keyDown}
                    {...handlers}
                >
                    <div className="ani-ios-exposure-ticks" aria-hidden="true">
                        {TICKS.map((tick) => (
                            <i
                                key={tick}
                                ref={(element) => {
                                    if (element)
                                        ticks.current.set(tick, element)
                                    else ticks.current.delete(tick)
                                }}
                                data-tick={tick}
                                data-zero={tick === 0 ? '' : undefined}
                                style={
                                    {
                                        '--tick-index': tick / 5,
                                    } as CSSProperties
                                }
                            />
                        ))}
                    </div>
                </div>
            </div>
        </>
    )
}
