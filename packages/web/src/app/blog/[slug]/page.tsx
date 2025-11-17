import path from 'node:path'
import DynamicLink from 'fumadocs-core/dynamic-link'
import type { Metadata } from 'next'
import { Darker_Grotesque, DM_Serif_Display, Inter } from 'next/font/google'
import { notFound } from 'next/navigation'
import { ShareButton } from '@/components/ui'
import { buttonVariants } from '@/components/ui/button'
import { createMetadata } from '@/lib/metadata/create_metadata'
import { blogSource } from '@/lib/source'
import { cn, tw } from '@/lib/utils'
import { getMDXComponents } from '@/mdx_components'

const inter = Inter({
    subsets: ['latin'],
    weight: '300',
})

const _dmSerif = DM_Serif_Display({
    weight: '400',
    subsets: ['latin'],
})

const darkerGrotesque = Darker_Grotesque({
    subsets: ['latin'],
    style: 'normal',
})

export default async function Page(props: PageProps<'/blog/[slug]'>) {
    const params = await props.params
    const page = blogSource.getPage([params.slug])

    if (!page) notFound()
    if (page.data.draft) notFound()

    const { body: Mdx, toc } = page.data

    return (
        <div
            className={tw.join(
                inter.className,
                'mx-auto flex w-full max-w-[800px] flex-col gap-y-7 px-4 py-8'
            )}
        >
            <section className="flex flex-col items-start justify-center gap-y-4">
                <ul
                    className={tw.join(
                        darkerGrotesque.className,
                        'mb-7 flex flex-row gap-4 font-normal text-lg'
                    )}
                >
                    <li>
                        <p className="mb-1 text-fd-muted-foreground">
                            Written by
                        </p>
                        <p className="font-medium">{page.data.author}</p>
                    </li>
                    <li>
                        <p className="mb-1 text-fd-muted-foreground">At</p>
                        <p className="font-medium">
                            {new Date(
                                page.data.update ??
                                    path.basename(
                                        page.path,
                                        path.extname(page.path)
                                    )
                            ).toDateString()}
                        </p>
                    </li>
                </ul>

                <h1
                    className={tw.join(
                        darkerGrotesque.className,
                        'mb-4 font-normal text-5xl'
                    )}
                >
                    {page.data.title}
                </h1>
                <p
                    className={tw.join(
                        darkerGrotesque.className,
                        'mb-8 font-normal text-fd-muted-foreground text-xl'
                    )}
                >
                    {page.data.description}
                </p>
            </section>

            <section className="flex flex-col items-start justify-center gap-y-4">
                <div className="not-prose mb-8 flex flex-row items-center gap-2">
                    <ShareButton
                        className={tw.join(
                            darkerGrotesque.className,
                            'text-lg'
                        )}
                        url={page.url}
                    />

                    <DynamicLink
                        href="/blog"
                        className={cn(
                            buttonVariants({
                                size: 'default',
                                variant: 'secondary',
                            }),
                            darkerGrotesque.className,
                            'text-lg'
                        )}
                    >
                        Back
                    </DynamicLink>
                </div>
            </section>

            <article className="prose min-w-0 flex-1 font-normal">
                <Mdx components={getMDXComponents()} />
            </article>
        </div>
    )
}

export async function generateMetadata(
    props: PageProps<'/blog/[slug]'>
): Promise<Metadata> {
    const params = await props.params
    const page = blogSource.getPage([params.slug])

    if (!page) notFound()

    return createMetadata({
        title: page.data.title,
        description: page.data.description,
    })
}

export function generateStaticParams(): Array<{ slug: string }> {
    const staticParams = blogSource
        .getPages()
        .filter((p) => Boolean(p.data.draft) === false)
        .map((p) => p.slugs)
        .filter((s) => s.length > 0)
        .map((s) => ({ slug: s[0] }))

    return staticParams
}
