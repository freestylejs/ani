'use client'

import { useFollow } from '@freestylejs/ani-react'
import {
    type KeyboardEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react'
import { finiteClamp, swipeRelease } from './interaction_math'
import {
    ActionIcon,
    type ActionIconName,
    BASE_CSS,
    type IosMotionProps,
    useCommitEffect,
} from './shared'
import { usePointerDrag } from './use_pointer_drag'

export interface IosSwipeAction {
    readonly id: string
    readonly label: string
    readonly icon: ActionIconName
    readonly color: string
    readonly primary?: boolean | undefined
}
export interface IosSwipeActionsProps extends IosMotionProps {
    readonly children?: ReactNode
    readonly leftActions?: readonly IosSwipeAction[] | undefined
    readonly rightActions?: readonly IosSwipeAction[] | undefined
    readonly onAction?: ((id: string) => void) | undefined
    readonly disabled?: boolean | undefined
}
const LEFT: readonly IosSwipeAction[] = [
    {
        id: 'read',
        label: 'Action 1',
        icon: 'mail',
        color: '#ff9500',
        primary: true,
    },
    { id: 'later', label: 'Action 2', icon: 'clock', color: '#75757e' },
]
const RIGHT: readonly IosSwipeAction[] = [
    { id: 'flag', label: 'Action 4', icon: 'flag', color: '#1d75ff' },
    {
        id: 'archive',
        label: 'Action 3',
        icon: 'archive',
        color: '#a000ff',
        primary: true,
    },
]
const CSS = `${BASE_CSS}
.ani-ios-swipe{width:min(384px,100%);height:80px;position:relative;border-radius:8px;overflow:hidden;background:#0b1211;border:1px solid #192020;--left-reveal:0px;--right-reveal:0px}
.ani-ios-swipe-actions{display:flex;position:absolute;top:0;bottom:0;overflow:hidden}
.ani-ios-swipe-actions[data-side="left"]{left:0;width:var(--left-reveal)}
.ani-ios-swipe-actions[data-side="right"]{right:0;width:var(--right-reveal)}
.ani-ios-swipe-actions button{flex:1 0 0;min-width:0;border:0;color:#fff;padding:0;display:flex;align-items:center;justify-content:center;gap:7px;flex-direction:column;cursor:pointer;overflow:hidden;font-size:10px;white-space:nowrap}
.ani-ios-swipe-actions svg{width:22px;height:22px;flex:none}
.ani-ios-swipe-surface{position:absolute;inset:0;background:#0b1211;border-radius:7px;color:#6d737d;display:flex;align-items:center;justify-content:center;font-size:12px;touch-action:pan-y;user-select:none;outline:none;cursor:grab;will-change:transform}
.ani-ios-swipe-surface:active{cursor:grabbing}
.ani-ios-swipe-surface:focus-visible{outline:2px solid #2388ff;outline-offset:-3px}
`

/** The row has one transform writer: Ani. Input policy stays outside the layout engine. */
export function IosSwipeActions({
    clock,
    className = '',
    children = 'Swipe left or right to reveal actions',
    leftActions = LEFT,
    rightActions = RIGHT,
    onAction,
    disabled = false,
}: IosSwipeActionsProps) {
    const root = useRef<HTMLDivElement | null>(null)
    const surface = useRef<HTMLDivElement | null>(null)
    const left = useRef<HTMLDivElement | null>(null)
    const right = useRef<HTMLDivElement | null>(null)
    const start = useRef({ x: 0, width: 384 })
    const suppressClick = useRef(false)
    const generation = useRef(0)
    const mounted = useRef(true)
    const [message, setMessage] = useState('')
    const motion = useFollow(
        { translateX: 0 },
        {
            ...(clock !== undefined && { clock }),
            spring: { m: 1, k: 900, c: 80, tolerance: 0.01 },
        }
    )
    const ref = useCallback(
        (next: HTMLDivElement | null) => {
            surface.current = next
            motion.ref(next)
        },
        [motion.ref]
    )
    const width = () => root.current?.clientWidth || 384
    const reveal = (side: 'left' | 'right') =>
        Math.min(
            width(),
            ((side === 'left' ? leftActions : rightActions).length * width()) /
                4
        )
    const paint = (x: number) => {
        root.current?.style.setProperty('--left-reveal', `${Math.max(0, x)}px`)
        root.current?.style.setProperty(
            '--right-reveal',
            `${Math.max(0, -x)}px`
        )
        const side = x > 0.5 ? 'left' : x < -0.5 ? 'right' : 'none'
        root.current?.setAttribute('data-open', side)
        surface.current?.setAttribute('aria-expanded', String(side !== 'none'))
        for (const [name, node] of [
            ['left', left.current],
            ['right', right.current],
        ] as const) {
            node?.setAttribute('aria-hidden', String(name !== side))
            for (const button of node?.querySelectorAll('button') ?? [])
                button.tabIndex = name === side && !disabled ? 0 : -1
        }
    }
    useCommitEffect(() => {
        paint(motion.follower.value.translateX)
        return motion.follower.onUpdate(({ state }) => paint(state.translateX))
    }, [motion.follower, disabled])
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
            generation.current++
        }
    }, [])
    const close = () => {
        generation.current++
        void motion.follower.set({ translateX: 0 })
    }
    const open = (side: 'left' | 'right') => {
        generation.current++
        void motion.follower.set({
            translateX: (side === 'left' ? 1 : -1) * reveal(side),
        })
    }
    const activate = (
        action: IosSwipeAction,
        side: 'left' | 'right',
        full = false,
        velocity = 0
    ) => {
        if (disabled) return
        const own = ++generation.current
        setMessage(`${action.label} activated`)
        const run = motion.follower.set(
            { translateX: full ? (side === 'left' ? 1 : -1) * width() : 0 },
            { velocity: { translateX: velocity } }
        )
        onAction?.(action.id)
        void run.then((result) => {
            if (
                full &&
                result === 'ended' &&
                mounted.current &&
                generation.current === own
            )
                close()
        })
    }
    const drag = usePointerDrag({
        disabled,
        axis: 'x',
        onStart({ element }) {
            element.focus({ preventScroll: true })
            generation.current++
            suppressClick.current = false
            start.current = {
                x: motion.follower.value.translateX,
                width: width(),
            }
            motion.follower.jump({ translateX: start.current.x })
        },
        onMove({ dx, distance }) {
            if (distance > 3) suppressClick.current = true
            const x = finiteClamp(
                start.current.x + dx,
                -start.current.width,
                start.current.width
            )
            motion.follower.jump({
                translateX:
                    (x > 0 && leftActions.length === 0) ||
                    (x < 0 && rightActions.length === 0)
                        ? 0
                        : x,
            })
        },
        onEnd({ dx, distance, velocity }) {
            if (distance > 3) suppressClick.current = true
            const final = finiteClamp(
                start.current.x + dx,
                -start.current.width,
                start.current.width
            )
            const x =
                (final > 0 && leftActions.length === 0) ||
                (final < 0 && rightActions.length === 0)
                    ? 0
                    : final
            // The last pointer-up may be the only sample beyond a threshold.
            // Release the actually reported position, not the last move frame.
            motion.follower.jump({ translateX: x })
            const side = x + velocity.x * 0.12 > 0 ? 'left' : 'right'
            const result = swipeRelease(
                x,
                velocity.x,
                start.current.width,
                reveal(side)
            )
            if (result.action) {
                // A full swipe belongs to the actually revealed side, even
                // when the final sample predicts motion in the other direction.
                const actions =
                    result.action === 'left' ? leftActions : rightActions
                const primary = actions.find((action) => action.primary)
                if (primary) {
                    activate(primary, result.action, true, velocity.x)
                    return
                }
                open(result.action)
                return
            }
            // A fling toward an unavailable side cannot reveal an empty
            // surface. Zero only that forbidden direction's input velocity.
            const incoming =
                (velocity.x < 0 && rightActions.length === 0) ||
                (velocity.x > 0 && leftActions.length === 0)
                    ? 0
                    : velocity.x
            void motion.follower.set(
                { translateX: result.target },
                { velocity: { translateX: incoming } }
            )
        },
        onCancel(_frame, reason) {
            if (reason === 'unmount') return
            if (reason === 'axis')
                void motion.follower.set(
                    { translateX: start.current.x },
                    { velocity: { translateX: 0 } }
                )
            else close()
        },
    })
    const { active: _active, cancel, ...handlers } = drag
    useEffect(() => {
        if (disabled) close()
    }, [disabled])
    const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return
        if (
            ![
                'ArrowLeft',
                'ArrowRight',
                'Escape',
                'Home',
                'Enter',
                ' ',
            ].includes(event.key)
        )
            return
        event.preventDefault()
        cancel()
        if (event.key === 'Escape' || event.key === 'Home') close()
        else open(event.key === 'ArrowRight' ? 'left' : 'right')
    }
    return (
        <>
            <style>{CSS}</style>
            <div
                className={`ani-ios ani-ios-swipe ${className}`}
                ref={root}
                data-swipe-root=""
                data-open="none"
            >
                {(['left', 'right'] as const).map((side) => (
                    <div
                        key={side}
                        ref={side === 'left' ? left : right}
                        className="ani-ios-swipe-actions"
                        data-side={side}
                        aria-hidden="true"
                    >
                        {(side === 'left' ? leftActions : rightActions).map(
                            (action) => (
                                <button
                                    key={action.id}
                                    type="button"
                                    data-swipe-action={action.id}
                                    tabIndex={-1}
                                    disabled={disabled}
                                    style={{ background: action.color }}
                                    aria-label={`${action.label}: ${action.id}`}
                                    onClick={() => activate(action, side)}
                                >
                                    <ActionIcon name={action.icon} />
                                    <span>{action.label}</span>
                                </button>
                            )
                        )}
                    </div>
                ))}
                <div
                    ref={ref}
                    style={motion.style}
                    className="ani-ios-swipe-surface"
                    data-swipe-surface=""
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-label="Swipe actions"
                    aria-expanded="false"
                    aria-disabled={disabled}
                    onKeyDown={keyDown}
                    {...handlers}
                    onClick={() => {
                        if (suppressClick.current) {
                            suppressClick.current = false
                            return
                        }
                        if (!disabled) open('right')
                    }}
                >
                    {children}
                </div>
                <span className="ani-ios-sr" role="status">
                    {message}
                </span>
            </div>
        </>
    )
}
