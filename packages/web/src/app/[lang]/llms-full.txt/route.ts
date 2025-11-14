import { getLLMText } from '@/lib/llm/get_llm_text'
import { docSource } from '@/lib/source'

export const revalidate = false

export async function GET() {
    const scan = docSource.getPages().map(getLLMText)
    const scanned = await Promise.all(scan)

    return new Response(scanned.join('\n\n'))
}
