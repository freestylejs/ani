import { getHighlighter, hastToJsx } from 'fumadocs-core/highlight'
import * as Base from 'fumadocs-ui/components/codeblock'
import type { BundledLanguage } from 'shiki'
import { cn } from '@/lib/utils'

export interface CodeBlockProps {
    code: string
    wrapper?: Base.CodeBlockProps
    lang: string
}

const highlighter = await getHighlighter('js', {
    langs: ['js', 'ts', 'jsx', 'tsx'],
    themes: ['vesper', 'github-light'],
})

export const CodeBlock = async ({ code, lang, wrapper }: CodeBlockProps) => {
    await highlighter.loadLanguage(lang as BundledLanguage)

    const hast = highlighter.codeToHast(code, {
        lang,
        defaultColor: false,
        themes: {
            light: 'github-light',
            dark: 'vesper',
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
