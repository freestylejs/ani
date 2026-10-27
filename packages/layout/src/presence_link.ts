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
 * the scope's known shadow roots (§4.6), if any is exiting. A `memo` shared
 * by the lookups of one pass (no presence changes phase in it) holds each
 * node's answer, so every ancestor is walked once.
 */
export function exitingPresence(
    element: Element,
    roots?: KnownRoots,
    memo?: Map<Element, PresenceLink | null>
): PresenceLink | null {
    const walked: Element[] = []
    let found: PresenceLink | null = null
    for (
        let node: Element | null = element;
        node;
        node = flatParent(node, roots)
    ) {
        const known = memo?.get(node)
        if (known !== undefined) {
            found = known
            break
        }
        walked.push(node)
        const link = links.get(node)
        if (link?.exiting) {
            found = link
            break
        }
    }
    if (memo) for (const node of walked) memo.set(node, found)
    return found
}

export function presenceOf(element: Element): PresenceLink | undefined {
    return links.get(element)
}
