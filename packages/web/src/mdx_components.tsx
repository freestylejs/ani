import { createGenerator } from 'fumadocs-typescript'
import { AutoTypeTable } from 'fumadocs-typescript/ui'
import { Callout } from 'fumadocs-ui/components/callout'
import * as TabsComponents from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'
import { LayoutShowcase } from '@/components/layout_showcase'

const generator = createGenerator()

export function getMDXComponents(components?: MDXComponents): MDXComponents {
    return {
        ...defaultMdxComponents,
        AutoTypeTable: (props) => (
            <AutoTypeTable {...props} generator={generator} />
        ),
        blockquote: Callout,
        LayoutShowcase,
        ...TabsComponents,
        ...components,
    }
}
