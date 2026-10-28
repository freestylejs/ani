import { createAniError, DEV } from '@freestylejs/ani-core'
import type { LayoutDrive, LayoutDriveHandle } from '@freestylejs/ani-layout'
import { useMemo } from 'react'

import { hasDOM, ownerOf } from './context'

/**
 * The layout side of a gesture (§5.10): a dispatcher that routes `take(el)`
 * to the live scope that currently owns the registered element — the explicit
 * `LayoutGroup` when it owns the element, otherwise the implicit root of its
 * document. It never owns DOM or a scope itself.
 *
 * The gesture layer owns pointer capture, `pointerId`, `touch-action`,
 * velocity estimation, keyboard operation and announcements; it hands layout
 * only view-space offsets and the release velocity, and maps `pointercancel`
 * and `lostpointercapture` to `cancel()`.
 */
export function useLayoutDrive(): LayoutDrive {
    return useMemo<LayoutDrive>(
        () => ({
            take(element: HTMLElement): LayoutDriveHandle {
                if (!hasDOM()) {
                    throw createAniError(
                        TypeError,
                        'ANI_INVALID_OPTIONS',
                        DEV
                            ? '[ani-react/layout] take: there is no DOM to drive.'
                            : ''
                    )
                }
                const scope = ownerOf(element)
                if (!scope) {
                    throw createAniError(
                        TypeError,
                        'ANI_INVALID_OPTIONS',
                        DEV
                            ? '[ani-react/layout] take: no layout scope owns the element. Register it with useLayout first.'
                            : ''
                    )
                }
                return scope.take(element)
            },
        }),
        []
    )
}
