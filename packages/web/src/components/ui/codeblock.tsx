'use client'

import { getHighlighter, hastToJsx } from 'fumadocs-core/highlight'
import * as Base from 'fumadocs-ui/components/codeblock'
import { useEffect, useState } from 'react'
import type { BundledLanguage, Highlighter } from 'shiki'
import { cn } from '@/lib/utils'

export interface CodeBlockProps {
    code: string
    wrapper?: Base.CodeBlockProps
    lang: string
}

export const CodeBlock = ({ code, lang, wrapper }: CodeBlockProps) => {
    const [highlighter, setHighlighter] = useState<Highlighter | null>(null)
    useEffect(() => {
        const loadLang = async () => {
            const highlighter = await getHighlighter('js', {
                langs: ['js', 'ts', 'jsx', 'tsx'],
                themes: ['catppuccin-macchiato', 'github-light'],
            })
            await highlighter.loadLanguage(lang as BundledLanguage)
            setHighlighter(highlighter)
            return
        }

        loadLang()
    }, [])

    if (!highlighter) {
        return null
    }

    const hast = highlighter.codeToHast(code.trim(), {
        lang,
        defaultColor: false,
        themes: {
            light: 'github-light',
            dark: 'catppuccin-macchiato',
        },
    })

    const rendered = hastToJsx(hast, {
        components: {
            pre: Base.Pre,
        },
    })

    return (
        <Base.CodeBlock {...wrapper} className={cn('my-0', wrapper?.className)}>
            {rendered}
        </Base.CodeBlock>
    )
}
