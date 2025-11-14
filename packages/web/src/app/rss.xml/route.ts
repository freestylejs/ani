import { Feed } from 'feed'
import { CONFIG } from '@/constant/config'
import { docSource } from '@/lib/source'

function getRss() {
    const baseUrl = CONFIG.siteUrl
    const feed = new Feed({
        title: `${CONFIG.libName} - Blog`,
        id: `${baseUrl}/blog`,
        link: `${baseUrl}/blog`,
        language: 'en',

        image: `${baseUrl}${CONFIG.mainBannerUrl}`,
        favicon: `${baseUrl}/icon.png`,
        copyright: `All rights reserved 2025, ${CONFIG.authorName}`,
    })

    for (const page of docSource.getPages()) {
        feed.addItem({
            id: page.url,
            title: page.data.title,
            description: page.data.description,
            link: `${baseUrl}${page.url}`,
            date: new Date(page.data.lastModified ?? new Date()),

            author: [{ name: CONFIG.authorName }],
        })
    }

    return feed.rss2()
}

// NEXT CONFIG
export const revalidate = false

export function GET() {
    return new Response(getRss())
}
