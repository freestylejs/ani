import { defineI18n } from 'fumadocs-core/i18n'
import { CONFIG } from '@/constant/config'

export const i18n = defineI18n({
    defaultLanguage: CONFIG.majorLang,
    languages: CONFIG.supportedLang as unknown as string[],
})
