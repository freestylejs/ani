import { createI18nMiddleware } from 'fumadocs-core/i18n/middleware'
import { i18n } from '@/lib/i18n/i18n'

export const config = {
    // Matcher entries ignore `/_next/` and `/api/`
    // You may need to adjust this to ignore static assets in the `/public` folder
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}

export const proxy = createI18nMiddleware(i18n)
