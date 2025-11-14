/** biome-ignore-all lint/style/noDefaultExport: <nextjs default export needed.> */
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { baseOptions } from '@/lib/layout.shared'

export default async function Layout({
    children,
    params,
}: LayoutProps<'/[lang]'>) {
    const { lang } = await params

    return <HomeLayout {...baseOptions(lang)}>{children}</HomeLayout>
}
