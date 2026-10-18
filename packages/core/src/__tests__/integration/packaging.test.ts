import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// packages/core/src/__tests__/integration -> repo root
const root = resolve(__dirname, '../../../../..')
const read = (path: string) =>
    JSON.parse(readFileSync(resolve(root, path), 'utf8')) as Record<
        string,
        Record<string, string> & {
            exports?: Record<string, { import: { default: string } }>
        }
    > &
        Record<string, any>

const PACKAGES = ['core', 'react', 'vue', 'solid', 'svelte']

describe('package metadata', () => {
    it.each(
        PACKAGES
    )('%s: `module` points at the file `exports` serves', (name) => {
        const pkg = read(`packages/${name}/package.json`)
        expect(pkg.module).toBe(pkg.exports['.'].import.default)
        expect(pkg.main).toBe(pkg.module)
    })

    it('solid-js is a peer dependency of the solid binding, never a hard dependency', () => {
        const pkg = read('packages/solid/package.json')
        expect(pkg.dependencies?.['solid-js']).toBeUndefined()
        expect(pkg.peerDependencies?.['solid-js']).toBeDefined()
    })

    it('root tooling is pinned (no `latest`) and vitest/coverage versions agree', () => {
        const pkg = read('package.json')
        const dev = pkg.devDependencies as Record<string, string>
        for (const [name, range] of Object.entries(dev)) {
            expect(range, name).not.toBe('latest')
            expect(range, name).toMatch(/^\d+\.\d+\.\d+$/)
        }
        expect(dev['@vitest/coverage-v8']).toBe(dev.vitest)
    })
})
