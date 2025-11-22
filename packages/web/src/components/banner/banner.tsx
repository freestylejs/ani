'use client'

import { a } from '@freestylejs/ani-core'
import { DM_Serif_Display } from 'next/font/google'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { CONFIG } from '@/constant/config'
import { tw } from '@/lib/utils'
import { Button } from '../ui'
import BannerImage from './bg.png'

const dmSerif = DM_Serif_Display({
    weight: '400',
    subsets: ['latin'],
})

const controller = a.timeline(
    a.sequence(
        [
            a.ani({
                to: { opacity: 1, skew: 0, translateX: 0, scale: 1 },
                duration: 1.5,
            }),
        ],
        a.timing.spring({ m: 1, k: 100, c: 20 })
    )
)

export const Banner = ({
    title,
    description,
    subDescription,
    linkDescription,
    linkUrl,
    noAnimation,
}: {
    title: string
    description: string
    subDescription: string
    linkDescription: string
    linkUrl: string
    noAnimation: boolean
}) => {
    const target = useRef<HTMLElement>(null)

    useEffect(() => {
        if (!target.current) return
        if (noAnimation) return
        controller.play(target.current, {
            from: { opacity: 0, skew: 2, translateX: -10, scale: 0.975 },
        })
    }, [noAnimation])

    return (
        <section
            ref={target}
            className={tw.join(
                noAnimation ? 'opacity-100' : 'opacity-0',
                'group relative flex flex-1 flex-col items-start justify-center gap-y-4 p-4 will-change-transform lg:p-8'
            )}
        >
            <Image
                src={BannerImage}
                priority={true}
                alt="banner"
                className="-z-1 absolute inset-0 size-full rounded-xl border border-transparent object-cover opacity-100 brightness-100 transition-all duration-500 ease-out group-hover:border-zinc-200 group-hover:brightness-110 group-hover:dark:border-zinc-600 group-hover:dark:brightness-90"
            />

            <div className="flex w-full flex-col items-start justify-center gap-y-6 px-2 py-4 text-left">
                <h1
                    className={tw.join(
                        dmSerif.className,
                        'font-bold text-3xl text-white tracking-tight sm:text-5xl'
                    )}
                >
                    {title}
                </h1>

                <h2 className="text-3xl text-zinc-200">{description}</h2>

                <h3 className="text-lg text-zinc-400">{subDescription}</h3>

                <div className="flex justify-center">
                    <Link href={linkUrl ?? `/${CONFIG.majorLang}/docs`}>
                        <Button
                            className="rounded-none border border-zinc-600 text-base text-zinc-200 decoration-transparent transition-all duration-200"
                            variant="link"
                        >
                            {linkDescription}
                        </Button>
                    </Link>
                </div>
            </div>
        </section>
    )
}
