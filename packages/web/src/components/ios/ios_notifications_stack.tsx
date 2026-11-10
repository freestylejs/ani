'use client'

import { useFollow } from '@freestylejs/ani-react'
import { type ReactNode, useState } from 'react'
import { BASE_CSS, type IosMotionProps, useCommitEffect } from './shared'

export interface IosNotification {
    readonly id: string
    readonly content?: ReactNode
    readonly label?: string | undefined
}
export interface IosNotificationsStackProps extends IosMotionProps {
    readonly items?: readonly IosNotification[] | undefined
    readonly expanded?: boolean | undefined
    readonly defaultExpanded?: boolean | undefined
    readonly onExpandedChange?: ((expanded: boolean) => void) | undefined
    readonly onSelect?: ((item: IosNotification) => void) | undefined
    readonly title?: string | undefined
}
const DEFAULT_ITEMS: readonly IosNotification[] = [
    { id: 'first' },
    { id: 'second' },
    { id: 'third' },
]
const SPRING = { m: 1, k: 450, c: 35, tolerance: 0.001 }
const CSS = `${BASE_CSS}
.ani-ios-stack{position:relative;width:280px;max-width:100%;color:white;min-height:60px}
.ani-ios-stack-heading{position:absolute;left:0;right:0;top:-36px;display:flex;align-items:center;justify-content:space-between;font-size:12px;line-height:20px;white-space:nowrap}
.ani-ios-stack-heading button{border:0;background:#292d32;color:#dddfe2;border-radius:20px;font-size:10px;line-height:20px;padding:1px 10px;cursor:pointer}
.ani-ios-stack-card{position:absolute;inset:0 0 auto;height:60px;transform-origin:50% 0;list-style:none}
.ani-ios-stack-card button{display:block;width:100%;height:100%;padding:12px 16px;text-align:left;border:1px solid #e0e3e5;background:#fff;color:#20242a;border-radius:11px;box-shadow:0 2px 5px #0002;cursor:pointer;font-size:13px;line-height:18px;overflow:hidden}
`
function NotificationCard({
    item,
    index,
    count,
    expanded,
    onClick,
    clock,
}: {
    item: IosNotification
    index: number
    count: number
    expanded: boolean
    onClick: () => void
} & IosMotionProps) {
    const pose = {
        translateY: expanded ? index * 68 : -Math.min(index, 3) * 10,
        scale: expanded ? 1 : 1 - Math.min(index, 3) * 0.06,
        opacity: !expanded && index > 2 ? 0 : 1,
    }
    const motion = useFollow(pose, {
        ...(clock !== undefined && { clock }),
        spring: SPRING,
    })
    useCommitEffect(() => {
        void motion.follower.set(pose)
    }, [expanded, index, motion.follower])
    return (
        <div
            ref={motion.ref}
            style={{ ...motion.style, zIndex: count - index }}
            className="ani-ios-stack-card"
            role="listitem"
            data-notification={item.id}
            aria-hidden={!expanded && index > 0}
        >
            <button
                type="button"
                tabIndex={expanded || index === 0 ? 0 : -1}
                inert={!expanded && index > 0}
                data-stack-expand={!expanded && index === 0 ? '' : undefined}
                aria-label={
                    !expanded && index === 0
                        ? 'Expand notifications'
                        : (item.label ?? `Notification ${index + 1}`)
                }
                onClick={onClick}
            >
                {item.content}
            </button>
        </div>
    )
}

/** The empty reference cards are deliberate; consumers may supply meaningful content. */
export function IosNotificationsStack({
    clock,
    className = '',
    items = DEFAULT_ITEMS,
    expanded: controlled,
    defaultExpanded = false,
    onExpandedChange,
    onSelect,
    title = 'Notifications',
}: IosNotificationsStackProps) {
    if (new Set(items.map((item) => item.id)).size !== items.length)
        throw new TypeError('Notification ids must be unique.')
    const [local, setLocal] = useState(defaultExpanded)
    const expanded = controlled ?? local
    const change = (next: boolean) => {
        if (controlled === undefined) setLocal(next)
        onExpandedChange?.(next)
    }
    const root = useFollow(
        {
            height: expanded ? Math.max(60, items.length * 68 - 8) : 60,
            scale: 1,
        },
        { ...(clock !== undefined && { clock }), spring: SPRING }
    )
    const heading = useFollow(
        { opacity: expanded ? 1 : 0, translateY: expanded ? 0 : 10 },
        { ...(clock !== undefined && { clock }), spring: SPRING }
    )
    useCommitEffect(() => {
        void root.follower.set({
            height: expanded ? Math.max(60, items.length * 68 - 8) : 60,
            scale: 1,
        })
        void heading.follower.set({
            opacity: expanded ? 1 : 0,
            translateY: expanded ? 0 : 10,
        })
    }, [expanded, items.length, root.follower, heading.follower])
    return (
        <>
            <style>{CSS}</style>
            <div
                ref={root.ref}
                style={root.style}
                className={`ani-ios ani-ios-stack ${className}`}
                data-stack-root=""
                data-expanded={expanded}
                onPointerEnter={(event) => {
                    if (!expanded && event.pointerType === 'mouse')
                        void root.follower.set({ scale: 1.04 })
                }}
                onPointerLeave={() => {
                    void root.follower.set({ scale: 1 })
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.stopPropagation()
                        change(false)
                    }
                }}
            >
                <div
                    ref={heading.ref}
                    style={heading.style}
                    className="ani-ios-stack-heading"
                    aria-hidden={!expanded}
                >
                    <span>{title}</span>
                    <button
                        type="button"
                        data-stack-collapse=""
                        tabIndex={expanded ? 0 : -1}
                        inert={!expanded}
                        onClick={() => change(false)}
                    >
                        Collapse
                    </button>
                </div>
                <div role="list" aria-label={title}>
                    {items.map((item, index) => (
                        <NotificationCard
                            key={item.id}
                            item={item}
                            index={index}
                            count={items.length}
                            clock={clock}
                            expanded={expanded}
                            onClick={() => {
                                if (expanded) onSelect?.(item)
                                else change(true)
                            }}
                        />
                    ))}
                </div>
            </div>
        </>
    )
}
