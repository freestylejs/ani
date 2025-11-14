// ENTRY FILES FOR FUMADOCS

import type { I18nConfig } from 'fumadocs-core/i18n'
import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared'
import { BookIcon, RocketIcon } from 'lucide-react'
import { i18n } from '@/lib/i18n/i18n'
import { CONFIG } from '../constant/config'

const GetLinkItems = (locale: string): LinkItemType[] => [
    {
        icon: <RocketIcon />,
        text: 'Docs',
        url: `/${locale}/docs`,
    },
    {
        icon: <BookIcon />,
        text: 'Blog',
        url: `/blog`,
        // secondary items will be displayed differently on navbar
        secondary: false,
    },
]

export function baseOptions(
    locale: string,
    i18nConfig: boolean | I18nConfig<string> = i18n
): BaseLayoutProps {
    return {
        i18n: i18nConfig,
        nav: {
            title: 'Ani',
            children: <></>,
            url: `/${locale}`,
            transparentMode: 'top',
        },
        githubUrl: CONFIG.repoUrl,
        themeSwitch: { mode: 'light-dark-system' },
        links: GetLinkItems(locale),
    }
}
