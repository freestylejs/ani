import type { Metadata } from 'next/types'
import { CONFIG } from '../../constant/config'

export function createMetadata(override: Metadata): Metadata {
    return {
        ...override,
        openGraph: {
            title: override.title ?? undefined,
            description: override.description ?? undefined,
            images: CONFIG.mainBannerUrl,
            siteName: CONFIG.siteName,
            url: CONFIG.siteUrl,
            ...override.openGraph,
        },
        twitter: {
            card: 'summary_large_image',
            creator: CONFIG.authorName,
            title: override.title ?? undefined,
            description: override.description ?? undefined,
            images: CONFIG.mainBannerUrl,
            ...override.twitter,
        },
        alternates: {
            types: {
                'application/rss+xml': [
                    {
                        title: CONFIG.libName,
                        url: `${CONFIG.siteUrl}/blog/rss.xml`,
                    },
                ],
            },
            ...override.alternates,
        },
    }
}

export const baseUrl = new URL('http://localhost:3000')
