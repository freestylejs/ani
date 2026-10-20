import { noteWriter } from '~/dev'
import { createAniError } from '~/error'

declare const __ANI_DEV__: boolean

export interface StyleWriter {
    /** Writes the declarations of `style` that changed since this writer's previous write. */
    write(style: Readonly<Record<string, unknown>>): void
}

/**
 * Writer for one element. camelCase keys are assigned, `--custom` / hyphenated
 * keys go through `setProperty` (property assignment silently ignores them).
 * Declarations whose written value equals the one this writer wrote last are
 * skipped. The first write writes everything.
 */
export function createStyleWriter(
    target: { style: CSSStyleDeclaration } | HTMLElement
): StyleWriter {
    const style = (target as { style?: unknown } | null | undefined)?.style
    if (typeof style !== 'object' || style === null) {
        throw createAniError(
            TypeError,
            'ANI_INVALID_OPTIONS',
            __ANI_DEV__
                ? '[StyleWriter] target must be an element or an object with a `style` object.'
                : ''
        )
    }
    const written = new Map<string, string>()
    const writer: StyleWriter = {
        write(style) {
            const css = target.style
            const assignable = css as unknown as Record<string, unknown>
            for (const key in style) {
                const value = style[key]
                const text = String(value)
                if (written.get(key) === text) continue
                if (__ANI_DEV__) noteWriter(target, writer, key)
                if (key.includes('-')) {
                    css.setProperty(key, text)
                } else {
                    assignable[key] = value
                }
                written.set(key, text)
            }
        },
    }
    return writer
}
