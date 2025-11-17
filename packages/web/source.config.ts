import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins'
import {
    defineCollections,
    defineConfig,
    defineDocs,
    frontmatterSchema,
    metaSchema,
} from 'fumadocs-mdx/config'
import { transformerTwoslash } from 'fumadocs-twoslash'
import { createGenerator, remarkAutoTypeTable } from 'fumadocs-typescript'
import z from 'zod'

const generator = createGenerator()

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.dev/docs/mdx/collections
export const docs = defineDocs({
    dir: 'content/docs',
    docs: {
        schema: frontmatterSchema,
        postprocess: {
            includeProcessedMarkdown: true,
        },
    },
    meta: {
        schema: metaSchema,
    },
})

export const blog = defineCollections({
    type: 'doc',
    dir: 'content/blog',
    schema: frontmatterSchema.extend({
        title: z.string(),
        description: z.string(),
        author: z.string(),
        update: z.iso.date().or(z.date()),
        draft: z.boolean().optional(),
    }),
})

export default defineConfig({
    lastModifiedTime: 'git',
    mdxOptions: {
        rehypeCodeOptions: {
            themes: {
                light: 'github-light',
                dark: 'material-theme-palenight',
            },
            transformers: [
                ...(rehypeCodeDefaultOptions.transformers ?? []),
                transformerTwoslash(),
            ],
        },
        remarkPlugins: [[remarkAutoTypeTable, { generator }]],
    },
})
