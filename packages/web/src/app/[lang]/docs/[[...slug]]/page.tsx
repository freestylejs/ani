import { createRelativeLink } from 'fumadocs-ui/mdx'
import {
    DocsBody,
    DocsDescription,
    DocsPage,
    DocsTitle,
} from 'fumadocs-ui/page'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { notFound } from 'next/navigation'
import { docSource, getPageImage } from '@/lib/source'
import { getMDXComponents } from '@/mdx_components'

const inter = Inter({
    subsets: ['latin'],
    weight: '300',
})

export default async function Page(
    props: PageProps<'/[lang]/docs/[[...slug]]'>
) {
    const { slug, lang } = await props.params

    const page = docSource.getPage(slug, lang)

    if (!page) notFound()

    const MDX = page.data.body

    return (
        <DocsPage toc={page.data.toc} full={page.data.full}>
            <DocsTitle className="text-4xl">{page.data.title}</DocsTitle>
            <DocsDescription className="text-2xl">
                {page.data.description}
            </DocsDescription>
            <DocsBody className={inter.className}>
                <MDX
                    components={getMDXComponents({
                        a: createRelativeLink(docSource, page),
                    })}
                />
            </DocsBody>
        </DocsPage>
    )
}

export async function generateStaticParams() {
    return docSource.generateParams()
}

export async function generateMetadata(
    props: PageProps<'/[lang]/docs/[[...slug]]'>
): Promise<Metadata> {
    const { slug, lang } = await props.params

    const page = docSource.getPage(slug, lang)

    if (!page) notFound()

    return {
        title: page.data.title,
        description: page.data.description,
        openGraph: {
            images: getPageImage(page).url,
        },
    }
}
