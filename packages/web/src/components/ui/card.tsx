'use client'

import DynamicLink from 'fumadocs-core/dynamic-link'
import { ArrowUpRight } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils' // Assumes you have the Shadcn 'cn' utility

const Card = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        data-slot="card"
        className={cn(
            'glass-1 group relative flex size-full flex-col gap-6 overflow-hidden rounded-xl border border-zinc-100 p-6 text-card-foreground transition-all duration-300 hover:border-zinc-200 hover:bg-transparent dark:border-zinc-900 hover:dark:border-zinc-600',
            className
        )}
        ref={ref}
        {...props}
    />
))
Card.displayName = 'Card'

const CardLink = React.forwardRef<
    HTMLAnchorElement,
    React.AnchorHTMLAttributes<HTMLAnchorElement>
>(({ className, children, ...props }, ref) => (
    <DynamicLink
        href={`/[lang]/${props.href ?? ''}`}
        data-slot="card-link"
        className={cn(
            'absolute top-4 right-4 z-20 block rounded-full p-2.5',
            'bg-neutral-200/90 dark:bg-black/20',
            'border border-neutral-200 dark:border-zinc-800',
            'hover:border-neutral-300 dark:hover:border-zinc-700',
            'opacity-0 transition-all duration-200',
            'group-hover:scale-110 group-hover:opacity-100 group-hover:active:scale-95',
            className
        )}
        ref={ref}
        {...props}
    >
        {children || <ArrowUpRight className="size-5 text-white/90" />}
    </DynamicLink>
))
CardLink.displayName = 'CardLink'

const CardContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        data-slot="card-content"
        className={cn('relative z-10 flex flex-col gap-4', className)}
        ref={ref}
        {...props}
    />
))
CardContent.displayName = 'CardContent'

const CardTitle = React.forwardRef<
    HTMLHeadingElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h3
        data-slot="card-title"
        className={cn(
            'relative z-10 font-semibold text-2xl text-neutral-900 leading-none tracking-tight dark:text-white',
            className
        )}
        ref={ref}
        {...props}
    />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        data-slot="card-description"
        className={cn(
            'relative z-10 flex flex-col gap-2 text-balance text-md text-neutral-700 dark:text-neutral-400',
            className
        )}
        ref={ref}
        {...props}
    />
))
CardDescription.displayName = 'CardDescription'

const CardVisual = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
    <div
        data-slot="card-visual"
        className={cn(
            'relative z-10 flex grow items-end justify-center',
            className
        )}
        ref={ref}
        {...props}
    >
        <div className="-mb-[96px] sm:-mb-[186px] md:-mx-32">{children}</div>
    </div>
))
CardVisual.displayName = 'CardVisual'

export {
    Card as Card,
    CardLink as CardLink,
    CardContent as CardContent,
    CardTitle as CardTitle,
    CardDescription as CardDescription,
    CardVisual as CardVisual,
}
