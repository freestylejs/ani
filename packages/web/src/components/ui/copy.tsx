'use client'
import { useCopyButton } from 'fumadocs-ui/utils/use-copy-button'
import { Check, Share } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const ShareButton = ({
    url,
    className,
}: {
    url: string
    className?: string
}) => {
    const [isChecked, onCopy] = useCopyButton(() => {
        void navigator.clipboard.writeText(`${window.location.origin}${url}`)
    })

    return (
        <button
            type="button"
            className={cn(
                buttonVariants({ variant: 'outline', className: 'gap-2' }),
                className
            )}
            onClick={onCopy}
        >
            {isChecked ? (
                <Check className="size-4" />
            ) : (
                <Share className="size-4" />
            )}
            {isChecked ? 'Copied URL' : 'Share Post'}
        </button>
    )
}
