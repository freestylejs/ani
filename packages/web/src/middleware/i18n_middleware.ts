import { createI18nMiddleware } from 'fumadocs-core/i18n/middleware'
import { i18n } from '@/lib/i18n' // This path is correct for your structure

export const config = {
    // Matcher-Einträge ignorieren `/_next/` und `/api/`
    // Möglicherweise müssen Sie dies anpassen, um statische Assets im `/public`-Ordner zu ignorieren
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}

export default createI18nMiddleware(i18n)
