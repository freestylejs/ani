'use client'

import { type ReactNode, useState } from 'react'
import { CodeBlock } from '@/components/ui'
import {
    Card,
    CardContent,
    CardDescription,
    CardLink,
    CardShow,
    CardTitle,
} from '@/components/ui/card'
import { Glow } from '@/components/ui/glow'
import { tw } from '@/lib/utils'

interface FeatureCardProps {
    title: string
    description: string
    code: string
    link?: string
    children: ReactNode
}

export function FeatureCard({
    title,
    description,
    code,
    link,
    children,
}: FeatureCardProps) {
    const [showCode, setShowCode] = useState<boolean>(false)

    return (
        <Card
            className={tw.join(
                'group relative grid size-full grid-rows-[auto_1fr] transition-all',
                showCode
                    ? 'min-h-[600px] lg:min-h-[750px]'
                    : 'min-h-[350px] lg:min-h-[375px]'
            )}
        >
            <Glow />

            <CardLink href={link} aria-label="Read more" />
            <CardShow
                show={showCode}
                onClick={() => setShowCode((s) => !s)}
                aria-label="Read example code"
            />

            <CardContent className="row-start-1">
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardContent>

            <div className="relative row-start-2">
                <div
                    className={tw.join(
                        'absolute inset-0 flex items-center justify-center p-2 transition-opacity duration-300',
                        showCode ? 'opacity-0' : 'opacity-100',
                        showCode ? 'pointer-events-none' : 'pointer-events-auto'
                    )}
                >
                    {children}
                </div>
                <div
                    className={tw.join(
                        'no-scrollbar absolute inset-0 max-h-full overflow-y-auto rounded-xl transition-opacity duration-300',
                        showCode ? 'opacity-100' : 'opacity-0',
                        showCode ? 'pointer-events-auto' : 'pointer-events-none'
                    )}
                >
                    <CodeBlock
                        code={code.trim()}
                        lang="tsx"
                        wrapper={{ className: 'p-1' }}
                    />
                </div>
            </div>
        </Card>
    )
}
