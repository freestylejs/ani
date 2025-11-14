import '../global.css'

import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { RootProvider } from 'fumadocs-ui/provider/next'
import { Darker_Grotesque, Inter } from 'next/font/google'

import { CONFIG } from '@/constant/config'

import { baseOptions } from '@/lib/layout.shared'
import { tw } from '@/lib/utils'

const inter = Inter({
    subsets: ['latin'],
})

const darkerGrotesque = Darker_Grotesque({
    subsets: ['latin'],
    style: 'normal',
})

export default function Layout({ children }: LayoutProps<'/blog'>) {
    return (
        <html
            lang="en"
            className={tw.join(inter.className, darkerGrotesque.className)}
            suppressHydrationWarning={true}
        >
            <body className="flex min-h-screen flex-col overflow-x-hidden">
                <RootProvider>
                    <HomeLayout {...baseOptions(CONFIG.majorLang, false)}>
                        {children}
                    </HomeLayout>
                </RootProvider>
            </body>
        </html>
    )
}
