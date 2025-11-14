import { tw } from '@/lib/utils'
import '../global.css'

import { defineI18nUI } from 'fumadocs-ui/i18n'
import { RootProvider } from 'fumadocs-ui/provider/next'
import { Darker_Grotesque, Inter } from 'next/font/google'
import { i18n } from '@/lib/i18n/i18n'

const inter = Inter({
    subsets: ['latin'],
})

const darkerGrotesque = Darker_Grotesque({
    subsets: ['latin'],
    style: 'normal',
})

const { provider } = defineI18nUI(i18n, {
    translations: {
        en: {
            displayName: 'English',
        },
        // ko: {
        //     displayName: '한국어',
        // },
    },
})

export default async function Layout({
    params,
    children,
}: LayoutProps<'/[lang]'>) {
    const lang = (await params).lang

    return (
        <html
            lang={lang}
            className={tw.join(inter.className, darkerGrotesque.className)}
            suppressHydrationWarning={true}
        >
            <body className="flex min-h-screen flex-col overflow-x-hidden">
                <RootProvider
                    i18n={provider(lang)}
                    search={{
                        enabled: true,
                        options: {},
                    }}
                >
                    {children}
                </RootProvider>
            </body>
        </html>
    )
}
