import type { ReactNode } from 'react'
import {
    Card,
    CardContent,
    CardDescription,
    CardLink,
    CardTitle,
} from '@/components/ui/card'
import { Glow } from '@/components/ui/glow'

interface FeatureCardProps {
    title: string
    description: string
    link?: string
    children: ReactNode
}

export function FeatureCard({
    title,
    description,
    link,
    children,
}: FeatureCardProps) {
    return (
        <>
            <Card className="group relative size-full">
                <Glow />

                <CardLink href={link} aria-label="Read more" />

                <CardContent>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                </CardContent>

                <div className="size-full min-h-40 p-2">{children}</div>
            </Card>
        </>
    )
}
