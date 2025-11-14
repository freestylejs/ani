/** biome-ignore-all lint/style/noDefaultExport: <nextjs page need default exported component.> */
import { PathUtils } from 'fumadocs-core/source'
import Link from 'next/link'
import { Banner } from '@/components/banner'
import { CONFIG } from '@/constant/config'
import { blogSource } from '@/lib/source'

function getName(path: string) {
    return PathUtils.basename(path, PathUtils.extname(path))
}

export default function BlogIntroduction() {
    const posts = [...blogSource.getPages()]
        .filter((p) => Boolean(p.data.draft) === false)
        .sort(
            (a, b) =>
                new Date(b.data.date ?? getName(b.path)).getTime() -
                new Date(a.data.date ?? getName(a.path)).getTime()
        )

    const hasNoPost = posts.length === 0

    return (
        <main className="flex size-full flex-col gap-y-12 px-4 py-12">
            <Banner
                noAnimation={true}
                title={`${CONFIG.libName}. Blog`}
                description="Tiny, but Powerful Declarative Animation Library."
                subDescription="Read our story."
                linkDescription="→ Read documentation"
                linkUrl={`/${CONFIG.majorLang}/docs`}
            />

            <section className="grid grid-cols-1 gap-7 md:grid-cols-3 xl:grid-cols-4">
                {hasNoPost && (
                    <p className="text-xl underline decoration-[0.75px] decoration-wavy underline-offset-4">
                        Will be added soon.
                    </p>
                )}

                {hasNoPost === false &&
                    posts.map((post) => (
                        <Link
                            key={post.url}
                            href={post.url}
                            className="group glass-3 flex flex-col rounded-xl border border-zinc-100 p-4 transition-colors duration-200 hover:border-zinc-200 hover:bg-fd-accent hover:text-fd-accent-foreground active:translate-y-0.5 dark:border-zinc-800 hover:dark:border-zinc-500"
                        >
                            <p className="font-medium text-xl decoration-[0.75px] decoration-fd-accent-foreground underline-offset-4 group-hover:underline">
                                {post.data.title}
                            </p>
                            <p className="text-base text-fd-muted-foreground">
                                {post.data.description}
                            </p>

                            <p className="mt-auto pt-4 text-brand text-xs">
                                {new Date(
                                    post.data.date ?? getName(post.path)
                                ).toDateString()}
                            </p>
                        </Link>
                    ))}
            </section>
        </main>
    )
}
