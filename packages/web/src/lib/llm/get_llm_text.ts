import type { Page } from '@/lib/source'
import { CONFIG } from '../../constant/config'

export async function getLLMText(page: Page) {
    const processed = await page.data.getText('processed')

    return `# ${page.data.title}
URL: ${page.url}
Source: ${CONFIG.repoUrl}/blob/main/packages/web/content/docs/${page.path}

${page.data.description ?? ''}
        
${processed}`
}
