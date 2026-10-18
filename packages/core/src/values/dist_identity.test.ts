import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dist = join(__dirname, '..', '..', 'dist')
const built =
    existsSync(join(dist, 'index.cjs')) && existsSync(join(dist, 'values.cjs'))

function definitions(extension: string): number {
    return readdirSync(dist)
        .filter((file) => file.endsWith(extension) && !file.includes('.d.'))
        .map((file) => readFileSync(join(dist, file), 'utf8'))
        .filter((source) => /AniError = class|class AniError/.test(source))
        .length
}

describe.runIf(built)('built entries share one AniError', () => {
    it('defines the class once per format', () => {
        expect(definitions('.cjs')).toBe(1)
        expect(definitions('.js')).toBe(1)
    })

    it('throws the root AniError from the cjs values entry', () => {
        const load = createRequire(join(dist, 'index.cjs'))
        const root = load('./index.cjs')
        const values = load('./values.cjs')
        let thrown: unknown
        try {
            values.color.encode('notacolor')
        } catch (error) {
            thrown = error
        }
        expect(thrown).toBeInstanceOf(root.AniError)
    })
})
