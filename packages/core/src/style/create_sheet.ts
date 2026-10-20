const TransformFunctionMap = {
    // deg
    rotate: { fn: 'rotate', unit: 'deg' },
    rotateX: { fn: 'rotateX', unit: 'deg' },
    rotateY: { fn: 'rotateY', unit: 'deg' },
    rotateZ: { fn: 'rotateZ', unit: 'deg' },
    skew: { fn: 'skew', unit: 'deg' },
    skewX: { fn: 'skewX', unit: 'deg' },
    skewY: { fn: 'skewY', unit: 'deg' },
    // px
    translate: { fn: 'translate', unit: 'px' },
    translateX: { fn: 'translateX', unit: 'px' },
    translateY: { fn: 'translateY', unit: 'px' },
    translateZ: { fn: 'translateZ', unit: 'px' },
    // unitless
    scale: { fn: 'scale' },
    scaleX: { fn: 'scaleX' },
    scaleY: { fn: 'scaleY' },
    scaleZ: { fn: 'scaleZ' },
} as const satisfies Record<string, { fn: string; unit?: string }>

type TransformPropertiesLiteral = keyof typeof TransformFunctionMap

type PxPropertiesLiteral =
    | 'width'
    | 'height'
    | 'margin'
    | 'marginTop'
    | 'marginBottom'
    | 'marginLeft'
    | 'marginRight'
    | 'padding'
    | 'paddingTop'
    | 'paddingBottom'
    | 'paddingLeft'
    | 'paddingRight'
    | 'top'
    | 'left'
    | 'right'
    | 'bottom'
    | 'borderWidth'
    | 'borderRadius'

type UnitlessPropertiesLiteral =
    | 'opacity'
    | 'zIndex'
    | 'lineHeight'
    | 'fontWeight'

export type StylesheetSupportedLiteral =
    | TransformPropertiesLiteral
    | PxPropertiesLiteral
    | UnitlessPropertiesLiteral

/** How one declaration of a value plan is written. */
export const VALUE_NUMBER = 0
export const VALUE_PX = 1
export const VALUE_PROPERTY = 2
export const VALUE_TRANSFORM = 3
export const VALUE_OPACITY = 4

/** One transform part of a value plan (`translateX(` + value + `px)`). */
export interface ValueStylePart {
    readonly lane: number
    readonly open: string
    readonly close: string
}

/** One declaration of a value plan, fed straight from a runtime's values. */
export interface ValueStyleDeclaration {
    readonly key: string
    readonly lane: number
    /** `VALUE_NUMBER`, `VALUE_PX`, `VALUE_PROPERTY`, `VALUE_TRANSFORM` or `VALUE_OPACITY`. */
    readonly kind: number
}

/**
 * A key layout compiled once: writing a frame means formatting these
 * declarations from the runtime values, without building a style object.
 */
export interface ValueStylePlan {
    readonly signature: string
    readonly laneCount: number
    readonly parts: readonly ValueStylePart[]
    readonly declarations: readonly ValueStyleDeclaration[]
}

interface MutableDeclaration {
    readonly key: string
    readonly lane: number
    kind: number
}

const planCache = new WeakMap<readonly string[], ValueStylePlan>()

/**
 * Compiles (and caches per key array) the declarations `createStyleSheet`
 * would build for a `from` layout. The insertion order is the same.
 */
export function createValueStylePlan(keys: readonly string[]): ValueStylePlan {
    const cached = planCache.get(keys)
    if (cached) return cached

    const parts: ValueStylePart[] = []
    const declarations: MutableDeclaration[] = []
    let transform: MutableDeclaration | null = null

    for (let lane = 0; lane < keys.length; lane++) {
        const key = keys[lane]!
        const kind = KEY_KIND[key]
        if (kind !== undefined && kind !== PX) {
            parts.push({ lane, open: kind.open, close: kind.close })
            continue
        }
        const declaration: MutableDeclaration = {
            key,
            lane,
            kind:
                kind === PX
                    ? VALUE_PX
                    : key.includes('-')
                      ? VALUE_PROPERTY
                      : key === 'opacity'
                        ? VALUE_OPACITY
                        : VALUE_NUMBER,
        }
        if (key === 'transform') transform = declaration
        declarations.push(declaration)
    }
    if (parts.length > 0) {
        if (transform) {
            transform.kind = VALUE_TRANSFORM
        } else {
            declarations.push({
                key: 'transform',
                lane: -1,
                kind: VALUE_TRANSFORM,
            })
        }
    }

    const plan: ValueStylePlan = {
        signature: keys.join('\u0000'),
        laneCount: keys.length,
        parts,
        declarations,
    }
    planCache.set(keys, plan)
    return plan
}

export type Resolver<T> = {
    [Key in keyof T]?: (target: T[keyof T]) => {
        key: string
        value: string | number
    }
}

const PX_KEYS = [
    'width',
    'height',
    'margin',
    'marginTop',
    'marginBottom',
    'marginLeft',
    'marginRight',
    'padding',
    'paddingTop',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
    'top',
    'left',
    'right',
    'bottom',
    'borderWidth',
    'borderRadius',
] as const

type StylesheetValueTarget = Record<string, number>

interface TransformKind {
    // `fn(` and `unit)` pre-joined so a part is built with two concatenations
    readonly open: string
    readonly close: string
}

/** Sentinel: value is written as `<n>px`. */
const PX = Symbol('px')

/**
 * One lookup classifies a key: transform function, px length, or (absent)
 * unitless / pass-through. Null prototype: keys like `constructor` must not
 * hit `Object.prototype`.
 */
const KEY_KIND: Record<string, TransformKind | typeof PX> = Object.create(null)

for (const [key, def] of Object.entries(TransformFunctionMap)) {
    KEY_KIND[key] = {
        open: `${def.fn}(`,
        close: 'unit' in def ? `${def.unit})` : ')',
    }
}
for (const key of PX_KEYS) {
    KEY_KIND[key] = PX
}

export function createStyleSheet(
    animeStyleValue: StylesheetValueTarget,
    resolver?: Resolver<StylesheetValueTarget>
): Record<string, any> {
    const styleAccumulator: Record<string, any> = {}
    let transform = ''

    for (const key in animeStyleValue) {
        if (!Object.hasOwn(animeStyleValue, key)) {
            continue
        }
        const value = animeStyleValue[key]

        if (typeof value !== 'number') {
            continue
        }

        // Custom Resolver
        const styleResolver = resolver?.[key]
        if (styleResolver) {
            const { key: resolvedKey, value: resolvedValue } =
                styleResolver(value)

            styleAccumulator[resolvedKey] = resolvedValue
            continue
        }

        const kind = KEY_KIND[key]

        // Transform (parts are joined with a single space, in key order)
        if (kind !== undefined && kind !== PX) {
            const part = `${kind.open}${value}${kind.close}`
            transform = transform === '' ? part : `${transform} ${part}`
            continue
        }

        // PX
        if (kind === PX) {
            styleAccumulator[key] = `${value}px`
            continue
        }

        // Unitless & fallback
        styleAccumulator[key] = value
    }

    // Combine Transform Syntax
    if (transform !== '') {
        styleAccumulator['transform'] = transform
    }

    return styleAccumulator
}
