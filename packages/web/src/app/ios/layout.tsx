import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './style.css'

export const metadata: Metadata = {
    title: 'Ani — iOS Interaction Lab',
    description:
        'Eight reusable iOS-inspired interactions built with Ani, with official Motion reference previews and explicit verification boundaries.',
    robots: { index: false, follow: false },
}

/** A separate root layout: no docs shell, sidebar, theme provider or docs CSS. */
export default function IosLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=TASA+Orbiter:wght@400..800&display=swap"
                />
            </head>
            <body>{children}</body>
        </html>
    )
}
