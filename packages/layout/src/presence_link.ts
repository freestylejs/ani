/**
 * Package-internal link between presence and layout (§6): presence registers
 * its element, its phase, whether its record animates `opacity`, and accepts
 * release holds. Adapters see none of it.
 */

import { flatParent, type KnownRoots } from './dom'

export interface PresenceLink {
    readonly exiting: boolean
    /** The presence record names `opacity`. */
    readonly opacity: boolean
    /** Delays the exit's release until `until` settles (a crossfade). */
    hold(until: Promise<void>): void
}

const links = new WeakMap<Element, PresenceLink>()

export function linkPresence(element: Element, link: PresenceLink): () => void {
    links.set(element, link)
    return () => {
        if (links.get(element) === link) links.delete(element)
    }
}

/**
 * The nearest presence link at or above `element` in the flat tree, through
 * the scope's known shadow roots (§4.6), if any is exiting.
 */
export function exitingPresence(
    element: Element,
    roots?: KnownRoots
): PresenceLink | null {
    for (
        let node: Element | null = element;
        node;
        node = flatParent(node, roots)
    ) {
        const link = links.get(node)
        if (link?.exiting) return link
    }
    return null
}

export function presenceOf(element: Element): PresenceLink | undefined {
    return links.get(element)
}
