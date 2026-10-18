export interface StyleWriter {
    /** Writes the declarations of `style` that changed since this writer's previous write. */
    write(style: Readonly<Record<string, unknown>>): void
}

/**
 * Writer for one element. Same write rules as `applyStyleSheet` (camelCase
 * keys by assignment, `--custom` / hyphenated keys with `setProperty`), but
 * skips declarations whose written value equals the one this writer wrote
 * last. The first write writes everything.
 */
export function createStyleWriter(
    target: { style: CSSStyleDeclaration } | HTMLElement
): StyleWriter {
    const style = (target as { style?: unknown } | null | undefined)?.style
    if (typeof style !== 'object' || style === null) {
        throw new TypeError(
            '[StyleWriter] target must be an element or an object with a `style` object.'
        )
    }
    const written = new Map<string, string>()
    return {
        write(style) {
            const css = target.style
            const assignable = css as unknown as Record<string, unknown>
            for (const key in style) {
                const value = style[key]
                const text = String(value)
                if (written.get(key) === text) continue
                if (key.includes('-')) {
                    css.setProperty(key, text)
                } else {
                    assignable[key] = value
                }
                written.set(key, text)
            }
        },
    }
}
