import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../../../', import.meta.url))

/** Code that uses ANI through the package name (core uses relative imports). */
const scanned = [
    'packages/react/src',
    'packages/vue/src',
    'packages/solid/src',
    'packages/svelte/src',
    'packages/web/src',
    'bench',
]
/** Scanned when present (the browser tests may land after this packet). */
const optional = ['tests']
const extensions = /\.(ts|tsx|mts|js|jsx|mjs|vue|svelte)$/
const skipped = new Set(['node_modules', 'dist', '.next', 'results'])

function walk(dir: string, out: string[]): string[] {
    let names: string[]
    try {
        names = readdirSync(dir)
    } catch {
        return out
    }
    for (const name of names) {
        if (skipped.has(name)) continue
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path, out)
        else if (extensions.test(name)) out.push(path)
    }
    return out
}

const legacy: Array<[string, RegExp]> = [
    [
        'import { a } from ani-core',
        /import\s*\{[^}]*\ba\b[^}]*\}\s*from\s*['"]@freestylejs\/ani-core['"]/,
    ],
    ['getCurrentValue()', /\.getCurrentValue\s*\(/],
    ['getCurrentVelocity()', /\.getCurrentVelocity\s*\(/],
    ['currentConfig', /\.currentConfig\b/],
    ['dynamicTimeline', /\bdynamicTimeline\b/],
    ['webTimeline', /\bwebTimeline\b/],
    ['AnimationClock', /\bAnimationClock\b/],
    ['initialFrom', /\binitialFrom\b/],
    ['onTimelineChange', /\bonTimelineChange\b/],
]

describe('MIG3a: no 1.x call site is left outside core', () => {
    const files = [...scanned, ...optional].flatMap((dir) =>
        walk(join(root, dir), [])
    )

    it('S1: the scan sees the bindings, the site and the benchmarks', () => {
        const rel = files.map((file) => relative(root, file))
        for (const dir of scanned) {
            expect(
                rel.some((file) => file.startsWith(dir)),
                dir
            ).toBe(true)
        }
    })

    it('S2: none of them uses a 1.x API', () => {
        const hits: string[] = []
        for (const file of files) {
            const text = readFileSync(file, 'utf8')
            const rel = relative(root, file)
            // bench imports the built core by path, not by package name
            if (
                !text.includes('@freestylejs/ani') &&
                !/^(bench|tests)\//.test(rel)
            )
                continue
            for (const [name, pattern] of legacy) {
                if (pattern.test(text)) {
                    hits.push(`${rel}: ${name}`)
                }
            }
        }
        expect(hits).toEqual([])
    })
})
