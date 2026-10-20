import { noteWriter, releaseWriter } from '~/dev'
import { createAniError } from '~/error'
import {
    VALUE_NUMBER,
    VALUE_OPACITY,
    VALUE_PX,
    VALUE_TRANSFORM,
    type ValueStylePlan,
} from './create_sheet'

declare const __ANI_DEV__: boolean

export interface StyleWriter {
    /** Writes the declarations of `style` that changed since this writer's previous write. */
    write(style: Readonly<Record<string, unknown>>): void
    /** @private Drops this writer's development conflict-tracking entry. */
    release(): void
    /**
     * @private Writes runtime values through a compiled plan: no style object,
     * no string conversion for unchanged declarations. `transform` is the
     * already formatted transform declaration, when the caller shares it.
     */
    writeValues(
        plan: ValueStylePlan,
        values: ArrayLike<number>,
        transform?: string
    ): void
}

/** Formats the transform declaration of `plan` from `values`. */
export function formatTransform(
    plan: ValueStylePlan,
    values: ArrayLike<number>
): string {
    const parts = plan.parts
    let text = ''
    for (let p = 0; p < parts.length; p++) {
        const part = parts[p]!
        const piece = part.open + values[part.lane]! + part.close
        text = p === 0 ? piece : `${text} ${piece}`
    }
    return text
}

function sameNumber(a: number, b: number): boolean {
    return a === b || (a !== a && b !== b)
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
    const css = style as CSSStyleDeclaration
    const assignable = css as unknown as Record<string, unknown>

    // Generic path: created only when an object sheet is written.
    let written: Map<string, string> | null = null
    // Value path: one slot per lane of the plan, no per-write lookup.
    let plan: ValueStylePlan | null = null
    let last = new Float64Array(0)
    let seen = new Uint8Array(0)

    const writer: StyleWriter = {
        release() {
            releaseWriter(target, writer)
        },
        write(style) {
            const cache = (written ??= new Map<string, string>())
            for (const key in style) {
                const value = style[key]
                const text = String(value)
                if (cache.get(key) === text) continue
                if (__ANI_DEV__) noteWriter(target, writer, key)
                if (key.includes('-')) {
                    css.setProperty(key, text)
                } else {
                    assignable[key] = value
                }
                cache.set(key, text)
            }
        },

        writeValues(next, values, sharedTransform) {
            if (next !== plan) {
                // a new run with the same key layout keeps the written cache
                if (plan === null || next.signature !== plan.signature) {
                    last = new Float64Array(next.laneCount)
                    seen = new Uint8Array(next.laneCount)
                }
                plan = next
            }
            const declarations = next.declarations
            const parts = next.parts
            for (let d = 0; d < declarations.length; d++) {
                const declaration = declarations[d]!
                const key = declaration.key
                if (declaration.kind === VALUE_TRANSFORM) {
                    let changed = false
                    for (let p = 0; p < parts.length; p++) {
                        const lane = parts[p]!.lane
                        if (
                            seen[lane] === 0 ||
                            !sameNumber(values[lane]!, last[lane]!)
                        ) {
                            changed = true
                            break
                        }
                    }
                    if (!changed) continue
                    let text = sharedTransform
                    if (text === undefined) {
                        text = ''
                        for (let p = 0; p < parts.length; p++) {
                            const part = parts[p]!
                            const piece =
                                part.open + values[part.lane]! + part.close
                            text = p === 0 ? piece : `${text} ${piece}`
                        }
                    }
                    if (__ANI_DEV__) noteWriter(target, writer, key)
                    css.transform = text
                    for (let p = 0; p < parts.length; p++) {
                        const lane = parts[p]!.lane
                        last[lane] = values[lane]!
                        seen[lane] = 1
                    }
                    continue
                }

                const lane = declaration.lane
                const value = values[lane]!
                if (seen[lane] !== 0 && sameNumber(value, last[lane]!)) {
                    continue
                }
                if (__ANI_DEV__) noteWriter(target, writer, key)
                if (declaration.kind === VALUE_OPACITY) {
                    assignable[key] = value
                } else if (declaration.kind === VALUE_PX) {
                    assignable[key] = `${value}px`
                } else if (declaration.kind === VALUE_NUMBER) {
                    assignable[key] = value
                } else {
                    css.setProperty(key, String(value))
                }
                last[lane] = value
                seen[lane] = 1
            }
        },
    }
    return writer
}
