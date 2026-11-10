'use client'

import type { Clock } from '@freestylejs/ani-core'
import { type SVGProps, useEffect, useLayoutEffect, useRef } from 'react'
import { finiteClamp } from './interaction_math'

export interface IosMotionProps {
    readonly clock?: Clock | undefined
    readonly className?: string | undefined
}
export interface NumericControlProps extends IosMotionProps {
    readonly value?: number | undefined
    readonly defaultValue?: number | undefined
    /** Bounded proposed value. A controlled owner decides whether to accept it. */
    readonly onValueChange?: ((value: number) => void) | undefined
    /** Final bounded proposal, not a read of the previous batched owner render. */
    readonly onValueCommit?: ((value: number) => void) | undefined
    readonly disabled?: boolean | undefined
    readonly label?: string | undefined
}
export const useCommitEffect =
    typeof window === 'undefined' ? useEffect : useLayoutEffect

/** The owner remains authoritative; uncontrolled values do not trigger React per input sample. */
export function useNumericControl(
    props: NumericControlProps,
    initial: number,
    min: number,
    max: number
) {
    const current = useRef(
        finiteClamp(props.value ?? props.defaultValue ?? initial, min, max)
    )
    const latest = useRef(props)
    latest.current = props
    if (props.value !== undefined)
        current.current = finiteClamp(props.value, min, max)
    return {
        current,
        request(value: number) {
            const next = finiteClamp(value, min, max)
            if (latest.current.value === undefined) current.current = next
            latest.current.onValueChange?.(next)
            return current.current
        },
        commit(requested: number) {
            latest.current.onValueCommit?.(finiteClamp(requested, min, max))
        },
    }
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
            <circle cx="16" cy="16" r="6.2" fill="currentColor" />
            <path
                d="M16 2v3M16 27v3M2 16h3M27 16h3M6.1 6.1l2.2 2.2M23.7 23.7l2.2 2.2M6.1 25.9l2.2-2.2M23.7 8.3l2.2-2.2"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
            />
        </svg>
    )
}

export type ActionIconName =
    | 'mail'
    | 'clock'
    | 'flag'
    | 'archive'
    | 'close'
    | 'back'
export function ActionIcon({
    name,
    ...props
}: SVGProps<SVGSVGElement> & { name: ActionIconName }) {
    const paths: Record<ActionIconName, string> = {
        mail: 'M3 7l9-4 9 4v13H3V7zm0 0l9 7 9-7',
        clock: 'M12 7v5l-3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
        flag: 'M5 22V3c5-3 9 4 14 1v11c-5 3-9-4-14-1',
        archive: 'M3 3h18v5H3V3zm2 5v13h14V8M9 12h6',
        close: 'M5 5l14 14M19 5L5 19',
        back: 'M15 3l-9 9 9 9',
    }
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            {...props}
        >
            <path d={paths[name]} />
        </svg>
    )
}

/** Scoped rules only: a component never changes a host app's body/cursor/theme. */
export const BASE_CSS = `
.ani-ios{font-family:var(--ani-ios-font,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);box-sizing:border-box;-webkit-font-smoothing:antialiased;position:relative;isolation:isolate}
.ani-ios *, .ani-ios *::before, .ani-ios *::after{box-sizing:border-box}
.ani-ios button{font:inherit;-webkit-tap-highlight-color:transparent}
.ani-ios button:focus-visible,.ani-ios [role="slider"]:focus-visible{outline:3px solid #2388ff;outline-offset:5px}
.ani-ios button:disabled{cursor:default;opacity:.45}
.ani-ios .ani-ios-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
`
