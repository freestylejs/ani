// ENTRY FILES FOR FUMADOCS

import {
    type InferMetaType,
    type InferPageType,
    type LoaderPlugin,
    loader,
} from 'fumadocs-core/source'
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons'
import { createMDXSource } from 'fumadocs-mdx/runtime/next'
import { blog as blogPosts, docs } from '@/.source'
import { i18n } from '@/lib/i18n/i18n'

function pageTreeCodeTitles(): LoaderPlugin {
    return {
        transformPageTree: {
            file(node) {
                if (
                    typeof node.name === 'string' &&
                    (node.name.endsWith('()') || node.name.match(/^<\w+ \/>$/))
                ) {
                    return {
                        ...node,
                        name: <code className="text-[13px]">{node.name}</code>,
                    }
                }
                return node
            },
        },
    }
}

// See https://fumadocs.dev/docs/headless/source-api for more info
export const docSource = loader({
    baseUrl: '/docs',
    i18n,
    source: docs.toFumadocsSource(),
    plugins: [pageTreeCodeTitles(), lucideIconsPlugin()],
})

export const blogSource = loader(createMDXSource(blogPosts), {
    baseUrl: '/blog',
})

export function getPageImage(page: InferPageType<typeof docSource>) {
    const segments = [...page.slugs, 'image.png']
    return {
        segments,
        url: `/og/docs/${segments.join('/')}`,
    }
}

export type Page = InferPageType<typeof docSource>

export type Meta = InferMetaType<typeof docSource>
