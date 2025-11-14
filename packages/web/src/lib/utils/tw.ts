import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
    type CreateTailwindest,
    type CreateTailwindLiteral,
    createTools,
} from 'tailwindest'
import type { Tailwind, TailwindNestGroups } from './tailwind'

export type Tailwindest = CreateTailwindest<{
    tailwind: Tailwind
    tailwindNestGroups: TailwindNestGroups
    useArbitrary: true // <-- enable arbitrary values, type-hinting is available for this option
    // groupPrefix: "$" <-- prefix for group variants
}>

// Create a literal type for all possible Tailwind classes
export type TailwindLiteral = CreateTailwindLiteral<Tailwind>

// Create the tools
export const tw = createTools<{
    tailwindest: Tailwindest
    tailwindLiteral: TailwindLiteral
    useArbitrary: true
    // useTypedLiteral: true <-- enables typed literal classes at tw.style().class(...typed literals)
}>()

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
