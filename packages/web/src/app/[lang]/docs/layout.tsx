import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { baseOptions } from '@/lib/layout.shared'
import { docSource } from '@/lib/source'

export default async function Layout({
    params,
    children,
}: LayoutProps<'/[lang]/docs'>) {
    const { lang } = await params
    return (
        <DocsLayout {...baseOptions(lang)} tree={docSource.pageTree[lang]}>
            {children}
        </DocsLayout>
    )
}
