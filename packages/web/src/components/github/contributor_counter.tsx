import Image from 'next/image'
import type { HTMLAttributes } from 'react'
import { CONFIG } from '@/constant/config'
import { fetchContributors } from '@/lib/github/contributor'
import { cn } from '@/lib/utils'

export interface ContributorCounterProps
    extends HTMLAttributes<HTMLDivElement> {
    repoOwner: string
    repoName: string
    displayCount?: number
}

export const ContributorCounter = async ({
    repoOwner,
    repoName,
    displayCount = 20,
    ...props
}: ContributorCounterProps): Promise<React.ReactElement> => {
    const contributors = await fetchContributors(repoOwner, repoName)
    const topContributors = contributors
        .filter((contributor) => contributor.login !== repoOwner)
        .slice(0, displayCount)

    return (
        <div
            {...props}
            className={cn('flex flex-col items-center gap-4', props.className)}
        >
            <div className="flex flex-row flex-wrap items-center justify-center md:pe-4">
                {topContributors.map((contributor, i) => (
                    <a
                        title={`${CONFIG.libName} contributor - ${contributor}`}
                        key={contributor.login}
                        href={`https://github.com/${contributor.login}`}
                        rel="noreferrer noopener"
                        target="_blank"
                        className="md:-mr-4 size-10 overflow-hidden rounded-full border-4 border-fd-background bg-fd-background md:size-12"
                        style={{
                            zIndex: topContributors.length - i,
                        }}
                    >
                        <Image
                            src={contributor.avatar_url}
                            alt={`${contributor.login}'s avatar`}
                            unoptimized={true}
                            width={48}
                            height={48}
                        />
                    </a>
                ))}
                {displayCount < contributors.length ? (
                    <div className="size-12 content-center rounded-full bg-fd-secondary text-center">
                        +{contributors.length - displayCount}
                    </div>
                ) : null}
            </div>
            <div className="text-center text-fd-muted-foreground text-sm">
                Some of our best contributors.
            </div>
        </div>
    )
}
