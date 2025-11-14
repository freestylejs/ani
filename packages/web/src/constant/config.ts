const prodUrl = process.env.VERCEL_PROD_URL
    ? process.env.VERCEL_PROD_URL
    : 'http://localhost:3000'

export const CONFIG = {
    libName: 'Ani',
    siteName: 'Ani - Tiny, but Powerful Declarative Animation Library.',
    authorName: 'freestylejs',
    repoUrl: 'https://github.com/freestylejs/ani',
    siteUrl: prodUrl,
    mainBannerUrl: '/ani_banner.png',
    supportedLang: [
        'en',
        // 'ko'
    ],
    majorLang: 'en',
} as const
