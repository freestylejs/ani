import { notFound } from 'next/navigation'
import { type NextRequest, NextResponse } from 'next/server'
import { getLLMText } from '@/lib/llm/get_llm_text'
import { docSource } from '@/lib/source'

export const revalidate = false

export async function GET(
    _req: NextRequest,
    { params }: RouteContext<'/[lang]/llms/[...slug]'>
) {
    const slug = (await params).slug
    const page = docSource.getPage(slug)
    if (!page) notFound()

    return new NextResponse(await getLLMText(page), {
        headers: {
            'Content-Type': 'text/markdown',
        },
    })
}

export function generateStaticParams() {
    return docSource.generateParams().filter((param) => param.slug.length > 0)
}
