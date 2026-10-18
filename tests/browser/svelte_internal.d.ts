// Svelte ships no types for its client runtime; only what the Svelte cases use.
declare module 'svelte/internal/client' {
    /** Opens the scope of a component (what compiled components do first). */
    export function push(props: Record<string, unknown>, runes?: boolean): void
    /** Closes the scope opened by `push` and runs the deferred effects. */
    export function pop(): void
}
