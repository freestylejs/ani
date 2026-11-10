'use client'

import { useFollow } from '@freestylejs/ani-react'
import { type KeyboardEvent, useCallback, useRef } from 'react'
import { finiteClamp, sliderPose } from './interaction_math'
import {
    BASE_CSS,
    type NumericControlProps,
    SunIcon,
    useCommitEffect,
    useNumericControl,
} from './shared'
import { usePointerDrag } from './use_pointer_drag'

const CSS = `${BASE_CSS}
.ani-ios-slider{width:100px;height:225px;border-radius:40px;background:#242d29;position:relative;touch-action:none;user-select:none;cursor:ns-resize;outline:none;will-change:transform}
.ani-ios-slider[aria-disabled="true"]{cursor:default;opacity:.5}
.ani-ios-slider-clip{position:absolute;inset:0;border-radius:inherit;overflow:hidden}
.ani-ios-slider-fill{position:absolute;left:0;right:0;bottom:0;height:var(--ani-level,50%);background:#fff}
.ani-ios-slider svg{position:absolute;width:34px;height:34px;left:33px;bottom:27px;color:#11181b;pointer-events:none;mix-blend-mode:multiply}
`

/** Brightness: semantic 0..1, 1:1 input, separate bounded elastic presentation. */
export function IosSlider(props: NumericControlProps) {
    const {
        clock,
        className = '',
        disabled = false,
        label = 'Brightness',
    } = props
    const control = useNumericControl(props, 0.5, 0, 1)
    const element = useRef<HTMLDivElement | null>(null)
    const start = useRef({
        value: control.current.current,
        accepted: control.current.current,
        height: 225,
        top: 0,
    })
    const pendingPose = useRef<ReturnType<typeof sliderPose> | null>(null)
    const motion = useFollow(
        { value: control.current.current, translateY: 0, scaleX: 1, scaleY: 1 },
        {
            ...(clock !== undefined && { clock }),
            spring: { m: 1, k: 200, c: 60, tolerance: 0.001 },
            resolver: {
                value: (value) => ({
                    key: '--ani-level',
                    value: `${finiteClamp(value, 0, 1) * 100}%`,
                }),
            },
        }
    )
    const ref = useCallback(
        (next: HTMLDivElement | null) => {
            element.current = next
            motion.ref(next)
        },
        [motion.ref]
    )
    const announce = () =>
        element.current?.setAttribute(
            'aria-valuenow',
            String(Number(control.current.current.toFixed(4)))
        )
    const recover = () => {
        element.current?.removeAttribute('data-dragging')
        void motion.follower.set({
            value: control.current.current,
            translateY: 0,
            scaleX: 1,
            scaleY: 1,
        })
        announce()
    }
    const drag = usePointerDrag({
        disabled,
        axis: 'y',
        onStart({ element: target }) {
            target.focus({ preventScroll: true })
            const rect = target.getBoundingClientRect()
            const height = target.offsetHeight || rect.height || 225
            const drawn = motion.follower.value
            // Invert only the bounded product rubber band. Ani still owns the
            // spring and velocity; re-catching must preserve the displayed pose.
            const pull = finiteClamp(drawn.translateY, -19.999999, 19.999999)
            const distance = (pull * 20) / (20 - Math.abs(pull))
            start.current = {
                value: drawn.value - distance / height,
                accepted: control.current.current,
                height,
                top: rect.top,
            }
            pendingPose.current = null
            target.setAttribute('data-dragging', '')
            motion.follower.jump(drawn)
        },
        onMove({ dy }) {
            const pose = sliderPose(
                start.current.value - dy / start.current.height,
                start.current.height
            )
            pendingPose.current = pose
            const value = control.request(pose.value)
            const apply = props.value === undefined || value === pose.value
            motion.follower.jump({
                value,
                translateY: apply ? pose.pull : 0,
                scaleX: apply ? pose.sx : 1,
                scaleY: apply ? pose.sy : 1,
            })
            announce()
        },
        onEnd({ distance, dy, y }) {
            const raw =
                distance < 3
                    ? 1 - (y - start.current.top) / start.current.height
                    : start.current.value - dy / start.current.height
            const requested = finiteClamp(raw, 0, 1)
            pendingPose.current = null
            control.request(requested)
            recover()
            control.commit(requested)
        },
        onCancel(_frame, reason) {
            if (reason === 'unmount') return
            pendingPose.current = null
            if (reason !== 'axis') control.request(start.current.accepted)
            recover()
        },
    })
    const { active, cancel, ...handlers } = drag
    useCommitEffect(() => {
        if (!active()) {
            recover()
            return
        }
        const pose = pendingPose.current
        const apply = pose?.value === control.current.current
        motion.follower.jump({
            value: control.current.current,
            translateY: apply ? pose.pull : 0,
            scaleX: apply ? pose.sx : 1,
            scaleY: apply ? pose.sy : 1,
        })
        announce()
    }, [props.value, motion.follower])

    const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return
        const value = control.current.current
        const next =
            event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? 1
                  : event.key === 'ArrowUp' || event.key === 'ArrowRight'
                    ? value + 0.05
                    : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
                      ? value - 0.05
                      : event.key === 'PageUp'
                        ? value + 0.1
                        : event.key === 'PageDown'
                          ? value - 0.1
                          : null
        if (event.key === 'Escape') {
            cancel()
            return
        }
        if (next === null) return
        event.preventDefault()
        cancel()
        const requested = finiteClamp(next, 0, 1)
        control.request(requested)
        recover()
        control.commit(requested)
    }
    return (
        <>
            <style>{CSS}</style>
            <div
                ref={ref}
                className={`ani-ios ani-ios-slider ${className}`}
                style={motion.style}
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-label={label}
                aria-orientation="vertical"
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={control.current.current}
                aria-disabled={disabled}
                data-ios-slider=""
                onKeyDown={keyDown}
                {...handlers}
            >
                <div className="ani-ios-slider-clip">
                    <div className="ani-ios-slider-fill" />
                </div>
                <SunIcon />
            </div>
        </>
    )
}
