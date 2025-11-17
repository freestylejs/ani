import { Feed } from 'feed'
import { NextResponse } from 'next/server'
import { CONFIG } from '@/constant/config'
import { blogSource } from '@/lib/source'

export const revalidate = false

export function GET() {
    const baseUrl = CONFIG.siteUrl

    const feed = new Feed({
        title: `${CONFIG.libName} Blog`,
        id: `${baseUrl}/blog`,
        link: `${baseUrl}/blog`,
        language: 'en',

        image: `${baseUrl}/banner.png`,
        favicon: `${baseUrl}/icon.png`,
        copyright: `All rights reserved 2025, ${CONFIG.authorName}`,
    })

    for (const page of blogSource.getPages().sort((a, b) => {
        return (
            new Date(b.data.update).getTime() -
            new Date(a.data.update).getTime()
        )
    })) {
        feed.addItem({
            id: page.url,
            title: page.data.title,
            description: page.data.description,
            link: `${baseUrl}${page.url}`,
            date: new Date(page.data.update),

            author: [
                {
                    name: page.data.author,
                },
            ],
        })
    }

    return new NextResponse(feed.rss2())
}
