/**
 * Writes a `createStyleSheet` result onto an element. camelCase keys are
 * assigned as properties, `--custom` / hyphenated keys go through
 * `setProperty` (property assignment silently ignores them).
 */
export function applyStyleSheet(
    element: HTMLElement,
    style: Record<string, unknown>
): void {
    const target = element.style as unknown as Record<string, unknown>
    for (const key in style) {
        const value = style[key]
        if (key.includes('-')) {
            element.style.setProperty(key, String(value))
        } else {
            target[key] = value
        }
    }
}
