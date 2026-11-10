import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('the independent iOS route and its static assets bypass the docs locale middleware', () => {
    const source = readFileSync(
        new URL('../../../proxy.ts', import.meta.url),
        'utf8'
    )
    const pattern = /matcher:\s*\[\s*'([^']+)'\s*,?\s*\]/.exec(source)?.[1]
    expect(pattern).toBeDefined()
    const matcher = new RegExp(`^${pattern}$`)
    expect(matcher.test('/ios')).toBe(false)
    expect(matcher.test('/ios/')).toBe(false)
    expect(matcher.test('/ios-assets/exposure-reference.png')).toBe(false)
    expect(matcher.test('/en/docs/showcase/layout')).toBe(true)
    expect(matcher.test('/api/search')).toBe(false)
})
