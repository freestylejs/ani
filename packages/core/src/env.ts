declare const __ANI_DEV__: boolean

// Absent when the sources run directly (tests, docs): default to development.
// Both builds replace `__ANI_DEV__` at build time, so this guard vanishes.
if (typeof __ANI_DEV__ === 'undefined') {
    ;(globalThis as { __ANI_DEV__?: boolean }).__ANI_DEV__ = true
}

/**
 * Whether this code is running as a development build.
 *
 * `true` when the sources run directly (tests, docs) or from the
 * `development` export condition; the production build replaces the flag and
 * removes every `DEV ? ... : ''` branch that carries long error text. Core
 * sources read the replaced `__ANI_DEV__` global directly, so each long
 * message folds away in its own module; this export is the flag the framework
 * bindings read.
 */
export const DEV: boolean = __ANI_DEV__ === true
