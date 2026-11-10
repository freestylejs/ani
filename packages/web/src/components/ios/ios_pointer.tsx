'use client'

import { useFollow } from '@freestylejs/ani-react'
import { type PointerEvent, useRef } from 'react'
import { ActionIcon, BASE_CSS, type IosMotionProps } from './shared'

export interface IosPointerProps extends IosMotionProps {
    readonly label?: string | undefined
    readonly onPress?: (() => void) | undefined
    readonly disabled?: boolean | undefined
}
const CSS = `${BASE_CSS}
.ani-ios-pointer-surface{width:100%;height:100%;min-height:300px;display:grid;place-items:center;overflow:hidden;color:#1684ee}
.ani-ios-pointer-surface[data-custom-pointer]{cursor:none}
.ani-ios-pointer-anchor{position:relative;z-index:1}
.ani-ios-pointer-button{display:flex;align-items:center;gap:4px;border:0;background:none;padding:12px 10px;color:inherit;font-size:24px;line-height:1.2;font-weight:400;cursor:inherit;user-select:none;outline:none}
.ani-ios-pointer-button svg{width:18px;height:24px;stroke-width:1.5}
.ani-ios-pointer-dot{position:absolute;left:0;top:0;background:#7b7d7e;pointer-events:none;z-index:0;will-change:transform,width,height}
`

/** A local magnetic pointer. It never changes the document's cursor or global pointer stream. */
export function IosPointer({
    clock,
    className = '',
    label = 'Appearance',
    onPress,
    disabled = false,
}: IosPointerProps) {
    const root = useRef<HTMLDivElement | null>(null)
    const anchor = useRef<HTMLDivElement | null>(null)
    const options = {
        ...(clock !== undefined && { clock }),
        spring: { m: 1, k: 500, c: 38 },
    }
    const dot = useFollow(
        {
            translateX: 0,
            translateY: 0,
            width: 16,
            height: 16,
            borderRadius: 8,
            opacity: 0,
        },
        options
    )
    const target = useFollow(
        { translateX: 0, translateY: 0, scale: 1 },
        options
    )
    const move = (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== 'mouse' || !root.current || !anchor.current)
            return
        const bounds = root.current.getBoundingClientRect()
        const box = anchor.current.getBoundingClientRect()
        const dx = event.clientX - (box.left + box.width / 2)
        const dy = event.clientY - (box.top + box.height / 2)
        const near =
            !disabled &&
            Math.abs(dx) < box.width / 2 + 16 &&
            Math.abs(dy) < box.height / 2 + 16
        root.current.setAttribute('data-custom-pointer', '')
        if (near) {
            const x = dx * 0.12
            const y = dy * 0.12
            void target.follower.set({ translateX: x, translateY: y })
            void dot.follower.set({
                translateX: box.left - bounds.left - 4 + x,
                translateY: box.top - bounds.top - 2 + y,
                width: box.width + 8,
                height: box.height + 4,
                borderRadius: 10,
                opacity: 0.17,
            })
        } else {
            void target.follower.set({ translateX: 0, translateY: 0, scale: 1 })
            void dot.follower.set({
                translateX: event.clientX - bounds.left - 8,
                translateY: event.clientY - bounds.top - 8,
                width: 16,
                height: 16,
                borderRadius: 8,
                opacity: 0.85,
            })
        }
    }
    const leave = () => {
        root.current?.removeAttribute('data-custom-pointer')
        void dot.follower.set({ opacity: 0 })
        void target.follower.set({ translateX: 0, translateY: 0, scale: 1 })
    }
    return (
        <>
            <style>{CSS}</style>
            <div
                ref={root}
                className={`ani-ios ani-ios-pointer-surface ${className}`}
                data-ios-pointer=""
                onPointerEnter={move}
                onPointerMove={move}
                onPointerLeave={leave}
            >
                <div ref={anchor} className="ani-ios-pointer-anchor">
                    <button
                        ref={target.ref}
                        style={target.style}
                        type="button"
                        disabled={disabled}
                        className="ani-ios-pointer-button"
                        onClick={onPress}
                        onPointerDown={(event) => {
                            if (event.button !== 0) return
                            try {
                                event.currentTarget.setPointerCapture(
                                    event.pointerId
                                )
                            } catch {
                                /* Native cancellation is also handled below. */
                            }
                            void target.follower.set({ scale: 0.95 })
                        }}
                        onPointerUp={(event) => {
                            if (
                                event.currentTarget.hasPointerCapture(
                                    event.pointerId
                                )
                            )
                                event.currentTarget.releasePointerCapture(
                                    event.pointerId
                                )
                            void target.follower.set({ scale: 1 })
                        }}
                        onLostPointerCapture={() => {
                            void target.follower.set({ scale: 1 })
                        }}
                        onPointerCancel={leave}
                        onBlur={leave}
                    >
                        <ActionIcon name="back" />
                        {label}
                    </button>
                </div>
                <div
                    ref={dot.ref}
                    style={dot.style}
                    className="ani-ios-pointer-dot"
                    aria-hidden="true"
                />
            </div>
        </>
    )
}
